begin;
-- Versioned system definitions, never user or role grants.
create function qarar_iam.system_permission_catalog()
returns table(code text,module text,action text,context_scope text,name_ar text,name_en text)
language sql immutable set search_path=pg_catalog as $catalog$
  select * from (values
    ('agenda.exception', 'agenda', 'exception', 'governance_unit', 'اعتماد استثناء جدول الأعمال', 'Grant agenda exceptions'),
    ('agenda.manage', 'agenda', 'manage', 'governance_unit', 'إدارة جدول الأعمال', 'Manage agenda'),
    ('attendance.check_in', 'attendance', 'check_in', 'governance_unit', 'تسجيل الحضور', 'Check in'),
    ('attendance.lock', 'attendance', 'lock', 'governance_unit', 'إقفال سجل الحضور', 'Lock attendance'),
    ('attendance.manage', 'attendance', 'manage', 'governance_unit', 'إدارة الحضور', 'Manage attendance'),
    ('attendance.override', 'attendance', 'override', 'governance_unit', 'تصحيح الحضور', 'Override attendance'),
    ('attendance.read', 'attendance', 'read', 'governance_unit', 'عرض الحضور', 'Read attendance'),
    ('attendance.verify', 'attendance', 'verify', 'governance_unit', 'التحقق من الحضور', 'Verify attendance'),
    ('audit.logs.read', 'audit', 'logs.read', 'organization', 'عرض سجل التدقيق', 'Read audit logs'),
    ('decisions.create', 'decisions', 'create', 'governance_unit', 'إنشاء القرارات', 'Create decisions'),
    ('decisions.read', 'decisions', 'read', 'governance_unit', 'عرض القرارات', 'Read decisions'),
    ('governance.alerts.manage', 'governance', 'manage', 'organization', 'إدارة تنبيهات الحوكمة', 'Manage governance alerts'),
    ('governance.compliance.read', 'governance', 'read', 'organization', 'عرض الامتثال اللائحي', 'Read regulation compliance'),
    ('governance.exceptions.approve', 'governance', 'approve', 'organization', 'اعتماد الاستثناءات اللائحية', 'Approve regulation exceptions'),
    ('governance.exceptions.request', 'governance', 'request', 'governance_unit', 'طلب استثناء لائحي', 'Request regulation exception'),
    ('governance.leadership.assign', 'governance', 'assign', 'governance_unit', 'تعيين قيادة المجلس', 'Assign leadership'),
    ('governance.memberships.manage', 'governance', 'manage', 'governance_unit', 'إدارة عضويات المجلس', 'Manage memberships'),
    ('governance.memberships.read', 'governance', 'read', 'governance_unit', 'عرض أعضاء المجلس', 'Read memberships'),
    ('governance.model.activate', 'governance', 'activate', 'organization', 'تفعيل نموذج الحوكمة', 'Activate governance model'),
    ('governance.model.approve', 'governance', 'approve', 'organization', 'اعتماد نموذج الحوكمة', 'Approve governance model'),
    ('governance.model.edit', 'governance', 'edit', 'organization', 'إعداد نموذج الحوكمة', 'Edit governance model'),
    ('governance.model.read', 'governance', 'read', 'organization', 'عرض نموذج الحوكمة', 'Read governance model'),
    ('governance.model.review', 'governance', 'review', 'organization', 'مراجعة نموذج الحوكمة', 'Review governance model'),
    ('governance.policies.approve', 'governance', 'approve', 'organization', 'اعتماد اللوائح', 'Approve regulations'),
    ('governance.policies.manage', 'governance', 'manage', 'organization', 'إدارة اللوائح', 'Manage regulations'),
    ('governance.policies.read', 'governance', 'read', 'organization', 'عرض اللوائح', 'Read regulations'),
    ('governance.prior_route.approve', 'governance', 'approve', 'organization', 'مراجعة واعتماد أدلة المسار السابق', 'Approve prior route completion'),
    ('governance.prior_route.request', 'governance', 'request', 'governance_unit', 'تقديم أدلة استكمال المسار السابق', 'Request prior route completion'),
    ('governance.unit_types.manage', 'governance', 'manage', 'organization', 'إدارة أنواع المجالس', 'Manage council types'),
    ('governance.units.activate', 'governance', 'activate', 'organization', 'تفعيل المجالس', 'Activate councils'),
    ('governance.units.archive', 'governance', 'archive', 'organization', 'أرشفة المجالس', 'Archive councils'),
    ('governance.units.manage', 'governance', 'manage', 'organization', 'إدارة المجالس', 'Manage councils'),
    ('governance.units.read', 'governance', 'read', 'organization', 'عرض المجالس والشجرة', 'Read councils'),
    ('governance.workflows.manage', 'governance', 'manage', 'organization', 'إدارة المسارات الحوكمية', 'Manage governed workflows'),
    ('iam.approvals.review', 'iam', 'approvals.review', 'organization', 'مراجعة تغييرات الصلاحيات', 'Review IAM changes'),
    ('iam.delegations.manage', 'iam', 'delegations.manage', 'organization', 'إدارة التفويضات المؤقتة', 'Manage temporary delegations'),
    ('iam.permissions.manage', 'iam', 'permissions.manage', 'organization', 'إدارة الصلاحيات', 'Manage permissions'),
    ('iam.permissions.read', 'iam', 'permissions.read', 'organization', 'عرض الصلاحيات', 'Read permissions'),
    ('iam.roles.assign', 'iam', 'roles.assign', 'organization', 'تعيين الأدوار', 'Assign roles'),
    ('iam.roles.manage', 'iam', 'roles.manage', 'organization', 'إدارة الأدوار', 'Manage roles'),
    ('iam.roles.read', 'iam', 'roles.read', 'organization', 'عرض الأدوار', 'Read roles'),
    ('iam.roles.revoke', 'iam', 'roles.revoke', 'organization', 'إلغاء الأدوار', 'Revoke roles'),
    ('iam.sessions.manage', 'iam', 'sessions.manage', 'organization', 'إدارة الجلسات', 'Manage sessions'),
    ('iam.sso.manage', 'iam', 'sso.manage', 'organization', 'إدارة الدخول الموحد', 'Manage SSO'),
    ('iam.sso.read', 'iam', 'sso.read', 'organization', 'عرض إعدادات الدخول الموحد', 'Read SSO configuration'),
    ('iam.users.invite', 'iam', 'users.invite', 'organization', 'دعوة المستخدمين', 'Invite users'),
    ('iam.users.manage', 'iam', 'users.manage', 'organization', 'إدارة المستخدمين', 'Manage users'),
    ('iam.users.read', 'iam', 'users.read', 'organization', 'عرض المستخدمين', 'Read users'),
    ('meetings.create', 'meetings', 'create', 'governance_unit', 'إنشاء الاجتماعات', 'Create meetings'),
    ('meetings.manage', 'meetings', 'manage', 'governance_unit', 'إدارة الاجتماعات', 'Manage meetings'),
    ('meetings.read', 'meetings', 'read', 'governance_unit', 'عرض الاجتماعات', 'Read meetings'),
    ('quorum.manage', 'quorum', 'manage', 'governance_unit', 'إدارة النصاب', 'Manage quorum'),
    ('quorum.read', 'quorum', 'read', 'governance_unit', 'عرض النصاب', 'Read quorum'),
    ('topics.create', 'topics', 'create', 'governance_unit', 'إنشاء الموضوعات', 'Create topics'),
    ('topics.read', 'topics', 'read', 'governance_unit', 'عرض الموضوعات', 'Read topics'),
    ('topics.refer', 'topics', 'refer', 'governance_unit', 'إحالة الموضوعات', 'Refer topics'),
    ('topics.referrals.read', 'topics', 'referrals.read', 'governance_unit', 'عرض إحالات الموضوعات', 'Read topic referrals'),
    ('topics.review', 'topics', 'review', 'governance_unit', 'مراجعة الموضوعات', 'Review topics'),
    ('voting.cast', 'voting', 'cast', 'governance_unit', 'الإدلاء بالصوت', 'Cast vote'),
    ('voting.manage', 'voting', 'manage', 'governance_unit', 'إدارة التصويت', 'Manage voting'),
    ('voting.read', 'voting', 'read', 'governance_unit', 'عرض التصويت', 'Read voting')
  ) as definitions(code,module,action,context_scope,name_ar,name_en)
