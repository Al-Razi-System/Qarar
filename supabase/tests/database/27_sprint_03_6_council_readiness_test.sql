begin;
create extension if not exists pgtap;
select plan(16);
select is((select count(*)::integer from qarar_architecture.api_contract_registry where contract_name in(
 'admin_validate_council_administrative_readiness','admin_activate_council',
 'admin_deactivate_council','admin_archive_council')),4,'all lifecycle contracts are registered');
select ok(not has_function_privilege('authenticated',
 'qarar_core.change_council_status(uuid,text,text,timestamp with time zone)','execute'),
 'internal generic state transition is not client executable');

insert into qarar_core.organizations(id,code,name_ar)values
('59000000-0000-0000-0000-000000000001','ready-a','Ready A');
insert into auth.users(id,email)values
('59000000-0000-0000-0000-000000000011','admin@ready.test'),
('59000000-0000-0000-0000-000000000012','chair@ready.test'),
('59000000-0000-0000-0000-000000000013','rapporteur@ready.test');
insert into qarar_iam.users(id,organization_id,email,full_name_ar,is_system_admin)values
('59000000-0000-0000-0000-000000000011','59000000-0000-0000-0000-000000000001','admin@ready.test','Admin',true),
('59000000-0000-0000-0000-000000000012','59000000-0000-0000-0000-000000000001','chair@ready.test','Chair',false),
('59000000-0000-0000-0000-000000000013','59000000-0000-0000-0000-000000000001','rapporteur@ready.test','Rapporteur',false);
insert into qarar_iam.roles(id,organization_id,code,name_ar,role_scope)values
('59000000-0000-0000-0000-000000000021','59000000-0000-0000-0000-000000000001','member','عضو','governance_unit'),
('59000000-0000-0000-0000-000000000022','59000000-0000-0000-0000-000000000001','council_chair','رئيس','governance_unit'),
('59000000-0000-0000-0000-000000000023','59000000-0000-0000-0000-000000000001','council_rapporteur','مقرر','governance_unit')
on conflict(organization_id,code)do update set
 id=excluded.id,name_ar=excluded.name_ar,role_scope=excluded.role_scope,is_active=true;
insert into qarar_core.governance_unit_types(id,organization_id,code,name_ar,is_council_type)values
('59000000-0000-0000-0000-000000000031','59000000-0000-0000-0000-000000000001','council','Council',true);
insert into qarar_governance.governance_unit_classes(id,organization_id,code,name_ar,governance_level)values
('59000000-0000-0000-0000-000000000032','59000000-0000-0000-0000-000000000001','department','Department','department');
insert into qarar_core.governance_units(id,organization_id,unit_type_id,code,name_ar,status,
 governance_class_id,minimum_active_members)values
('59000000-0000-0000-0000-000000000041','59000000-0000-0000-0000-000000000001',
 '59000000-0000-0000-0000-000000000031','ready_council','Ready Council','inactive',
 '59000000-0000-0000-0000-000000000032',2);
select set_config('request.jwt.claim.sub','59000000-0000-0000-0000-000000000011',true);
select set_config('request.jwt.claim.role','authenticated',true);

select is((api_v1.admin_validate_council_administrative_readiness(
 '59000000-0000-0000-0000-000000000041')->>'ready')::boolean,false,
 'incomplete council is reported as not ready');
select ok((api_v1.admin_validate_council_administrative_readiness(
 '59000000-0000-0000-0000-000000000041')->'errors')@>
 '[{"code":"MINIMUM_ACTIVE_MEMBERS_NOT_MET"},{"code":"COUNCIL_CHAIR_REQUIRED"},{"code":"COUNCIL_RAPPORTEUR_REQUIRED"}]',
 'readiness returns stable codes for every missing requirement');
select throws_ok($$select api_v1.admin_activate_council(
 '59000000-0000-0000-0000-000000000041','تفعيل',
 (select updated_at from qarar_core.governance_units where id='59000000-0000-0000-0000-000000000041'))$$,
 '23514',null,'incomplete council cannot be activated');

insert into qarar_iam.memberships(organization_id,user_id,governance_unit_id,role_id,start_date)values
('59000000-0000-0000-0000-000000000001','59000000-0000-0000-0000-000000000012',
 '59000000-0000-0000-0000-000000000041','59000000-0000-0000-0000-000000000021',current_date),
('59000000-0000-0000-0000-000000000001','59000000-0000-0000-0000-000000000013',
 '59000000-0000-0000-0000-000000000041','59000000-0000-0000-0000-000000000021',current_date),
('59000000-0000-0000-0000-000000000001','59000000-0000-0000-0000-000000000012',
 '59000000-0000-0000-0000-000000000041','59000000-0000-0000-0000-000000000022',current_date),
('59000000-0000-0000-0000-000000000001','59000000-0000-0000-0000-000000000013',
 '59000000-0000-0000-0000-000000000041','59000000-0000-0000-0000-000000000023',current_date);
select is((api_v1.admin_validate_council_administrative_readiness(
 '59000000-0000-0000-0000-000000000041')->>'ready')::boolean,true,
 'complete administrative master data is ready');
select lives_ok($$select api_v1.admin_activate_council(
 '59000000-0000-0000-0000-000000000041','اكتمل التشكيل',
 (select updated_at from qarar_core.governance_units where id='59000000-0000-0000-0000-000000000041'))$$,
 'ready council activates');
select is((select status from qarar_core.governance_units where id='59000000-0000-0000-0000-000000000041'),
 'active','activation persists the active state');
select lives_ok($$select api_v1.admin_deactivate_council(
 '59000000-0000-0000-0000-000000000041','تعليق إداري',
 (select updated_at from qarar_core.governance_units where id='59000000-0000-0000-0000-000000000041'))$$,
 'active council can be administratively deactivated');
select lives_ok($$select api_v1.admin_archive_council(
 '59000000-0000-0000-0000-000000000041','انتهاء الكيان',
 (select updated_at from qarar_core.governance_units where id='59000000-0000-0000-0000-000000000041'))$$,
 'inactive council can be archived');
select is((select status from qarar_core.governance_units where id='59000000-0000-0000-0000-000000000041'),
 'archived','archival state is persisted');
select throws_ok($$select api_v1.admin_activate_council(
 '59000000-0000-0000-0000-000000000041','إعادة',
 (select updated_at from qarar_core.governance_units where id='59000000-0000-0000-0000-000000000041'))$$,
 '55000',null,'archival is final');
select is((select count(*)::integer from qarar_core.governance_unit_status_history where governance_unit_id=
 '59000000-0000-0000-0000-000000000041' and from_status is not null),3,
 'every state transition has immutable history');
select is((select count(*)::integer from qarar_audit.audit_logs where organization_id=
 '59000000-0000-0000-0000-000000000001' and action in(
 'council.activated','council.deactivated','council.archived')),3,
 'every successful state transition is audited');
select ok((select count(*) from qarar_audit.audit_logs where action=
 'council.administrative_readiness.checked')>=4,'readiness checks are auditable');
select ok(not exists(select 1 from qarar_audit.audit_logs
 where organization_id='59000000-0000-0000-0000-000000000001'
 and action='council.administrative_readiness.checked'
 and(metadata::text ilike '%meeting%' or metadata::text ilike '%quorum%'
  or metadata::text ilike '%voting%')),
 'administrative readiness has no meeting, quorum, or voting dependency');

select * from finish();
rollback;
