begin;

alter table qarar_topics.topics drop constraint topics_governance_source_check;
alter table qarar_topics.topics add constraint topics_governance_source_check
  check(governance_source is null or governance_source in('regulated','custom','exception','legacy'));
alter table qarar_topics.topics alter column governance_source set default 'legacy';
alter table qarar_topics.topics alter column routing_status set default 'routing_ready';
update qarar_topics.topics set governance_source='legacy',routing_status='routing_ready'
where governance_source is null and routing_decision_id is null;

create or replace function qarar_meetings.enforce_governed_agenda_topic()
returns trigger language plpgsql security definer
set search_path=pg_catalog,qarar_meetings
as $$
declare v_topic record;v_meeting record;v_step record;
begin
  select organization_id,governance_source,routing_status,workflow_instance_id,current_workflow_step_id
  into v_topic from qarar_topics.topics where id=new.topic_id;
  select organization_id,governance_unit_id into v_meeting
  from qarar_meetings.meetings where id=new.meeting_id;
  if v_topic.organization_id is distinct from new.organization_id
    or v_meeting.organization_id is distinct from new.organization_id then
    raise exception using errcode='23503',message='الموضوع أو الاجتماع خارج المؤسسة';
  end if;
  if v_topic.governance_source='legacy' then return new;end if;
  if v_topic.routing_status<>'routing_ready' or v_topic.workflow_instance_id is null
    or v_topic.current_workflow_step_id is null then
    raise exception using errcode='55000',message='لا يمكن إضافة موضوع بلا مسار حوكمة جاهز';
  end if;
  select s.assigned_unit_id,(s.snapshot->>'responsibility') responsibility into v_step
  from qarar_governance.workflow_instance_steps s
  where s.id=v_topic.current_workflow_step_id and s.workflow_instance_id=v_topic.workflow_instance_id
    and s.status='active';
  if v_step.assigned_unit_id is distinct from v_meeting.governance_unit_id then
    raise exception using errcode='42501',message='الاجتماع ليس للمجلس المسؤول عن الخطوة الحالية';
  end if;
  if v_step.responsibility not in(
    'present','discuss','recommend','initial_approve','final_approve'
  ) then raise exception using errcode='55000',
    message='الخطوة الحالية لا تسمح بعرض الموضوع على الأجندة';end if;
  return new;
end;
$$;

create trigger agenda_items_governance_guard
before insert or update of topic_id,meeting_id on qarar_meetings.agenda_items
for each row execute function qarar_meetings.enforce_governed_agenda_topic();

create or replace function qarar_voting.enforce_governed_voting_round()
returns trigger language plpgsql security definer
set search_path=pg_catalog,qarar_voting
as $$
declare v_topic record;v_meeting_unit uuid;v_step record;
begin
  select t.governance_source,t.routing_status,t.workflow_instance_id,t.current_workflow_step_id
  into v_topic
  from qarar_meetings.agenda_items a join qarar_topics.topics t on t.id=a.topic_id
  where a.id=new.agenda_item_id and a.organization_id=new.organization_id;
  if v_topic.governance_source='legacy' then return new;end if;
  if v_topic.routing_status<>'routing_ready' or v_topic.current_workflow_step_id is null then
    raise exception using errcode='55000',message='لا يمكن فتح التصويت بلا مسار حوكمة جاهز';
  end if;
  select governance_unit_id into v_meeting_unit from qarar_meetings.meetings where id=new.meeting_id;
  select s.assigned_unit_id,(s.snapshot->>'responsibility') responsibility into v_step
  from qarar_governance.workflow_instance_steps s
  where s.id=v_topic.current_workflow_step_id and s.status='active';
  if v_step.assigned_unit_id is distinct from v_meeting_unit then
    raise exception using errcode='42501',message='التصويت ليس في المجلس المسؤول عن الخطوة الحالية';
  end if;
  if v_step.responsibility not in('discuss','recommend','initial_approve','final_approve') then
    raise exception using errcode='55000',message='الخطوة الحالية لا تسمح بالتصويت';
  end if;
  return new;
end;
$$;

create trigger voting_rounds_governance_guard
before insert on qarar_voting.voting_rounds
for each row execute function qarar_voting.enforce_governed_voting_round();

insert into qarar_architecture.module_table_read_allowlist(
  source_module,target_schema,table_name,rationale
) values
('meetings','qarar_governance','workflow_instance_steps',
 'Verify the assigned council and responsibility before agenda admission'),
('voting','qarar_governance','workflow_instance_steps',
 'Verify the assigned council and voting responsibility before opening a round')
on conflict do nothing;
grant select on qarar_governance.workflow_instance_steps
  to qarar_meetings_executor,qarar_voting_executor;

alter function qarar_meetings.enforce_governed_agenda_topic() owner to qarar_meetings_executor;
alter function qarar_voting.enforce_governed_voting_round() owner to qarar_voting_executor;
revoke all on function qarar_meetings.enforce_governed_agenda_topic()
  from public,anon,authenticated,service_role;
revoke all on function qarar_voting.enforce_governed_voting_round()
  from public,anon,authenticated,service_role;

comment on column qarar_topics.topics.governance_source is
'regulated/custom/exception for governed topics; legacy is an internal migration-only compatibility marker.';

commit;
