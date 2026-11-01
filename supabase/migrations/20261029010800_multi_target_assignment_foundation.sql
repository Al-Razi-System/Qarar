-- Logical assignment batches, explicit unit responsibles, and read-only target preview.
begin;

create table qarar_core.organizational_unit_responsibles(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references qarar_core.organizations(id) on delete restrict,
  governance_unit_id uuid not null,
  user_id uuid not null,
  valid_from date not null default current_date,
  valid_until date,
  reason text not null check(char_length(btrim(reason)) between 5 and 1000),
  created_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  unique(id,organization_id),
  foreign key(governance_unit_id,organization_id) references qarar_core.governance_units(id,organization_id) on delete restrict,
  foreign key(user_id,organization_id) references qarar_iam.users(id,organization_id) on delete restrict,
  foreign key(created_by_user_id,organization_id) references qarar_iam.users(id,organization_id) on delete restrict,
  check(valid_until is null or valid_until>=valid_from)
);
create unique index organizational_unit_responsibles_current_uidx
  on qarar_core.organizational_unit_responsibles(organization_id,governance_unit_id)
  where valid_until is null;
alter table qarar_core.organizational_unit_responsibles add constraint organizational_unit_responsibles_no_overlap
  exclude using gist(
    organization_id with =,
    governance_unit_id with =,
    daterange(valid_from,coalesce(valid_until + 1,'infinity'::date),'[)') with &&
  );
alter table qarar_core.organizational_unit_responsibles enable row level security;
alter table qarar_core.organizational_unit_responsibles force row level security;
revoke all on qarar_core.organizational_unit_responsibles from public,anon,authenticated,service_role;
grant select,insert,update on qarar_core.organizational_unit_responsibles to qarar_core_executor;

create table qarar_meetings.meeting_assignment_batches(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references qarar_core.organizations(id) on delete restrict,
  meeting_id uuid not null,
  agenda_item_id uuid not null,
  decision_id uuid not null,
  title_ar text not null check(char_length(btrim(title_ar)) between 5 and 300),
  description text check(char_length(description)<=2000),
  follow_up_user_id uuid not null,
  due_date date,
  requires_evidence boolean not null default false,
  selection_snapshot jsonb not null check(jsonb_typeof(selection_snapshot)='array'),
  status text not null check(status in('proposed','active','withdrawn')),
  target_count integer not null check(target_count between 1 and 200),
  revision integer not null default 0 check(revision>=0),
  proposed_by_user_id uuid not null,
  issued_by_user_id uuid,
  issued_at timestamptz,
  client_request_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,organization_id),
  unique(organization_id,proposed_by_user_id,client_request_id),
  foreign key(meeting_id,organization_id) references qarar_meetings.meetings(id,organization_id) on delete restrict,
  foreign key(agenda_item_id,organization_id) references qarar_meetings.agenda_items(id,organization_id) on delete restrict,
  foreign key(decision_id,organization_id) references qarar_decisions.decisions(id,organization_id) on delete restrict,
  foreign key(follow_up_user_id,organization_id) references qarar_iam.users(id,organization_id) on delete restrict,
  foreign key(proposed_by_user_id,organization_id) references qarar_iam.users(id,organization_id) on delete restrict,
  foreign key(issued_by_user_id,organization_id) references qarar_iam.users(id,organization_id) on delete restrict,
  check(status<>'active' or (issued_by_user_id is not null and issued_at is not null))
);
create index meeting_assignment_batches_meeting_idx on qarar_meetings.meeting_assignment_batches(organization_id,meeting_id,created_at);
alter table qarar_meetings.meeting_assignment_batches enable row level security;
alter table qarar_meetings.meeting_assignment_batches force row level security;
revoke all on qarar_meetings.meeting_assignment_batches from public,anon,authenticated,service_role;
grant select,insert,update on qarar_meetings.meeting_assignment_batches to qarar_meetings_executor;

create table qarar_meetings.meeting_assignment_targets(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references qarar_core.organizations(id) on delete restrict,
  batch_id uuid not null,
  target_kind text not null check(target_kind in('user','unit')),
  target_user_id uuid,
  target_unit_id uuid,
  resolved_user_id uuid not null,
  resolved_user_name_ar text not null,
  resolved_unit_name_ar text,
  selection_kind text not null check(selection_kind in('user','unit','unit_type')),
  source_unit_type_id uuid,
  source_scope_unit_id uuid,
  legacy_assignment_id uuid,
  created_at timestamptz not null default now(),
  unique(id,organization_id),
  foreign key(batch_id,organization_id) references qarar_meetings.meeting_assignment_batches(id,organization_id) on delete restrict,
  foreign key(target_user_id,organization_id) references qarar_iam.users(id,organization_id) on delete restrict,
  foreign key(target_unit_id,organization_id) references qarar_core.governance_units(id,organization_id) on delete restrict,
  foreign key(resolved_user_id,organization_id) references qarar_iam.users(id,organization_id) on delete restrict,
  foreign key(source_unit_type_id,organization_id) references qarar_core.governance_unit_types(id,organization_id) on delete restrict,
  foreign key(source_scope_unit_id,organization_id) references qarar_core.governance_units(id,organization_id) on delete restrict,
  foreign key(legacy_assignment_id,organization_id) references qarar_meetings.meeting_assignments(id,organization_id) on delete restrict,
  check((target_kind='user' and target_user_id is not null and target_unit_id is null)
     or (target_kind='unit' and target_user_id is null and target_unit_id is not null))
);
create index meeting_assignment_targets_batch_idx on qarar_meetings.meeting_assignment_targets(batch_id,created_at);
create unique index meeting_assignment_targets_user_uidx
  on qarar_meetings.meeting_assignment_targets(batch_id,target_user_id)
  where target_kind='user';
