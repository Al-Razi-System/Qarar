begin;

-- PB-022: governed, versioned minute drafts.  Human approval and meeting
-- closure are implemented by the subsequent Sprint 4 command migrations.

alter table qarar_minutes.meeting_minutes
  add column if not exists current_revision_no integer not null default 0
    check (current_revision_no >= 0);

create table qarar_minutes.minute_revisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references qarar_core.organizations(id) on delete restrict,
  minute_id uuid not null references qarar_minutes.meeting_minutes(id) on delete restrict,
  revision_no integer not null check (revision_no > 0),
  content text not null check (length(btrim(content)) > 0),
  source text not null check (source in ('manual', 'ai_generated', 'ai_regenerated')),
  created_by_user_id uuid references qarar_iam.users(id) on delete restrict,
  generation_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp(),
  unique (id, organization_id),
  unique (minute_id, revision_no),
  foreign key (minute_id, organization_id)
    references qarar_minutes.meeting_minutes(id, organization_id),
  foreign key (created_by_user_id, organization_id)
    references qarar_iam.users(id, organization_id)
);

create table qarar_minutes.minute_status_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references qarar_core.organizations(id) on delete restrict,
  minute_id uuid not null references qarar_minutes.meeting_minutes(id) on delete restrict,
  from_status text,
  to_status text not null check (to_status in ('draft', 'generated', 'ready_for_approval', 'approved', 'rejected')),
  changed_by_user_id uuid references qarar_iam.users(id) on delete set null,
  reason text,
  created_at timestamptz not null default clock_timestamp(),
  unique (id, organization_id),
  foreign key (minute_id, organization_id)
    references qarar_minutes.meeting_minutes(id, organization_id),
  foreign key (changed_by_user_id, organization_id)
    references qarar_iam.users(id, organization_id)
);

create index minute_revisions_minute_idx
  on qarar_minutes.minute_revisions(organization_id, minute_id, revision_no desc);
create index minute_status_history_minute_idx
  on qarar_minutes.minute_status_history(organization_id, minute_id, created_at, id);

insert into qarar_architecture.entity_registry(entity_name,module_code,legacy_public_view)
values
 ('minute_revisions','minutes',false),
 ('minute_status_history','minutes',false)
on conflict(entity_name) do update
set module_code=excluded.module_code, legacy_public_view=excluded.legacy_public_view;

alter table qarar_minutes.minute_revisions enable row level security;
alter table qarar_minutes.minute_status_history enable row level security;

-- All client access is through the api_v1 functions below.  The legacy trigger
-- flow could advance legal state from an arbitrary table update, so retire it.
drop trigger if exists trigger_on_minute_ready on qarar_minutes.meeting_minutes;
drop trigger if exists trigger_on_approval_status_change on qarar_minutes.minute_approvals;
drop policy if exists "unit members can manage minutes" on qarar_minutes.meeting_minutes;
drop policy if exists "minutes follow meeting visibility" on qarar_minutes.meeting_minutes;
drop policy if exists "minute approvals are visible inside organization" on qarar_minutes.minute_approvals;
drop policy if exists "users can update their own approval" on qarar_minutes.minute_approvals;
revoke all on qarar_minutes.meeting_minutes, qarar_minutes.minute_approvals,
  qarar_minutes.minute_revisions, qarar_minutes.minute_status_history
from public, anon, authenticated;

insert into qarar_iam.permissions(
  organization_id,code,module,action,context_scope,name_ar,name_en,is_system_permission
)
select o.id,p.code,'minutes',p.action,'governance_unit',p.name_ar,p.name_en,true
from qarar_core.organizations o cross join (values
 ('minutes.read','read','Read minutes','Read minutes'),
 ('minutes.manage','manage','Manage minute drafts','Manage minute drafts'),
 ('minutes.approve','approve','Approve minutes','Approve minutes')
) p(code,action,name_ar,name_en)
on conflict(organization_id,code) do update set
 module=excluded.module,action=excluded.action,context_scope=excluded.context_scope,
 name_ar=excluded.name_ar,name_en=excluded.name_en,is_system_permission=true,
 is_active=true,updated_at=clock_timestamp();

