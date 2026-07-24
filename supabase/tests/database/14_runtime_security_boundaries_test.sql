begin;
create extension if not exists pgtap;
select plan(24);

select is(
 (select count(*)::integer from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.prokind='f'
   and not exists(
    select 1 from pg_depend d where d.classid='pg_proc'::regclass
     and d.objid=p.oid and d.deptype='e')),
 0,'public contains no application functions');

select is(
 (select count(*)::integer from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='v'
   and not exists(
    select 1 from pg_depend d where d.classid='pg_class'::regclass
     and d.objid=c.oid and d.deptype='e')
   and (has_table_privilege('authenticated',c.oid,'insert')
    or has_table_privilege('authenticated',c.oid,'update')
    or has_table_privilege('authenticated',c.oid,'delete'))),
 0,'authenticated has no writable public views');

select is(
 (select count(*)::integer from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname like 'qarar\_%' escape '\' and c.relkind in('r','p')
   and (has_table_privilege('authenticated',c.oid,'insert')
    or has_table_privilege('authenticated',c.oid,'update')
    or has_table_privilege('authenticated',c.oid,'delete'))),
 0,'authenticated has no direct module-table writes');

select is(
 (select count(*)::integer from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='api_v1' and pg_get_userbyid(p.proowner)<>'qarar_api_executor'),
 0,'every API wrapper is owned by the limited API executor');

select is(
 (select count(*)::integer from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname like 'qarar\_%' escape '\' and c.relkind in('r','p')
   and has_table_privilege('qarar_api_executor',c.oid,'select')),
 0,'the API executor cannot read tables');

select is(
 (select count(*)::integer from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname like 'qarar\_%' escape '\' and c.relkind in('r','p') and (
   has_table_privilege('qarar_api_executor',c.oid,'insert')
   or has_table_privilege('qarar_api_executor',c.oid,'update')
   or has_table_privilege('qarar_api_executor',c.oid,'delete'))),
 0,'the API executor cannot write tables');

select is(
 (select count(*)::integer
  from qarar_architecture.api_contract_registry r
  join pg_proc p on p.proname=r.contract_name
   and pg_get_function_identity_arguments(p.oid)=r.identity_arguments
  join pg_namespace n on n.oid=p.pronamespace and n.nspname='api_v1'
  where r.audience='service_role'
   and has_function_privilege('authenticated',p.oid,'execute')),
 0,'authenticated cannot execute any service-only contract');

select is(
 (select count(*)::integer
  from qarar_architecture.api_contract_registry r
  join pg_proc p on p.proname=r.contract_name
   and pg_get_function_identity_arguments(p.oid)=r.identity_arguments
  join pg_namespace n on n.oid=p.pronamespace and n.nspname='api_v1'
  where r.audience='authenticated'
   and not has_function_privilege('authenticated',p.oid,'execute')),
 0,'every authenticated contract is executable by authenticated');

select is(
 (select count(*)::integer
  from qarar_architecture.api_contract_registry r
  join pg_proc p on p.proname=r.contract_name
   and pg_get_function_identity_arguments(p.oid)=r.identity_arguments
  join pg_namespace n on n.oid=p.pronamespace and n.nspname='api_v1'
  where has_function_privilege('anon',p.oid,'execute')),
 0,'anonymous cannot execute any application contract');

select is(
 (select count(*)::integer from qarar_architecture.api_contract_registry
  where audience='edge_authenticated'),
 0,'edge_authenticated is not used as a false security boundary');

select is(
 (select count(*)::integer
  from qarar_architecture.function_registry r
  join pg_proc p on p.oid=r.function_oid
  where pg_get_userbyid(p.proowner)<>format('qarar_%s_executor',r.module_code)),
 0,'every implementation is owned by its module executor');

select is(
 (select count(*)::integer
  from qarar_architecture.function_registry r
  join pg_proc p on p.oid=r.function_oid
  where not r.is_rls_predicate and (
   has_function_privilege('authenticated',p.oid,'execute')
   or has_function_privilege('anon',p.oid,'execute'))),
 0,'clients cannot execute internal implementations');

select is(
 (select count(*)::integer
  from qarar_architecture.function_registry r
  join pg_proc p on p.oid=r.function_oid
  where r.is_rls_predicate and not has_function_privilege('authenticated',p.oid,'execute')),
 0,'every RLS predicate is explicitly allowlisted');

select is(
 (select count(*)::integer
  from qarar_architecture.function_registry r
  join pg_proc p on p.oid=r.function_oid
  where not p.prosecdef and r.function_name<>'current_app_user_id'
   and r.function_name<>'set_updated_at'),
 0,'module commands execute under their constrained module role');

select is(
 (select md5(string_agg(
   p.proname||'|'||pg_get_function_identity_arguments(p.oid)||'|'||
   pg_get_function_result(p.oid)||'|'||r.audience,E'\n'
   order by p.proname,pg_get_function_identity_arguments(p.oid)))
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace and n.nspname='api_v1'
  join qarar_architecture.api_contract_registry r
   on r.contract_name=p.proname
   and r.identity_arguments=pg_get_function_identity_arguments(p.oid)),
 (select contract_hash from qarar_architecture.api_release_registry where api_version='v1'),
 'api_v1 signature, result, and audience match the frozen release');

