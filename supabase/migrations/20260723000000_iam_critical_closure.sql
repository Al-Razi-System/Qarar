-- Critical IAM closure: Auth session revocation, atomic provisioning, complete SSO
-- group reconciliation, delegation expiry, and audit-log administration.

create table public.sso_group_membership_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  provider_id uuid not null references public.sso_identity_providers(id) on delete cascade,
  mapping_id uuid not null references public.sso_group_role_mappings(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  membership_id uuid not null references public.memberships(id) on delete cascade,
  owns_membership boolean not null default false,
  external_group text not null,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (organization_id, provider_id, mapping_id, user_id),
  foreign key (provider_id, organization_id) references public.sso_identity_providers(id, organization_id),
  foreign key (user_id, organization_id) references public.users(id, organization_id)
);

create index sso_group_membership_links_user_idx
  on public.sso_group_membership_links (organization_id, provider_id, user_id);

alter table public.sso_group_membership_links enable row level security;
grant select on public.sso_group_membership_links to authenticated;

create policy "users and sso admins can read group membership links"
on public.sso_group_membership_links for select to authenticated
using (
  organization_id = public.current_organization_id()
  and (user_id = auth.uid() or public.has_permission('iam.sso.read'))
);

create trigger audit_sso_group_membership_links_changes
after insert or update or delete on public.sso_group_membership_links
for each row execute function public.audit_row_change();

create or replace function public.actor_has_permission(
  p_actor_user_id uuid,
  p_permission_code text,
  p_target_unit_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select u.is_system_admin
    from public.users u
    where u.id = p_actor_user_id and u.status = 'active'
  ), false) or coalesce(exists (
    select 1
    from public.memberships m
    join public.roles r on r.id = m.role_id and r.organization_id = m.organization_id and r.is_active
    join public.role_permissions rp on rp.role_id = r.id and rp.organization_id = r.organization_id and rp.is_active
    join public.permissions p on p.id = rp.permission_id and p.organization_id = rp.organization_id and p.is_active
    join public.users u on u.id = m.user_id and u.organization_id = m.organization_id and u.status = 'active'
    where m.user_id = p_actor_user_id
      and m.membership_status = 'active'
      and (m.end_date is null or m.end_date >= current_date)
      and p.code = p_permission_code
      and (p.context_scope in ('system', 'organization', 'self') or p_target_unit_id is null or m.governance_unit_id = p_target_unit_id)
  ), false);
$$;

