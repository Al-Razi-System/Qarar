-- Restore the self-profile fields consumed by the dashboard shell. The
-- containment version of this RPC retained authorization data but omitted the
-- authenticated user's display identity, causing the UI to fall back to
-- generic labels such as "المستخدم الحالي".
create or replace function qarar_iam.get_current_user_access_context()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'user_id', u.id,
    'organization_id', u.organization_id,
    'organization_code', o.code,
    'organization_name_ar', o.name_ar,
    'full_name_ar', u.full_name_ar,
    'full_name_en', u.full_name_en,
    'email', u.email,
    'job_title', u.job_title,
    'is_system_admin', u.is_system_admin,
    'sso_provider_id', qarar_iam.current_sso_provider_id(),
    'roles', coalesce((
      select jsonb_agg(distinct jsonb_build_object(
        'role_id', r.id,
        'code', r.code,
        'name_ar', r.name_ar,
        'scope', r.role_scope,
        'governance_unit_id', m.governance_unit_id,
        'membership_title', m.membership_title
      ))
      from qarar_iam.memberships m
      join qarar_iam.roles r
        on r.id = m.role_id
       and r.organization_id = m.organization_id
      where m.user_id = u.id
        and m.organization_id = u.organization_id
        and m.membership_status = 'active'
        and r.is_active = true
        and (m.end_date is null or m.end_date >= current_date)
    ), '[]'::jsonb),
    'permissions', coalesce((
      select jsonb_agg(distinct p.code order by p.code)
      from qarar_iam.memberships m
      join qarar_iam.roles r
        on r.id = m.role_id
       and r.organization_id = m.organization_id
      join qarar_iam.role_permissions rp
        on rp.role_id = r.id
       and rp.organization_id = m.organization_id
       and rp.is_active = true
      join qarar_iam.permissions p
        on p.id = rp.permission_id
       and p.organization_id = m.organization_id
       and p.is_active = true
      where m.user_id = u.id
        and m.organization_id = u.organization_id
        and m.membership_status = 'active'
        and r.is_active = true
        and (m.end_date is null or m.end_date >= current_date)
    ), '[]'::jsonb)
  )
  from qarar_iam.users u
  join qarar_core.organizations o on o.id = u.organization_id
  where u.id = auth.uid()
    and u.status = 'active';
$$;

comment on function qarar_iam.get_current_user_access_context() is
  'Returns the authenticated user self-profile together with effective roles and permissions.';

notify pgrst, 'reload schema';
