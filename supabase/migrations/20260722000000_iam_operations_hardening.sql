-- Production IAM operations: sessions, SSO group mapping, temporary delegation,
-- sensitive-change approvals, and portable permission-matrix exports.

create table public.user_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  user_id uuid not null references public.users(id) on delete cascade,
  auth_session_id uuid,
  device_id text not null,
  device_name text,
  platform text,
  app_version text,
  ip_address inet,
  user_agent text,
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  revocation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id, device_id),
  foreign key (user_id, organization_id) references public.users(id, organization_id)
);

create table public.sso_group_role_mappings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  provider_id uuid not null references public.sso_identity_providers(id) on delete cascade,
  external_group text not null,
  role_id uuid not null references public.roles(id) on delete restrict,
  governance_unit_id uuid not null references public.governance_units(id) on delete restrict,
  membership_title text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, provider_id, external_group),
  foreign key (provider_id, organization_id) references public.sso_identity_providers(id, organization_id),
  foreign key (role_id, organization_id) references public.roles(id, organization_id),
  foreign key (governance_unit_id, organization_id) references public.governance_units(id, organization_id)
);

create table public.access_delegations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  delegated_by_user_id uuid not null references public.users(id) on delete restrict,
  delegated_to_user_id uuid not null references public.users(id) on delete restrict,
  source_membership_id uuid not null references public.memberships(id) on delete restrict,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text not null,
  status text not null default 'active' check (status in ('active', 'revoked', 'expired')),
  revoked_at timestamptz,
  revoked_by_user_id uuid references public.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (delegated_by_user_id <> delegated_to_user_id),
  check (ends_at > starts_at),
  foreign key (delegated_by_user_id, organization_id) references public.users(id, organization_id),
  foreign key (delegated_to_user_id, organization_id) references public.users(id, organization_id)
);

create table public.iam_change_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  change_type text not null check (change_type in ('role_permissions_replace', 'permission_matrix_import')),
  target_role_id uuid references public.roles(id) on delete restrict,
  payload jsonb not null,
  justification text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled', 'applied', 'failed')),
  requested_by_user_id uuid not null references public.users(id) on delete restrict,
  reviewed_by_user_id uuid references public.users(id) on delete restrict,
  reviewed_at timestamptz,
  review_notes text,
  applied_at timestamptz,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (requested_by_user_id, organization_id) references public.users(id, organization_id),
  foreign key (reviewed_by_user_id, organization_id) references public.users(id, organization_id),
  foreign key (target_role_id, organization_id) references public.roles(id, organization_id)
);

create table public.iam_operation_rate_limits (
  actor_user_id uuid not null,
  operation text not null,
  window_started_at timestamptz not null,
  request_count integer not null default 1 check (request_count > 0),
  primary key (actor_user_id, operation, window_started_at)
);

create index user_sessions_active_idx on public.user_sessions (user_id, last_seen_at desc) where revoked_at is null;
create index access_delegations_effective_idx on public.access_delegations (delegated_to_user_id, starts_at, ends_at) where status = 'active';
create index iam_change_requests_pending_idx on public.iam_change_requests (organization_id, created_at) where status = 'pending';

create trigger set_user_sessions_updated_at before update on public.user_sessions for each row execute function public.set_updated_at();
create trigger set_sso_group_role_mappings_updated_at before update on public.sso_group_role_mappings for each row execute function public.set_updated_at();
create trigger set_access_delegations_updated_at before update on public.access_delegations for each row execute function public.set_updated_at();
create trigger set_iam_change_requests_updated_at before update on public.iam_change_requests for each row execute function public.set_updated_at();

alter table public.user_sessions enable row level security;
alter table public.sso_group_role_mappings enable row level security;
alter table public.access_delegations enable row level security;
alter table public.iam_change_requests enable row level security;

grant select, insert, update on public.user_sessions to authenticated;
grant select, insert, update, delete on public.sso_group_role_mappings to authenticated;
grant select, insert, update on public.access_delegations to authenticated;
grant select, insert, update on public.iam_change_requests to authenticated;