select is(
 (select count(*)::integer
  from pg_roles source
  join qarar_architecture.module_registry owner_module on true
  join pg_class c on has_table_privilege(source.rolname,c.oid,'insert')
   or has_table_privilege(source.rolname,c.oid,'update')
   or has_table_privilege(source.rolname,c.oid,'delete')
  join pg_namespace n on n.oid=c.relnamespace and n.nspname=owner_module.schema_name
  where source.rolname like 'qarar\_%\_executor' escape '\'
   and source.rolname not in(
    'qarar_api_executor',
    format('qarar_%s_executor',owner_module.module_code),
    'qarar_audit_executor')
   and not (
    source.rolname in('qarar_attendance_executor','qarar_minutes_executor','qarar_voting_executor')
    and n.nspname='qarar_meetings'
    and c.relname in('meetings','meeting_status_history')
   )
   and not (
    source.rolname='qarar_meetings_executor'
    and n.nspname='qarar_topics' and c.relname='topics'
   )
   and not (
    source.rolname='qarar_voting_executor'
    and n.nspname='qarar_meetings' and c.relname='agenda_items'
   )
   and not (n.nspname='qarar_audit' and c.relname='audit_logs')),
0,'module executors have no unregistered cross-module table writes');

select is(
 (select count(*)::integer
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  left join qarar_architecture.compatibility_surface_registry r
   on r.relation_name=c.relname
  where n.nspname='public' and c.relkind='v'
   and not exists(
    select 1 from pg_depend d where d.classid='pg_class'::regclass
     and d.objid=c.oid and d.deptype='e')
   and r.relation_name is null),
 0,'every public compatibility view has a registered consumer and retirement plan');

select is(
 (select count(*)::integer
  from qarar_architecture.compatibility_surface_registry
  where not client_read_only),
0,'all compatibility surfaces are client read-only');

select is(
 (select count(*)::integer
  from pg_roles source
  join qarar_architecture.module_registry source_module
   on source.rolname=format('qarar_%s_executor',source_module.module_code)
  join qarar_architecture.entity_registry entity on entity.module_code<>source_module.module_code
  join qarar_architecture.module_registry target_module on target_module.module_code=entity.module_code
  join pg_class c on c.relnamespace=target_module.schema_name::regnamespace
   and c.relname=entity.entity_name
  where source_module.module_code not in('api','architecture')
   and has_table_privilege(source.rolname,c.oid,'select')
   and not exists(
    select 1 from qarar_architecture.module_table_read_allowlist a
    where a.source_module=source_module.module_code
     and a.target_schema=target_module.schema_name
     and a.table_name=entity.entity_name)),
 0,'module executors have no unregistered cross-module reads');

select is(
 (select count(*)::integer
  from qarar_architecture.module_table_read_allowlist a
  join qarar_architecture.module_registry m on m.module_code=a.source_module
  where not has_table_privilege(
   format('qarar_%s_executor',m.module_code),
   format('%I.%I',a.target_schema,a.table_name),
   'select')),
 0,'every registered cross-module table read is granted');

select is(
 (select count(*)::integer
  from pg_roles source
  join qarar_architecture.module_registry source_module
   on source.rolname=format('qarar_%s_executor',source_module.module_code)
  join qarar_architecture.function_registry implementation
   on implementation.module_code<>source_module.module_code
  join pg_proc p on p.oid=implementation.function_oid
  where source_module.module_code not in('api','architecture')
   and has_function_privilege(source.rolname,p.oid,'execute')
   and not exists(
    select 1 from qarar_architecture.module_function_execute_allowlist a
    where a.source_module=source_module.module_code
     and a.target_schema=implementation.owning_schema
     and a.function_name=implementation.function_name
     and a.identity_arguments=implementation.identity_arguments)),
 0,'module executors have no unregistered cross-module function execution');

select is(
 (select count(*)::integer
  from qarar_architecture.module_function_execute_allowlist a
  join pg_namespace n on n.nspname=a.target_schema
  join pg_proc p on p.pronamespace=n.oid and p.proname=a.function_name
   and pg_get_function_identity_arguments(p.oid)=a.identity_arguments
  where not has_function_privilege(
   format('qarar_%s_executor',a.source_module),p.oid,'execute')),
 0,'every registered cross-module function dependency is granted');

with discovered as (
 select distinct r.module_code,m[1]::name target_schema,m[2]::name target_name
 from qarar_architecture.function_registry r
 join pg_proc p on p.oid=r.function_oid
 cross join lateral regexp_matches(
  pg_get_functiondef(p.oid),
  '(qarar_[a-z_]+)\.([a-z][a-z0-9_]*)',
  'g'
 ) m
 where m[1] <> format('qarar_%s',r.module_code)
)
select is(
 (select count(*)::integer
  from discovered d
  where not exists(
   select 1 from qarar_architecture.module_table_read_allowlist a
   where a.source_module=d.module_code and a.target_schema=d.target_schema
    and a.table_name=d.target_name)
   and not exists(
    select 1 from qarar_architecture.module_function_execute_allowlist a
    where a.source_module=d.module_code and a.target_schema=d.target_schema
     and a.function_name=d.target_name)),
 0,'all source-level cross-module dependencies are registered');

select is(
 (select count(*)::integer
  from qarar_architecture.api_contract_registry c
  join pg_proc p on p.proname=c.implementation_name
   and pg_get_function_identity_arguments(p.oid)=c.identity_arguments
  join pg_namespace n on n.oid=p.pronamespace and n.nspname=c.implementation_schema
  where pg_get_functiondef(p.oid) !~
   '(current_organization_id|organization_id|assert_permission|has_permission|is_system_admin|auth\.uid|users where id=p_actor_user_id)'
 ),
 0,'every API contract implementation contains an explicit tenant or actor guard');

select * from finish();
rollback;
