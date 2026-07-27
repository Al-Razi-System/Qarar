begin;

create or replace function qarar_governance.record_unresolved_topic_governance(
  p_topic_id uuid,p_decision_id uuid,p_outcome text
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,qarar_governance
as $$
declare v_org uuid:=qarar_iam.current_organization_id();v_user uuid:=auth.uid();
  v_status text;v_alert uuid;
begin
  v_status:=case when p_outcome='multiple_policy_conflict' then 'routing_conflict' else 'routing_blocked' end;
  perform qarar_topics.apply_governance_snapshot(
    p_topic_id,null,v_status,null,null,null,null,null,null,null,p_decision_id
  );
  insert into qarar_governance.governance_compliance_events(
    organization_id,topic_id,event_type,severity,result,details,actor_user_id
  ) values(v_org,p_topic_id,'governance.routing.unresolved','critical','denied',
    jsonb_build_object('decision_id',p_decision_id,'outcome',p_outcome),v_user)
  returning id into v_alert;
  insert into qarar_governance.governance_alerts(
    organization_id,topic_id,compliance_event_id,alert_type,severity,title_ar,details
  ) values(v_org,p_topic_id,v_alert,'routing_unresolved','critical',
    'تعذر تحديد المسار اللائحي للموضوع',
    jsonb_build_object('decision_id',p_decision_id,'outcome',p_outcome));
  return jsonb_build_object('topic_id',p_topic_id,'routing_status',v_status,'decision_id',p_decision_id);
end;
$$;

create or replace function qarar_topics.create_topic_with_workflow(
  p_title_ar text,p_description text,p_category_id uuid,p_current_unit_id uuid,
  p_priority text default 'medium',p_source_type text default 'new',
  p_title_en text default null,p_client_request_id uuid default null
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,qarar_topics
as $$
declare v_topic jsonb;v_match jsonb;v_route jsonb;v_topic_id uuid;
begin
  v_topic:=qarar_topics.create_topic_unrouted(
    p_title_ar,p_description,p_category_id,p_current_unit_id,p_priority,
    p_source_type,p_title_en,p_client_request_id
  );
  v_topic_id:=(v_topic->>'id')::uuid;
  if coalesce((v_topic->>'idempotent_replay')::boolean,false) then
    return v_topic || jsonb_build_object(
      'routing_status',(select routing_status from qarar_topics.topics where id=v_topic_id)
    );
  end if;
  v_match:=qarar_governance.resolve_topic_governance(
    p_current_unit_id,p_category_id,current_date,v_topic_id
  );
  if v_match->>'outcome'='resolved' then
    v_route:=qarar_governance.instantiate_topic_workflow(v_topic_id,(v_match->>'decision_id')::uuid);
  else
    v_route:=qarar_governance.record_unresolved_topic_governance(
      v_topic_id,(v_match->>'decision_id')::uuid,v_match->>'outcome'
    );
  end if;
  return v_topic || v_match || v_route;
end;
$$;

create or replace function qarar_governance.request_workflow_exception(
  p_topic_id uuid,p_workflow_template_version_id uuid,p_reason text,
  p_valid_until timestamptz default null
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,qarar_governance
as $$
declare v_org uuid:=qarar_iam.current_organization_id();v_user uuid:=auth.uid();
  v_unit uuid;v_id uuid;
begin
  select current_unit_id into v_unit from qarar_topics.topics
  where id=p_topic_id and organization_id=v_org
    and routing_status in('routing_blocked','routing_conflict','routing_exception_pending');
  if v_unit is null then raise exception using errcode='55000',
    message='لا يقبل الموضوع طلب استثناء في حالته الحالية';end if;
  perform qarar_iam.assert_permission('governance.exceptions.request',v_unit);
  if char_length(btrim(coalesce(p_reason,'')))<10 then
    raise exception using errcode='22023',message='سبب الاستثناء مطلوب وبحد أدنى عشرة أحرف';end if;
  if not exists(select 1 from qarar_governance.workflow_template_versions
    where id=p_workflow_template_version_id and organization_id=v_org
      and status='active' and validation_status='valid')
  then raise exception using errcode='23514',message='قالب مسار الاستثناء غير نشط أو غير مكتمل';end if;
  if exists(select 1 from qarar_governance.governance_exceptions
    where topic_id=p_topic_id and status='pending')
  then raise exception using errcode='23505',message='يوجد طلب استثناء معلق لهذا الموضوع';end if;
  insert into qarar_governance.governance_exceptions(
    organization_id,topic_id,requested_source,requested_route,reason,status,
    requested_by_user_id,valid_until
  ) values(v_org,p_topic_id,'exception',
    jsonb_build_object('workflow_template_version_id',p_workflow_template_version_id),
    btrim(p_reason),'pending',v_user,p_valid_until) returning id into v_id;
  perform qarar_topics.apply_governance_snapshot(
    p_topic_id,'exception','routing_exception_pending',null,null,null,null,
    p_workflow_template_version_id,null,null,
    (select routing_decision_id from qarar_topics.topics where id=p_topic_id)
  );
  perform qarar_audit.append_audit_log(v_org,'governance.exception.request','governance_exceptions',v_id,
    jsonb_build_object('topic_id',p_topic_id,'reason',p_reason));
  return jsonb_build_object('id',v_id,'topic_id',p_topic_id,'status','pending');
end;
$$;

create or replace function qarar_governance.approve_workflow_exception(
  p_exception_id uuid,p_approve boolean,p_review_comment text
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,qarar_governance
as $$
declare v_org uuid:=qarar_iam.current_organization_id();v_user uuid:=auth.uid();
  v_exception qarar_governance.governance_exceptions%rowtype;
  v_topic qarar_topics.topics%rowtype;v_template uuid;v_mapping uuid;v_instance uuid;
  v_current uuid;v_missing integer;
begin
  perform qarar_iam.assert_permission('governance.exceptions.approve',null);
  select * into v_exception from qarar_governance.governance_exceptions
  where id=p_exception_id and organization_id=v_org and status='pending' for update;
  if v_exception.id is null then raise exception using errcode='55000',
    message='طلب الاستثناء غير موجود أو تمت مراجعته';end if;
  if v_exception.requested_by_user_id=v_user then raise exception using errcode='42501',
    message='لا يجوز لمقدم الاستثناء مراجعته';end if;
  if char_length(btrim(coalesce(p_review_comment,'')))<5 then raise exception using errcode='22023',
    message='تعليق المراجعة مطلوب';end if;
  update qarar_governance.governance_exceptions set
    status=case when p_approve then 'approved' else 'rejected' end,
    reviewed_by_user_id=v_user,reviewed_at=now(),review_comment=btrim(p_review_comment)
  where id=p_exception_id;
  if not p_approve then
    perform qarar_topics.apply_governance_snapshot(
      v_exception.topic_id,'exception','routing_blocked',null,null,null,null,null,null,null,
      (select routing_decision_id from qarar_topics.topics where id=v_exception.topic_id)
    );
    return jsonb_build_object('id',p_exception_id,'status','rejected');
  end if;
  select * into v_topic from qarar_topics.topics
  where id=v_exception.topic_id and organization_id=v_org;
  v_template:=(v_exception.requested_route->>'workflow_template_version_id')::uuid;
  update qarar_governance.topic_governance_mappings set
    governance_source='exception',routing_status='routing_resolved',
    workflow_template_version_id=v_template,
    snapshot=jsonb_build_object('exception_id',p_exception_id,'route',v_exception.requested_route),
    mapped_by_user_id=v_user,mapped_at=now()
  where topic_id=v_topic.id
  returning id into v_mapping;
  if v_mapping is null then
  insert into qarar_governance.topic_governance_mappings(
    organization_id,topic_id,governance_source,routing_status,routing_decision_id,
    workflow_template_version_id,snapshot,mapped_by_user_id
  ) values(v_org,v_topic.id,'exception','routing_resolved',v_topic.routing_decision_id,
    v_template,jsonb_build_object('exception_id',p_exception_id,'route',v_exception.requested_route),v_user)
  returning id into v_mapping;
  end if;
  insert into qarar_governance.workflow_instances(
    organization_id,topic_id,topic_governance_mapping_id,workflow_template_version_id,
    started_by_user_id,snapshot
  ) values(v_org,v_topic.id,v_mapping,v_template,v_user,
    jsonb_build_object('exception_id',p_exception_id,'template_version_id',v_template))
  returning id into v_instance;
  insert into qarar_governance.workflow_instance_steps(
    organization_id,workflow_instance_id,template_step_id,sequence_no,status,
    assigned_unit_id,required_permission_code,opened_at,snapshot
  )
  select v_org,v_instance,s.id,s.sequence_no,case when s.is_initial then 'active' else 'pending' end,
    qarar_governance.resolve_step_unit(v_org,v_topic.current_unit_id,s.governance_unit_id,s.governance_class_id),
    s.required_permission_code,case when s.is_initial then now() end,
    jsonb_build_object('step_code',s.step_code,'name_ar',s.name_ar,'responsibility',s.responsibility,
      'governance_unit_id',s.governance_unit_id,'governance_class_id',s.governance_class_id,
      'allowed_outcomes',s.allowed_outcomes)
  from qarar_governance.workflow_template_steps s
  where s.workflow_template_version_id=v_template order by s.sequence_no;
  select count(*) into v_missing from qarar_governance.workflow_instance_steps
  where workflow_instance_id=v_instance and assigned_unit_id is null;
  if v_missing>0 then raise exception using errcode='23514',
    message='تعذر تحديد المجلس المسؤول عن خطوة في مسار الاستثناء';end if;
  select wis.id into v_current from qarar_governance.workflow_instance_steps wis
  join qarar_governance.workflow_template_steps s on s.id=wis.template_step_id
  where wis.workflow_instance_id=v_instance and s.is_initial;
  update qarar_governance.workflow_instances set current_step_id=v_current where id=v_instance;
  perform qarar_topics.apply_governance_snapshot(
    v_topic.id,'exception','routing_ready',null,null,null,null,v_template,v_instance,v_current,
    v_topic.routing_decision_id
  );
  perform qarar_audit.append_audit_log(v_org,'governance.exception.approve','governance_exceptions',
    p_exception_id,jsonb_build_object('topic_id',v_topic.id,'workflow_instance_id',v_instance));
  return jsonb_build_object('id',p_exception_id,'status','approved',
    'topic_id',v_topic.id,'workflow_instance_id',v_instance,'current_workflow_step_id',v_current);
end;
$$;

insert into qarar_architecture.module_function_execute_allowlist(
  source_module,target_schema,function_name,identity_arguments,rationale
) values(
  'topics','qarar_governance','record_unresolved_topic_governance',
  'p_topic_id uuid, p_decision_id uuid, p_outcome text',
  'Persist blocked routing and alert without granting topics cross-module writes'
) on conflict do nothing;
grant execute on function qarar_governance.record_unresolved_topic_governance(uuid,uuid,text)
  to qarar_topics_executor;

do $$
declare f record;
begin
  for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where (n.nspname='qarar_governance' and p.proname in(
      'record_unresolved_topic_governance','request_workflow_exception','approve_workflow_exception'))
      or (n.nspname='qarar_topics' and p.proname='create_topic_with_workflow')
  loop
    execute format('alter function %s owner to %I',f.oid::regprocedure,
      case when (select n.nspname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.oid=f.oid)
        ='qarar_topics' then 'qarar_topics_executor' else 'qarar_governance_executor' end);
    execute format('revoke all on function %s from public,anon,authenticated,service_role',f.oid::regprocedure);
  end loop;
end;
$$;

commit;