insert into qarar_iam.role_permissions(organization_id,role_id,permission_id)
select r.organization_id,r.id,p.id
from qarar_iam.roles r
join qarar_iam.permissions p on p.organization_id=r.organization_id
where (r.code='governance_admin' and p.code in ('minutes.read','minutes.manage','minutes.approve'))
   or (r.code='council_chair' and p.code in ('minutes.read','minutes.manage','minutes.approve'))
   or (r.code='council_rapporteur' and p.code in ('minutes.read','minutes.manage'))
   or (r.code='council_member' and p.code='minutes.read')
on conflict(organization_id,role_id,permission_id) do update
set is_active=true,updated_at=clock_timestamp();

create or replace function qarar_minutes.assert_minute_access(
  p_governance_unit_id uuid,
  p_required_permission text
) returns void
language plpgsql security definer
set search_path=pg_catalog,qarar_iam
as $$
begin
  if not (qarar_iam.has_permission(p_required_permission,p_governance_unit_id)
    or (p_required_permission='minutes.read' and qarar_iam.has_permission('minutes.manage',p_governance_unit_id))
    or (p_required_permission='minutes.read' and qarar_iam.has_permission('minutes.approve',p_governance_unit_id))) then
    raise exception 'permission denied: %',p_required_permission using errcode='42501';
  end if;
end;
$$;

create or replace function qarar_minutes.get_meeting_minutes(p_meeting_id uuid)
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,qarar_minutes,qarar_meetings,qarar_iam
as $$
declare v_org uuid:=qarar_iam.current_organization_id(); v_meeting qarar_meetings.meetings%rowtype;
begin
  select * into v_meeting from qarar_meetings.meetings
  where id=p_meeting_id and organization_id=v_org;
  if v_meeting.id is null then raise exception 'meeting not found' using errcode='P0002'; end if;
  perform qarar_minutes.assert_minute_access(v_meeting.governance_unit_id,'minutes.read');
  return jsonb_build_object(
    'meeting_id',v_meeting.id,
    'meeting_status',v_meeting.status,
    'minute',(
      select to_jsonb(m) - 'content_final' || jsonb_build_object(
        'revisions',coalesce((select jsonb_agg(to_jsonb(r) order by r.revision_no desc)
          from qarar_minutes.minute_revisions r where r.minute_id=m.id),'[]'::jsonb),
        'status_history',coalesce((select jsonb_agg(to_jsonb(h) order by h.created_at,h.id)
          from qarar_minutes.minute_status_history h where h.minute_id=m.id),'[]'::jsonb),
        'approvals',coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at,a.id)
          from qarar_minutes.minute_approvals a where a.minute_id=m.id),'[]'::jsonb)
      ) from qarar_minutes.meeting_minutes m where m.meeting_id=v_meeting.id
    )
  );
end;
$$;

