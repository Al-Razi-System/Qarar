-- Establish physical module ownership while preserving controlled legacy compatibility views.

create schema if not exists qarar_architecture;
create schema if not exists qarar_core;
create schema if not exists qarar_iam;
create schema if not exists qarar_topics;
create schema if not exists qarar_meetings;
create schema if not exists qarar_attendance;
create schema if not exists qarar_voting;
create schema if not exists qarar_minutes;
create schema if not exists qarar_decisions;
create schema if not exists qarar_execution;
create schema if not exists qarar_audit;
create schema if not exists api_v1;

revoke all on schema qarar_architecture,qarar_core,qarar_iam,qarar_topics,qarar_meetings,
 qarar_attendance,qarar_voting,qarar_minutes,qarar_decisions,qarar_execution,qarar_audit,
 api_v1 from public,anon;
grant usage on schema api_v1 to authenticated,service_role;
grant usage on schema qarar_core,qarar_iam,qarar_topics,qarar_meetings,qarar_attendance,
 qarar_voting,qarar_minutes,qarar_decisions,qarar_execution,qarar_audit
to authenticated,service_role;

create table qarar_architecture.module_registry (
  module_code text primary key,
  schema_name name not null unique,
  description text not null,
  is_exposed boolean not null default false
);
revoke all on qarar_architecture.module_registry from public,anon,authenticated;
grant select on qarar_architecture.module_registry to service_role;

insert into qarar_architecture.module_registry(module_code,schema_name,description,is_exposed) values
('core','qarar_core','Tenant and governance-unit reference model',false),
('iam','qarar_iam','Identity, roles, permissions, memberships, SSO, and sessions',false),
('topics','qarar_topics','Topics, categories, referrals, and topic history',false),
('meetings','qarar_meetings','Meetings, agenda, numbering, and lifecycle history',false),
('attendance','qarar_attendance','Check-in, attendance verification, quorum, and evidence',false),
('voting','qarar_voting','Voting rounds, eligibility snapshots, and immutable votes',false),
('minutes','qarar_minutes','Meeting minutes and approvals',false),
('decisions','qarar_decisions','Decisions, notes, and lifecycle history',false),
('execution','qarar_execution','Action items, evidence, follow-up, and escalation',false),
('audit','qarar_audit','Append-only application audit records',false),
('api','api_v1','Version 1 public application contract facade',true)
on conflict(module_code) do update set schema_name=excluded.schema_name,
 description=excluded.description,is_exposed=excluded.is_exposed;

create table qarar_architecture.entity_registry (
  entity_name name primary key,
  module_code text not null references qarar_architecture.module_registry(module_code),
  legacy_public_view boolean not null default true,
  moved_at timestamptz not null default now()
);
revoke all on qarar_architecture.entity_registry from public,anon,authenticated;
grant select on qarar_architecture.entity_registry to service_role;

insert into qarar_architecture.entity_registry(entity_name,module_code) values
('organizations','core'),
('governance_unit_types','core'),
('governance_units','core'),
('users','iam'),
('user_preferences','iam'),
('roles','iam'),
('permissions','iam'),
('role_permissions','iam'),
('memberships','iam'),
('user_invitations','iam'),
('sso_identity_providers','iam'),
('sso_domains','iam'),
('user_identity_links','iam'),
('user_sessions','iam'),
('sso_group_role_mappings','iam'),
('sso_group_membership_links','iam'),
('access_delegations','iam'),
('iam_change_requests','iam'),
('iam_operation_rate_limits','iam'),
('topic_categories','topics'),
('topics','topics'),
('topic_status_history','topics'),
('topic_referrals','topics'),
('topic_number_counters','topics'),
('meeting_types','meetings'),
('meetings','meetings'),
('meeting_status_history','meetings'),
('meeting_number_counters','meetings'),
('agenda_items','meetings'),
('attendance_records','attendance'),
('attendance_history','attendance'),
('attendance_events','attendance'),
('meeting_checkin_sessions','attendance'),
('quorum_snapshots','attendance'),
('voting_rounds','voting'),
('voting_eligible_members','voting'),
('votes','voting'),
('meeting_minutes','minutes'),
('minute_approvals','minutes'),
('decision_types','decisions'),
('decisions','decisions'),
('decision_notes','decisions'),
('decision_status_history','decisions'),
('action_items','execution'),
('action_evidence','execution'),
('follow_up_records','execution'),
('escalations','execution'),
('audit_logs','audit')
on conflict(entity_name) do update set module_code=excluded.module_code;