create unique index meeting_assignment_targets_unit_uidx
  on qarar_meetings.meeting_assignment_targets(batch_id,target_unit_id)
  where target_kind='unit';
alter table qarar_meetings.meeting_assignment_targets enable row level security;
alter table qarar_meetings.meeting_assignment_targets force row level security;
revoke all on qarar_meetings.meeting_assignment_targets from public,anon,authenticated,service_role;
grant select,insert,update on qarar_meetings.meeting_assignment_targets to qarar_meetings_executor;

alter table qarar_meetings.meeting_assignments add column assignment_batch_id uuid;
alter table qarar_meetings.meeting_assignments add constraint meeting_assignments_batch_tenant_fk
  foreign key(assignment_batch_id,organization_id)
  references qarar_meetings.meeting_assignment_batches(id,organization_id) on delete restrict;
create index meeting_assignments_batch_idx on qarar_meetings.meeting_assignments(assignment_batch_id);

create function qarar_meetings.preview_meeting_assignment_targets(p_agenda_item_id uuid,p_selections jsonb)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_org uuid:=qarar_iam.current_organization_id();v_meeting_id uuid;v_ctx jsonb;v_count integer;
begin
  select meeting_id into v_meeting_id from qarar_meetings.agenda_items
  where id=p_agenda_item_id and organization_id=v_org;
  if v_meeting_id is null then raise exception using errcode='P0002',message='بند الاجتماع غير موجود.';end if;
  v_ctx:=qarar_meetings.assignment_context(v_meeting_id);
  if not(coalesce((v_ctx->>'chair')::boolean,false) or coalesce((v_ctx->>'rapporteur')::boolean,false)) then
    raise exception using errcode='42501',message='معاينة مستهدفي التكليف متاحة لرئيس المجلس ومقرره.';
  end if;
  if jsonb_typeof(p_selections)<>'array' or jsonb_array_length(p_selections) not between 1 and 200 then
    raise exception using errcode='22023',message='اختر مستهدفاً واحداً على الأقل، وبحد أقصى 200.';
  end if;
  with recursive selections as(
    select x.kind,x.id,x.scope_unit_id from jsonb_to_recordset(p_selections) x(kind text,id uuid,scope_unit_id uuid)
  ), descendants as(
    select g.id,g.parent_unit_id,g.unit_type_id from qarar_core.governance_units g,selections s
    where s.kind='unit_type' and s.scope_unit_id is not null and g.id=s.scope_unit_id and g.organization_id=v_org
    union all
    select c.id,c.parent_unit_id,c.unit_type_id from qarar_core.governance_units c join descendants p on c.parent_unit_id=p.id
    where c.organization_id=v_org and c.status='active'
  ), raw_targets as(
    select 'user'::text target_kind,s.id target_user_id,null::uuid target_unit_id,'user'::text selection_kind,null::uuid source_type,null::uuid source_scope from selections s where s.kind='user'
    union all select 'unit',null,s.id,'unit',null,null from selections s where s.kind='unit'
    union all
    select 'unit',null,g.id,'unit_type',s.id,s.scope_unit_id from selections s join qarar_core.governance_units g
      on s.kind='unit_type' and g.organization_id=v_org and g.status='active' and g.unit_type_id=s.id
      and (s.scope_unit_id is null or g.id in(select id from descendants))
  ), targets as(select distinct * from raw_targets), resolved as(
    select t.*,coalesce(t.target_user_id,leader.user_id) resolved_user_id,
      u.full_name_ar resolved_user_name_ar,gu.name_ar resolved_unit_name_ar,
      case when t.target_kind='user' and u.id is null then 'المستخدم غير موجود أو غير نشط.'
           when t.target_kind='unit' and gu.id is null then 'الوحدة غير موجودة أو غير نشطة.'
           when t.target_kind='unit' and leader.candidate_count=0 then 'لا يوجد مسؤول محدد لهذه الوحدة.'
           when t.target_kind='unit' and leader.candidate_count>1 then 'يوجد أكثر من مسؤول محتمل لهذه الوحدة.' end blocker
    from targets t
    left join qarar_core.governance_units gu on gu.id=t.target_unit_id and gu.organization_id=v_org and gu.status='active'
    left join lateral(
      select count(*)::integer candidate_count,min(c.user_id) user_id from(
        select r.user_id from qarar_core.organizational_unit_responsibles r
        join qarar_iam.users ru on ru.id=r.user_id and ru.organization_id=r.organization_id and ru.status='active'
        where r.organization_id=v_org and r.governance_unit_id=t.target_unit_id
          and r.valid_from<=current_date and (r.valid_until is null or r.valid_until>=current_date)
        union
        select m.user_id from qarar_core.governance_units council
        join qarar_iam.memberships m on m.governance_unit_id=council.id and m.organization_id=council.organization_id
          and m.membership_status='active' and m.start_date<=current_date and (m.end_date is null or m.end_date>=current_date)
        join qarar_iam.roles role on role.id=m.role_id and role.organization_id=m.organization_id and role.code='council_chair' and role.is_active
        join qarar_iam.users cu on cu.id=m.user_id and cu.organization_id=m.organization_id and cu.status='active'
        where council.organization_id=v_org and council.scope_unit_id=t.target_unit_id and council.status='active'
          and not exists(select 1 from qarar_core.organizational_unit_responsibles r where r.organization_id=v_org and r.governance_unit_id=t.target_unit_id and r.valid_from<=current_date and (r.valid_until is null or r.valid_until>=current_date))
      ) c
    ) leader on t.target_kind='unit'
    left join qarar_iam.users u on u.id=coalesce(t.target_user_id,leader.user_id) and u.organization_id=v_org and u.status='active'
  )
  select jsonb_build_object(
    'count',count(*) filter(where blocker is null),
    'targets',coalesce(jsonb_agg(jsonb_build_object('target_kind',target_kind,'target_user_id',target_user_id,'target_unit_id',target_unit_id,'resolved_user_id',resolved_user_id,'resolved_user_name_ar',resolved_user_name_ar,'resolved_unit_name_ar',resolved_unit_name_ar,'selection_kind',selection_kind,'source_unit_type_id',source_type,'source_scope_unit_id',source_scope) order by coalesce(resolved_unit_name_ar,resolved_user_name_ar)) filter(where blocker is null),'[]'::jsonb),
    'blockers',coalesce(jsonb_agg(jsonb_build_object('target_unit_id',target_unit_id,'unit_name_ar',resolved_unit_name_ar,'reason',blocker) order by resolved_unit_name_ar) filter(where blocker is not null),'[]'::jsonb)
  ) into v_ctx from resolved;
  return v_ctx;