$catalog$;
alter function qarar_iam.system_permission_catalog() owner to qarar_iam_executor;
revoke all on function qarar_iam.system_permission_catalog() from public,anon,authenticated,service_role;

create function qarar_iam.sync_system_permission_catalog(p_organization_id uuid)
returns integer language plpgsql security definer set search_path=pg_catalog as $sync$
declare v_added text[];
begin
  -- Serialize maintenance with another synchronization of the same tenant.
  perform 1 from qarar_core.organizations where id=p_organization_id;
  if not found then raise exception using errcode='22023',message='catalog organization not found'; end if;
  perform pg_advisory_xact_lock(hashtextextended('iam.permission_catalog:'||p_organization_id::text,0));
  with inserted as (
    insert into qarar_iam.permissions(
      organization_id,code,module,action,context_scope,name_ar,name_en,description,
      is_system_permission,is_active)
    select p_organization_id,c.code,c.module,c.action,c.context_scope,c.name_ar,c.name_en,
      case when c.context_scope='governance_unit'
        then 'تُطبّق داخل نطاق المجلس المسند للمستخدم، مع بقاء شروط الدور وحالة العملية.'
        else 'تُطبّق داخل المؤسسة، مع بقاء شروط الدور وحالة العملية والاعتماد.'
      end,true,true
    from qarar_iam.system_permission_catalog() c
    on conflict(organization_id,code) do nothing
    returning code
  ) select coalesce(array_agg(code order by code),array[]::text[]) into v_added from inserted;
  if cardinality(v_added)>0 then
    perform qarar_audit.append_audit_log(p_organization_id,
      'iam.permission_catalog.provision','permissions',null,
      jsonb_build_object('catalog_version','20261010018000','added_codes',to_jsonb(v_added),
        'added_count',cardinality(v_added),'grants_changed',false));
  end if;
  return cardinality(v_added);
