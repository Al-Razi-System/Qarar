begin;

create or replace function qarar_governance.resolve_topic_governance(
  p_governance_unit_id uuid,p_topic_category_id uuid,
  p_effective_on date default current_date,p_topic_id uuid default null
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,qarar_governance as $$
declare o uuid:=qarar_iam.current_organization_id();actor uuid:=auth.uid();
 u qarar_core.governance_units%rowtype;level text;cnt int;top_score int;winners int;
 selected record;outcome text;candidates jsonb;decision_id uuid;context jsonb;
begin
 if o is null or actor is null then raise exception using errcode='42501',message='يلزم حساب نشط';end if;
 perform qarar_iam.assert_permission('topics.create',p_governance_unit_id);
 select * into u from qarar_core.governance_units where id=p_governance_unit_id and organization_id=o and status='active';
 if u.id is null then raise exception using errcode='P0002',message='المجلس غير موجود أو غير نشط';end if;
 select governance_level into level from qarar_governance.governance_unit_classes where id=u.governance_class_id and organization_id=o;
 context:=jsonb_build_object('governance_unit_id',u.id,'governance_class_id',u.governance_class_id,
   'governance_level',level,'governance_unit_type_id',u.unit_type_id,'topic_category_id',p_topic_category_id);
 if p_topic_id is not null then
   context:=context||coalesce((select jsonb_build_object('priority',priority,'source_type',source_type)
     from qarar_topics.topics where id=p_topic_id and organization_id=o),'{}');
 end if;
 create temporary table if not exists pg_temp.governance_candidates(
  policy_id uuid,policy_version_id uuid,policy_item_id uuid,scope_id uuid,
  workflow_version_id uuid,automation_status text,governance_mode text,score int
 ) on commit drop;truncate pg_temp.governance_candidates;
 insert into pg_temp.governance_candidates
 select p.id,pv.id,pi.id,sa.id,pi.workflow_template_version_id,pv.automation_status,pi.governance_mode,
  (case
    when ov.is_included then 7000000
    when sa.scope_type='governance_unit' then 6000000
    when sa.scope_type='governance_class' then 5000000
    when sa.scope_type='governance_level' then 4000000
    when sa.scope_type='governance_unit_type' then 3000000
    when sa.scope_type='unit_subtree' then 2000000 else 1000000 end)
   + greatest(-99999,least(99999,coalesce(ov.priority,sa.priority))) as score
 from qarar_governance.policies p
 join qarar_governance.policy_versions pv on pv.policy_id=p.id and pv.organization_id=p.organization_id
 join qarar_governance.policy_items pi on pi.policy_version_id=pv.id and pi.organization_id=p.organization_id
 join qarar_governance.policy_scope_assignments sa on sa.policy_version_id=pv.id and sa.organization_id=p.organization_id
 left join lateral(
  select x.is_included,x.priority from qarar_governance.policy_item_scope_overrides x
  where x.policy_item_id=pi.id and x.scope_assignment_id=sa.id and x.governance_unit_id=u.id
   and (x.valid_from is null or p_effective_on>=x.valid_from)
   and (x.valid_to is null or p_effective_on<=x.valid_to)
  order by x.priority desc limit 1
 )ov on true
 where p.organization_id=o and p.status='active' and pi.is_active and sa.is_active
  and pv.legal_status='effective' and p_effective_on>=pv.effective_from
  and (pv.effective_to is null or p_effective_on<=pv.effective_to)
  and (sa.valid_from is null or p_effective_on>=sa.valid_from)
  and (sa.valid_to is null or p_effective_on<=sa.valid_to)
  and (pi.topic_category_id is null or pi.topic_category_id=p_topic_category_id)
  and qarar_governance.conditions_match(pi.match_criteria,context)
  and coalesce(ov.is_included,true)
  and (ov.is_included or sa.scope_type='organization'
   or(sa.scope_type='governance_unit' and sa.governance_unit_id=u.id)
   or(sa.scope_type='governance_class' and sa.governance_class_id=u.governance_class_id)
   or(sa.scope_type='governance_level' and sa.governance_level=level)
   or(sa.scope_type='governance_unit_type' and sa.governance_unit_type_id=u.unit_type_id)
   or(sa.scope_type='unit_subtree' and exists(
    with recursive d(id)as(select sa.governance_unit_id union all select c.id from qarar_core.governance_units c join d on c.parent_unit_id=d.id where c.organization_id=o)
    select 1 from d where id=u.id)));
 select count(*),max(score) into cnt,top_score from pg_temp.governance_candidates;
 select count(*) into winners from pg_temp.governance_candidates where score=top_score;
 select * into selected from pg_temp.governance_candidates where score=top_score order by policy_version_id,policy_item_id limit 1;
 outcome:=case when cnt=0 then 'no_applicable_policy' when winners>1 then 'multiple_policy_conflict'
  when selected.automation_status='blocked' then 'blocked'
  when selected.automation_status in('not_configured','mapping_in_progress') and selected.governance_mode in('custom_route_allowed','regulated_fallback_allowed') then 'custom_route_required'
  when selected.automation_status not in('ready') then 'policy_partially_ready'
  when selected.workflow_version_id is null then case when selected.governance_mode in('custom_route_allowed','regulated_fallback_allowed') then 'custom_route_required' else 'policy_not_implemented' end
  when not exists(select 1 from qarar_governance.workflow_template_versions where id=selected.workflow_version_id and status='active' and validation_status='valid')
   then case when selected.governance_mode in('custom_route_allowed','regulated_fallback_allowed') then 'custom_route_required' else 'policy_not_implemented' end
  else 'resolved' end;
 select coalesce(jsonb_agg(jsonb_build_object('policy_id',policy_id,'policy_version_id',policy_version_id,
  'policy_item_id',policy_item_id,'scope_assignment_id',scope_id,'score',score)order by score desc),'[]')
 into candidates from pg_temp.governance_candidates;
 insert into qarar_governance.regulation_match_decisions(organization_id,topic_id,governance_unit_id,
  topic_category_id,effective_on,outcome,selected_policy_id,selected_policy_version_id,selected_policy_item_id,
  selected_scope_assignment_id,selected_workflow_template_version_id,specificity_score,candidate_count,
  explanation,candidates,created_by_user_id)
 values(o,p_topic_id,u.id,p_topic_category_id,p_effective_on,outcome,
  case when outcome in('resolved','custom_route_required') then selected.policy_id end,
  case when outcome in('resolved','custom_route_required') then selected.policy_version_id end,
  case when outcome in('resolved','custom_route_required') then selected.policy_item_id end,
  case when outcome in('resolved','custom_route_required') then selected.scope_id end,
  case when outcome='resolved' then selected.workflow_version_id end,top_score,cnt,
  jsonb_build_object('outcome',outcome,'specificity_precedes_priority',true,'context',context),candidates,actor)
 returning id into decision_id;
 return jsonb_build_object('decision_id',decision_id,'outcome',outcome,'candidate_count',cnt,
  'policy_id',case when outcome in('resolved','custom_route_required') then selected.policy_id end,
  'policy_version_id',case when outcome in('resolved','custom_route_required') then selected.policy_version_id end,
  'policy_item_id',case when outcome in('resolved','custom_route_required') then selected.policy_item_id end,
  'scope_assignment_id',case when outcome in('resolved','custom_route_required') then selected.scope_id end,
  'workflow_template_version_id',case when outcome='resolved' then selected.workflow_version_id end,
  'explanation',jsonb_build_object('winning_score',top_score,'candidates',candidates));
end $$;

create or replace function qarar_topics.create_topic_with_workflow(
 p_title_ar text,p_description text,p_category_id uuid,p_current_unit_id uuid,
 p_priority text default 'medium',p_source_type text default 'new',
 p_title_en text default null,p_client_request_id uuid default null
)returns jsonb language plpgsql security definer set search_path=pg_catalog,qarar_topics as $$
declare topic jsonb;match jsonb;route jsonb;topic_id uuid;outcome text;
begin
 if qarar_iam.current_organization_id() is null then
  raise exception using errcode='42501',message='يلزم حساب نشط';
 end if;
 topic:=qarar_topics.create_topic_unrouted(p_title_ar,p_description,p_category_id,p_current_unit_id,
  p_priority,p_source_type,p_title_en,p_client_request_id);topic_id:=(topic->>'id')::uuid;
 if coalesce((topic->>'idempotent_replay')::boolean,false) then return topic||jsonb_build_object(
  'routing_status',(select routing_status from qarar_topics.topics where id=topic_id));end if;
 match:=qarar_governance.resolve_topic_governance(p_current_unit_id,p_category_id,current_date,topic_id);
 outcome:=match->>'outcome';
 if outcome='resolved' then route:=qarar_governance.instantiate_topic_workflow(topic_id,(match->>'decision_id')::uuid);
 else
  route:=qarar_governance.record_unresolved_topic_governance(topic_id,(match->>'decision_id')::uuid,outcome);
  if outcome='custom_route_required' then
   update qarar_topics.topics set governance_source='custom',routing_status='routing_exception_pending' where id=topic_id;
   route:=route||jsonb_build_object('routing_status','routing_exception_pending','custom_route_required',true);
  end if;
 end if;return topic||match||route;
end $$;

create or replace function qarar_governance.request_custom_workflow(
 p_topic_id uuid,p_workflow_template_version_id uuid,p_reason text,p_valid_until timestamptz default null
)returns jsonb language plpgsql security definer set search_path=pg_catalog,qarar_governance as $$
declare o uuid:=qarar_iam.current_organization_id();actor uuid:=auth.uid();unit_id uuid;id uuid;
begin
 select current_unit_id into unit_id from qarar_topics.topics where id=p_topic_id and organization_id=o
  and governance_source='custom' and routing_status='routing_exception_pending';
 if unit_id is null then raise exception using errcode='55000',message='الموضوع لا ينتظر مسارًا مخصصًا';end if;
 perform qarar_iam.assert_permission('governance.exceptions.request',unit_id);
 if char_length(btrim(coalesce(p_reason,'')))<10 then raise exception using errcode='22023',message='يلزم سبب تفصيلي';end if;
 if not exists(select 1 from qarar_governance.workflow_template_versions where id=p_workflow_template_version_id
  and organization_id=o and status='active' and validation_status='valid') then raise exception using errcode='23514',message='قالب المسار غير صالح';end if;
 insert into qarar_governance.governance_exceptions(organization_id,topic_id,requested_source,requested_route,
  reason,status,requested_by_user_id,valid_until)
 values(o,p_topic_id,'custom',jsonb_build_object('workflow_template_version_id',p_workflow_template_version_id),
  btrim(p_reason),'pending',actor,p_valid_until)returning id into id;
 return jsonb_build_object('id',id,'topic_id',p_topic_id,'status','pending','governance_source','custom');
end $$;

alter function qarar_governance.resolve_topic_governance(uuid,uuid,date,uuid) owner to qarar_governance_executor;
alter function qarar_topics.create_topic_with_workflow(text,text,uuid,uuid,text,text,text,uuid) owner to qarar_topics_executor;
alter function qarar_governance.request_custom_workflow(uuid,uuid,text,timestamptz) owner to qarar_governance_executor;
revoke all on function qarar_governance.request_custom_workflow(uuid,uuid,text,timestamptz) from public,anon,authenticated,service_role;

commit;