do $$
declare r record;
begin
 for r in
  select e.entity_name,m.schema_name
  from qarar_architecture.entity_registry e
  join qarar_architecture.module_registry m using(module_code)
  order by e.entity_name
 loop
  execute format('alter table public.%I set schema %I',r.entity_name,r.schema_name);
  execute format('alter table %I.%I enable row level security',r.schema_name,r.entity_name);
 end loop;
end $$;

-- Function source text used qualified public table names. Rebind it to the owning schemas.
do $$
declare f record;r record;v_definition text;
begin
 for f in
  select p.oid
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.prokind='f'
 loop
  v_definition:=pg_get_functiondef(f.oid);
  for r in
   select e.entity_name,m.schema_name
   from qarar_architecture.entity_registry e
   join qarar_architecture.module_registry m using(module_code)
  loop
   v_definition:=replace(v_definition,
    format('public.%I',r.entity_name),
    format('%I.%I',r.schema_name,r.entity_name));
  end loop;
  execute v_definition;
 end loop;
end $$;

-- Legacy public relations are read/write-compatible views for existing trusted integrations only.
do $$
declare r record;
begin
 for r in
  select e.entity_name,m.schema_name
  from qarar_architecture.entity_registry e
  join qarar_architecture.module_registry m using(module_code)
  where e.legacy_public_view
  order by e.entity_name
 loop
  execute format(
   'create view public.%I with (security_invoker=true) as select * from %I.%I',
   r.entity_name,r.schema_name,r.entity_name
  );
  execute format('revoke all on public.%I from public,anon,authenticated',r.entity_name);
  execute format('grant select,insert,update,delete on public.%I to service_role',r.entity_name);
  if has_table_privilege('authenticated',format('%I.%I',r.schema_name,r.entity_name),'select') then
   execute format('grant select on public.%I to authenticated',r.entity_name);
  end if;
  if has_table_privilege('authenticated',format('%I.%I',r.schema_name,r.entity_name),'insert') then
   execute format('grant insert on public.%I to authenticated',r.entity_name);
  end if;
  if has_table_privilege('authenticated',format('%I.%I',r.schema_name,r.entity_name),'update') then
   execute format('grant update on public.%I to authenticated',r.entity_name);
  end if;
  if has_table_privilege('authenticated',format('%I.%I',r.schema_name,r.entity_name),'delete') then
   execute format('grant delete on public.%I to authenticated',r.entity_name);
  end if;
 end loop;
end $$;

comment on schema api_v1 is 'Versioned public RPC facade. Frontends must use this schema.';
comment on schema qarar_architecture is 'Module ownership registry and architecture controls.';
comment on schema qarar_core is 'Internal core tenant and governance-unit module.';
comment on schema qarar_iam is 'Internal identity and access management module.';
comment on schema qarar_topics is 'Internal topic workflow module.';
comment on schema qarar_meetings is 'Internal meeting and agenda module.';
comment on schema qarar_attendance is 'Internal governed attendance and quorum module.';
comment on schema qarar_voting is 'Internal voting module.';
comment on schema qarar_minutes is 'Internal minutes module.';
comment on schema qarar_decisions is 'Internal decisions module.';
comment on schema qarar_execution is 'Internal execution and follow-up module.';
comment on schema qarar_audit is 'Internal append-only audit module.';