end;
$sync$;
alter function qarar_iam.sync_system_permission_catalog(uuid) owner to qarar_iam_executor;
revoke all on function qarar_iam.sync_system_permission_catalog(uuid) from public,anon,authenticated,service_role;

create function qarar_iam.provision_system_permission_catalog()
returns trigger language plpgsql security definer set search_path=pg_catalog as $trigger$
begin
  perform qarar_iam.sync_system_permission_catalog(new.id);
  return new;
end;
$trigger$;
alter function qarar_iam.provision_system_permission_catalog() owner to qarar_iam_executor;
revoke all on function qarar_iam.provision_system_permission_catalog() from public,anon,authenticated,service_role;
create trigger provision_system_permission_catalog
after insert on qarar_core.organizations
for each row execute function qarar_iam.provision_system_permission_catalog();

insert into qarar_architecture.function_registry
  (function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate)
select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),'iam','qarar_iam',false
from pg_proc p where p.pronamespace='qarar_iam'::regnamespace
  and p.proname in ('system_permission_catalog','sync_system_permission_catalog','provision_system_permission_catalog')
on conflict(function_oid) do nothing;
-- Existing IAM-to-audit permission is reused; no new execute privilege.
insert into qarar_architecture.module_function_execute_allowlist
  (source_module,target_schema,function_name,identity_arguments,rationale)
values ('iam','qarar_audit','append_audit_log',
  'p_organization_id uuid, p_action text, p_entity_type text, p_entity_id uuid, p_metadata jsonb',
  'Audit definition-only catalog provisioning without granting roles')
on conflict do nothing;

-- Existing disabled or customized definitions and all role grants are preserved.
do $repair$
declare v_org uuid;
begin
  for v_org in select id from qarar_core.organizations order by id loop
    perform qarar_iam.sync_system_permission_catalog(v_org);
  end loop;
end;
$repair$;
commit;