create policy "users can read own sessions" on public.user_sessions for select to authenticated
using (user_id = auth.uid() or public.has_permission('iam.users.manage'));
create policy "users can register own sessions" on public.user_sessions for insert to authenticated
with check (user_id = auth.uid() and organization_id = public.current_organization_id());
create policy "users can update own sessions" on public.user_sessions for update to authenticated
using (user_id = auth.uid() or public.has_permission('iam.users.manage'))
with check (organization_id = public.current_organization_id());
create policy "iam admins manage sso group mappings" on public.sso_group_role_mappings for all to authenticated
using (organization_id = public.current_organization_id() and public.has_permission('iam.sso.manage'))
with check (organization_id = public.current_organization_id() and public.has_permission('iam.sso.manage'));
create policy "users read related delegations" on public.access_delegations for select to authenticated
using (organization_id = public.current_organization_id() and (delegated_by_user_id = auth.uid() or delegated_to_user_id = auth.uid() or public.has_permission('iam.roles.read')));
create policy "role admins manage delegations" on public.access_delegations for all to authenticated
using (organization_id = public.current_organization_id() and public.has_permission('iam.roles.assign'))
with check (organization_id = public.current_organization_id() and public.has_permission('iam.roles.assign'));
create policy "iam admins read change requests" on public.iam_change_requests for select to authenticated
using (organization_id = public.current_organization_id() and public.has_permission('iam.permissions.read'));
create policy "iam admins create change requests" on public.iam_change_requests for insert to authenticated
with check (organization_id = public.current_organization_id() and requested_by_user_id = auth.uid() and public.has_permission('iam.permissions.manage'));
create policy "iam admins review change requests" on public.iam_change_requests for update to authenticated
using (organization_id = public.current_organization_id() and public.has_permission('iam.permissions.manage'))
with check (organization_id = public.current_organization_id());

create trigger audit_user_sessions_changes after insert or update or delete on public.user_sessions for each row execute function public.audit_row_change();
create trigger audit_sso_group_role_mappings_changes after insert or update or delete on public.sso_group_role_mappings for each row execute function public.audit_row_change();
create trigger audit_access_delegations_changes after insert or update or delete on public.access_delegations for each row execute function public.audit_row_change();
create trigger audit_iam_change_requests_changes after insert or update or delete on public.iam_change_requests for each row execute function public.audit_row_change();

create or replace function public.has_permission(permission_code text, target_unit_id uuid default null)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.is_system_admin(), false) or coalesce(exists (
    select 1
    from public.memberships m
    join public.roles r on r.id = m.role_id and r.organization_id = m.organization_id and r.is_active
    join public.role_permissions rp on rp.role_id = r.id and rp.organization_id = m.organization_id and rp.is_active
    join public.permissions p on p.id = rp.permission_id and p.organization_id = m.organization_id and p.is_active
    where m.organization_id = public.current_organization_id()
      and m.membership_status = 'active' and (m.end_date is null or m.end_date >= current_date)
      and p.code = permission_code
      and (m.user_id = auth.uid() or exists (
        select 1 from public.access_delegations d
        where d.source_membership_id = m.id and d.organization_id = m.organization_id
          and d.delegated_to_user_id = auth.uid() and d.status = 'active'
          and now() between d.starts_at and d.ends_at
      ))
      and (p.context_scope in ('system', 'organization', 'self') or target_unit_id is null or m.governance_unit_id = target_unit_id)
  ), false);
$$;

