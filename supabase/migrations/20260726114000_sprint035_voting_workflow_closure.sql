begin;

alter table qarar_governance.workflow_template_steps
  drop constraint if exists workflow_template_steps_step_type_check;
alter table qarar_governance.workflow_template_steps
  add constraint workflow_template_steps_step_type_check
  check (step_type in (
    'review','discussion','recommendation','approval','voting','execution','follow_up'
  ));

alter table qarar_voting.voting_rounds
  add column if not exists workflow_instance_step_id uuid;
alter table qarar_voting.voting_rounds
  drop constraint if exists voting_rounds_workflow_step_tenant_fk;
alter table qarar_voting.voting_rounds
  add constraint voting_rounds_workflow_step_tenant_fk
  foreign key (workflow_instance_step_id,organization_id)
  references qarar_governance.workflow_instance_steps(id,organization_id)
  on delete restrict;
create index if not exists voting_rounds_workflow_instance_step_idx
  on qarar_voting.voting_rounds(workflow_instance_step_id)
  where workflow_instance_step_id is not null;

create or replace function qarar_voting.enforce_governed_voting_round()
returns trigger language plpgsql security definer
set search_path=pg_catalog,qarar_voting
as $$
declare
  v_topic record;
  v_meeting_unit uuid;
  v_step record;
begin
  select t.governance_source,t.routing_status,t.workflow_instance_id,
    t.current_workflow_step_id
  into v_topic
  from qarar_meetings.agenda_items a
  join qarar_topics.topics t on t.id=a.topic_id
  where a.id=new.agenda_item_id and a.organization_id=new.organization_id;

  if v_topic.governance_source='legacy' then
    new.workflow_instance_step_id:=null;
    return new;
  end if;
  if v_topic.routing_status<>'routing_ready'
    or v_topic.workflow_instance_id is null
    or v_topic.current_workflow_step_id is null
  then
    raise exception using errcode='55000',
      message='لا يمكن فتح التصويت بلا مسار حوكمة جاهز';
  end if;

  select governance_unit_id into v_meeting_unit
  from qarar_meetings.meetings
  where id=new.meeting_id and organization_id=new.organization_id;

  select s.id,s.assigned_unit_id,s.status,s.workflow_instance_id,
    ts.step_type,ts.responsibility
  into v_step
  from qarar_governance.workflow_instance_steps s
  join qarar_governance.workflow_template_steps ts on ts.id=s.template_step_id
  where s.id=v_topic.current_workflow_step_id
    and s.organization_id=new.organization_id;

  if v_step.id is null or v_step.status<>'active'
    or v_step.workflow_instance_id is distinct from v_topic.workflow_instance_id
  then
    raise exception using errcode='55000',
      message='خطوة الحوكمة الحالية غير نشطة أو لا تتبع المسار';
  end if;
  if v_step.step_type<>'voting' then
    raise exception using errcode='55000',
      message='خطوة الحوكمة الحالية ليست خطوة تصويتية';
  end if;
  if v_step.assigned_unit_id is distinct from v_meeting_unit then
    raise exception using errcode='42501',
      message='التصويت ليس في المجلس المسؤول عن الخطوة الحالية';
  end if;
  if v_step.responsibility not in(
    'discuss','recommend','initial_approve','final_approve'
  ) then
    raise exception using errcode='55000',
      message='مسؤولية الخطوة الحالية لا تسمح بالتصويت';
  end if;

  new.workflow_instance_step_id:=v_step.id;
  return new;
end;
$$;

create or replace function qarar_voting.advance_governed_workflow_from_vote()
returns trigger language plpgsql security definer
set search_path=pg_catalog,qarar_voting
as $$
declare
  v_topic_id uuid;
  v_current_step_id uuid;
  v_action_version integer;
  v_outcome text;
begin
  if new.status<>'closed' or old.status='closed'
    or new.workflow_instance_step_id is null
  then
    return new;
  end if;
  if new.result not in('approved','rejected','tied','no_votes') then
    raise exception using errcode='22023',
      message='نتيجة جولة التصويت لا تحرك مسار الحوكمة';
  end if;

  select a.topic_id into v_topic_id
  from qarar_meetings.agenda_items a
  where a.id=new.agenda_item_id and a.organization_id=new.organization_id;
  select t.current_workflow_step_id into v_current_step_id
  from qarar_topics.topics t
  where t.id=v_topic_id and t.organization_id=new.organization_id
    and t.routing_status='routing_ready';
  if v_current_step_id is distinct from new.workflow_instance_step_id then
    raise exception using errcode='40001',
      message='تغيرت خطوة المسار منذ فتح التصويت؛ لا يمكن تطبيق نتيجة جولة قديمة';
  end if;

  select s.action_version into v_action_version
  from qarar_governance.workflow_instance_steps s
  join qarar_governance.workflow_template_steps ts on ts.id=s.template_step_id
  where s.id=new.workflow_instance_step_id
    and s.organization_id=new.organization_id
    and s.status='active'
    and ts.step_type='voting';
  if v_action_version is null then
    raise exception using errcode='40001',
      message='خطوة التصويت المرتبطة غير نشطة';
  end if;

  v_outcome:=case new.result
    when 'approved' then 'approved'
    when 'rejected' then 'rejected'
    when 'tied' then 'tie'
    when 'no_votes' then 'no_vote'
  end;
  perform set_config('qarar.voting_transition','on',true);
  perform set_config('qarar.voting_round_id',new.id::text,true);
  perform qarar_governance.act_topic_workflow_step(
    v_topic_id,v_outcome,'نتيجة التصويت '||new.id,new.id,v_action_version
  );
  return new;