create or replace function public.admin_finalize_invited_user(
  p_auth_user_id uuid,
  p_email text,
  p_full_name_ar text,
  p_employee_no text default null,
  p_mobile text default null,
  p_job_title text default null,
  p_role_id uuid default null,
  p_governance_unit_id uuid default null,
  p_membership_title text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.current_organization_id();
  v_user_id uuid;
  v_membership_id uuid;
begin
  perform public.assert_permission('iam.users.manage');
  if (p_role_id is null) <> (p_governance_unit_id is null) then
    raise exception 'role and governance unit must be provided together';
  end if;

  v_user_id := public.admin_create_user_profile(
    p_auth_user_id, p_email, p_full_name_ar, p_employee_no, p_mobile, p_job_title
  );

  if p_role_id is not null then
    v_membership_id := public.admin_assign_role(
      v_user_id, p_role_id, p_governance_unit_id, p_membership_title, current_date, null
    );
  end if;

  return jsonb_build_object('user_id', v_user_id, 'membership_id', v_membership_id);
end;
$$;

create or replace function public.service_apply_user_status(
  p_actor_user_id uuid,
  p_user_id uuid,
  p_status text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_org uuid;
  v_sessions_revoked integer := 0;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if p_status not in ('active', 'inactive', 'suspended') then
    raise exception 'invalid user status';
  end if;
  if not public.actor_has_permission(p_actor_user_id, 'iam.users.manage') then
    raise exception 'permission denied: iam.users.manage' using errcode = '42501';
  end if;
  if p_actor_user_id = p_user_id and p_status <> 'active' then
    raise exception 'administrators cannot deactivate their own profile';
  end if;

  select organization_id into v_org from public.users where id = p_user_id for update;
  if v_org is null then raise exception 'user not found'; end if;
  if v_org <> (select organization_id from public.users where id = p_actor_user_id) then
    raise exception 'cross-organization user management is forbidden' using errcode = '42501';
  end if;

  update public.users set status = p_status where id = p_user_id;
  if p_status <> 'active' then
    delete from auth.sessions where user_id = p_user_id;
    get diagnostics v_sessions_revoked = row_count;
    update public.user_sessions
    set revoked_at = coalesce(revoked_at, now()), revocation_reason = coalesce(p_reason, p_status)
    where user_id = p_user_id and revoked_at is null;
  end if;

  insert into public.audit_logs(organization_id, actor_user_id, action, entity_type, entity_id, metadata)
  values(v_org, p_actor_user_id, 'iam.user.status_update', 'users', p_user_id,
    jsonb_build_object('status', p_status, 'reason', p_reason, 'auth_sessions_revoked', v_sessions_revoked));

  return jsonb_build_object('user_id', p_user_id, 'status', p_status, 'auth_sessions_revoked', v_sessions_revoked);
end;
$$;

create or replace function public.service_revoke_auth_sessions(
  p_actor_user_id uuid,
  p_user_id uuid,
  p_auth_session_id uuid default null,
  p_reason text default null
)
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare v_org uuid; v_count integer;
begin
  if auth.role() <> 'service_role' then raise exception 'service role required' using errcode='42501'; end if;
  if p_actor_user_id <> p_user_id and not public.actor_has_permission(p_actor_user_id, 'iam.sessions.manage')
     and not public.actor_has_permission(p_actor_user_id, 'iam.users.manage') then
    raise exception 'permission denied: iam.sessions.manage' using errcode='42501';
  end if;
  select organization_id into v_org from public.users where id=p_user_id;
  if v_org is null or v_org <> (select organization_id from public.users where id=p_actor_user_id) then
    raise exception 'user not found in actor organization' using errcode='42501';
  end if;

  delete from auth.sessions
  where user_id=p_user_id and (p_auth_session_id is null or id=p_auth_session_id);
  get diagnostics v_count=row_count;
  update public.user_sessions set revoked_at=coalesce(revoked_at,now()),revocation_reason=coalesce(p_reason,'revoked')
  where user_id=p_user_id and (p_auth_session_id is null or auth_session_id=p_auth_session_id) and revoked_at is null;
  insert into public.audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,metadata)
  values(v_org,p_actor_user_id,'iam.auth_sessions.revoke','users',p_user_id,
    jsonb_build_object('auth_session_id',p_auth_session_id,'revoked_count',v_count,'reason',p_reason));
  return v_count;
end;
$$;

create or replace function public.service_record_iam_event(
  p_actor_user_id uuid, p_target_user_id uuid, p_action text, p_metadata jsonb default '{}'::jsonb
)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_org uuid; v_id uuid;
begin
  if auth.role()<>'service_role' then raise exception 'service role required' using errcode='42501'; end if;
  if not public.actor_has_permission(p_actor_user_id,'iam.users.manage') then raise exception 'permission denied: iam.users.manage' using errcode='42501'; end if;
  select organization_id into v_org from public.users where id=p_target_user_id;
  if v_org is null or v_org<>(select organization_id from public.users where id=p_actor_user_id) then raise exception 'target user not found in actor organization'; end if;
  insert into public.audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,metadata)
  values(v_org,p_actor_user_id,p_action,'users',p_target_user_id,coalesce(p_metadata,'{}'::jsonb)) returning id into v_id;
  return v_id;
end; $$;

