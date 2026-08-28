-- Phase 0 containment: remove public client paths that can disclose vote totals
-- or let client-supplied SSO group names affect role membership.
--
-- This is intentionally a narrow emergency migration.  A later IAM release must
-- replace these service-only legacy contracts with a trusted IdP-claims workflow.

do $$
declare
  v_contract_count integer;
  v_wrapper_count integer;
begin
  if not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'voting_results_view'
      and c.relkind = 'v'
  ) then
    raise exception 'Phase 0 containment requires public.voting_results_view to be a view';
  end if;

  select count(*)
    into v_contract_count
  from qarar_architecture.api_contract_registry r
  where r.api_version = 'v1'
    and r.contract_name::text in (
      'bootstrap_current_user_profile',
      'sync_current_sso_groups'
    );

  if v_contract_count <> 2 then
    raise exception 'Phase 0 containment expected two IAM API contracts, found %', v_contract_count;
  end if;

  select count(*)
    into v_wrapper_count
  from qarar_architecture.api_contract_registry r
  join pg_proc p
    on p.proname = r.contract_name
   and pg_get_function_identity_arguments(p.oid) = r.identity_arguments
  join pg_namespace n
    on n.oid = p.pronamespace
   and n.nspname = 'api_v1'
  where r.api_version = 'v1'
    and r.contract_name::text in (
      'bootstrap_current_user_profile',
      'sync_current_sso_groups'
    );

  if v_wrapper_count <> 2 then
    raise exception 'Phase 0 containment expected two IAM API wrappers, found %', v_wrapper_count;
  end if;
end;
$$;

-- A view normally evaluates access to its underlying relation as the view owner.
-- Ensure that any future explicit grant is still constrained by the caller's RLS.
alter view public.voting_results_view set (security_invoker = true);
revoke all on table public.voting_results_view from public, anon, authenticated;
grant select on table public.voting_results_view to service_role;

comment on view public.voting_results_view is
  'Phase 0 containment: legacy vote-reporting view; security_invoker is required and only service_role may read it directly.';

-- Both contracts previously accepted security-sensitive state from a browser
-- session.  They remain available only to a controlled server-side caller while
-- the IdP-claims and organization-bootstrap replacements are implemented.
update qarar_architecture.api_contract_registry
set audience = 'service_role'
where api_version = 'v1'
  and contract_name::text in (
    'bootstrap_current_user_profile',
    'sync_current_sso_groups'
  );

revoke all on function api_v1.sync_current_sso_groups(text[])
  from public, anon, authenticated, service_role;
revoke all on function api_v1.bootstrap_current_user_profile(text, text, text, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function api_v1.sync_current_sso_groups(text[]) to service_role;
grant execute on function api_v1.bootstrap_current_user_profile(text, text, text, text, text, text) to service_role;

comment on function api_v1.sync_current_sso_groups(text[]) is
  'Phase 0 containment: service-only. Client-supplied SSO group arrays are not a trusted authorization input.';
comment on function api_v1.bootstrap_current_user_profile(text, text, text, text, text, text) is
  'Phase 0 containment: service-only. Initial organization administrator provisioning must be performed by a controlled backend workflow.';

-- This is an intentional, reviewed v1 audience change.  Keep the release ledger
-- truthful so the runtime security boundary test continues to detect drift.
update qarar_architecture.api_release_registry
set contract_count = (
      select count(*)::integer
      from qarar_architecture.api_contract_registry
      where api_version = 'v1'
    ),
    contract_hash = (
      select md5(string_agg(
        p.proname || '|' || pg_get_function_identity_arguments(p.oid) || '|' ||
        pg_get_function_result(p.oid) || '|' || r.audience,
        E'\n'
        order by p.proname, pg_get_function_identity_arguments(p.oid)
      ))
      from pg_proc p
      join pg_namespace n
        on n.oid = p.pronamespace
       and n.nspname = 'api_v1'
      join qarar_architecture.api_contract_registry r
        on r.api_version = 'v1'
       and r.contract_name = p.proname
       and r.identity_arguments = pg_get_function_identity_arguments(p.oid)
    ),
    released_at = '2026-08-16 00:00:00+00',
    notes = 'Phase 0 emergency containment: voting results are service-only and bootstrap/SSO group synchronization are service-only pending a trusted IAM redesign.'
where api_version = 'v1';

do $$
declare
  v_security_invoker boolean;
  v_exposed_contracts integer;
begin
  select coalesce(c.reloptions @> array['security_invoker=true']::text[], false)
    into v_security_invoker
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'voting_results_view';

  if not v_security_invoker
     or has_table_privilege('anon', 'public.voting_results_view', 'select')
     or has_table_privilege('authenticated', 'public.voting_results_view', 'select')
     or not has_table_privilege('service_role', 'public.voting_results_view', 'select') then
    raise exception 'Phase 0 containment failed to secure public.voting_results_view';
  end if;

  select count(*)
    into v_exposed_contracts
  from qarar_architecture.api_contract_registry r
  join pg_proc p
    on p.proname = r.contract_name
   and pg_get_function_identity_arguments(p.oid) = r.identity_arguments
  join pg_namespace n
    on n.oid = p.pronamespace
   and n.nspname = 'api_v1'
  where r.api_version = 'v1'
    and r.contract_name::text in (
      'bootstrap_current_user_profile',
      'sync_current_sso_groups'
    )
    and (
      r.audience <> 'service_role'
      or has_function_privilege('anon', p.oid, 'execute')
      or has_function_privilege('authenticated', p.oid, 'execute')
      or not has_function_privilege('service_role', p.oid, 'execute')
    );

  if v_exposed_contracts <> 0 then
    raise exception 'Phase 0 containment failed to make both IAM contracts service-only';
  end if;
end;
$$;

notify pgrst, 'reload schema';