create or replace function public.register_user_session(
  p_device_id text, p_device_name text default null, p_platform text default null,
  p_app_version text default null, p_auth_session_id uuid default null,
  p_ip_address inet default null, p_user_agent text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_org uuid := public.current_organization_id(); v_id uuid;
begin
  if auth.uid() is null or nullif(btrim(p_device_id), '') is null then raise exception 'authenticated user and device id are required'; end if;
  insert into public.user_sessions(organization_id,user_id,auth_session_id,device_id,device_name,platform,app_version,ip_address,user_agent,last_seen_at,revoked_at,revocation_reason)
  values(v_org,auth.uid(),p_auth_session_id,btrim(p_device_id),nullif(btrim(p_device_name),''),nullif(btrim(p_platform),''),nullif(btrim(p_app_version),''),p_ip_address,nullif(btrim(p_user_agent),''),now(),null,null)
  on conflict (organization_id,user_id,device_id) do update set auth_session_id=excluded.auth_session_id,device_name=excluded.device_name,platform=excluded.platform,app_version=excluded.app_version,ip_address=excluded.ip_address,user_agent=excluded.user_agent,last_seen_at=now(),revoked_at=null,revocation_reason=null
  returning id into v_id;
  return v_id;
end; $$;

create or replace function public.consume_iam_rate_limit(
  p_operation text, p_limit integer default 10, p_window_seconds integer default 600
) returns integer language plpgsql security definer set search_path=public as $$
declare v_actor uuid:=auth.uid(); v_window timestamptz; v_count integer;
begin
  if v_actor is null then raise exception 'authenticated user is required'; end if;
  if p_limit<1 or p_limit>1000 or p_window_seconds<1 or p_window_seconds>86400 then raise exception 'invalid rate limit configuration'; end if;
  v_window:=to_timestamp(floor(extract(epoch from now())/p_window_seconds)*p_window_seconds);
  insert into public.iam_operation_rate_limits(actor_user_id,operation,window_started_at,request_count)
  values(v_actor,btrim(p_operation),v_window,1)
  on conflict(actor_user_id,operation,window_started_at) do update set request_count=public.iam_operation_rate_limits.request_count+1
  returning request_count into v_count;
  if v_count>p_limit then raise exception 'rate limit exceeded for %',p_operation using errcode='P0001'; end if;
  delete from public.iam_operation_rate_limits where window_started_at<now()-interval '2 days';
  return v_count;
end; $$;

create or replace function public.list_my_sessions() returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(s) - 'organization_id' - 'user_id' order by s.last_seen_at desc),'[]'::jsonb)
  from public.user_sessions s where s.user_id=auth.uid() and s.organization_id=public.current_organization_id();
$$;

