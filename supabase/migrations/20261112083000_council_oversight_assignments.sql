-- Council oversight: who may follow the performance of which councils, down the organisational tree.
-- Follow-up is read-only: it never passes through has_permission and grants no command authority.
-- A position (the chair of a council, or of every council of a class) is resolved from memberships in
-- force on the day, so follow-up moves with the position when its holder changes.
-- Impact map: docs/engineering/impact/COUNCIL_OVERSIGHT_ASSIGNMENTS_20261112_AR.md
begin;

create table qarar_iam.oversight_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references qarar_core.organizations(id) on delete restrict,
  title_ar text check (title_ar is null or char_length(title_ar) between 1 and 200),
  holder_kind text not null check (holder_kind in ('user','council_position','position_rule')),
  holder_user_id uuid references qarar_iam.users(id),
  holder_council_id uuid references qarar_core.governance_units(id),
  holder_role_code text,
  holder_class_id uuid references qarar_governance.governance_unit_classes(id),
  target_mode text not null check (target_mode in ('subtree','selected')),
  root_unit_id uuid references qarar_core.governance_units(id),
  target_class_ids uuid[] not null default '{}',
  council_ids uuid[] not null default '{}',
  starts_on date not null default current_date,
  ends_on date,
  status text not null default 'active' check (status in ('active','ended')),
  end_reason text,
  ended_at timestamptz,
  ended_by_user_id uuid references qarar_iam.users(id),
  version integer not null default 1,
  request_id uuid not null,
  created_by_user_id uuid references qarar_iam.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, request_id),
  check (ends_on is null or ends_on >= starts_on),
  check (holder_kind <> 'user' or holder_user_id is not null),
  check (holder_kind <> 'council_position' or (holder_council_id is not null and holder_role_code is not null)),
  check (holder_kind <> 'position_rule' or (holder_role_code is not null and holder_class_id is not null and root_unit_id is null)),
  check (target_mode <> 'selected' or cardinality(council_ids) > 0),
  check (target_mode <> 'subtree' or holder_kind = 'position_rule' or root_unit_id is not null),
  check (status <> 'ended' or (end_reason is not null and ended_at is not null))
);
insert into qarar_architecture.entity_registry(entity_name,module_code,legacy_public_view)
values('oversight_assignments','iam',false)
on conflict(entity_name) do update set module_code=excluded.module_code,legacy_public_view=false;
create index oversight_assignments_org_active on qarar_iam.oversight_assignments(organization_id) where status = 'active';
alter table qarar_iam.oversight_assignments enable row level security;
revoke all on qarar_iam.oversight_assignments from public, anon, authenticated, service_role;
grant select, insert, update on qarar_iam.oversight_assignments to qarar_iam_executor;
create trigger set_oversight_assignments_updated_at before update on qarar_iam.oversight_assignments
  for each row execute function qarar_core.set_updated_at();
create trigger audit_oversight_assignments_changes after insert or update or delete on qarar_iam.oversight_assignments
  for each row execute function qarar_audit.audit_row_change();

-- Permission to manage assignments, granted to the governance administrator role.
create or replace function qarar_iam.system_permission_catalog()
 RETURNS TABLE(code text, module text, action text, context_scope text, name_ar text, name_en text)
 LANGUAGE sql
 IMMUTABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
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
    ('corrections.read', 'corrections', 'read', 'organization', 'عرض التصحيحات الرسمية', 'Read formal corrections'),
    ('decisions.create', 'decisions', 'create', 'governance_unit', 'إنشاء القرارات', 'Create decisions'),
    ('decisions.read', 'decisions', 'read', 'governance_unit', 'عرض القرارات', 'Read decisions'),
    ('execution.tasks.read', 'execution', 'tasks.read', 'organization', 'عرض كل التكليفات', 'Read all assignments'),
    ('execution.tasks.verify', 'execution', 'tasks.verify', 'organization', 'التحقق من إنجاز التكليفات', 'Verify assignment completion'),
    ('execution.unit_tasks.execute', 'execution', 'unit_tasks.execute', 'governance_unit', 'تنفيذ تكليفات الجهة', 'Execute the unit''s assignments'),
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
    ('voting.read', 'voting', 'read', 'governance_unit', 'عرض التصويت', 'Read voting'),
    ('execution.tasks.manage', 'execution', 'tasks.manage', 'organization', 'إدارة التكليفات', 'Manage assignments'),
    ('governance.oversight.manage', 'governance', 'oversight.manage', 'organization', 'إدارة صلاحيات متابعة المجالس', 'Manage council oversight')
  ) as definitions(code, module, action, context_scope, name_ar, name_en)