end;
$$;
alter function qarar_meetings.preview_meeting_assignment_targets(uuid,jsonb) owner to qarar_meetings_executor;
revoke all on function qarar_meetings.preview_meeting_assignment_targets(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function qarar_meetings.preview_meeting_assignment_targets(uuid,jsonb) to qarar_api_executor;

create function api_v2.preview_meeting_assignment_targets_v2(p_agenda_item_id uuid,p_selections jsonb)
returns jsonb language sql stable security definer set search_path=pg_catalog
as $$select qarar_meetings.preview_meeting_assignment_targets($1,$2)$$;
alter function api_v2.preview_meeting_assignment_targets_v2(uuid,jsonb) owner to qarar_api_executor;
revoke all on function api_v2.preview_meeting_assignment_targets_v2(uuid,jsonb) from public,anon,service_role;
grant execute on function api_v2.preview_meeting_assignment_targets_v2(uuid,jsonb) to authenticated;

insert into qarar_architecture.entity_registry(entity_name,module_code,legacy_public_view) values
('organizational_unit_responsibles','core',false),
('meeting_assignment_batches','meetings',false),
('meeting_assignment_targets','meetings',false)
on conflict(entity_name) do update set module_code=excluded.module_code,legacy_public_view=false;

insert into qarar_architecture.function_registry(function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate)
select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),'meetings',n.nspname,false
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where p.oid='qarar_meetings.preview_meeting_assignment_targets(uuid,jsonb)'::regprocedure
on conflict(function_oid) do update set function_name=excluded.function_name,identity_arguments=excluded.identity_arguments,module_code=excluded.module_code,owning_schema=excluded.owning_schema,is_rls_predicate=false;

insert into qarar_architecture.api_contract_registry(api_version,contract_name,implementation_schema,implementation_name,identity_arguments,module_code,audience)
values('v2','preview_meeting_assignment_targets_v2','qarar_meetings','preview_meeting_assignment_targets','p_agenda_item_id uuid, p_selections jsonb','meetings','authenticated')
on conflict(api_version,contract_name,identity_arguments) do update set implementation_schema=excluded.implementation_schema,implementation_name=excluded.implementation_name,module_code=excluded.module_code,audience=excluded.audience;

insert into qarar_architecture.module_table_read_allowlist(source_module,target_schema,table_name,rationale) values
('meetings','qarar_core','organizational_unit_responsibles','Resolve the responsible user for a selected organizational unit'),
('meetings','qarar_iam','memberships','Resolve the active chair of the single council scoped to an organizational unit'),
('meetings','qarar_iam','roles','Identify the contextual council chair while resolving a unit target')
on conflict do nothing;
grant select on qarar_core.organizational_unit_responsibles to qarar_meetings_executor;

notify pgrst,'reload schema';
commit;