create or replace function public.request_session_revocation(p_session_id uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_session public.user_sessions%rowtype; v_revoke_all boolean;
begin
  select * into v_session from public.user_sessions where id=p_session_id and organization_id=public.current_organization_id();
  if v_session.id is null then raise exception 'session not found'; end if;
  if v_session.user_id <> auth.uid() and not public.has_permission('iam.users.manage') then raise exception 'permission denied' using errcode='42501'; end if;
  v_revoke_all := v_session.user_id = auth.uid();
  update public.user_sessions set revoked_at=now(),revocation_reason='revoked_by_user_or_admin' where id=p_session_id;
  perform public.append_audit_log(v_session.organization_id,'iam.session.revoke','user_sessions',p_session_id,jsonb_build_object('target_user_id',v_session.user_id));
  return jsonb_build_object('session_id',p_session_id,'revoke_all',v_revoke_all);
end; $$;

create or replace function public.admin_upsert_sso_group_mapping(
  p_provider_id uuid,p_external_group text,p_role_id uuid,p_governance_unit_id uuid,p_membership_title text default null,p_is_active boolean default true
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_org uuid:=public.current_organization_id(); v_id uuid;
begin
  perform public.assert_permission('iam.sso.manage');
  insert into public.sso_group_role_mappings(organization_id,provider_id,external_group,role_id,governance_unit_id,membership_title,is_active)
  values(v_org,p_provider_id,btrim(p_external_group),p_role_id,p_governance_unit_id,nullif(btrim(p_membership_title),''),p_is_active)
  on conflict(organization_id,provider_id,external_group) do update set role_id=excluded.role_id,governance_unit_id=excluded.governance_unit_id,membership_title=excluded.membership_title,is_active=excluded.is_active
  returning id into v_id; return v_id;
end; $$;

create or replace function public.sync_current_sso_groups(p_external_groups text[]) returns integer language plpgsql security definer set search_path=public as $$
declare v_provider uuid; v_count integer;
begin
  select id into v_provider from public.sso_identity_providers where supabase_sso_provider_id=public.current_sso_provider_id() and organization_id=public.current_organization_id() and status='active';
  if v_provider is null then raise exception 'active SSO provider mapping not found'; end if;
  insert into public.memberships(organization_id,user_id,governance_unit_id,role_id,membership_title,membership_status)
  select m.organization_id,auth.uid(),m.governance_unit_id,m.role_id,m.membership_title,'active'
  from public.sso_group_role_mappings m where m.provider_id=v_provider and m.is_active and m.external_group=any(coalesce(p_external_groups,array[]::text[]))
  on conflict(organization_id,user_id,governance_unit_id,role_id,start_date) do update set membership_status='active',membership_title=excluded.membership_title;
  get diagnostics v_count=row_count;
  perform public.append_audit_log(public.current_organization_id(),'iam.sso.groups_sync','users',auth.uid(),jsonb_build_object('groups',p_external_groups,'memberships_upserted',v_count));
  return v_count;
end; $$;

create or replace function public.admin_create_delegation(p_source_membership_id uuid,p_delegated_to_user_id uuid,p_starts_at timestamptz,p_ends_at timestamptz,p_reason text)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_org uuid:=public.current_organization_id(); v_source public.memberships%rowtype; v_id uuid;
begin
  select * into v_source from public.memberships where id=p_source_membership_id and organization_id=v_org and membership_status='active';
  if v_source.id is null then raise exception 'active source membership not found'; end if;
  perform public.assert_permission('iam.roles.assign',v_source.governance_unit_id);
  if p_ends_at<=p_starts_at or p_ends_at>now()+interval '90 days' then raise exception 'delegation must end after it starts and within 90 days'; end if;
  insert into public.access_delegations(organization_id,delegated_by_user_id,delegated_to_user_id,source_membership_id,starts_at,ends_at,reason)
  values(v_org,v_source.user_id,p_delegated_to_user_id,p_source_membership_id,p_starts_at,p_ends_at,btrim(p_reason)) returning id into v_id;
  return v_id;
end; $$;

create or replace function public.admin_revoke_delegation(p_delegation_id uuid,p_reason text) returns void language plpgsql security definer set search_path=public as $$
declare v_org uuid:=public.current_organization_id();
begin
  perform public.assert_permission('iam.roles.revoke');
  update public.access_delegations set status='revoked',revoked_at=now(),revoked_by_user_id=auth.uid(),reason=reason||E'\nRevoked: '||coalesce(p_reason,'') where id=p_delegation_id and organization_id=v_org and status='active';
  if not found then raise exception 'active delegation not found'; end if;
end; $$;

create or replace function public.admin_request_role_permissions_change(p_role_id uuid,p_permission_codes text[],p_justification text)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_org uuid:=public.current_organization_id(); v_id uuid;
begin
  perform public.assert_permission('iam.permissions.manage');
  if not exists(select 1 from public.roles where id=p_role_id and organization_id=v_org) then raise exception 'role not found'; end if;
  if nullif(btrim(p_justification),'') is null then raise exception 'justification is required'; end if;
  insert into public.iam_change_requests(organization_id,change_type,target_role_id,payload,justification,requested_by_user_id)
  values(v_org,'role_permissions_replace',p_role_id,jsonb_build_object('permission_codes',to_jsonb(coalesce(p_permission_codes,array[]::text[]))),btrim(p_justification),auth.uid()) returning id into v_id;
  return v_id;
end; $$;

create or replace function public.admin_review_iam_change(p_request_id uuid,p_decision text,p_notes text default null)
returns void language plpgsql security definer set search_path=public as $$
declare v_org uuid:=public.current_organization_id(); v_req public.iam_change_requests%rowtype; v_codes text[]; v_item jsonb; v_role jsonb; v_role_id uuid;
begin
  perform public.assert_permission('iam.permissions.manage');
  select * into v_req from public.iam_change_requests where id=p_request_id and organization_id=v_org and status='pending' for update;
  if v_req.id is null then raise exception 'pending change request not found'; end if;
  if v_req.requested_by_user_id=auth.uid() then raise exception 'requester cannot approve their own change' using errcode='42501'; end if;
  if p_decision not in ('approved','rejected') then raise exception 'decision must be approved or rejected'; end if;
  update public.iam_change_requests set status=p_decision,reviewed_by_user_id=auth.uid(),reviewed_at=now(),review_notes=p_notes where id=p_request_id;
  if p_decision='approved' and v_req.change_type='role_permissions_replace' then
    select coalesce(array_agg(value),array[]::text[]) into v_codes from jsonb_array_elements_text(v_req.payload->'permission_codes');
    if exists(select 1 from unnest(v_codes) c where not exists(select 1 from public.permissions p where p.organization_id=v_org and p.code=c and p.is_active)) then raise exception 'request contains unknown or inactive permissions'; end if;
    update public.role_permissions set is_active=false where organization_id=v_org and role_id=v_req.target_role_id;
    insert into public.role_permissions(organization_id,role_id,permission_id,is_active)
    select v_org,v_req.target_role_id,p.id,true from public.permissions p where p.organization_id=v_org and p.code=any(v_codes)
    on conflict(organization_id,role_id,permission_id) do update set is_active=true,updated_at=now();
    update public.iam_change_requests set status='applied',applied_at=now() where id=p_request_id;
  elsif p_decision='approved' and v_req.change_type='permission_matrix_import' then
    for v_item in select value from jsonb_array_elements(v_req.payload->'permissions') loop
      insert into public.permissions(organization_id,code,module,action,context_scope,name_ar,name_en,description,is_active)
      values(v_org,v_item->>'code',v_item->>'module',v_item->>'action',v_item->>'context_scope',v_item->>'name_ar',v_item->>'name_en',v_item->>'description',coalesce((v_item->>'is_active')::boolean,true))
      on conflict(organization_id,code) do update set module=excluded.module,action=excluded.action,context_scope=excluded.context_scope,name_ar=excluded.name_ar,name_en=excluded.name_en,description=excluded.description,is_active=excluded.is_active,updated_at=now();
    end loop;
    for v_role in select value from jsonb_array_elements(v_req.payload->'roles') loop
      insert into public.roles(organization_id,code,name_ar,name_en,description,role_scope,is_active)
      values(v_org,v_role->>'code',v_role->>'name_ar',v_role->>'name_en',v_role->>'description',v_role->>'role_scope',coalesce((v_role->>'is_active')::boolean,true))
      on conflict(organization_id,code) do update set name_ar=excluded.name_ar,name_en=excluded.name_en,description=excluded.description,role_scope=excluded.role_scope,is_active=excluded.is_active,updated_at=now()
      returning id into v_role_id;
      update public.role_permissions set is_active=false where organization_id=v_org and role_id=v_role_id;
      insert into public.role_permissions(organization_id,role_id,permission_id,is_active)
      select v_org,v_role_id,p.id,true from public.permissions p where p.organization_id=v_org and p.code in(select jsonb_array_elements_text(coalesce(v_role->'permissions','[]'::jsonb)))
      on conflict(organization_id,role_id,permission_id) do update set is_active=true,updated_at=now();
    end loop;
    update public.iam_change_requests set status='applied',applied_at=now() where id=p_request_id;
  end if;
end; $$;

create or replace function public.admin_request_permission_matrix_import(p_matrix jsonb,p_justification text)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_org uuid:=public.current_organization_id(); v_id uuid;
begin
  perform public.assert_permission('iam.permissions.manage');
  if coalesce((p_matrix->>'schema_version')::integer,0)<>1 or jsonb_typeof(p_matrix->'permissions')<>'array' or jsonb_typeof(p_matrix->'roles')<>'array' then raise exception 'invalid permission matrix schema'; end if;
  if nullif(btrim(p_justification),'') is null then raise exception 'justification is required'; end if;
  insert into public.iam_change_requests(organization_id,change_type,payload,justification,requested_by_user_id)
  values(v_org,'permission_matrix_import',p_matrix-'organization_id'-'exported_at',btrim(p_justification),auth.uid()) returning id into v_id;
  return v_id;
end; $$;

create or replace function public.admin_export_permission_matrix() returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
  perform public.assert_permission('iam.permissions.read');
  return jsonb_build_object(
    'schema_version',1,'organization_id',public.current_organization_id(),'exported_at',now(),
    'permissions',coalesce((select jsonb_agg(jsonb_build_object('code',p.code,'module',p.module,'action',p.action,'context_scope',p.context_scope,'name_ar',p.name_ar,'name_en',p.name_en,'description',p.description,'is_active',p.is_active) order by p.code) from public.permissions p where p.organization_id=public.current_organization_id()),'[]'::jsonb),
    'roles',coalesce((select jsonb_agg(jsonb_build_object('code',r.code,'name_ar',r.name_ar,'name_en',r.name_en,'description',r.description,'role_scope',r.role_scope,'is_active',r.is_active,'permissions',coalesce((select jsonb_agg(p.code order by p.code) from public.role_permissions rp join public.permissions p on p.id=rp.permission_id and p.organization_id=rp.organization_id where rp.role_id=r.id and rp.organization_id=r.organization_id and rp.is_active),'[]'::jsonb)) order by r.code) from public.roles r where r.organization_id=public.current_organization_id()),'[]'::jsonb)
  );
end;
$$;

insert into public.permissions(organization_id,code,module,action,context_scope,name_ar,name_en,is_system_permission,is_active)
select o.id,p.code,'iam',p.action,'organization',p.name_ar,p.name_en,true,true from public.organizations o cross join (values
 ('iam.sessions.manage','sessions.manage','إدارة جلسات المستخدمين','Manage user sessions'),
 ('iam.delegations.manage','delegations.manage','إدارة التفويضات المؤقتة','Manage temporary delegations'),
 ('iam.approvals.review','approvals.review','مراجعة تغييرات الصلاحيات','Review IAM changes')
) p(code,action,name_ar,name_en)
on conflict(organization_id,code) do update set is_active=true,updated_at=now();

insert into public.role_permissions(organization_id,role_id,permission_id)
select r.organization_id,r.id,p.id from public.roles r join public.permissions p on p.organization_id=r.organization_id
where r.code='governance_admin' and p.code in('iam.sessions.manage','iam.delegations.manage','iam.approvals.review')
on conflict(organization_id,role_id,permission_id) do update set is_active=true,updated_at=now();

grant execute on function public.register_user_session(text,text,text,text,uuid,inet,text) to authenticated;
grant execute on function public.consume_iam_rate_limit(text,integer,integer) to authenticated;
grant execute on function public.list_my_sessions() to authenticated;
grant execute on function public.request_session_revocation(uuid) to authenticated;
grant execute on function public.admin_upsert_sso_group_mapping(uuid,text,uuid,uuid,text,boolean) to authenticated;
grant execute on function public.sync_current_sso_groups(text[]) to authenticated;
grant execute on function public.admin_create_delegation(uuid,uuid,timestamptz,timestamptz,text) to authenticated;
grant execute on function public.admin_revoke_delegation(uuid,text) to authenticated;
grant execute on function public.admin_request_role_permissions_change(uuid,text[],text) to authenticated;
grant execute on function public.admin_request_permission_matrix_import(jsonb,text) to authenticated;
grant execute on function public.admin_review_iam_change(uuid,text,text) to authenticated;
grant execute on function public.admin_export_permission_matrix() to authenticated;
revoke execute on function public.admin_set_role_permissions(uuid,text[]) from authenticated;
revoke execute on function public.admin_set_role_permissions(uuid,text[]) from public;