create or replace function qarar_minutes.create_minute_draft(
  p_meeting_id uuid,p_content text
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,qarar_minutes,qarar_meetings,qarar_iam,qarar_audit
as $$
declare v_org uuid:=qarar_iam.current_organization_id(); v_actor uuid:=auth.uid();
  v_meeting qarar_meetings.meetings%rowtype; v_minute_id uuid; v_changed timestamptz;
begin
  if nullif(btrim(p_content),'') is null then raise exception 'minute content is required' using errcode='22023'; end if;
  select * into v_meeting from qarar_meetings.meetings where id=p_meeting_id and organization_id=v_org for update;
  if v_meeting.id is null then raise exception 'meeting not found' using errcode='P0002'; end if;
  perform qarar_minutes.assert_minute_access(v_meeting.governance_unit_id,'minutes.manage');
  if v_meeting.status<>'waiting_for_minutes' then raise exception 'meeting is not awaiting minutes' using errcode='23514'; end if;
  if exists(select 1 from qarar_minutes.meeting_minutes where meeting_id=v_meeting.id) then
    raise exception 'minute already exists for meeting' using errcode='23505';
  end if;
  insert into qarar_minutes.meeting_minutes(organization_id,meeting_id,content_draft,status,created_by_user_id,current_revision_no)
  values(v_org,v_meeting.id,btrim(p_content),'draft',v_actor,1)
  returning id,updated_at into v_minute_id,v_changed;
  insert into qarar_minutes.minute_revisions(organization_id,minute_id,revision_no,content,source,created_by_user_id)
  values(v_org,v_minute_id,1,btrim(p_content),'manual',v_actor);
  insert into qarar_minutes.minute_status_history(organization_id,minute_id,to_status,changed_by_user_id,reason)
  values(v_org,v_minute_id,'draft',v_actor,'draft_created');
  perform qarar_audit.append_audit_log(v_org,'minutes.draft_created','meeting_minutes',v_minute_id,
    jsonb_build_object('meeting_id',v_meeting.id,'revision_no',1));
  return jsonb_build_object('minute_id',v_minute_id,'meeting_id',v_meeting.id,
    'status','draft','revision_no',1,'updated_at',v_changed);
end;
$$;

create or replace function qarar_minutes.update_minute_draft(
  p_minute_id uuid,p_content text,p_expected_updated_at timestamptz
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,qarar_minutes,qarar_meetings,qarar_iam,qarar_audit
as $$
declare v_org uuid:=qarar_iam.current_organization_id(); v_actor uuid:=auth.uid();
  v_minute qarar_minutes.meeting_minutes%rowtype; v_unit_id uuid; v_changed timestamptz; v_revision integer;
begin
  if nullif(btrim(p_content),'') is null then raise exception 'minute content is required' using errcode='22023'; end if;
  select * into v_minute
  from qarar_minutes.meeting_minutes
  where id=p_minute_id and organization_id=v_org
  for update;
  if v_minute.id is null then raise exception 'minute not found' using errcode='P0002'; end if;
  select governance_unit_id into v_unit_id
  from qarar_meetings.meetings
  where id=v_minute.meeting_id and organization_id=v_org;
  perform qarar_minutes.assert_minute_access(v_unit_id,'minutes.manage');
  if v_minute.status not in ('draft','generated') then raise exception 'minute is not editable' using errcode='23514'; end if;
  update qarar_minutes.meeting_minutes
  set content_draft=btrim(p_content),current_revision_no=current_revision_no+1
  where id=p_minute_id and updated_at=p_expected_updated_at
  returning updated_at,current_revision_no into v_changed,v_revision;
  if v_changed is null then raise exception 'minute has changed; reload it before saving' using errcode='40001'; end if;
  insert into qarar_minutes.minute_revisions(organization_id,minute_id,revision_no,content,source,created_by_user_id)
  values(v_org,p_minute_id,v_revision,btrim(p_content),'manual',v_actor);
  perform qarar_audit.append_audit_log(v_org,'minutes.draft_updated','meeting_minutes',p_minute_id,
    jsonb_build_object('revision_no',v_revision));
  return jsonb_build_object('minute_id',p_minute_id,'status',v_minute.status,
    'revision_no',v_revision,'updated_at',v_changed);
end;
$$;

alter function qarar_minutes.assert_minute_access(uuid,text) owner to qarar_minutes_executor;
alter function qarar_minutes.get_meeting_minutes(uuid) owner to qarar_minutes_executor;
alter function qarar_minutes.create_minute_draft(uuid,text) owner to qarar_minutes_executor;
alter function qarar_minutes.update_minute_draft(uuid,text,timestamptz) owner to qarar_minutes_executor;
revoke all on function qarar_minutes.assert_minute_access(uuid,text),
  qarar_minutes.get_meeting_minutes(uuid),qarar_minutes.create_minute_draft(uuid,text),
  qarar_minutes.update_minute_draft(uuid,text,timestamptz)
from public,anon,authenticated,service_role;

insert into qarar_architecture.module_function_execute_allowlist(
 source_module,target_schema,function_name,identity_arguments,rationale
) values
 ('minutes','qarar_iam','current_organization_id','','Resolve minute caller tenant'),
 ('minutes','qarar_iam','has_permission','permission_code text, target_unit_id uuid','Authorize minute access'),
 ('minutes','qarar_audit','append_audit_log','p_organization_id uuid, p_action text, p_entity_type text, p_entity_id uuid, p_metadata jsonb','Audit minute draft mutations')
on conflict do nothing;
grant usage on schema qarar_iam,qarar_audit to qarar_minutes_executor;
grant execute on function qarar_iam.current_organization_id(),qarar_iam.has_permission(text,uuid)
  to qarar_minutes_executor;
grant execute on function qarar_audit.append_audit_log(uuid,text,text,uuid,jsonb) to qarar_minutes_executor;

insert into qarar_architecture.function_registry(
 function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate
)
select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),'minutes','qarar_minutes',false
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='qarar_minutes' and p.proname in(
 'assert_minute_access','get_meeting_minutes','create_minute_draft','update_minute_draft')
on conflict(function_oid) do update set function_name=excluded.function_name,
 identity_arguments=excluded.identity_arguments,module_code='minutes',owning_schema='qarar_minutes',is_rls_predicate=false;

insert into qarar_architecture.api_contract_registry(
 api_version,contract_name,implementation_schema,implementation_name,identity_arguments,module_code,audience
) values
 ('v1','get_meeting_minutes','qarar_minutes','get_meeting_minutes','p_meeting_id uuid','minutes','authenticated'),
 ('v1','create_minute_draft','qarar_minutes','create_minute_draft','p_meeting_id uuid, p_content text','minutes','authenticated'),
 ('v1','update_minute_draft','qarar_minutes','update_minute_draft','p_minute_id uuid, p_content text, p_expected_updated_at timestamp with time zone','minutes','authenticated')
on conflict do nothing;

do $$
declare c record; f record; args text; call_args text; sql text;
begin
  for c in select * from qarar_architecture.api_contract_registry
   where api_version='v1' and module_code='minutes'
     and contract_name in ('get_meeting_minutes','create_minute_draft','update_minute_draft')
  loop
    select p.oid,pg_get_function_arguments(p.oid) arguments,pg_get_function_result(p.oid) result
    into f from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname=c.implementation_schema and p.proname=c.implementation_name
      and pg_get_function_identity_arguments(p.oid)=c.identity_arguments;
    select string_agg(split_part(btrim(a),' ',1),',' order by ord) into call_args
    from unnest(string_to_array(c.identity_arguments,',')) with ordinality z(a,ord);
    sql:=format('create or replace function api_v1.%I(%s) returns %s language sql volatile security definer set search_path=pg_catalog as $f$ select %I.%I(%s) $f$',
      c.contract_name,f.arguments,f.result,c.implementation_schema,c.implementation_name,call_args);
    execute sql;
    execute format('alter function api_v1.%I(%s) owner to qarar_api_executor',c.contract_name,c.identity_arguments);
    execute format('revoke all on function api_v1.%I(%s) from public,anon,service_role',c.contract_name,c.identity_arguments);
    execute format('grant execute on function api_v1.%I(%s) to authenticated',c.contract_name,c.identity_arguments);
    execute format('grant usage on schema qarar_minutes to qarar_api_executor');
    execute format('grant execute on function qarar_minutes.%I(%s) to qarar_api_executor',c.implementation_name,c.identity_arguments);
  end loop;
end;
$$;

comment on table qarar_minutes.minute_revisions is
  'Append-only draft and generated-content snapshots. Client DML is prohibited.';
comment on table qarar_minutes.minute_status_history is
  'Append-only governed minute lifecycle history. Client DML is prohibited.';

commit;