$function$;

do $sync$
declare v_org uuid;
begin
  for v_org in select id from qarar_core.organizations order by id loop
    perform qarar_iam.sync_system_permission_catalog(v_org);
  end loop;
end
$sync$;

insert into qarar_iam.role_permissions(organization_id, role_id, permission_id, is_active)
select r.organization_id, r.id, p.id, true
from qarar_iam.roles r join qarar_iam.permissions p on p.organization_id=r.organization_id and p.code='governance.oversight.manage'
where r.code='governance_admin'
  and not exists (select 1 from qarar_iam.role_permissions x where x.role_id=r.id and x.permission_id=p.id);

-- Units at and below a root of the organisational tree.
create function qarar_iam.unit_subtree(p_org uuid, p_root uuid)
returns setof uuid language sql stable security definer set search_path=pg_catalog
as $$
  with recursive tree(id) as (
    select u.id from qarar_core.governance_units u where u.id=p_root and u.organization_id=p_org
    union
    select c.id from qarar_core.governance_units c join tree t on c.parent_unit_id=t.id where c.organization_id=p_org
  ) select id from tree
$$;

/**
 * Every (holder, council) pair one definition covers today. The single source of truth for preview,
 * resolution and every later phase that asks "who follows this council".
 */
create function qarar_iam.oversight_coverage(
  p_org uuid, p_holder_kind text, p_holder_user_id uuid, p_holder_council_id uuid, p_holder_role_code text,
  p_holder_class_id uuid, p_target_mode text, p_root_unit_id uuid, p_target_class_ids uuid[], p_council_ids uuid[])
returns table(holder_user_id uuid, council_id uuid) language sql stable security definer set search_path=pg_catalog
as $$
  with active_memberships as (
    select m.user_id, m.governance_unit_id, r.code
    from qarar_iam.memberships m join qarar_iam.roles r on r.id=m.role_id and r.organization_id=m.organization_id and r.is_active
    where m.organization_id=p_org and m.membership_status='active' and m.start_date<=current_date
      and (m.end_date is null or m.end_date>=current_date)
  ), holders(user_id, root) as (
    select p_holder_user_id, p_root_unit_id where p_holder_kind='user'
    union all
    select am.user_id, p_root_unit_id from active_memberships am
    where p_holder_kind='council_position' and am.governance_unit_id=p_holder_council_id and am.code=p_holder_role_code
    union all
    select am.user_id, c.scope_unit_id from active_memberships am
    join qarar_core.governance_units c on c.id=am.governance_unit_id and c.organization_id=p_org
    where p_holder_kind='position_rule' and am.code=p_holder_role_code and c.governance_class_id=p_holder_class_id and c.scope_unit_id is not null
  ), councils as (
    select g.id, g.scope_unit_id, g.governance_class_id
    from qarar_core.governance_units g join qarar_core.governance_unit_types t on t.id=g.unit_type_id and t.is_council_type
    where g.organization_id=p_org and g.status <> 'archived'
  )
  select distinct h.user_id, c.id
  from holders h
  join councils c on case
    when p_target_mode='selected' then c.id = any(p_council_ids)
    else c.scope_unit_id in (select qarar_iam.unit_subtree(p_org, h.root))
      and (cardinality(p_target_class_ids)=0 or c.governance_class_id = any(p_target_class_ids)) end
  where h.user_id is not null