create or replace function public.request_session_revocation(p_session_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_session public.user_sessions%rowtype;
begin
  select * into v_session from public.user_sessions where id=p_session_id and organization_id=public.current_organization_id();
  if v_session.id is null then raise exception 'session not found'; end if;
  if v_session.user_id<>auth.uid() and not public.has_permission('iam.sessions.manage') and not public.has_permission('iam.users.manage') then
    raise exception 'permission denied: iam.sessions.manage' using errcode='42501';
  end if;
  return jsonb_build_object('session_id',v_session.id,'user_id',v_session.user_id,'auth_session_id',v_session.auth_session_id);
end; $$;

create or replace function public.sync_current_sso_groups(p_external_groups text[])
returns integer language plpgsql security definer set search_path=public as $$
declare
  v_org uuid:=public.current_organization_id(); v_provider uuid; v_mapping record;
  v_membership_id uuid; v_existed boolean; v_added integer:=0; v_removed integer:=0; v_link record;
begin
  select id into v_provider from public.sso_identity_providers
  where supabase_sso_provider_id=public.current_sso_provider_id() and organization_id=v_org and status='active';
  if v_provider is null then raise exception 'active SSO provider mapping not found'; end if;

  create temporary table if not exists pg_temp.current_sso_mappings(mapping_id uuid primary key) on commit drop;
  truncate pg_temp.current_sso_mappings;
  insert into pg_temp.current_sso_mappings
  select id from public.sso_group_role_mappings
  where provider_id=v_provider and organization_id=v_org and is_active
    and external_group=any(coalesce(p_external_groups,array[]::text[]));

  for v_mapping in
    select m.* from public.sso_group_role_mappings m join pg_temp.current_sso_mappings c on c.mapping_id=m.id
  loop
    select exists(select 1 from public.memberships where organization_id=v_org and user_id=auth.uid()
      and governance_unit_id=v_mapping.governance_unit_id and role_id=v_mapping.role_id and start_date=current_date)
    into v_existed;
    insert into public.memberships(organization_id,user_id,governance_unit_id,role_id,membership_title,membership_status)
    values(v_org,auth.uid(),v_mapping.governance_unit_id,v_mapping.role_id,v_mapping.membership_title,'active')
    on conflict(organization_id,user_id,governance_unit_id,role_id,start_date)
    do update set membership_status='active',membership_title=excluded.membership_title
    returning id into v_membership_id;
    insert into public.sso_group_membership_links(organization_id,provider_id,mapping_id,user_id,membership_id,owns_membership,external_group,last_seen_at)
    values(v_org,v_provider,v_mapping.id,auth.uid(),v_membership_id,not v_existed,v_mapping.external_group,now())
    on conflict(organization_id,provider_id,mapping_id,user_id)
    do update set membership_id=excluded.membership_id,external_group=excluded.external_group,last_seen_at=now();
    v_added:=v_added+1;
  end loop;

  for v_link in
    select l.* from public.sso_group_membership_links l
    where l.organization_id=v_org and l.provider_id=v_provider and l.user_id=auth.uid()
      and not exists(select 1 from pg_temp.current_sso_mappings c where c.mapping_id=l.mapping_id)
  loop
    delete from public.sso_group_membership_links where id=v_link.id;
    if v_link.owns_membership and not exists(select 1 from public.sso_group_membership_links where membership_id=v_link.membership_id) then
      update public.memberships set membership_status='ended',end_date=coalesce(end_date,current_date)
      where id=v_link.membership_id and membership_status='active';
      if found then v_removed:=v_removed+1; end if;
    end if;
  end loop;
  perform public.append_audit_log(v_org,'iam.sso.groups_sync','users',auth.uid(),
    jsonb_build_object('groups',p_external_groups,'mappings_seen',v_added,'memberships_ended',v_removed));
  return v_added;
end; $$;

create or replace function public.expire_access_delegations()
returns integer language plpgsql security definer set search_path=public as $$
declare v_count integer;
begin
  update public.access_delegations set status='expired',updated_at=now()
  where status='active' and ends_at<=now();
  get diagnostics v_count=row_count;
  return v_count;
end; $$;

do $$
begin
  if exists(select 1 from pg_available_extensions where name='pg_cron') then
    create extension if not exists pg_cron;
    perform cron.unschedule(jobid) from cron.job where jobname='qarar-expire-access-delegations';
    perform cron.schedule('qarar-expire-access-delegations','* * * * *','select public.expire_access_delegations()');
  end if;
exception when others then
  raise notice 'pg_cron scheduling skipped: %', sqlerrm;
end $$;

create or replace function public.admin_search_audit_logs(
  p_query text default null, p_action text default null, p_entity_type text default null,
  p_actor_user_id uuid default null, p_result text default null,
  p_from timestamptz default null, p_to timestamptz default null,
  p_limit integer default 50, p_offset integer default 0
)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_org uuid:=public.current_organization_id(); v_limit integer:=least(greatest(coalesce(p_limit,50),1),200); v_offset integer:=greatest(coalesce(p_offset,0),0);
begin
  perform public.assert_permission('audit.logs.read');
  if p_result is not null and p_result not in('success','failure','denied') then raise exception 'invalid audit result'; end if;
  return jsonb_build_object(
    'items',coalesce((select jsonb_agg(x.row_data order by x.occurred_at desc) from (
      select a.occurred_at,to_jsonb(a)||jsonb_build_object('actor_name_ar',u.full_name_ar,'actor_email',u.email) row_data
      from public.audit_logs a left join public.users u on u.id=a.actor_user_id and u.organization_id=a.organization_id
      where a.organization_id=v_org and (p_action is null or a.action=p_action) and (p_entity_type is null or a.entity_type=p_entity_type)
        and (p_actor_user_id is null or a.actor_user_id=p_actor_user_id) and (p_result is null or a.result=p_result)
        and (p_from is null or a.occurred_at>=p_from) and (p_to is null or a.occurred_at<p_to)
        and (nullif(btrim(p_query),'') is null or a.action ilike '%'||btrim(p_query)||'%' or a.entity_type ilike '%'||btrim(p_query)||'%' or a.metadata::text ilike '%'||btrim(p_query)||'%')
      order by a.occurred_at desc limit v_limit offset v_offset
    ) x),'[]'::jsonb),
    'total',(select count(*) from public.audit_logs a where a.organization_id=v_org
      and (p_action is null or a.action=p_action) and (p_entity_type is null or a.entity_type=p_entity_type)
      and (p_actor_user_id is null or a.actor_user_id=p_actor_user_id) and (p_result is null or a.result=p_result)
      and (p_from is null or a.occurred_at>=p_from) and (p_to is null or a.occurred_at<p_to)
      and (nullif(btrim(p_query),'') is null or a.action ilike '%'||btrim(p_query)||'%' or a.entity_type ilike '%'||btrim(p_query)||'%' or a.metadata::text ilike '%'||btrim(p_query)||'%')),
    'limit',v_limit,'offset',v_offset);
end; $$;

create or replace function public.admin_get_audit_log(p_audit_log_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_result jsonb;
begin
  perform public.assert_permission('audit.logs.read');
  select to_jsonb(a)||jsonb_build_object('actor_name_ar',u.full_name_ar,'actor_email',u.email) into v_result
  from public.audit_logs a left join public.users u on u.id=a.actor_user_id and u.organization_id=a.organization_id
  where a.id=p_audit_log_id and a.organization_id=public.current_organization_id();
  if v_result is null then raise exception 'audit log not found'; end if;
  return v_result;
end; $$;

create or replace function public.admin_export_audit_logs(
  p_action text default null, p_entity_type text default null, p_actor_user_id uuid default null,
  p_result text default null, p_from timestamptz default null, p_to timestamptz default null
)
returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
  perform public.assert_permission('audit.logs.read');
  return jsonb_build_object('schema_version',1,'exported_at',now(),'organization_id',public.current_organization_id(),
    'items',coalesce((select jsonb_agg(to_jsonb(x) order by x.occurred_at desc) from (
      select a.* from public.audit_logs a
      where a.organization_id=public.current_organization_id() and (p_action is null or a.action=p_action)
      and (p_entity_type is null or a.entity_type=p_entity_type) and (p_actor_user_id is null or a.actor_user_id=p_actor_user_id)
      and (p_result is null or a.result=p_result) and (p_from is null or a.occurred_at>=p_from) and (p_to is null or a.occurred_at<p_to)
      order by a.occurred_at desc limit 10000
    ) x),'[]'::jsonb));
end; $$;

revoke execute on function public.admin_update_user_status(uuid,text,text) from public, authenticated;
revoke all on function public.service_apply_user_status(uuid,uuid,text,text) from public, anon, authenticated;
revoke all on function public.service_revoke_auth_sessions(uuid,uuid,uuid,text) from public, anon, authenticated;
revoke all on function public.service_record_iam_event(uuid,uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.service_apply_user_status(uuid,uuid,text,text) to service_role;
grant execute on function public.service_revoke_auth_sessions(uuid,uuid,uuid,text) to service_role;
grant execute on function public.service_record_iam_event(uuid,uuid,text,jsonb) to service_role;
grant execute on function public.admin_finalize_invited_user(uuid,text,text,text,text,text,uuid,uuid,text) to authenticated;
revoke execute on function public.expire_access_delegations() from public, anon, authenticated;
grant execute on function public.admin_search_audit_logs(text,text,text,uuid,text,timestamptz,timestamptz,integer,integer) to authenticated;
grant execute on function public.admin_get_audit_log(uuid) to authenticated;
grant execute on function public.admin_export_audit_logs(text,text,uuid,text,timestamptz,timestamptz) to authenticated;
