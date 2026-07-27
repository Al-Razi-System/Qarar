begin;

alter function qarar_topics.create_topic(text,text,uuid,uuid,text,text,text,uuid)
  rename to create_topic_unrouted;

create or replace function qarar_topics.create_topic_with_workflow(
  p_title_ar text,p_description text,p_category_id uuid,p_current_unit_id uuid,
  p_priority text default 'medium',p_source_type text default 'new',
  p_title_en text default null,p_client_request_id uuid default null
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,qarar_topics
as $$
declare v_topic jsonb;v_match jsonb;v_workflow jsonb;v_topic_id uuid;
begin
  v_topic:=qarar_topics.create_topic_unrouted(
    p_title_ar,p_description,p_category_id,p_current_unit_id,p_priority,
    p_source_type,p_title_en,p_client_request_id
  );
  v_topic_id:=(v_topic->>'id')::uuid;
  if coalesce((v_topic->>'idempotent_replay')::boolean,false) then
    if exists(select 1 from qarar_topics.topics where id=v_topic_id and routing_status='routing_ready') then
      return v_topic || jsonb_build_object('routing_status','routing_ready','idempotent_replay',true);
    end if;
  end if;
  v_match:=qarar_governance.resolve_topic_governance(
    p_current_unit_id,p_category_id,current_date,v_topic_id
  );
  if v_match->>'outcome'<>'resolved' then
    raise exception using errcode='55000',
      message='تعذر إنشاء الموضوع: لم يُحسم المسار اللائحي',
      detail=v_match::text,
      hint='راجع نتيجة المطابقة أو اطلب استثناءً معتمدًا';
  end if;
  v_workflow:=qarar_governance.instantiate_topic_workflow(
    v_topic_id,(v_match->>'decision_id')::uuid
  );
  return v_topic || v_match || v_workflow;
end;
$$;

create or replace function qarar_topics.create_topic(
  p_title_ar text,p_description text,p_category_id uuid,p_current_unit_id uuid,
  p_priority text default 'medium',p_source_type text default 'new',
  p_title_en text default null,p_client_request_id uuid default null
) returns jsonb language sql volatile security definer
set search_path=pg_catalog,qarar_topics
as $$
  select qarar_topics.create_topic_with_workflow(
    p_title_ar,p_description,p_category_id,p_current_unit_id,p_priority,
    p_source_type,p_title_en,p_client_request_id
  )
$$;

create or replace function qarar_governance.get_topic_governance(p_topic_id uuid)
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,qarar_governance
as $$
declare v_org uuid:=qarar_iam.current_organization_id();v_result jsonb;
begin
  perform qarar_iam.assert_permission('governance.compliance.read',null);
  select jsonb_build_object(
    'topic_id',t.id,'governance_source',t.governance_source,'routing_status',t.routing_status,
    'policy_id',t.policy_id,'policy_version_id',t.policy_version_id,'policy_item_id',t.policy_item_id,
    'scope_assignment_id',t.policy_scope_assignment_id,
    'workflow_template_version_id',t.workflow_template_version_id,
    'workflow_instance_id',t.workflow_instance_id,'current_workflow_step_id',t.current_workflow_step_id,
    'routing_decision_id',t.routing_decision_id,
    'decision',case when d.id is null then null else jsonb_build_object(
      'outcome',d.outcome,'explanation',d.explanation,'candidates',d.candidates,'evaluated_at',d.evaluated_at
    ) end,
    'mapping_snapshot',m.snapshot
  ) into v_result
  from qarar_topics.topics t
  left join qarar_governance.regulation_match_decisions d on d.id=t.routing_decision_id
  left join qarar_governance.topic_governance_mappings m on m.topic_id=t.id
  where t.id=p_topic_id and t.organization_id=v_org;
  if v_result is null then raise exception using errcode='P0002',message='الموضوع غير موجود';end if;
  return v_result;
end;
$$;

create or replace function qarar_governance.get_topic_workflow(p_topic_id uuid)
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,qarar_governance
as $$
declare v_org uuid:=qarar_iam.current_organization_id();v_result jsonb;
begin
  if not exists(select 1 from qarar_topics.topics where id=p_topic_id and organization_id=v_org)
  then raise exception using errcode='P0002',message='الموضوع غير موجود';end if;
  select jsonb_build_object(
    'instance_id',i.id,'status',i.status,'started_at',i.started_at,'completed_at',i.completed_at,
    'current_step_id',i.current_step_id,
    'steps',coalesce(jsonb_agg(jsonb_build_object(
      'id',s.id,'sequence_no',s.sequence_no,'status',s.status,
      'assigned_unit_id',s.assigned_unit_id,'required_permission_code',s.required_permission_code,
      'opened_at',s.opened_at,'acted_by_user_id',s.acted_by_user_id,'acted_at',s.acted_at,
      'outcome_code',s.outcome_code,'comment',s.comment,'snapshot',s.snapshot
    ) order by s.sequence_no) filter(where s.id is not null),'[]'::jsonb)
  ) into v_result
  from qarar_governance.workflow_instances i
  left join qarar_governance.workflow_instance_steps s on s.workflow_instance_id=i.id
  where i.topic_id=p_topic_id and i.organization_id=v_org group by i.id;
  return coalesce(v_result,jsonb_build_object('topic_id',p_topic_id,'status','not_started','steps','[]'::jsonb));
end;
$$;

create or replace function qarar_governance.act_topic_workflow_step(
  p_topic_id uuid,p_outcome_code text,p_comment text default null
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,qarar_governance
as $$
declare
  v_org uuid:=qarar_iam.current_organization_id();v_user uuid:=auth.uid();
  v_instance qarar_governance.workflow_instances%rowtype;
  v_step qarar_governance.workflow_instance_steps%rowtype;
  v_transition qarar_governance.workflow_template_transitions%rowtype;
  v_next_step_id uuid;v_instance_status text;
begin
  select * into v_instance from qarar_governance.workflow_instances
  where topic_id=p_topic_id and organization_id=v_org and status='active' for update;
  if v_instance.id is null then raise exception using errcode='55000',message='لا يوجد مسار نشط للموضوع';end if;
  select * into v_step from qarar_governance.workflow_instance_steps
  where id=v_instance.current_step_id and status='active' for update;
  if v_step.id is null then raise exception using errcode='55000',message='لا توجد خطوة نشطة';end if;
  if v_step.required_permission_code is not null then
    perform qarar_iam.assert_permission(v_step.required_permission_code,v_step.assigned_unit_id);
  else
    perform qarar_iam.assert_permission('topics.review',v_step.assigned_unit_id);
  end if;
  select t.* into v_transition
  from qarar_governance.workflow_template_transitions t
  where t.workflow_template_version_id=v_instance.workflow_template_version_id
    and t.from_step_id=v_step.template_step_id and t.outcome_code=p_outcome_code;
  if v_transition.id is null and not exists(
    select 1 from qarar_governance.workflow_template_steps
    where id=v_step.template_step_id and is_terminal and p_outcome_code=any(allowed_outcomes)
  ) then raise exception using errcode='22023',message='النتيجة غير مسموحة لهذه الخطوة';end if;

  update qarar_governance.workflow_instance_steps set status=case p_outcome_code
      when 'returned' then 'returned' when 'rejected' then 'rejected'
      when 'cancelled' then 'cancelled' else 'completed' end,
    acted_by_user_id=v_user,acted_at=now(),outcome_code=p_outcome_code,
    comment=nullif(btrim(coalesce(p_comment,'')),'')
  where id=v_step.id;

  if v_transition.to_step_id is not null then
    select id into v_next_step_id from qarar_governance.workflow_instance_steps
    where workflow_instance_id=v_instance.id and template_step_id=v_transition.to_step_id;
    update qarar_governance.workflow_instance_steps set status='active',opened_at=now()
    where id=v_next_step_id;
    update qarar_governance.workflow_instances set current_step_id=v_next_step_id where id=v_instance.id;
    v_instance_status:='active';
  else
    v_instance_status:=case
      when p_outcome_code='rejected' then 'rejected'
      when p_outcome_code='cancelled' then 'cancelled' else 'completed' end;
    update qarar_governance.workflow_instances set status=v_instance_status,current_step_id=null,
      completed_at=now() where id=v_instance.id;
  end if;
  perform qarar_topics.apply_governance_snapshot(
    p_topic_id,'regulated','routing_ready',
    (select policy_id from qarar_topics.topics where id=p_topic_id),
    (select policy_version_id from qarar_topics.topics where id=p_topic_id),
    (select policy_item_id from qarar_topics.topics where id=p_topic_id),
    (select policy_scope_assignment_id from qarar_topics.topics where id=p_topic_id),
    v_instance.workflow_template_version_id,v_instance.id,v_next_step_id,
    (select routing_decision_id from qarar_topics.topics where id=p_topic_id)
  );
  insert into qarar_governance.governance_compliance_events(
    organization_id,topic_id,workflow_instance_id,event_type,severity,result,details,actor_user_id
  ) values(v_org,p_topic_id,v_instance.id,'governance.workflow_step.acted','info','allowed',
    jsonb_build_object('step_id',v_step.id,'outcome',p_outcome_code,'next_step_id',v_next_step_id),v_user);
  insert into qarar_governance.notification_outbox(
    organization_id,aggregate_type,aggregate_id,event_type,payload,deduplication_key
  ) values(v_org,'topic',p_topic_id,'governance.workflow.step_acted',
    jsonb_build_object('topic_id',p_topic_id,'step_id',v_step.id,'outcome',p_outcome_code),
    'workflow-step:'||v_step.id||':'||p_outcome_code);
  return jsonb_build_object('topic_id',p_topic_id,'workflow_instance_id',v_instance.id,
    'completed_step_id',v_step.id,'outcome',p_outcome_code,
    'next_step_id',v_next_step_id,'workflow_status',v_instance_status);
end;
$$;

create or replace function qarar_governance.complete_topic_workflow_step(
  p_topic_id uuid,p_outcome_code text default 'approved',p_comment text default null
) returns jsonb language sql volatile security definer
set search_path=pg_catalog,qarar_governance
as $$select qarar_governance.act_topic_workflow_step(p_topic_id,p_outcome_code,p_comment)$$;
create or replace function qarar_governance.return_topic_workflow_step(
  p_topic_id uuid,p_comment text
) returns jsonb language sql volatile security definer
set search_path=pg_catalog,qarar_governance
as $$select qarar_governance.act_topic_workflow_step(p_topic_id,'returned',p_comment)$$;
create or replace function qarar_governance.reject_topic_workflow_step(
  p_topic_id uuid,p_comment text
) returns jsonb language sql volatile security definer
set search_path=pg_catalog,qarar_governance
as $$select qarar_governance.act_topic_workflow_step(p_topic_id,'rejected',p_comment)$$;

insert into qarar_architecture.module_function_execute_allowlist(
  source_module,target_schema,function_name,identity_arguments,rationale
) values
('topics','qarar_governance','resolve_topic_governance',
 'p_governance_unit_id uuid, p_topic_category_id uuid, p_effective_on date, p_topic_id uuid',
 'Resolve regulation before committing topic creation'),
('topics','qarar_governance','instantiate_topic_workflow',
 'p_topic_id uuid, p_decision_id uuid','Instantiate governed route in the topic transaction')
on conflict do nothing;

grant usage on schema qarar_governance to qarar_topics_executor;
grant execute on function qarar_governance.resolve_topic_governance(uuid,uuid,date,uuid)
  to qarar_topics_executor;
grant execute on function qarar_governance.instantiate_topic_workflow(uuid,uuid)
  to qarar_topics_executor;

do $$
declare f record;
begin
  for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where (n.nspname='qarar_governance' and p.proname in(
      'get_topic_governance','get_topic_workflow','act_topic_workflow_step',
      'complete_topic_workflow_step','return_topic_workflow_step','reject_topic_workflow_step'))
      or (n.nspname='qarar_topics' and p.proname in(
        'create_topic','create_topic_unrouted','create_topic_with_workflow'))
  loop
    execute format('alter function %s owner to %I',f.oid::regprocedure,
      case when (select n.nspname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.oid=f.oid)
        ='qarar_topics' then 'qarar_topics_executor' else 'qarar_governance_executor' end);
    execute format('revoke all on function %s from public,anon,authenticated,service_role',f.oid::regprocedure);
  end loop;
end;
$$;

commit;