$$;

create function qarar_iam.overseen_councils(p_user uuid)
returns table(council_id uuid, assignment_id uuid) language sql stable security definer set search_path=pg_catalog
as $$
  select cov.council_id, a.id
  from qarar_iam.users u
  join qarar_iam.oversight_assignments a on a.organization_id=u.organization_id and a.status='active'
    and a.starts_on<=current_date and (a.ends_on is null or a.ends_on>=current_date)
  cross join lateral qarar_iam.oversight_coverage(a.organization_id, a.holder_kind, a.holder_user_id, a.holder_council_id, a.holder_role_code,
    a.holder_class_id, a.target_mode, a.root_unit_id, a.target_class_ids, a.council_ids) cov
  where u.id=p_user and cov.holder_user_id=p_user
$$;

/** Validates a definition against the caller's organisation and returns it normalised. */
create function qarar_iam.normalize_oversight_definition(p_org uuid, p_definition jsonb)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare
  v_kind text := p_definition->>'holder_kind';
  v_mode text := coalesce(p_definition->>'target_mode','subtree');
  v_user uuid; v_council uuid; v_role text; v_class uuid; v_root uuid;
  v_classes uuid[] := '{}'; v_councils uuid[] := '{}'; v_starts date; v_ends date; v_title text;
begin
  if jsonb_typeof(p_definition) is distinct from 'object' then raise exception 'oversight definition must be an object' using errcode='22023'; end if;
  if v_kind not in ('user','council_position','position_rule') then raise exception 'invalid oversight holder kind' using errcode='22023'; end if;
  if v_mode not in ('subtree','selected') then raise exception 'invalid oversight target mode' using errcode='22023'; end if;
  begin
    v_user := nullif(p_definition->>'holder_user_id','')::uuid;
    v_council := nullif(p_definition->>'holder_council_id','')::uuid;
    v_class := nullif(p_definition->>'holder_class_id','')::uuid;
    v_root := nullif(p_definition->>'root_unit_id','')::uuid;
    select coalesce(array_agg(x::uuid), '{}') into v_classes from jsonb_array_elements_text(coalesce(p_definition->'target_class_ids','[]')) x;
    select coalesce(array_agg(x::uuid), '{}') into v_councils from jsonb_array_elements_text(coalesce(p_definition->'council_ids','[]')) x;
    v_starts := coalesce(nullif(p_definition->>'starts_on','')::date, current_date);
    v_ends := nullif(p_definition->>'ends_on','')::date;
  exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
    raise exception 'invalid oversight identifier or date' using errcode='22023';
  end;
  v_role := nullif(btrim(p_definition->>'holder_role_code'),'');
  v_title := nullif(btrim(p_definition->>'title_ar'),'');

  if v_kind='user' and not exists (select 1 from qarar_iam.users u where u.id=v_user and u.organization_id=p_org) then
    raise exception 'oversight holder user is required in this organisation' using errcode='22023';
  end if;
  if v_kind in ('council_position','position_rule') and not exists (
    select 1 from qarar_iam.roles r where r.organization_id=p_org and r.code=v_role and r.role_scope='governance_unit' and r.is_active) then
    raise exception 'oversight holder position is required' using errcode='22023';
  end if;
  if v_kind='council_position' and not exists (
    select 1 from qarar_core.governance_units g join qarar_core.governance_unit_types t on t.id=g.unit_type_id and t.is_council_type
    where g.id=v_council and g.organization_id=p_org) then
    raise exception 'oversight holder council is required in this organisation' using errcode='22023';
  end if;
  if v_kind='position_rule' and not exists (select 1 from qarar_governance.governance_unit_classes c where c.id=v_class and c.organization_id=p_org) then
    raise exception 'oversight holder council class is required' using errcode='22023';
  end if;
  if v_kind='position_rule' then v_root := null; end if;
  if v_mode='subtree' and v_kind<>'position_rule' and not exists (select 1 from qarar_core.governance_units g where g.id=v_root and g.organization_id=p_org) then
    raise exception 'oversight root unit is required in this organisation' using errcode='22023';
  end if;
  if exists (select 1 from unnest(v_classes) c where not exists (select 1 from qarar_governance.governance_unit_classes k where k.id=c and k.organization_id=p_org)) then
    raise exception 'oversight council class is not in this organisation' using errcode='22023';
  end if;
  if v_mode='selected' then
    if cardinality(v_councils)=0 then raise exception 'choose at least one council to follow' using errcode='22023'; end if;
    if exists (select 1 from unnest(v_councils) c where not exists (
      select 1 from qarar_core.governance_units g join qarar_core.governance_unit_types t on t.id=g.unit_type_id and t.is_council_type
      where g.id=c and g.organization_id=p_org)) then
      raise exception 'oversight council is not in this organisation' using errcode='22023';
    end if;
    v_root := null; v_classes := '{}';
  else
    v_councils := '{}';
  end if;
  if v_ends is not null and v_ends < v_starts then raise exception 'oversight end precedes its start' using errcode='22023'; end if;
  if v_title is not null and char_length(v_title) > 200 then raise exception 'oversight title is too long' using errcode='22023'; end if;

  return jsonb_build_object(
    'title_ar', v_title, 'holder_kind', v_kind,
    'holder_user_id', case when v_kind='user' then v_user end,
    'holder_council_id', case when v_kind='council_position' then v_council end,
    'holder_role_code', case when v_kind<>'user' then v_role end,
    'holder_class_id', case when v_kind='position_rule' then v_class end,
    'target_mode', v_mode, 'root_unit_id', v_root,
    'target_class_ids', to_jsonb(v_classes), 'council_ids', to_jsonb(v_councils),
    'starts_on', v_starts, 'ends_on', v_ends);
