-- Preserve every council pass while allowing the contextual chair to return
-- an unlisted topic to the immediately preceding council with a written cause.
-- Impact map: docs/engineering/impact/CROSS_COUNCIL_TOPIC_RETURN_20261027_AR.md
begin;

create table qarar_governance.workflow_step_cycles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  workflow_instance_id uuid not null,
  workflow_instance_step_id uuid not null,
  template_step_id uuid not null,
  cycle_no integer not null,
  status text not null,
  assigned_unit_id uuid,
  opened_at timestamptz,
  closed_at timestamptz,
  acted_by_user_id uuid,
  outcome_code text,
  reason text,
  action_idempotency_key uuid,
  created_at timestamptz not null default clock_timestamp(),
  unique (id, organization_id),
  unique (workflow_instance_id, template_step_id, cycle_no),
  unique (workflow_instance_id, action_idempotency_key),
  foreign key (workflow_instance_id, organization_id)
    references qarar_governance.workflow_instances(id, organization_id) on delete restrict,
  foreign key (workflow_instance_step_id, organization_id)
    references qarar_governance.workflow_instance_steps(id, organization_id) on delete restrict,
  foreign key (template_step_id, organization_id)
    references qarar_governance.workflow_template_steps(id, organization_id) on delete restrict,
  foreign key (assigned_unit_id, organization_id)
    references qarar_core.governance_units(id, organization_id) on delete restrict,
  foreign key (acted_by_user_id, organization_id)
    references qarar_iam.users(id, organization_id) on delete restrict,
  check (cycle_no > 0),
  check (status in ('pending','active','completed','returned','rejected','cancelled','skipped')),
  check (outcome_code is null or outcome_code in ('approved','rejected','returned','tie','no_vote','cancelled','completed')),
  check (reason is null or char_length(btrim(reason)) >= 10)
);

alter table qarar_governance.workflow_step_cycles owner to qarar_governance_executor;
revoke all on qarar_governance.workflow_step_cycles from public,anon,authenticated,service_role;
alter table qarar_governance.workflow_step_cycles enable row level security;

create index workflow_step_cycles_instance_timeline_idx
  on qarar_governance.workflow_step_cycles(workflow_instance_id, cycle_no, created_at);
create index workflow_step_cycles_step_timeline_idx
  on qarar_governance.workflow_step_cycles(workflow_instance_step_id, cycle_no);

-- Existing rows become cycle one without changing their operational state.
insert into qarar_governance.workflow_step_cycles(
  organization_id,workflow_instance_id,workflow_instance_step_id,template_step_id,
  cycle_no,status,assigned_unit_id,opened_at,closed_at,acted_by_user_id,
  outcome_code,reason,action_idempotency_key,created_at
)
select s.organization_id,s.workflow_instance_id,s.id,s.template_step_id,
  1,s.status,s.assigned_unit_id,s.opened_at,s.acted_at,s.acted_by_user_id,
  s.outcome_code,case when char_length(btrim(coalesce(s.comment,'')))>=10 then btrim(s.comment) end,
  s.action_idempotency_key,s.created_at
from qarar_governance.workflow_instance_steps s;

