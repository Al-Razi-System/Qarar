begin;

create or replace function qarar_governance.act_topic_workflow_step_core(
  p_topic_id uuid,
  p_outcome_code text,
  p_comment text default null,
  p_idempotency_key uuid default null,
  p_expected_version integer default null
) returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,qarar_governance
as $$
declare
  o uuid:=qarar_iam.current_organization_id();
  actor uuid:=auth.uid();
  i qarar_governance.workflow_instances%rowtype;
  s qarar_governance.workflow_instance_steps%rowtype;
  ts qarar_governance.workflow_template_steps%rowtype;
  t qarar_governance.workflow_template_transitions%rowtype;
  n uuid;
  st text;
  source text;
  ctx jsonb;
  replay qarar_governance.workflow_instance_steps%rowtype;
  v_trusted_vote boolean;
begin
  if exists(
    select 1
    from qarar_governance.topic_governance_mappings m
    join qarar_governance.governance_exceptions e on (m.snapshot->>'exception_id')::uuid=e.id
    where m.topic_id=p_topic_id
      and m.organization_id=o
      and (e.status='expired' or (e.status='approved' and e.valid_until<=now()))
  ) then
    raise exception using errcode='55000',message='انتهت صلاحية المسار المؤقت؛ اطلب تجديده ثم المراجعة المستقلة';
  end if;
  if p_idempotency_key is null then
    raise exception using errcode='22023',message='مفتاح التكرار مطلوب';
  end if;

  select * into replay
  from qarar_governance.workflow_instance_steps
  where action_idempotency_key=p_idempotency_key
    and workflow_instance_id in(
      select id from qarar_governance.workflow_instances
      where topic_id=p_topic_id and organization_id=o
    );
  if replay.id is not null then
    return jsonb_build_object(
      'topic_id',p_topic_id,
      'workflow_instance_id',replay.workflow_instance_id,
      'completed_step_id',replay.id,
      'outcome',replay.outcome_code,
      'version',replay.action_version,
      'idempotent_replay',true
    );
  end if;

  select * into i
  from qarar_governance.workflow_instances
  where topic_id=p_topic_id and organization_id=o and status='active'
  for update;
  if i.id is null then
    raise exception using errcode='55000',message='لا يوجد مسار نشط';
  end if;
  select * into s
  from qarar_governance.workflow_instance_steps
  where id=i.current_step_id
  for update;
  if s.status<>'active' then
    raise exception using errcode='55000',message='لا توجد خطوة نشطة';
  end if;
  if p_expected_version is null or p_expected_version<>s.action_version then
    raise exception using errcode='40001',message='تم تعديل الخطوة؛ حدّث البيانات';
  end if;

  perform qarar_iam.assert_permission(
    coalesce(s.required_permission_code,'topics.review'),s.assigned_unit_id
  );
  select * into ts
  from qarar_governance.workflow_template_steps
  where id=s.template_step_id;

  v_trusted_vote:=
    ts.step_type='voting'
    and current_setting('qarar.voting_transition',true)='on'
    and nullif(current_setting('qarar.voting_round_id',true),'') is not null;
  ctx:=jsonb_build_object(
    'outcome',p_outcome_code,
    'assigned_unit_id',s.assigned_unit_id,
    'topic_id',p_topic_id
  );

  if not qarar_governance.conditions_match(ts.entry_conditions,ctx)
     or (not v_trusted_vote and not qarar_governance.conditions_match(ts.exit_conditions,ctx)) then
    raise exception using errcode='55000',message='شروط الخطوة غير متحققة';
  end if;
  if ts.step_type='voting' and not v_trusted_vote then
    raise exception using errcode='55000',message='الخطوة التصويتية تُحسم من نتيجة التصويت فقط';
  end if;

  select * into t
  from qarar_governance.workflow_template_transitions
  where workflow_template_version_id=i.workflow_template_version_id
    and from_step_id=s.template_step_id
    and outcome_code=p_outcome_code;
  if t.id is null and not(ts.is_terminal and p_outcome_code=any(ts.allowed_outcomes)) then
    raise exception using errcode='22023',message='النتيجة غير مسموحة';
  end if;

  update qarar_governance.workflow_instance_steps
     set status=case when p_outcome_code='rejected' then 'rejected' else 'completed' end,
         acted_by_user_id=actor,
         acted_at=now(),
         outcome_code=p_outcome_code,
         comment=p_comment,
         action_idempotency_key=p_idempotency_key,
         action_version=action_version+1
   where id=s.id;

  if t.to_step_id is not null then
    select id into n
    from qarar_governance.workflow_instance_steps
    where workflow_instance_id=i.id and template_step_id=t.to_step_id;
    update qarar_governance.workflow_instance_steps
       set status='active',opened_at=now()
     where id=n;
    update qarar_governance.workflow_instances
       set current_step_id=n
     where id=i.id;
    st:='active';
  else
    st:=case when p_outcome_code='rejected' then 'rejected' else 'completed' end;
    update qarar_governance.workflow_instances
       set status=st,current_step_id=null,completed_at=now()
     where id=i.id;
  end if;

  select governance_source into source
  from qarar_topics.topics
  where id=p_topic_id;
  perform qarar_topics.apply_governance_snapshot(
    p_topic_id,
    source,
    'routing_ready',
    (select policy_id from qarar_topics.topics where id=p_topic_id),
    (select policy_version_id from qarar_topics.topics where id=p_topic_id),
    (select policy_item_id from qarar_topics.topics where id=p_topic_id),
    (select policy_scope_assignment_id from qarar_topics.topics where id=p_topic_id),
    i.workflow_template_version_id,
    i.id,
    n,
    (select routing_decision_id from qarar_topics.topics where id=p_topic_id)
  );
  return jsonb_build_object(
    'topic_id',p_topic_id,
    'completed_step_id',s.id,
    'next_step_id',n,
    'workflow_status',st,
    'version',s.action_version+1
  );
end;
$$;

alter function qarar_governance.act_topic_workflow_step_core(uuid,text,text,uuid,integer)
  owner to qarar_governance_executor;

commit;
