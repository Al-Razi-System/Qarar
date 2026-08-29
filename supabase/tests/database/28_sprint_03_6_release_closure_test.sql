begin;
create extension if not exists pgtap;
select plan(12);

select is((select count(*)::integer from qarar_architecture.api_contract_registry
 where contract_name in(
 'admin_search_council_types','admin_create_council_type','admin_update_council_type','admin_deactivate_council_type',
 'get_council_form_options','admin_search_councils','admin_get_council_detail','admin_create_council',
 'admin_update_council','get_available_councils','admin_get_councils_tree','admin_move_council',
 'admin_list_council_members','admin_add_council_member','admin_update_council_membership',
 'admin_end_council_membership','admin_assign_council_leadership',
 'admin_validate_council_administrative_readiness','admin_activate_council',
 'admin_deactivate_council','admin_archive_council')),21,
 'all 21 council management contracts are registered');
select is((select contract_count from qarar_architecture.api_release_registry where api_version='v1'),
 204,'final API release count includes activation and governed offboarding contracts');
select ok((select contract_hash~'^[0-9a-f]{32}$' from qarar_architecture.api_release_registry where api_version='v1'),
 'final API release hash is frozen');
insert into qarar_core.organizations(id,code,name_ar)values(
 '5a000000-0000-0000-0000-000000000001','release-council','Release Council');
select is((select count(*)::integer from qarar_iam.permissions
 where organization_id='5a000000-0000-0000-0000-000000000001'
  and code in('governance.units.read','governance.units.manage','governance.units.activate',
   'governance.units.archive','governance.unit_types.manage','governance.memberships.read',
   'governance.memberships.manage','governance.leadership.assign')
  and is_system_permission and is_active),8,
 'new organizations receive the detailed council permission vocabulary');
select ok(not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname in('qarar_core','qarar_iam') and p.proname like '%council%'
 and(pg_get_functiondef(p.oid) like '%governance.policies.manage%'
  or pg_get_functiondef(p.oid) like '%governance.councils.manage%')),
 'council operations use neither regulation nor deprecated broad council permission');
select ok(not exists(select 1 from qarar_architecture.api_contract_registry r
 join pg_proc p on p.proname=r.contract_name join pg_namespace n on n.oid=p.pronamespace and n.nspname='api_v1'
 where r.contract_name like '%council%' and r.audience<>'authenticated'),
 'all council contracts have the reviewed authenticated audience');
select ok(not exists(select 1 from information_schema.role_table_grants where grantee='authenticated'
 and table_schema in('qarar_core','qarar_iam') and privilege_type in('INSERT','UPDATE','DELETE')),
 'clients have no direct council or membership writes');
select ok(not has_function_privilege('anon',
 'api_v1.get_available_councils(text,uuid,uuid,uuid,integer,integer)','execute'),
 'anonymous callers cannot read council references');
select ok(has_function_privilege('authenticated',
 'api_v1.get_available_councils(text,uuid,uuid,uuid,integer,integer)','execute'),
 'signed-in callers can use the council reference');
select is((select count(*)::integer from qarar_architecture.entity_registry
 where entity_name='governance_unit_status_history' and module_code='core'),1,
 'council status history ownership is registered');
select ok(position('لا يمنح صلاحية' in obj_description(
 'api_v1.get_available_councils(text,uuid,uuid,uuid,integer,integer)'::regprocedure,'pg_proc'))>0,
 'the reusable reference explicitly documents its authorization boundary');
select ok(not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname in('qarar_core','qarar_iam') and p.proname like '%council%'
 and(pg_get_functiondef(p.oid) ilike '%meeting%' or pg_get_functiondef(p.oid) ilike '%quorum%'
  or pg_get_functiondef(p.oid) ilike '%voting%' or pg_get_functiondef(p.oid) ilike '%minute%')),
 'council implementation contains no meeting, quorum, voting, or minute policy');

select * from finish();
rollback;
