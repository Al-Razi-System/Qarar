begin;
create extension if not exists pgtap;
select plan(19);

select has_column('qarar_core','governance_units','client_request_id',
 'council creation persists its idempotency key');
select has_column('qarar_core','governance_units','created_by_user_id',
 'council creation persists its actor');
select has_index('qarar_core','governance_units','governance_units_creation_idempotency_uidx',
 'council idempotency is unique per tenant and actor');
select is((select count(*)::integer from qarar_architecture.api_contract_registry
 where contract_name in('get_council_form_options','admin_search_councils',
 'admin_get_council_detail','admin_create_council','admin_update_council',
 'get_available_councils')),6,'all PB-074 contracts are registered');

insert into qarar_core.organizations(id,code,name_ar)values
('55000000-0000-0000-0000-000000000001','council-crud-a','Council CRUD A'),
('55000000-0000-0000-0000-000000000002','council-crud-b','Council CRUD B');
insert into auth.users(id,email)values
('55000000-0000-0000-0000-000000000011','council-crud@test.local');
insert into qarar_iam.users(id,organization_id,email,full_name_ar,is_system_admin)values
('55000000-0000-0000-0000-000000000011','55000000-0000-0000-0000-000000000001',
 'council-crud@test.local','Council CRUD Admin',true);
insert into qarar_core.governance_unit_types(id,organization_id,code,name_ar,is_council_type)values
('55000000-0000-0000-0000-000000000021','55000000-0000-0000-0000-000000000001','council','مجلس',true),
('55000000-0000-0000-0000-000000000022','55000000-0000-0000-0000-000000000002','other','Other',true);
insert into qarar_governance.governance_unit_classes(
 id,organization_id,code,name_ar,governance_level)values
('55000000-0000-0000-0000-000000000031','55000000-0000-0000-0000-000000000001',
 'department','Department','department');
select set_config('request.jwt.claim.sub','55000000-0000-0000-0000-000000000011',true);
select set_config('request.jwt.claim.role','authenticated',true);

select lives_ok($$select api_v1.admin_create_council(
 'ai_council','مجلس الذكاء الاصطناعي','AI Council',null,
 '55000000-0000-0000-0000-000000000021',null,
 '55000000-0000-0000-0000-000000000031',3,false,
 '55000000-0000-0000-0000-000000000041')$$,
 'an administrator creates an inactive council');
select is((select status from qarar_core.governance_units
 where organization_id='55000000-0000-0000-0000-000000000001' and code='ai_council'),
 'inactive','new councils are administratively inactive');
select is((api_v1.admin_create_council(
 'ignored','Ignored',null,null,'55000000-0000-0000-0000-000000000021',null,
 '55000000-0000-0000-0000-000000000031',3,false,
 '55000000-0000-0000-0000-000000000041')->>'idempotent_replay')::boolean,
 true,'replaying the same request returns the original council');
select is((select count(*)::integer from qarar_core.governance_units
 where organization_id='55000000-0000-0000-0000-000000000001' and client_request_id=
 '55000000-0000-0000-0000-000000000041'),1,'idempotent replay creates no duplicate');
select is((api_v1.admin_search_councils(null,null,null,null,null,50,0)->>'total')::integer,
 1,'administrative search is tenant isolated');
select is(api_v1.admin_get_council_detail((select id from qarar_core.governance_units
 where organization_id='55000000-0000-0000-0000-000000000001' and code='ai_council'))
 ->'unit_type'->>'code','council','detail includes the council type reference');
select is(jsonb_array_length(api_v1.get_available_councils(null,null,null,null,50,0)->'items'),
 0,'inactive councils are excluded from reusable references');
select lives_ok($$select api_v1.admin_update_council(
 (select id from qarar_core.governance_units where organization_id=
 '55000000-0000-0000-0000-000000000001' and code='ai_council'),
 'مجلس الذكاء الاصطناعي المحدث','Updated AI Council','Description',
 '55000000-0000-0000-0000-000000000021',
 '55000000-0000-0000-0000-000000000031',5,true,
 (select updated_at from qarar_core.governance_units where organization_id=
 '55000000-0000-0000-0000-000000000001' and code='ai_council'))$$,
 'council update accepts the current concurrency token');
select throws_ok($$select api_v1.admin_update_council(
 (select id from qarar_core.governance_units where organization_id=
 '55000000-0000-0000-0000-000000000001' and code='ai_council'),
 'Stale',null,null,'55000000-0000-0000-0000-000000000021',
 null,1,false,'2000-01-01'::timestamptz)$$,'40001',null,
 'stale council updates are rejected');
select throws_ok($$select api_v1.admin_create_council(
 'cross_tenant','Cross Tenant',null,null,
 '55000000-0000-0000-0000-000000000022',null,null,1,false,
 '55000000-0000-0000-0000-000000000042')$$,'23503',null,
 'cross-tenant council types are rejected');
select ok(jsonb_array_length(api_v1.get_council_form_options()->'council_types')=1
 and jsonb_array_length(api_v1.get_council_form_options()->'governance_classes')=1,
 'form options contain only active tenant references');
update qarar_core.governance_units set status='active',activated_at=now(),status_reason=null
where organization_id='55000000-0000-0000-0000-000000000001' and code='ai_council';
select is(jsonb_array_length(api_v1.get_available_councils('الذكاء',null,null,null,50,0)->'items'),
 1,'active councils are available through the reusable filtered reference');
select is((select count(*)::integer from qarar_audit.audit_logs where organization_id=
 '55000000-0000-0000-0000-000000000001' and action in('council.created','council.updated')),
 2,'successful creation and update are audited once');
select ok(not has_function_privilege('authenticated',
 'qarar_core.admin_create_council(text,text,text,text,uuid,uuid,uuid,integer,boolean,uuid)','execute'),
 'clients cannot execute the implementation function');
select ok(has_function_privilege('authenticated',
 'api_v1.get_available_councils(text,uuid,uuid,uuid,integer,integer)','execute'),
 'signed-in consumers can use the versioned council reference');

select * from finish();
rollback;
