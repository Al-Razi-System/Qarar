begin;

create or replace function qarar_iam.provision_governance_permissions()
returns trigger language plpgsql security definer
set search_path=pg_catalog,qarar_iam as $$
begin
 insert into qarar_iam.permissions(
  organization_id,code,module,action,context_scope,
  name_ar,name_en,description,is_system_permission,is_active
 )
 select new.id,p.code,'governance',p.action,p.context_scope,
  p.name_ar,p.name_en,p.description,true,true
 from (values
  ('governance.policies.read','read','organization','عرض اللوائح','Read regulations','View regulations, versions, items, and scopes'),
  ('governance.policies.manage','manage','organization','إدارة اللوائح','Manage regulations','Create and edit regulation drafts and mappings'),
  ('governance.policies.approve','approve','organization','اعتماد اللوائح','Approve regulations','Review, approve, activate, suspend, and archive versions'),
  ('governance.workflows.manage','manage','organization','إدارة المسارات الحوكمية','Manage governed workflows','Configure governed workflow templates and transitions'),
  ('governance.exceptions.request','request','governance_unit','طلب استثناء لائحي','Request regulation exception','Request a governed temporary or exceptional route'),
  ('governance.exceptions.approve','approve','organization','اعتماد الاستثناءات اللائحية','Approve regulation exceptions','Independently approve or reject governed exceptions'),
  ('governance.compliance.read','read','organization','عرض الامتثال اللائحي','Read regulation compliance','View regulation traceability and coverage reporting'),
  ('governance.alerts.manage','manage','organization','إدارة تنبيهات الحوكمة','Manage governance alerts','Review and resolve governance coverage and routing alerts'),
  ('governance.councils.manage','manage','organization','إدارة المجالس','Manage councils','Create and maintain council master data, hierarchy, memberships, leadership, and administrative lifecycle')
 )as p(code,action,context_scope,name_ar,name_en,description)
 on conflict(organization_id,code)do nothing;
 return new;
end $$;
alter function qarar_iam.provision_governance_permissions() owner to qarar_iam_executor;
revoke all on function qarar_iam.provision_governance_permissions() from public,anon,authenticated,service_role;
drop trigger if exists provision_governance_permissions on qarar_core.organizations;
create trigger provision_governance_permissions
after insert on qarar_core.organizations
for each row execute function qarar_iam.provision_governance_permissions();

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

create or replace function qarar_iam.provision_council_permission_to_governance_admin()
returns trigger language plpgsql security definer
set search_path=pg_catalog,qarar_iam as $$
begin
 if new.code='governance_admin' then
  insert into qarar_iam.role_permissions(organization_id,role_id,permission_id,is_active)
  select new.organization_id,new.id,p.id,true from qarar_iam.permissions p
  where p.organization_id=new.organization_id and p.code='governance.councils.manage'
  on conflict(organization_id,role_id,permission_id)do update set is_active=true;
 end if;
 return new;
end $$;
alter function qarar_iam.provision_council_permission_to_governance_admin() owner to qarar_iam_executor;
revoke all on function qarar_iam.provision_council_permission_to_governance_admin()
 from public,anon,authenticated,service_role;
drop trigger if exists provision_council_permission_to_governance_admin on qarar_iam.roles;
create trigger provision_council_permission_to_governance_admin
after insert or update of code on qarar_iam.roles
for each row execute function qarar_iam.provision_council_permission_to_governance_admin();

insert into qarar_architecture.function_registry(
 function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate
)
select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),'iam','qarar_iam',false
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='qarar_iam' and p.proname in(
 'provision_governance_permissions','provision_council_permission_to_governance_admin')
on conflict(function_name,identity_arguments)do update
set function_oid=excluded.function_oid,module_code='iam',owning_schema='qarar_iam';

update qarar_architecture.api_release_registry
set contract_count=139,contract_hash='cdc327e880ca8daf96a62baacce9789c',
 released_at='2026-07-29 00:00:00+00',
 notes='Sprint 03.6 council management final release: dedicated permission, 21 contracts, tenant isolation, audit, concurrency, and Arabic operational documentation.'
where api_version='v1';

comment on function api_v1.get_available_councils(text,uuid,uuid,uuid,integer,integer) is
'مرجع مؤسسي للمجالس الفعالة؛ لا يمنح صلاحية على العملية أو الكيان المستهلك.';

commit;
