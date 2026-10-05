begin;

-- Trigger routines are invoked by PostgreSQL, never directly by API roles.
revoke all on function qarar_meetings.require_final_agenda_summaries()
  from public, anon, authenticated, service_role;
revoke all on function qarar_minutes.ensure_final_content_hash()
  from public, anon, authenticated, service_role;

-- Preserve the latest topic-category behavior while restoring module ownership.
do $$
declare v_definition text;
begin
  select pg_get_functiondef('public.get_topic_categories_for_unit(uuid,date)'::regprocedure)
  into v_definition;
  v_definition := regexp_replace(
    v_definition,
    'FUNCTION public\.get_topic_categories_for_unit',
    'FUNCTION qarar_topics.get_topic_categories_for_unit'
  );
  execute v_definition;
end;
$$;

alter function qarar_topics.get_topic_categories_for_unit(uuid, date)
  owner to qarar_topics_executor;
revoke all on function qarar_topics.get_topic_categories_for_unit(uuid, date)
  from public, anon, authenticated, service_role;
grant execute on function qarar_topics.get_topic_categories_for_unit(uuid, date)
  to qarar_api_executor;

create or replace function api_v1.get_topic_categories_for_unit(
  p_governance_unit_id uuid,
  p_effective_on date default current_date
) returns jsonb
language sql
stable
security definer
set search_path=pg_catalog
as $$ select qarar_topics.get_topic_categories_for_unit($1, $2) $$;

alter function api_v1.get_topic_categories_for_unit(uuid, date)
  owner to qarar_api_executor;
revoke all on function api_v1.get_topic_categories_for_unit(uuid, date)
  from public, anon, authenticated, service_role;
grant execute on function api_v1.get_topic_categories_for_unit(uuid, date)
  to authenticated, service_role;

update qarar_architecture.api_contract_registry
set implementation_schema='qarar_topics',
    implementation_name='get_topic_categories_for_unit'
where api_version='v1'
  and contract_name='get_topic_categories_for_unit'
  and identity_arguments='p_governance_unit_id uuid, p_effective_on date';

drop function public.get_topic_categories_for_unit(uuid, date);

insert into qarar_architecture.module_table_read_allowlist(
  source_module, target_schema, table_name, rationale
) values
  ('attendance', 'qarar_iam', 'roles', 'Resolve contextual attendance roles'),
  ('governance', 'qarar_topics', 'topic_attachments', 'Validate evidence attachments owned by a topic'),
  ('minutes', 'qarar_decisions', 'decisions', 'Render approved decisions in meeting minutes')
on conflict (source_module, target_schema, table_name) do update
set rationale=excluded.rationale;

insert into qarar_architecture.module_function_execute_allowlist(
  source_module, target_schema, function_name, identity_arguments, rationale
) values
  ('governance', 'qarar_iam', 'is_system_admin', '', 'Evaluate governance oversight authority'),
  ('minutes', 'qarar_iam', 'assert_permission', 'permission_code text, target_unit_id uuid', 'Enforce minute permissions'),
  ('governance', 'qarar_topics', 'create_topic_unrouted',
   'p_title_ar text, p_description text, p_category_id uuid, p_current_unit_id uuid, p_priority text, p_source_type text, p_title_en text, p_client_request_id uuid',
   'Create a topic before governance routing is atomically attached')
on conflict (source_module, target_schema, function_name, identity_arguments) do update
set rationale=excluded.rationale;

