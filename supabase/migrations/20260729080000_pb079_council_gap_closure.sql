begin;

-- الصلاحيات المفصلة المعتمدة لإدارة المجالس.
insert into qarar_iam.permissions(
 organization_id,code,module,action,context_scope,name_ar,name_en,description,
 is_system_permission,is_active
)
select o.id,p.code,'governance',p.action,p.scope,p.name_ar,p.name_en,p.description,true,true
from qarar_core.organizations o cross join(values
 ('governance.units.read','read','organization','عرض المجالس والشجرة','Read councils','Read council master data and hierarchy'),
 ('governance.units.manage','manage','organization','إدارة المجالس','Manage councils','Create, update, and move councils'),
 ('governance.units.activate','activate','organization','تفعيل المجالس','Activate councils','Activate and deactivate administratively complete councils'),
 ('governance.units.archive','archive','organization','أرشفة المجالس','Archive councils','Permanently archive councils'),
 ('governance.unit_types.manage','manage','organization','إدارة أنواع المجالس','Manage council types','Manage tenant council types'),
 ('governance.memberships.read','read','governance_unit','عرض أعضاء المجلس','Read council memberships','Read council membership history'),
 ('governance.memberships.manage','manage','governance_unit','إدارة عضويات المجلس','Manage council memberships','Add, update, and end council memberships'),
 ('governance.leadership.assign','assign','governance_unit','تعيين قيادة المجلس','Assign council leadership','Assign and replace council chair and rapporteur')
)p(code,action,scope,name_ar,name_en,description)
on conflict(organization_id,code)do update set
 module=excluded.module,action=excluded.action,context_scope=excluded.context_scope,
 name_ar=excluded.name_ar,name_en=excluded.name_en,description=excluded.description,is_active=true;

-- تهيئة دوري القيادة لكل مؤسسة حالية دون تدخل يدوي.
insert into qarar_iam.roles(
 organization_id,code,name_ar,name_en,description,role_scope,is_active
)
select o.id,r.code,r.name_ar,r.name_en,r.description,'governance_unit',true
from qarar_core.organizations o cross join(values
 ('council_chair','رئيس المجلس','Council chair','Administrative chair of a council'),
 ('council_rapporteur','مقرر المجلس','Council rapporteur','Administrative rapporteur of a council')
)r(code,name_ar,name_en,description)
on conflict(organization_id,code)do update set
 name_ar=excluded.name_ar,name_en=excluded.name_en,description=excluded.description,
 role_scope='governance_unit',is_active=true;

-- مدير الحوكمة يحصل على مفردات الصلاحيات المفصلة فقط.
insert into qarar_iam.role_permissions(organization_id,role_id,permission_id,is_active)
select r.organization_id,r.id,p.id,true
from qarar_iam.roles r join qarar_iam.permissions p on p.organization_id=r.organization_id
where r.code='governance_admin' and p.code in(
 'governance.units.read','governance.units.manage','governance.units.activate',
 'governance.units.archive','governance.unit_types.manage','governance.memberships.read',
 'governance.memberships.manage','governance.leadership.assign')
on conflict(organization_id,role_id,permission_id)do update set is_active=true;

update qarar_iam.role_permissions rp set is_active=false
from qarar_iam.permissions p
where p.id=rp.permission_id and p.organization_id=rp.organization_id
 and p.code='governance.councils.manage';
update qarar_iam.permissions set is_active=false where code='governance.councils.manage';

