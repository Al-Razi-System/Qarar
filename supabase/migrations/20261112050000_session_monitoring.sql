-- Session monitoring: the organisation's sessions for whoever may revoke them, and an honest
-- status. A session is active only while its Auth sign-in still exists and has not expired;
-- logging out or expiring deletes that sign-in without touching user_sessions, so revoked_at
-- alone kept every old browser "active" forever.
-- Also records the sessions that are live right now, which were never registered because the
-- dashboard did not call register_user_session at login (fixed in the same change).
-- Impact map: docs/engineering/impact/SESSION_MONITORING_20261112_AR.md
begin;

create function qarar_iam.session_status(p_revoked_at timestamptz, p_auth_session_id uuid)
returns text language sql stable security definer set search_path=pg_catalog
as $$
  select case
    when p_revoked_at is not null then 'revoked'
    when exists (select 1 from auth.sessions a where a.id=p_auth_session_id and (a.not_after is null or a.not_after>now())) then 'active'
    else 'ended' end
$$;

create function qarar_iam.session_last_activity(p_last_seen_at timestamptz, p_auth_session_id uuid)
returns timestamptz language sql stable security definer set search_path=pg_catalog
as $$
  select greatest(p_last_seen_at, (select greatest(a.updated_at, a.refreshed_at::timestamptz) from auth.sessions a where a.id=p_auth_session_id))
$$;

create function qarar_iam.current_auth_session_id()
returns uuid language sql stable security definer set search_path=pg_catalog
as $$
  select case when (auth.jwt()->>'session_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then (auth.jwt()->>'session_id')::uuid end
$$;

-- Same fields as before, plus status, is_current and last_activity_at.
create or replace function qarar_iam.list_my_sessions()
returns jsonb language sql stable security definer set search_path=pg_catalog
as $$
  select coalesce(jsonb_agg(
    to_jsonb(s) - 'organization_id' - 'user_id'
      || jsonb_build_object(
        'status', qarar_iam.session_status(s.revoked_at, s.auth_session_id),
        'is_current', s.auth_session_id is not null and s.auth_session_id = qarar_iam.current_auth_session_id(),
        'last_activity_at', qarar_iam.session_last_activity(s.last_seen_at, s.auth_session_id))
    order by s.last_seen_at desc),'[]'::jsonb)
  from qarar_iam.user_sessions s
  where s.user_id=auth.uid() and s.organization_id=qarar_iam.current_organization_id();
$$;

create function qarar_iam.admin_list_sessions(p_status text default 'active', p_query text default null, p_limit integer default 50, p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare
  v_org uuid := qarar_iam.current_organization_id();
  v_status text := coalesce(nullif(btrim(p_status),''),'active');
  v_query text := nullif(btrim(p_query),'');
  v_limit integer := least(greatest(coalesce(p_limit,50),1),200);
  v_offset integer := greatest(coalesce(p_offset,0),0);
  v_current uuid := qarar_iam.current_auth_session_id();
begin
  -- Same authority as request_session_revocation: whoever may revoke a session may see it.
  if not qarar_iam.has_permission('iam.sessions.manage', null) and not qarar_iam.has_permission('iam.users.manage', null) then
    raise exception 'permission denied: iam.sessions.manage' using errcode='42501';
  end if;
  if v_status not in ('active','ended','revoked','all') then
    raise exception 'invalid session status: %', v_status using errcode='22023';
  end if;
  return (
    with rows as (
      select s.*, u.full_name_ar, u.email,
        qarar_iam.session_status(s.revoked_at, s.auth_session_id) as status,
        qarar_iam.session_last_activity(s.last_seen_at, s.auth_session_id) as last_activity_at
      from qarar_iam.user_sessions s
      join qarar_iam.users u on u.id=s.user_id and u.organization_id=s.organization_id
      where s.organization_id=v_org
        and (v_query is null or u.full_name_ar ilike '%'||v_query||'%' or u.email ilike '%'||v_query||'%'
             or s.device_name ilike '%'||v_query||'%' or host(s.ip_address) ilike '%'||v_query||'%')
    ), filtered as (
      select * from rows where v_status='all' or status=v_status
    )
    select jsonb_build_object(
      'items', coalesce((select jsonb_agg(jsonb_build_object(
          'id', f.id, 'user_id', f.user_id, 'user_name_ar', f.full_name_ar, 'user_email', f.email,
          'device_name', f.device_name, 'platform', f.platform, 'app_version', f.app_version,
          'ip_address', host(f.ip_address), 'user_agent', f.user_agent,
          'created_at', f.created_at, 'last_activity_at', f.last_activity_at,
          'status', f.status, 'revoked_at', f.revoked_at, 'revocation_reason', f.revocation_reason,
          'is_current', f.auth_session_id is not null and f.auth_session_id=v_current)
        order by f.last_activity_at desc nulls last)
        from (select * from filtered order by last_activity_at desc nulls last limit v_limit offset v_offset) f), '[]'::jsonb),
      'total', (select count(*) from filtered),
      'limit', v_limit, 'offset', v_offset)
  );
end;
$$;

alter function qarar_iam.session_status(timestamptz,uuid) owner to qarar_iam_executor;
alter function qarar_iam.session_last_activity(timestamptz,uuid) owner to qarar_iam_executor;
alter function qarar_iam.current_auth_session_id() owner to qarar_iam_executor;
alter function qarar_iam.admin_list_sessions(text,text,integer,integer) owner to qarar_iam_executor;
revoke all on function qarar_iam.session_status(timestamptz,uuid), qarar_iam.session_last_activity(timestamptz,uuid),
  qarar_iam.current_auth_session_id(), qarar_iam.admin_list_sessions(text,text,integer,integer)
  from public,anon,authenticated,service_role;
grant execute on function qarar_iam.admin_list_sessions(text,text,integer,integer) to qarar_api_executor;

create function api_v1.admin_list_sessions(p_status text default 'active', p_query text default null, p_limit integer default 50, p_offset integer default 0)
returns jsonb language sql security definer set search_path=pg_catalog
as $$ select qarar_iam.admin_list_sessions($1,$2,$3,$4) $$;
alter function api_v1.admin_list_sessions(text,text,integer,integer) owner to qarar_api_executor;
revoke all on function api_v1.admin_list_sessions(text,text,integer,integer) from public,anon,service_role;
grant execute on function api_v1.admin_list_sessions(text,text,integer,integer) to authenticated;

insert into qarar_architecture.api_contract_registry(api_version,contract_name,implementation_schema,implementation_name,identity_arguments,module_code,audience)
values ('v1','admin_list_sessions','qarar_iam','admin_list_sessions',
  'p_status text, p_query text, p_limit integer, p_offset integer','iam','authenticated');

-- One-time, idempotent repair: record the sign-ins that are live now, so the screen is not
-- empty until everyone logs in again. Expired sign-ins are left out; each insert is audited
-- by the existing audit_user_sessions_changes trigger.
insert into qarar_iam.user_sessions(organization_id,user_id,auth_session_id,device_id,ip_address,user_agent,last_seen_at,created_at)
select u.organization_id, a.user_id, a.id, 'auth-session:'||a.id, a.ip, nullif(btrim(a.user_agent),''),
  greatest(a.created_at, a.updated_at, a.refreshed_at::timestamptz), a.created_at
from auth.sessions a
join qarar_iam.users u on u.id=a.user_id
where (a.not_after is null or a.not_after>now())
  and not exists (select 1 from qarar_iam.user_sessions s where s.auth_session_id=a.id)
on conflict (organization_id,user_id,device_id) do nothing;

notify pgrst, 'reload schema';
commit;