end;
$$;

create function qarar_iam.oversight_assignment_json(p_id uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog
as $$
  select jsonb_build_object(
    'id', a.id, 'version', a.version, 'status', a.status, 'title_ar', a.title_ar,
    'holder_kind', a.holder_kind, 'holder_user_id', a.holder_user_id, 'holder_user_name_ar', hu.full_name_ar,
    'holder_council_id', a.holder_council_id, 'holder_council_name_ar', hc.name_ar,
    'holder_role_code', a.holder_role_code, 'holder_role_name_ar', hr.name_ar,
    'holder_class_id', a.holder_class_id, 'holder_class_name_ar', hk.name_ar,
    'target_mode', a.target_mode, 'root_unit_id', a.root_unit_id, 'root_unit_name_ar', ru.name_ar,
    'target_class_ids', to_jsonb(a.target_class_ids),
    'target_class_names_ar', coalesce((select jsonb_agg(k.name_ar order by array_position(array['university','faculty','department','committee','executive','other'], k.governance_level), k.name_ar) from qarar_governance.governance_unit_classes k where k.id = any(a.target_class_ids)), '[]'),
    'council_ids', to_jsonb(a.council_ids),
    'council_names_ar', coalesce((select jsonb_agg(g.name_ar order by g.name_ar) from qarar_core.governance_units g where g.id = any(a.council_ids)), '[]'),
    'starts_on', a.starts_on, 'ends_on', a.ends_on, 'end_reason', a.end_reason, 'ended_at', a.ended_at,
    'created_at', a.created_at, 'updated_at', a.updated_at,
    'coverage', (select jsonb_build_object(
        'council_count', count(distinct cov.council_id),
        'holder_count', count(distinct cov.holder_user_id),
        'holders', coalesce((select jsonb_agg(distinct u.full_name_ar) from qarar_iam.users u where u.id in (select c2.holder_user_id from qarar_iam.oversight_coverage(a.organization_id, a.holder_kind, a.holder_user_id, a.holder_council_id, a.holder_role_code, a.holder_class_id, a.target_mode, a.root_unit_id, a.target_class_ids, a.council_ids) c2)), '[]'))
      from qarar_iam.oversight_coverage(a.organization_id, a.holder_kind, a.holder_user_id, a.holder_council_id, a.holder_role_code,
        a.holder_class_id, a.target_mode, a.root_unit_id, a.target_class_ids, a.council_ids) cov))
  from qarar_iam.oversight_assignments a
  left join qarar_iam.users hu on hu.id=a.holder_user_id
  left join qarar_core.governance_units hc on hc.id=a.holder_council_id
  left join qarar_iam.roles hr on hr.organization_id=a.organization_id and hr.code=a.holder_role_code
  left join qarar_governance.governance_unit_classes hk on hk.id=a.holder_class_id
  left join qarar_core.governance_units ru on ru.id=a.root_unit_id
  where a.id=p_id
$$;

create function qarar_iam.admin_get_oversight_workspace_v2()
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_org uuid := qarar_iam.current_organization_id();
begin
  perform qarar_iam.assert_permission('governance.oversight.manage', null);
  return jsonb_build_object(
    'assignments', coalesce((select jsonb_agg(qarar_iam.oversight_assignment_json(a.id) order by a.status, a.created_at desc)
      from qarar_iam.oversight_assignments a where a.organization_id=v_org), '[]'),
    'users', coalesce((select jsonb_agg(jsonb_build_object('id', u.id, 'name_ar', u.full_name_ar, 'email', u.email) order by u.full_name_ar)
      from qarar_iam.users u where u.organization_id=v_org and coalesce(u.status,'active')='active'), '[]'),
    'roles', coalesce((select jsonb_agg(jsonb_build_object('code', r.code, 'name_ar', r.name_ar) order by r.name_ar)
      from qarar_iam.roles r where r.organization_id=v_org and r.role_scope='governance_unit' and r.is_active), '[]'),
    'classes', coalesce((select jsonb_agg(jsonb_build_object('id', k.id, 'name_ar', k.name_ar) order by array_position(array['university','faculty','department','committee','executive','other'], k.governance_level), k.name_ar)
      from qarar_governance.governance_unit_classes k where k.organization_id=v_org and coalesce(k.is_active,true)), '[]'),
    'units', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'name_ar', g.name_ar, 'parent_id', g.parent_unit_id) order by g.name_ar)
      from qarar_core.governance_units g join qarar_core.governance_unit_types t on t.id=g.unit_type_id and not t.is_council_type
      where g.organization_id=v_org and g.status <> 'archived'), '[]'),
    'councils', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'name_ar', g.name_ar, 'class_id', g.governance_class_id,
        'class_name_ar', k.name_ar, 'scope_unit_id', g.scope_unit_id, 'scope_unit_name_ar', s.name_ar) order by g.name_ar)
      from qarar_core.governance_units g join qarar_core.governance_unit_types t on t.id=g.unit_type_id and t.is_council_type
      left join qarar_governance.governance_unit_classes k on k.id=g.governance_class_id
      left join qarar_core.governance_units s on s.id=g.scope_unit_id
      where g.organization_id=v_org and g.status <> 'archived'), '[]'),
    'unlinked_councils', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'name_ar', g.name_ar) order by g.name_ar)
      from qarar_core.governance_units g join qarar_core.governance_unit_types t on t.id=g.unit_type_id and t.is_council_type
      where g.organization_id=v_org and g.status <> 'archived' and g.scope_unit_id is null), '[]'));