-- العضوية المجدولة لا تصبح مصدر صلاحية قبل تاريخ بدايتها.
create or replace function qarar_iam.has_permission(permission_code text,target_unit_id uuid default null)
returns boolean language sql stable security definer set search_path=pg_catalog as $$
 select coalesce(qarar_iam.is_system_admin(),false)or coalesce(exists(
  select 1 from qarar_iam.memberships m
  join qarar_iam.roles r on r.id=m.role_id and r.organization_id=m.organization_id and r.is_active
  join qarar_iam.role_permissions rp on rp.role_id=r.id and rp.organization_id=m.organization_id and rp.is_active
  join qarar_iam.permissions p on p.id=rp.permission_id and p.organization_id=m.organization_id and p.is_active
  where m.organization_id=qarar_iam.current_organization_id()
   and m.membership_status='active'
   and m.start_date<=current_date and(m.end_date is null or m.end_date>=current_date)
   and p.code=permission_code
   and(m.user_id=auth.uid()or exists(
    select 1 from qarar_iam.access_delegations d where d.source_membership_id=m.id
     and d.organization_id=m.organization_id and d.delegated_to_user_id=auth.uid()
     and d.status='active' and now()between d.starts_at and d.ends_at))
   and(p.context_scope in('system','organization','self')or target_unit_id is null
    or m.governance_unit_id=target_unit_id)
 ),false)
$$;
alter function qarar_iam.has_permission(text,uuid) owner to qarar_iam_executor;
revoke all on function qarar_iam.has_permission(text,uuid) from public,anon,service_role;
grant execute on function qarar_iam.has_permission(text,uuid) to authenticated,qarar_api_executor;

-- صيغة الرمز قاعدة بيانات وليست تحقق واجهة فقط.
alter table qarar_core.governance_units
 add constraint governance_units_code_format
 check(code~'^[a-z][a-z0-9_]*$') not valid;

-- منع أي قيادة متزامنة مكررة مهما كان المستخدم أو مسار الكتابة.
create or replace function qarar_iam.enforce_single_council_leader()
returns trigger language plpgsql security definer set search_path=pg_catalog,qarar_iam as $$
declare role_code text;
begin
 select code into role_code from qarar_iam.roles
 where id=new.role_id and organization_id=new.organization_id;
 if role_code in('council_chair','council_rapporteur')and new.membership_status='active' then
  if not exists(select 1 from qarar_iam.roles where id=new.role_id
   and organization_id=new.organization_id and role_scope='governance_unit' and is_active)
  then raise exception using errcode='23514',message='دور القيادة يجب أن يكون فعالًا وبنطاق مجلس';end if;
  perform pg_advisory_xact_lock(hashtextextended(
   new.organization_id::text||':'||new.governance_unit_id::text||':'||new.role_id::text,0));
  if exists(select 1 from qarar_iam.memberships m
   where m.organization_id=new.organization_id and m.governance_unit_id=new.governance_unit_id
    and m.role_id=new.role_id and m.membership_status='active' and m.id<>new.id
    and daterange(m.start_date,coalesce(m.end_date+1,'infinity'::date),'[)')&&
        daterange(new.start_date,coalesce(new.end_date+1,'infinity'::date),'[)'))
  then raise exception using errcode='23P01',message='يوجد رئيس أو مقرر فعال للفترة نفسها';end if;
 end if;
 return new;
end $$;
alter function qarar_iam.enforce_single_council_leader() owner to qarar_iam_executor;
revoke all on function qarar_iam.enforce_single_council_leader() from public,anon,authenticated,service_role;
create trigger memberships_enforce_single_council_leader
before insert or update of organization_id,governance_unit_id,role_id,membership_status,start_date,end_date
on qarar_iam.memberships for each row execute function qarar_iam.enforce_single_council_leader();

-- سجل الحالة غير قابل للتعديل بعد الإدراج.
create or replace function qarar_core.reject_status_history_mutation()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
 raise exception using errcode='55000',message='سجل حالات المجلس للإضافة فقط';
end $$;
alter function qarar_core.reject_status_history_mutation() owner to qarar_core_executor;
revoke all on function qarar_core.reject_status_history_mutation() from public,anon,authenticated,service_role;
create trigger governance_unit_status_history_append_only
before update or delete on qarar_core.governance_unit_status_history
for each row execute function qarar_core.reject_status_history_mutation();