create function qarar_governance.return_topic_to_previous_council(
  p_topic_id uuid,
  p_reason text,
  p_idempotency_key uuid,
  p_expected_version integer
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_org uuid := qarar_iam.current_organization_id();
  v_actor uuid := auth.uid();
  v_topic qarar_topics.topics%rowtype;
  v_instance qarar_governance.workflow_instances%rowtype;
  v_current qarar_governance.workflow_instance_steps%rowtype;
  v_previous qarar_governance.workflow_instance_steps%rowtype;
  v_replay qarar_governance.workflow_step_cycles%rowtype;
  v_previous_cycle integer;
  v_now timestamptz := clock_timestamp();
begin
  if v_org is null or v_actor is null then
    raise exception using errcode='42501',message='يلزم تسجيل الدخول لإرجاع الموضوع.';
  end if;
  if p_idempotency_key is null then
    raise exception using errcode='22023',message='تعذر تأكيد العملية؛ أعد المحاولة.';
  end if;

  select c.* into v_replay
  from qarar_governance.workflow_step_cycles c
  join qarar_governance.workflow_instances i on i.id=c.workflow_instance_id
  where i.topic_id=p_topic_id and i.organization_id=v_org
    and c.action_idempotency_key=p_idempotency_key;
  if v_replay.id is not null then
    return jsonb_build_object(
      'topic_id',p_topic_id,
      'returned_from_step_id',v_replay.workflow_instance_step_id,
      'returned_to_unit_id',(
        select s.assigned_unit_id from qarar_governance.workflow_instance_steps s
        where s.workflow_instance_id=v_replay.workflow_instance_id and s.status='active'
        order by s.sequence_no limit 1
      ),
      'idempotent_replay',true
    );
  end if;

  if char_length(btrim(coalesce(p_reason,''))) < 10 then
    raise exception using errcode='22023',message='اكتب سبب الإرجاع بوضوح في عشرة أحرف على الأقل.';
  end if;

  select * into v_topic from qarar_topics.topics
  where id=p_topic_id and organization_id=v_org for update;
  if v_topic.id is null then
    raise exception using errcode='P0002',message='الموضوع غير موجود.';
  end if;
  select * into v_instance from qarar_governance.workflow_instances
  where id=v_topic.workflow_instance_id and organization_id=v_org and status='active' for update;
  if v_instance.id is null then
    raise exception using errcode='55000',message='لا يوجد مسار نشط يمكن إرجاعه.';
  end if;
  select * into v_current from qarar_governance.workflow_instance_steps
  where id=v_instance.current_step_id and workflow_instance_id=v_instance.id for update;
  if v_current.id is null or v_current.status<>'active' then
    raise exception using errcode='55000',message='لا توجد مرحلة مجلس نشطة للموضوع.';
  end if;
  if not qarar_iam.has_unit_role_code(v_current.assigned_unit_id,array['council_chair']) then
    raise exception using errcode='42501',message='إرجاع الموضوع متاح لرئيس المجلس الحالي فقط.';
  end if;
  if p_expected_version is null or p_expected_version<>v_current.action_version then
    raise exception using errcode='40001',message='تغيّرت حالة الموضوع؛ حدّث الصفحة ثم أعد المحاولة.';
  end if;
  if exists(
    select 1 from qarar_meetings.agenda_items ai
    join qarar_meetings.meetings m on m.id=ai.meeting_id
    where ai.topic_id=p_topic_id and ai.organization_id=v_org
      and m.governance_unit_id=v_current.assigned_unit_id
      and m.status not in ('closed','cancelled')
  ) and current_setting('qarar.rejected_vote_resolution',true) is distinct from 'on' then
    raise exception using errcode='55000',message='الموضوع مدرج في جدول اجتماع؛ عالجه من داخل الاجتماع.';
  end if;

  select * into v_previous from qarar_governance.workflow_instance_steps
  where workflow_instance_id=v_instance.id and sequence_no<v_current.sequence_no
  order by sequence_no desc limit 1 for update;
  -- Rows created after this migration (and fixtures/imports) receive their
  -- immutable first-cycle snapshot lazily before a repeated pass is opened.
  insert into qarar_governance.workflow_step_cycles(
    organization_id,workflow_instance_id,workflow_instance_step_id,template_step_id,
    cycle_no,status,assigned_unit_id,opened_at,closed_at,acted_by_user_id,
    outcome_code,reason,action_idempotency_key,created_at
  )
  select s.organization_id,s.workflow_instance_id,s.id,s.template_step_id,
    1,s.status,s.assigned_unit_id,s.opened_at,s.acted_at,s.acted_by_user_id,
    s.outcome_code,case when char_length(btrim(coalesce(s.comment,'')))>=10 then btrim(s.comment) end,
    s.action_idempotency_key,s.created_at
  from qarar_governance.workflow_instance_steps s
  where s.workflow_instance_id=v_instance.id
  on conflict (workflow_instance_id,template_step_id,cycle_no) do nothing;

  update qarar_governance.workflow_step_cycles
  set status='returned',closed_at=v_now,acted_by_user_id=v_actor,
      outcome_code='returned',reason=btrim(p_reason),action_idempotency_key=p_idempotency_key
  where workflow_instance_id=v_instance.id and template_step_id=v_current.template_step_id
    and cycle_no=(select max(cycle_no) from qarar_governance.workflow_step_cycles
                  where workflow_instance_id=v_instance.id and template_step_id=v_current.template_step_id);

  if v_previous.id is not null then
    select coalesce(max(cycle_no),0)+1 into v_previous_cycle
    from qarar_governance.workflow_step_cycles
    where workflow_instance_id=v_instance.id and template_step_id=v_previous.template_step_id;
    insert into qarar_governance.workflow_step_cycles(
      organization_id,workflow_instance_id,workflow_instance_step_id,template_step_id,
      cycle_no,status,assigned_unit_id,opened_at
    ) values (
      v_org,v_instance.id,v_previous.id,v_previous.template_step_id,
      v_previous_cycle,'active',v_previous.assigned_unit_id,v_now
    );
  end if;

  update qarar_governance.workflow_instance_steps
  set status='returned',acted_by_user_id=v_actor,acted_at=v_now,outcome_code='returned',
      comment=btrim(p_reason),action_idempotency_key=p_idempotency_key,
      action_version=action_version+1,updated_at=v_now
  where id=v_current.id;
  if v_previous.id is not null then
    update qarar_governance.workflow_instance_steps
    set status='active',opened_at=v_now,acted_by_user_id=null,acted_at=null,
        outcome_code=null,comment=null,action_idempotency_key=null,
        action_version=action_version+1,updated_at=v_now
    where id=v_previous.id;
    update qarar_governance.workflow_instances
    set current_step_id=v_previous.id,status='active',completed_at=null,updated_at=v_now
    where id=v_instance.id;
    update qarar_topics.topics
    set current_workflow_step_id=v_previous.id,current_unit_id=v_previous.assigned_unit_id,
        status='approved',routing_status='routing_ready',updated_at=v_now
    where id=v_topic.id;
  else
    update qarar_governance.workflow_instances
    set current_step_id=null,status='blocked',completed_at=null,updated_at=v_now
    where id=v_instance.id;
    update qarar_topics.topics
    set current_workflow_step_id=null,current_unit_id=null,status='returned',
        routing_status='routing_blocked',updated_at=v_now
    where id=v_topic.id;
  end if;

  perform qarar_audit.append_audit_log(
    v_org,'topic.returned_to_previous_council','topics',p_topic_id,
    jsonb_build_object(
      'reason',btrim(p_reason),'from_step_id',v_current.id,'from_unit_id',v_current.assigned_unit_id,
      'to_step_id',v_previous.id,'to_unit_id',v_previous.assigned_unit_id,
      'returned_to_submitter',v_previous.id is null,
      'cycle_no',v_previous_cycle,'idempotency_key',p_idempotency_key
    )
  );
  return jsonb_build_object(
    'topic_id',p_topic_id,'returned_from_step_id',v_current.id,
    'returned_to_step_id',v_previous.id,'returned_to_unit_id',v_previous.assigned_unit_id,
    'returned_to_submitter',v_previous.id is null,
    'cycle_no',v_previous_cycle,'idempotent_replay',false
  );
end;
$$;

alter function qarar_governance.return_topic_to_previous_council(uuid,text,uuid,integer) owner to qarar_governance_executor;
revoke all on function qarar_governance.return_topic_to_previous_council(uuid,text,uuid,integer) from public,anon,authenticated,service_role;
grant execute on function qarar_governance.return_topic_to_previous_council(uuid,text,uuid,integer) to qarar_api_executor;

grant execute on function qarar_iam.has_unit_role_code(uuid,text[]) to qarar_governance_executor;
grant execute on function qarar_audit.append_audit_log(uuid,text,text,uuid,jsonb) to qarar_governance_executor;
insert into qarar_architecture.module_function_execute_allowlist(
  source_module,target_schema,function_name,identity_arguments,rationale
) values
('governance','qarar_iam','has_unit_role_code','target_unit_id uuid, role_codes text[]','Only the contextual chair may return a topic to the previous council'),
('governance','qarar_audit','append_audit_log','p_organization_id uuid, p_action text, p_entity_type text, p_entity_id uuid, p_metadata jsonb','Keep an immutable audit event for every cross-council topic return')
on conflict do nothing;

insert into qarar_architecture.entity_registry(entity_name,module_code,legacy_public_view)
values ('workflow_step_cycles','governance',false) on conflict do nothing;
insert into qarar_architecture.function_registry(
  function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate
)
select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),'governance','qarar_governance',false
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='qarar_governance' and p.proname='return_topic_to_previous_council'
on conflict do nothing;

