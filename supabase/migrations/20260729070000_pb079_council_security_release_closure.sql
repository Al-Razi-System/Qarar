begin;

insert into qarar_iam.permissions(
 organization_id,code,module,action,context_scope,name_ar,name_en,description,
 is_system_permission,is_active
)
select o.id,'governance.councils.manage','governance','manage','organization',
 'إدارة المجالس','Manage councils',
 'Create and maintain council master data, hierarchy, memberships, leadership, and administrative lifecycle',
 true,true
from qarar_core.organizations o
on conflict(organization_id,code)do update set
 name_ar=excluded.name_ar,name_en=excluded.name_en,description=excluded.description,is_active=true;

insert into qarar_iam.role_permissions(organization_id,role_id,permission_id,is_active)
select r.organization_id,r.id,p.id,true
from qarar_iam.roles r join qarar_iam.permissions p
 on p.organization_id=r.organization_id and p.code='governance.councils.manage'
where r.code='governance_admin'
on conflict(organization_id,role_id,permission_id)do update set is_active=true;

update qarar_architecture.api_release_registry
set contract_count=139,contract_hash='cdc327e880ca8daf96a62baacce9789c',
 released_at='2026-07-29 00:00:00+00',
 notes='Sprint 03.6 council management final release: dedicated permission, 21 contracts, tenant isolation, audit, concurrency, and Arabic operational documentation.'
where api_version='v1';

comment on function api_v1.get_available_councils(text,uuid,uuid,uuid,integer,integer) is
'مرجع مؤسسي للمجالس الفعالة؛ لا يمنح صلاحية على العملية أو الكيان المستهلك.';

commit;