-- تهيئة الصلاحيات والأدوار نفسها للمؤسسات التي تنشأ مستقبلًا.
create or replace function qarar_iam.provision_council_management()
returns trigger language plpgsql security definer set search_path=pg_catalog,qarar_iam as $$
begin
 insert into qarar_iam.permissions(
  organization_id,code,module,action,context_scope,name_ar,name_en,description,
  is_system_permission,is_active)
 select new.id,p.code,'governance',p.action,p.scope,p.name_ar,p.name_en,p.description,true,true
 from(values
  ('governance.units.read','read','organization','عرض المجالس والشجرة','Read councils','Read council master data and hierarchy'),
  ('governance.units.manage','manage','organization','إدارة المجالس','Manage councils','Create, update, and move councils'),
  ('governance.units.activate','activate','organization','تفعيل المجالس','Activate councils','Activate and deactivate councils'),
  ('governance.units.archive','archive','organization','أرشفة المجالس','Archive councils','Permanently archive councils'),
  ('governance.unit_types.manage','manage','organization','إدارة أنواع المجالس','Manage council types','Manage tenant council types'),
  ('governance.memberships.read','read','governance_unit','عرض أعضاء المجلس','Read memberships','Read council membership history'),
  ('governance.memberships.manage','manage','governance_unit','إدارة عضويات المجلس','Manage memberships','Manage council memberships'),
  ('governance.leadership.assign','assign','governance_unit','تعيين قيادة المجلس','Assign leadership','Assign council leadership')
 )p(code,action,scope,name_ar,name_en,description)
 on conflict(organization_id,code)do nothing;
 insert into qarar_iam.roles(organization_id,code,name_ar,name_en,description,role_scope,is_active)
 values
  (new.id,'council_chair','رئيس المجلس','Council chair','Administrative chair of a council','governance_unit',true),
  (new.id,'council_rapporteur','مقرر المجلس','Council rapporteur','Administrative rapporteur of a council','governance_unit',true)
 on conflict(organization_id,code)do nothing;
 return new;
end $$;
alter function qarar_iam.provision_council_management() owner to qarar_iam_executor;
revoke all on function qarar_iam.provision_council_management() from public,anon,authenticated,service_role;
create trigger provision_council_management
after insert on qarar_core.organizations
for each row execute function qarar_iam.provision_council_management();

create or replace function qarar_iam.provision_council_permissions_to_governance_admin()
returns trigger language plpgsql security definer set search_path=pg_catalog,qarar_iam as $$
begin
 if new.code='governance_admin' then
  insert into qarar_iam.role_permissions(organization_id,role_id,permission_id,is_active)
  select new.organization_id,new.id,p.id,true from qarar_iam.permissions p
  where p.organization_id=new.organization_id and p.code in(
   'governance.units.read','governance.units.manage','governance.units.activate',
   'governance.units.archive','governance.unit_types.manage','governance.memberships.read',
   'governance.memberships.manage','governance.leadership.assign')
  on conflict(organization_id,role_id,permission_id)do update set is_active=true;
 end if;
 return new;
end $$;
alter function qarar_iam.provision_council_permissions_to_governance_admin() owner to qarar_iam_executor;
revoke all on function qarar_iam.provision_council_permissions_to_governance_admin()
 from public,anon,authenticated,service_role;
create trigger provision_council_permissions_to_governance_admin
after insert or update of code on qarar_iam.roles
for each row execute function qarar_iam.provision_council_permissions_to_governance_admin();

drop trigger if exists provision_council_permission_to_governance_admin on qarar_iam.roles;
delete from qarar_architecture.function_registry
where function_name='provision_council_permission_to_governance_admin' and identity_arguments='';
drop function if exists qarar_iam.provision_council_permission_to_governance_admin();

insert into qarar_architecture.function_registry(
 function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate)
select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),
 case when n.nspname='qarar_core' then 'core' else 'iam' end,n.nspname,false
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where(n.nspname,p.proname)in(
 ('qarar_iam','enforce_single_council_leader'),
 ('qarar_iam','provision_council_management'),
 ('qarar_iam','provision_council_permissions_to_governance_admin'),
 ('qarar_core','reject_status_history_mutation'))
on conflict(function_name,identity_arguments)do update set
 function_oid=excluded.function_oid,module_code=excluded.module_code,owning_schema=excluded.owning_schema;

commit;