end;
$$;

create function qarar_iam.admin_preview_oversight_v2(p_definition jsonb)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_org uuid := qarar_iam.current_organization_id(); v_def jsonb;
begin
  perform qarar_iam.assert_permission('governance.oversight.manage', null);
  v_def := qarar_iam.normalize_oversight_definition(v_org, p_definition);
  return (
    with cov as (
      select * from qarar_iam.oversight_coverage(v_org, v_def->>'holder_kind', (v_def->>'holder_user_id')::uuid, (v_def->>'holder_council_id')::uuid,
        v_def->>'holder_role_code', (v_def->>'holder_class_id')::uuid, v_def->>'target_mode', (v_def->>'root_unit_id')::uuid,
        array(select jsonb_array_elements_text(v_def->'target_class_ids')::uuid), array(select jsonb_array_elements_text(v_def->'council_ids')::uuid))
    )
    select jsonb_build_object(
      'council_count', (select count(distinct council_id) from cov),
      'councils', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'name_ar', g.name_ar, 'class_name_ar', k.name_ar) order by array_position(array['university','faculty','department','committee','executive','other'], k.governance_level), g.name_ar)
        from qarar_core.governance_units g left join qarar_governance.governance_unit_classes k on k.id=g.governance_class_id
        where g.id in (select council_id from cov)), '[]'),
      'holders', coalesce((select jsonb_agg(jsonb_build_object('id', u.id, 'name_ar', u.full_name_ar, 'council_count',
          (select count(*) from cov c2 where c2.holder_user_id=u.id)) order by u.full_name_ar)
        from qarar_iam.users u where u.id in (select holder_user_id from cov)), '[]'))
  );