create function qarar_meetings.get_topic_return_option(p_topic_id uuid,p_meeting_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare
  v_org uuid:=qarar_iam.current_organization_id();
  v_meeting qarar_meetings.meetings%rowtype;
  v_topic qarar_topics.topics%rowtype;
  v_step qarar_governance.workflow_instance_steps%rowtype;
  v_previous qarar_governance.workflow_instance_steps%rowtype;
  v_is_chair boolean:=false;
  v_blocker text;
begin
  select * into v_meeting from qarar_meetings.meetings
  where id=p_meeting_id and organization_id=v_org;
  if v_meeting.id is null then
    raise exception using errcode='P0002',message='الاجتماع غير موجود.';
  end if;
  perform qarar_iam.assert_permission('agenda.manage',v_meeting.governance_unit_id);
  select * into v_topic from qarar_topics.topics
  where id=p_topic_id and organization_id=v_org;
  if v_topic.id is null then
    raise exception using errcode='P0002',message='الموضوع غير موجود.';
  end if;
  select * into v_step from qarar_governance.workflow_instance_steps
  where id=v_topic.current_workflow_step_id and workflow_instance_id=v_topic.workflow_instance_id;
  select * into v_previous from qarar_governance.workflow_instance_steps
  where workflow_instance_id=v_topic.workflow_instance_id and sequence_no<v_step.sequence_no
  order by sequence_no desc limit 1;
  v_is_chair:=v_step.id is not null
    and qarar_iam.has_unit_role_code(v_meeting.governance_unit_id,array['council_chair']);
  v_blocker:=case
    when v_meeting.status not in ('draft','scheduled') then 'يمكن إرجاع الموضوع أثناء إعداد جدول الأعمال فقط.'
    when v_step.id is null or v_step.status<>'active' then 'لا توجد مرحلة مجلس نشطة لهذا الموضوع.'
    when v_step.assigned_unit_id is distinct from v_meeting.governance_unit_id then 'الموضوع ليس في مرحلة هذا المجلس.'
    when exists(select 1 from qarar_meetings.agenda_items ai where ai.meeting_id=v_meeting.id and ai.topic_id=v_topic.id) then 'الموضوع مدرج في جدول الأعمال؛ عالجه من داخل الاجتماع.'
    when not v_is_chair then 'إرجاع الموضوع متاح لرئيس هذا المجلس فقط.'
  end;
  return jsonb_build_object(
    'available',v_blocker is null,'reason_unavailable',v_blocker,
    'expected_version',v_step.action_version,'current_step_id',v_step.id,
    'current_unit_name_ar',(select name_ar from qarar_core.governance_units where id=v_step.assigned_unit_id),
    'previous_step_id',v_previous.id,'previous_unit_id',v_previous.assigned_unit_id,
    'previous_unit_name_ar',coalesce((select name_ar from qarar_core.governance_units where id=v_previous.assigned_unit_id),'مقدم الموضوع')
  );
end;
$$;
alter function qarar_meetings.get_topic_return_option(uuid,uuid) owner to qarar_meetings_executor;
revoke all on function qarar_meetings.get_topic_return_option(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function qarar_meetings.get_topic_return_option(uuid,uuid) to qarar_api_executor;
insert into qarar_architecture.function_registry(
  function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate
)
select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),'meetings','qarar_meetings',false
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='qarar_meetings' and p.proname='get_topic_return_option'
on conflict do nothing;

create function api_v1.get_topic_return_option(p_topic_id uuid,p_meeting_id uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog
as $$select qarar_meetings.get_topic_return_option($1,$2)$$;
alter function api_v1.get_topic_return_option(uuid,uuid) owner to qarar_api_executor;
revoke all on function api_v1.get_topic_return_option(uuid,uuid) from public,anon;
grant execute on function api_v1.get_topic_return_option(uuid,uuid) to authenticated,service_role;
insert into qarar_architecture.api_contract_registry(
  api_version,contract_name,implementation_schema,implementation_name,
  identity_arguments,module_code,audience
) values (
  'v1','get_topic_return_option','qarar_meetings','get_topic_return_option',
  'p_topic_id uuid, p_meeting_id uuid','meetings','authenticated'
) on conflict do nothing;

create function api_v1.return_topic_to_previous_council(
  p_topic_id uuid,p_reason text,p_idempotency_key uuid,p_expected_version integer
) returns jsonb language sql security definer set search_path=pg_catalog
as $$select qarar_governance.return_topic_to_previous_council($1,$2,$3,$4)$$;
alter function api_v1.return_topic_to_previous_council(uuid,text,uuid,integer) owner to qarar_api_executor;
revoke all on function api_v1.return_topic_to_previous_council(uuid,text,uuid,integer) from public,anon;
grant execute on function api_v1.return_topic_to_previous_council(uuid,text,uuid,integer) to authenticated,service_role;
insert into qarar_architecture.api_contract_registry(
  api_version,contract_name,implementation_schema,implementation_name,
  identity_arguments,module_code,audience
) values (
  'v1','return_topic_to_previous_council','qarar_governance','return_topic_to_previous_council',
  'p_topic_id uuid, p_reason text, p_idempotency_key uuid, p_expected_version integer','governance','authenticated'
) on conflict do nothing;

create function qarar_governance.get_topic_resubmission_option(p_topic_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare
  v_org uuid:=qarar_iam.current_organization_id();
  v_actor uuid:=auth.uid();
  v_topic qarar_topics.topics%rowtype;
  v_instance qarar_governance.workflow_instances%rowtype;
  v_step qarar_governance.workflow_instance_steps%rowtype;
  v_blocker text;
begin
  select * into v_topic from qarar_topics.topics
  where id=p_topic_id and organization_id=v_org;
  if v_topic.id is null then
    raise exception using errcode='P0002',message='الموضوع غير موجود.';
  end if;
  select * into v_instance from qarar_governance.workflow_instances
  where id=v_topic.workflow_instance_id and organization_id=v_org;
  select * into v_step from qarar_governance.workflow_instance_steps
  where workflow_instance_id=v_instance.id and status='returned'
  order by sequence_no limit 1;
  v_blocker:=case
    when v_topic.submitted_by_user_id is distinct from v_actor then 'إعادة إرسال الموضوع متاحة لمقدم الموضوع فقط.'
    when v_topic.status<>'returned' or v_topic.routing_status<>'routing_blocked' then 'الموضوع ليس بانتظار استكمال من مقدمه.'
    when v_instance.status<>'blocked' or v_instance.current_step_id is not null then 'تغيّرت حالة مسار الموضوع؛ حدّث الصفحة.'
    when v_step.id is null then 'تعذر تحديد مرحلة المجلس التي سيعود إليها الموضوع.'
  end;
  return jsonb_build_object(
    'available',v_blocker is null,
    'reason_unavailable',v_blocker,
    'expected_version',v_step.action_version,
    'destination_step_id',v_step.id,
    'destination_unit_id',v_step.assigned_unit_id,
    'destination_unit_name_ar',(select name_ar from qarar_core.governance_units where id=v_step.assigned_unit_id)
  );
end;
$$;

create function qarar_governance.resubmit_returned_topic(
  p_topic_id uuid,
  p_idempotency_key uuid,
  p_expected_version integer
) returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare
  v_org uuid:=qarar_iam.current_organization_id();
  v_actor uuid:=auth.uid();
  v_topic qarar_topics.topics%rowtype;
  v_instance qarar_governance.workflow_instances%rowtype;
  v_step qarar_governance.workflow_instance_steps%rowtype;
  v_cycle integer;
  v_now timestamptz:=clock_timestamp();
begin
  if v_org is null or v_actor is null then
    raise exception using errcode='42501',message='يلزم تسجيل الدخول لإعادة إرسال الموضوع.';
  end if;
  if p_idempotency_key is null then
    raise exception using errcode='22023',message='تعذر تأكيد العملية؛ أعد المحاولة.';
  end if;

  select t.* into v_topic from qarar_topics.topics t
  join qarar_governance.workflow_instances i on i.id=t.workflow_instance_id
  join qarar_governance.workflow_instance_steps s on s.workflow_instance_id=i.id
  where t.id=p_topic_id and t.organization_id=v_org
    and s.action_idempotency_key=p_idempotency_key and s.status='active';
  if v_topic.id is not null then
    return jsonb_build_object('topic_id',p_topic_id,'idempotent_replay',true);
  end if;

  select * into v_topic from qarar_topics.topics
  where id=p_topic_id and organization_id=v_org for update;
  if v_topic.id is null then
    raise exception using errcode='P0002',message='الموضوع غير موجود.';
  end if;
  if v_topic.submitted_by_user_id<>v_actor then
    raise exception using errcode='42501',message='إعادة إرسال الموضوع متاحة لمقدم الموضوع فقط.';
  end if;
  if v_topic.status<>'returned' or v_topic.routing_status<>'routing_blocked' then
    raise exception using errcode='55000',message='الموضوع ليس بانتظار استكمال من مقدمه.';
  end if;
  select * into v_instance from qarar_governance.workflow_instances
  where id=v_topic.workflow_instance_id and organization_id=v_org for update;
  if v_instance.id is null or v_instance.status<>'blocked' or v_instance.current_step_id is not null then
    raise exception using errcode='55000',message='تغيّرت حالة مسار الموضوع؛ حدّث الصفحة.';
  end if;
  select * into v_step from qarar_governance.workflow_instance_steps
  where workflow_instance_id=v_instance.id and status='returned'
  order by sequence_no limit 1 for update;
  if v_step.id is null then
    raise exception using errcode='55000',message='تعذر تحديد مرحلة المجلس التي سيعود إليها الموضوع.';
  end if;
  if p_expected_version is null or p_expected_version<>v_step.action_version then
    raise exception using errcode='40001',message='تغيّرت حالة الموضوع؛ حدّث الصفحة ثم أعد المحاولة.';
  end if;

  if v_topic.topic_type_version_id is not null or v_topic.policy_item_id is not null then
    perform qarar_topics.assert_topic_requirements_ready(p_topic_id,'before_submission');
  end if;
  select coalesce(max(cycle_no),0)+1 into v_cycle
  from qarar_governance.workflow_step_cycles
  where workflow_instance_id=v_instance.id and template_step_id=v_step.template_step_id;
  insert into qarar_governance.workflow_step_cycles(
    organization_id,workflow_instance_id,workflow_instance_step_id,template_step_id,
    cycle_no,status,assigned_unit_id,opened_at,action_idempotency_key
  ) values (
    v_org,v_instance.id,v_step.id,v_step.template_step_id,
    v_cycle,'active',v_step.assigned_unit_id,v_now,p_idempotency_key
  );
  update qarar_governance.workflow_instance_steps
  set status='active',opened_at=v_now,acted_by_user_id=null,acted_at=null,
      outcome_code=null,comment=null,action_idempotency_key=p_idempotency_key,
      action_version=action_version+1,updated_at=v_now
  where id=v_step.id;
  update qarar_governance.workflow_instances
  set status='active',current_step_id=v_step.id,completed_at=null,updated_at=v_now
  where id=v_instance.id;
  update qarar_topics.topics
  set status='approved',routing_status='routing_ready',current_unit_id=v_step.assigned_unit_id,
      current_workflow_step_id=v_step.id,updated_at=v_now
  where id=v_topic.id;
  perform qarar_audit.append_audit_log(
    v_org,'topic.resubmitted_after_return','topics',p_topic_id,
    jsonb_build_object('step_id',v_step.id,'unit_id',v_step.assigned_unit_id,
      'cycle_no',v_cycle,'idempotency_key',p_idempotency_key)
  );
  return jsonb_build_object(
    'topic_id',p_topic_id,'step_id',v_step.id,'unit_id',v_step.assigned_unit_id,
    'cycle_no',v_cycle,'idempotent_replay',false
  );
end;
$$;

alter function qarar_governance.get_topic_resubmission_option(uuid) owner to qarar_governance_executor;
alter function qarar_governance.resubmit_returned_topic(uuid,uuid,integer) owner to qarar_governance_executor;
revoke all on function qarar_governance.get_topic_resubmission_option(uuid) from public,anon,authenticated,service_role;
revoke all on function qarar_governance.resubmit_returned_topic(uuid,uuid,integer) from public,anon,authenticated,service_role;
grant execute on function qarar_governance.get_topic_resubmission_option(uuid) to qarar_api_executor;
grant execute on function qarar_governance.resubmit_returned_topic(uuid,uuid,integer) to qarar_api_executor;
grant execute on function qarar_topics.assert_topic_requirements_ready(uuid,text) to qarar_governance_executor;

insert into qarar_architecture.module_function_execute_allowlist(
  source_module,target_schema,function_name,identity_arguments,rationale
) values
('governance','qarar_topics','assert_topic_requirements_ready','p_topic_id uuid, p_phase text','Require submitter to complete mandatory evidence before resubmitting a returned topic')
on conflict do nothing;

insert into qarar_architecture.function_registry(
  function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate
)
select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),'governance','qarar_governance',false
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='qarar_governance' and p.proname in ('get_topic_resubmission_option','resubmit_returned_topic')
on conflict do nothing;

create function api_v1.get_topic_resubmission_option(p_topic_id uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog
as $$select qarar_governance.get_topic_resubmission_option($1)$$;
create function api_v1.resubmit_returned_topic(
  p_topic_id uuid,p_idempotency_key uuid,p_expected_version integer
) returns jsonb language sql security definer set search_path=pg_catalog
as $$select qarar_governance.resubmit_returned_topic($1,$2,$3)$$;
alter function api_v1.get_topic_resubmission_option(uuid) owner to qarar_api_executor;
alter function api_v1.resubmit_returned_topic(uuid,uuid,integer) owner to qarar_api_executor;
revoke all on function api_v1.get_topic_resubmission_option(uuid) from public,anon;
revoke all on function api_v1.resubmit_returned_topic(uuid,uuid,integer) from public,anon;
grant execute on function api_v1.get_topic_resubmission_option(uuid) to authenticated,service_role;
grant execute on function api_v1.resubmit_returned_topic(uuid,uuid,integer) to authenticated,service_role;
insert into qarar_architecture.api_contract_registry(
  api_version,contract_name,implementation_schema,implementation_name,
  identity_arguments,module_code,audience
) values
('v1','get_topic_resubmission_option','qarar_governance','get_topic_resubmission_option','p_topic_id uuid','governance','authenticated'),
('v1','resubmit_returned_topic','qarar_governance','resubmit_returned_topic','p_topic_id uuid, p_idempotency_key uuid, p_expected_version integer','governance','authenticated')
on conflict do nothing;

notify pgrst,'reload schema';
commit;