grant execute on function qarar_topics.create_topic_unrouted(
  text, text, uuid, uuid, text, text, text, uuid
) to qarar_governance_executor;

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
  if p_idempotency_key is null then
    raise exception using errcode='22023',message='مفتاح التكرار مطلوب';
  end if;

  select s.* into replay
  from qarar_governance.workflow_instance_steps s
  where s.action_idempotency_key=p_idempotency_key
    and s.workflow_instance_id in(
      select wi.id from qarar_governance.workflow_instances wi
      where wi.topic_id=p_topic_id and wi.organization_id=o
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

  if exists(
    select 1
    from qarar_governance.topic_governance_mappings m
    join qarar_governance.governance_exceptions e
      on (m.snapshot->>'exception_id')::uuid=e.id
    where m.topic_id=p_topic_id and m.organization_id=o
      and (e.status='expired' or (e.status='approved' and e.valid_until<=now()))
  ) then
    raise exception using errcode='55000',message='انتهت صلاحية المسار المؤقت؛ اطلب تجديده ثم المراجعة المستقلة';
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
    and coalesce(current_setting('qarar.voting_transition', true), '')='on'
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
  where id=p_topic_id and organization_id=o;
  perform qarar_topics.apply_governance_snapshot(
    p_topic_id, source, 'routing_ready',
    (select policy_id from qarar_topics.topics where id=p_topic_id and organization_id=o),
    (select policy_version_id from qarar_topics.topics where id=p_topic_id and organization_id=o),
    (select policy_item_id from qarar_topics.topics where id=p_topic_id and organization_id=o),
    (select policy_scope_assignment_id from qarar_topics.topics where id=p_topic_id and organization_id=o),
    i.workflow_template_version_id, i.id, n,
    (select routing_decision_id from qarar_topics.topics where id=p_topic_id and organization_id=o)
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
revoke all on function qarar_governance.act_topic_workflow_step_core(uuid,text,text,uuid,integer)
  from public, anon, authenticated, service_role;
grant execute on function qarar_governance.act_topic_workflow_step_core(uuid,text,text,uuid,integer)
  to qarar_governance_executor;

create or replace function qarar_governance.act_topic_workflow_step(
  p_topic_id uuid,
  p_outcome_code text,
  p_comment text default null,
  p_idempotency_key uuid default null,
  p_expected_version integer default null
) returns jsonb
language plpgsql
security definer
set search_path=pg_catalog
as $$
declare
  v_organization_id uuid := qarar_iam.current_organization_id();
  v_topic qarar_topics.topics%rowtype;
  v_step record;
  v_is_voting_transition boolean;
  v_result jsonb;
begin
  if v_organization_id is null then
    raise exception using errcode='42501', message='تعذر تحديد المؤسسة الحالية';
  end if;

  select * into v_topic
  from qarar_topics.topics
  where id=p_topic_id and organization_id=v_organization_id
  for update;
  if v_topic.id is null then
    raise exception using errcode='P0002', message='الموضوع غير موجود';
  end if;

  select s.id,s.status,ts.step_type,ts.responsibility
    into v_step
  from qarar_governance.workflow_instance_steps s
  join qarar_governance.workflow_template_steps ts on ts.id=s.template_step_id
  where s.id=v_topic.current_workflow_step_id
    and s.workflow_instance_id=v_topic.workflow_instance_id;
  if v_step.id is null or v_step.status<>'active' then
    raise exception using errcode='55000', message='لا توجد خطوة حوكمة نشطة للموضوع';
  end if;

  v_is_voting_transition:=
    coalesce(current_setting('qarar.voting_transition',true),'')='on'
    and nullif(current_setting('qarar.voting_round_id',true),'') is not null;

  if v_step.step_type='voting'
     or v_step.responsibility in('initial_approve','final_approve') then
    if not v_is_voting_transition then
      raise exception using errcode='55000', message='خطوة التصويت تُنفذ حصراً عبر جولة تصويت الاجتماع';
    end if;
  elsif v_step.step_type='discussion'
     or v_step.responsibility in('present','discuss','recommend') then
    raise exception using errcode='55000', message='هذه الخطوة تُنفذ من الاجتماع بعد إدراج الموضوع في جدول الأعمال';
  end if;

  if v_step.step_type='review' or v_step.responsibility='review' then
    perform qarar_topics.assert_topic_requirements_ready(p_topic_id,'before_review');
    if v_topic.status='new' then
      perform qarar_topics.review_topic(p_topic_id,'start_review',null,v_topic.updated_at);
      select * into v_topic
      from qarar_topics.topics
      where id=p_topic_id and organization_id=v_organization_id
      for update;
    end if;
    if p_outcome_code in('approved','completed') and v_topic.status='under_review' then
      perform qarar_topics.review_topic(p_topic_id,'approve',p_comment,v_topic.updated_at);
    elsif p_outcome_code='rejected' and v_topic.status in('new','under_review') then
      perform qarar_topics.review_topic(p_topic_id,'reject',p_comment,v_topic.updated_at);
    end if;
  end if;

  v_result := qarar_governance.act_topic_workflow_step_guarded_core(
    p_topic_id, p_outcome_code, p_comment, p_idempotency_key, p_expected_version
  );

  return v_result || jsonb_build_object(
    'topic_status', (
      select status from qarar_topics.topics
      where id=p_topic_id and organization_id=v_organization_id
    )
  );
end;
$$;

alter function qarar_governance.act_topic_workflow_step(uuid,text,text,uuid,integer)
  owner to qarar_governance_executor;
revoke all on function qarar_governance.act_topic_workflow_step(uuid,text,text,uuid,integer)
  from public, anon, authenticated, service_role;
grant execute on function qarar_governance.act_topic_workflow_step(uuid,text,text,uuid,integer)
  to qarar_api_executor;

update qarar_architecture.api_release_registry release
set contract_count=reviewed.contract_count,
    contract_hash=reviewed.contract_hash,
    released_at=clock_timestamp(),
    notes='Re-frozen after architecture registry and canonical signature reconciliation.'
from (
  select count(*)::integer contract_count,
         md5(string_agg(
           p.proname||'|'||pg_get_function_identity_arguments(p.oid)||'|'||
           pg_get_function_result(p.oid)||'|'||registry.audience,
           E'\n' order by p.proname,pg_get_function_identity_arguments(p.oid)
         )) contract_hash
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace and n.nspname='api_v1'
  join qarar_architecture.api_contract_registry registry
    on registry.api_version='v1'
   and registry.contract_name=p.proname
   and registry.identity_arguments=pg_get_function_identity_arguments(p.oid)
) reviewed
where release.api_version='v1';

commit;