end;
$$;

create or replace function qarar_governance.enforce_exception_validity()
returns trigger language plpgsql security definer
set search_path=pg_catalog,qarar_governance
as $$
begin
  if new.status in('pending','approved')
    and (new.valid_until is null or new.valid_until<=now())
  then
    if tg_op='UPDATE' and new.status='approved' then
      raise exception using errcode='55000',
        message='انتهت صلاحية طلب المسار المؤقت ولا يمكن اعتماده';
    end if;
    raise exception using errcode='22023',
      message='تاريخ انتهاء مستقبلي مطلوب للمسار المؤقت';
  end if;
  return new;
end;
$$;

drop trigger if exists governance_exceptions_validity_guard
  on qarar_governance.governance_exceptions;
create trigger governance_exceptions_validity_guard
before insert or update of status,valid_until
on qarar_governance.governance_exceptions
for each row execute function qarar_governance.enforce_exception_validity();

create or replace function qarar_governance.request_custom_workflow(
  p_topic_id uuid,
  p_workflow_template_version_id uuid,
  p_reason text,
  p_valid_until timestamptz default null
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,qarar_governance
as $$
declare
  v_organization_id uuid:=qarar_iam.current_organization_id();
  v_actor_id uuid:=auth.uid();
  v_unit_id uuid;
  v_exception_id uuid;
begin
  select current_unit_id into v_unit_id
  from qarar_topics.topics
  where id=p_topic_id
    and organization_id=v_organization_id
    and governance_source='custom'
    and routing_status='routing_exception_pending';
  if v_unit_id is null then
    raise exception using errcode='55000',
      message='the topic is not awaiting a custom workflow route';
  end if;
  perform qarar_iam.assert_permission('governance.exceptions.request',v_unit_id);
  if char_length(btrim(coalesce(p_reason,'')))<10 then
    raise exception using errcode='22023',
      message='a detailed reason is required for a custom workflow route';
  end if;
  if p_valid_until is null or p_valid_until<=now() then
    raise exception using errcode='22023',
      message='a future valid_until is required for a temporary workflow route';
  end if;
  if not exists(
    select 1
    from qarar_governance.workflow_template_versions
    where id=p_workflow_template_version_id
      and organization_id=v_organization_id
      and status='active'
      and validation_status='valid'
  ) then
    raise exception using errcode='23514',message='workflow template is not active and valid';
  end if;

  insert into qarar_governance.governance_exceptions(
    organization_id,topic_id,requested_source,requested_route,
    reason,status,requested_by_user_id,valid_until
  ) values(
    v_organization_id,p_topic_id,'custom',
    jsonb_build_object('workflow_template_version_id',p_workflow_template_version_id),
    btrim(p_reason),'pending',v_actor_id,p_valid_until
  ) returning id into v_exception_id;

  return jsonb_build_object(
    'id',v_exception_id,'topic_id',p_topic_id,'status','pending',
    'governance_source','custom','valid_until',p_valid_until
  );
end;
$$;

revoke all on function qarar_governance.enforce_exception_validity() from public;
revoke all on function qarar_governance.enforce_exception_validity()
  from anon,authenticated,service_role;
alter function qarar_governance.enforce_exception_validity()
  owner to qarar_governance_executor;

insert into qarar_architecture.function_registry(
  function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate
)
select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),
  'governance','qarar_governance',false
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='qarar_governance'
  and p.proname='enforce_exception_validity'
on conflict(function_name,identity_arguments) do update
set function_oid=excluded.function_oid,module_code='governance',
  owning_schema='qarar_governance';

insert into qarar_architecture.module_table_read_allowlist(
  source_module,target_schema,table_name,rationale
) values(
  'voting','qarar_governance','workflow_template_steps',
  'Bind each governed voting round to an active voting template step'
)
on conflict do nothing;
grant usage on schema qarar_governance to qarar_voting_executor;
grant usage on schema qarar_governance to qarar_meetings_executor;
grant select on qarar_governance.workflow_template_steps
  to qarar_voting_executor;

comment on column qarar_voting.voting_rounds.workflow_instance_step_id is
'Immutable governed workflow step captured when the voting round opens; null only for legacy topics.';

commit;