end;
$$;

create function qarar_iam.admin_save_oversight_assignment_v2(p_assignment_id uuid, p_definition jsonb, p_expected_version integer, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare
  v_org uuid := qarar_iam.current_organization_id(); v_actor uuid := auth.uid(); v_def jsonb; v_id uuid; v_existing qarar_iam.oversight_assignments%rowtype;
begin
  perform qarar_iam.assert_permission('governance.oversight.manage', null);
  if p_request_id is null then raise exception 'request id is required' using errcode='22023'; end if;
  select id into v_id from qarar_iam.oversight_assignments where organization_id=v_org and request_id=p_request_id;
  if v_id is not null then return qarar_iam.oversight_assignment_json(v_id); end if;
  v_def := qarar_iam.normalize_oversight_definition(v_org, p_definition);

  if p_assignment_id is null then
    insert into qarar_iam.oversight_assignments(organization_id, title_ar, holder_kind, holder_user_id, holder_council_id, holder_role_code,
      holder_class_id, target_mode, root_unit_id, target_class_ids, council_ids, starts_on, ends_on, request_id, created_by_user_id)
    values (v_org, v_def->>'title_ar', v_def->>'holder_kind', (v_def->>'holder_user_id')::uuid, (v_def->>'holder_council_id')::uuid,
      v_def->>'holder_role_code', (v_def->>'holder_class_id')::uuid, v_def->>'target_mode', (v_def->>'root_unit_id')::uuid,
      array(select jsonb_array_elements_text(v_def->'target_class_ids')::uuid), array(select jsonb_array_elements_text(v_def->'council_ids')::uuid),
      (v_def->>'starts_on')::date, (v_def->>'ends_on')::date, p_request_id, v_actor)
    returning id into v_id;
  else
    select * into v_existing from qarar_iam.oversight_assignments where id=p_assignment_id and organization_id=v_org for update;
    if v_existing.id is null then raise exception 'oversight assignment not found' using errcode='P0002'; end if;
    if v_existing.status <> 'active' then raise exception 'an ended oversight assignment cannot be changed' using errcode='22023'; end if;
    if p_expected_version is distinct from v_existing.version then raise exception 'oversight assignment changed since it was read' using errcode='40001'; end if;
    update qarar_iam.oversight_assignments set title_ar=v_def->>'title_ar', holder_kind=v_def->>'holder_kind',
      holder_user_id=(v_def->>'holder_user_id')::uuid, holder_council_id=(v_def->>'holder_council_id')::uuid,
      holder_role_code=v_def->>'holder_role_code', holder_class_id=(v_def->>'holder_class_id')::uuid, target_mode=v_def->>'target_mode',
      root_unit_id=(v_def->>'root_unit_id')::uuid, target_class_ids=array(select jsonb_array_elements_text(v_def->'target_class_ids')::uuid),
      council_ids=array(select jsonb_array_elements_text(v_def->'council_ids')::uuid), starts_on=(v_def->>'starts_on')::date,
      ends_on=(v_def->>'ends_on')::date, version=version+1, request_id=p_request_id
    where id=p_assignment_id returning id into v_id;
  end if;
  return qarar_iam.oversight_assignment_json(v_id);
end;
$$;

create function qarar_iam.admin_end_oversight_assignment_v2(p_assignment_id uuid, p_reason text, p_expected_version integer)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare v_org uuid := qarar_iam.current_organization_id(); v_existing qarar_iam.oversight_assignments%rowtype;
begin
  perform qarar_iam.assert_permission('governance.oversight.manage', null);
  if nullif(btrim(p_reason),'') is null or char_length(p_reason) > 500 then raise exception 'an end reason is required' using errcode='22023'; end if;
  select * into v_existing from qarar_iam.oversight_assignments where id=p_assignment_id and organization_id=v_org for update;
  if v_existing.id is null then raise exception 'oversight assignment not found' using errcode='P0002'; end if;
  if v_existing.status <> 'active' then raise exception 'oversight assignment already ended' using errcode='22023'; end if;
  if p_expected_version is distinct from v_existing.version then raise exception 'oversight assignment changed since it was read' using errcode='40001'; end if;
  update qarar_iam.oversight_assignments set status='ended', end_reason=btrim(p_reason), ended_at=now(),
    ended_by_user_id=auth.uid(), version=version+1 where id=p_assignment_id;
  return qarar_iam.oversight_assignment_json(p_assignment_id);
end;
$$;

create function qarar_iam.get_my_oversight_scope_v2()
returns jsonb language sql stable security definer set search_path=pg_catalog
as $$
  select jsonb_build_object('councils', coalesce((
    select jsonb_agg(jsonb_build_object('id', g.id, 'name_ar', g.name_ar, 'class_name_ar', k.name_ar, 'scope_unit_name_ar', s.name_ar,
        'via', (select jsonb_agg(jsonb_build_object('assignment_id', a.id, 'title_ar', a.title_ar, 'holder_kind', a.holder_kind) order by a.created_at)
                from qarar_iam.oversight_assignments a where a.id in (select o2.assignment_id from qarar_iam.overseen_councils(auth.uid()) o2 where o2.council_id=g.id)))
      order by array_position(array['university','faculty','department','committee','executive','other'], k.governance_level), g.name_ar)
    from qarar_core.governance_units g
    left join qarar_governance.governance_unit_classes k on k.id=g.governance_class_id
    left join qarar_core.governance_units s on s.id=g.scope_unit_id
    where g.id in (select o.council_id from qarar_iam.overseen_councils(auth.uid()) o)), '[]'))
$$;

do $owners$
declare f text;
begin
  foreach f in array array[
    'qarar_iam.unit_subtree(uuid,uuid)',
    'qarar_iam.oversight_coverage(uuid,text,uuid,uuid,text,uuid,text,uuid,uuid[],uuid[])',
    'qarar_iam.overseen_councils(uuid)',
    'qarar_iam.normalize_oversight_definition(uuid,jsonb)',
    'qarar_iam.oversight_assignment_json(uuid)',
    'qarar_iam.admin_get_oversight_workspace_v2()',
    'qarar_iam.admin_preview_oversight_v2(jsonb)',
    'qarar_iam.admin_save_oversight_assignment_v2(uuid,jsonb,integer,uuid)',
    'qarar_iam.admin_end_oversight_assignment_v2(uuid,text,integer)',
    'qarar_iam.get_my_oversight_scope_v2()'] loop
    execute format('alter function %s owner to qarar_iam_executor', f);
    execute format('revoke all on function %s from public, anon, authenticated, service_role', f);
  end loop;
end
$owners$;
grant execute on function qarar_iam.admin_get_oversight_workspace_v2(), qarar_iam.admin_preview_oversight_v2(jsonb),
  qarar_iam.admin_save_oversight_assignment_v2(uuid,jsonb,integer,uuid), qarar_iam.admin_end_oversight_assignment_v2(uuid,text,integer),
  qarar_iam.get_my_oversight_scope_v2() to qarar_api_executor;
-- Later phases (dashboard, alerts, reports) resolve scope through these from their own modules.
grant execute on function qarar_iam.overseen_councils(uuid), qarar_iam.oversight_coverage(uuid,text,uuid,uuid,text,uuid,text,uuid,uuid[],uuid[]),
  qarar_iam.unit_subtree(uuid,uuid)
  to qarar_meetings_executor, qarar_governance_executor, qarar_execution_executor, qarar_topics_executor, qarar_decisions_executor;

create function api_v2.admin_get_oversight_workspace_v2() returns jsonb language sql security definer set search_path=pg_catalog
as $$ select qarar_iam.admin_get_oversight_workspace_v2() $$;
create function api_v2.admin_preview_oversight_v2(p_definition jsonb) returns jsonb language sql security definer set search_path=pg_catalog
as $$ select qarar_iam.admin_preview_oversight_v2($1) $$;
create function api_v2.admin_save_oversight_assignment_v2(p_assignment_id uuid, p_definition jsonb, p_expected_version integer, p_request_id uuid)
returns jsonb language sql security definer set search_path=pg_catalog
as $$ select qarar_iam.admin_save_oversight_assignment_v2($1,$2,$3,$4) $$;
create function api_v2.admin_end_oversight_assignment_v2(p_assignment_id uuid, p_reason text, p_expected_version integer)
returns jsonb language sql security definer set search_path=pg_catalog
as $$ select qarar_iam.admin_end_oversight_assignment_v2($1,$2,$3) $$;
create function api_v2.get_my_oversight_scope_v2() returns jsonb language sql security definer set search_path=pg_catalog
as $$ select qarar_iam.get_my_oversight_scope_v2() $$;

do $api$
declare f text;
begin
  foreach f in array array[
    'api_v2.admin_get_oversight_workspace_v2()', 'api_v2.admin_preview_oversight_v2(jsonb)',
    'api_v2.admin_save_oversight_assignment_v2(uuid,jsonb,integer,uuid)', 'api_v2.admin_end_oversight_assignment_v2(uuid,text,integer)',
    'api_v2.get_my_oversight_scope_v2()'] loop
    execute format('alter function %s owner to qarar_api_executor', f);
    execute format('revoke all on function %s from public, anon, service_role', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end
$api$;

insert into qarar_architecture.api_contract_registry(api_version,contract_name,implementation_schema,implementation_name,identity_arguments,module_code,audience) values
('v2','admin_get_oversight_workspace_v2','qarar_iam','admin_get_oversight_workspace_v2','','iam','authenticated'),
('v2','admin_preview_oversight_v2','qarar_iam','admin_preview_oversight_v2','p_definition jsonb','iam','authenticated'),
('v2','admin_save_oversight_assignment_v2','qarar_iam','admin_save_oversight_assignment_v2','p_assignment_id uuid, p_definition jsonb, p_expected_version integer, p_request_id uuid','iam','authenticated'),
('v2','admin_end_oversight_assignment_v2','qarar_iam','admin_end_oversight_assignment_v2','p_assignment_id uuid, p_reason text, p_expected_version integer','iam','authenticated'),
('v2','get_my_oversight_scope_v2','qarar_iam','get_my_oversight_scope_v2','','iam','authenticated');

notify pgrst, 'reload schema';
commit;
