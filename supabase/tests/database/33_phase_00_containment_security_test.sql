begin;
create extension if not exists pgtap;
select plan(10);

select ok(
  not has_table_privilege('anon', 'public.voting_results_view', 'SELECT'),
  'anon cannot select the voting results compatibility view'
);

select ok(
  not has_table_privilege('authenticated', 'public.voting_results_view', 'SELECT'),
  'authenticated cannot select the voting results compatibility view'
);

select ok(
  has_table_privilege('service_role', 'public.voting_results_view', 'SELECT'),
  'the controlled service path can still read the voting results compatibility view'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'api_v1.sync_current_sso_groups(text[])',
    'EXECUTE'
  ),
  'authenticated cannot execute the client-controlled SSO group sync contract'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'api_v1.bootstrap_current_user_profile(text,text,text,text,text,text)',
    'EXECUTE'
  ),
  'authenticated cannot execute the self-bootstrap profile contract'
);

select ok(
  has_function_privilege(
    'service_role',
    'api_v1.sync_current_sso_groups(text[])',
    'EXECUTE'
  ),
  'the controlled service path can execute the SSO group sync contract'
);

select ok(
  has_function_privilege(
    'service_role',
    'api_v1.bootstrap_current_user_profile(text,text,text,text,text,text)',
    'EXECUTE'
  ),
  'the controlled service path can execute the initial-profile contract'
);

select is(
  (
    select audience
    from qarar_architecture.api_contract_registry
    where api_version = 'v1'
      and contract_name = 'sync_current_sso_groups'
  ),
  'service_role',
  'the SSO group sync contract registry audience is service_role'
);

select is(
  (
    select audience
    from qarar_architecture.api_contract_registry
    where api_version = 'v1'
      and contract_name = 'bootstrap_current_user_profile'
  ),
  'service_role',
  'the initial-profile contract registry audience is service_role'
);

select ok(
  coalesce((
    select 'security_invoker=true' = any(c.reloptions)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'voting_results_view'
      and c.relkind = 'v'
  ), false),
  'voting results compatibility view evaluates with security_invoker enabled'
);

select * from finish();
rollback;
