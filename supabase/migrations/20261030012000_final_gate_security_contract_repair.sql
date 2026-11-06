-- Repair the final-gate defects without rewriting already-applied migrations.
-- Impact map: docs/engineering/impact/FINAL_GATE_SECURITY_AND_CONTRACT_REPAIR_AR.md
begin;

create or replace function qarar_topics.get_topic_detail_with_corrections(p_topic_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_base jsonb;
  v_version qarar_governance.corrected_document_versions%rowtype;
  v_no text;
  v_active record;
begin
  v_base := qarar_topics.get_topic_detail(p_topic_id);

  select r.id, r.correction_no, r.status
    into v_active
  from qarar_governance.topic_correction_requests r
  where r.organization_id = qarar_iam.current_organization_id()
    and r.topic_id = p_topic_id
    and r.status in ('traversing', 'returned_to_opener')
  order by r.updated_at desc
  limit 1;

  select d.*
    into v_version
  from qarar_governance.corrected_document_versions d
  join qarar_governance.topic_correction_requests r
    on r.id = d.correction_request_id
   and r.organization_id = d.organization_id
  where d.organization_id = qarar_iam.current_organization_id()
    and d.document_type = 'topic'
    and d.original_document_id = p_topic_id
    and r.status = 'completed'
  order by d.version_no desc
  limit 1;

  if v_version.id is not null then
    select r.correction_no
      into v_no
    from qarar_governance.topic_correction_requests r
    where r.id = v_version.correction_request_id
      and r.organization_id = v_version.organization_id;

    v_base := v_base
      || v_version.corrected_content
      || jsonb_build_object(
        'is_corrected', true,
        'correction_no', v_no,
        'original_content', jsonb_build_object(
          'title_ar', v_base->>'title_ar',
          'title_en', v_base->>'title_en',
          'description', v_base->>'description'
        )
      );
  else
    v_base := v_base || jsonb_build_object('is_corrected', false);
  end if;

  return v_base || jsonb_build_object(
    'active_correction_id', v_active.id,
    'active_correction_no', v_active.correction_no,
    'correction_status', v_active.status
  );
end;
$$;

-- Functions created in the correction/calendar batches inherited PUBLIC EXECUTE.
-- Keep only the explicit executor path used by registered API wrappers.
revoke all on function
  qarar_governance.open_topic_correction(uuid,text,jsonb,uuid,integer),
  qarar_governance.get_topic_correction(uuid),
  qarar_governance.decide_topic_correction_station(uuid,text,text,integer,uuid),
  qarar_governance.list_topic_corrections(uuid),
  qarar_governance.withdraw_topic_correction(uuid,integer,uuid),
  qarar_governance.sign_corrected_minutes(uuid,jsonb,integer),
  qarar_governance.revise_topic_correction(uuid,text,jsonb,integer,uuid),
  qarar_governance.guard_agenda_topic_correction(),
  qarar_governance.guard_vote_topic_correction(),
  qarar_topics.get_topic_detail_with_corrections(uuid),
  qarar_topics.get_topic_meeting_history_with_corrections(uuid),
  qarar_meetings.materialize_council_plan_cycle_trigger(),
  qarar_meetings.save_council_meeting_plan_v2(uuid,jsonb,uuid),
  qarar_meetings.list_meetings_calendar_v2(date,date,uuid[])
from public, anon, authenticated, service_role;

grant execute on function
  qarar_governance.open_topic_correction(uuid,text,jsonb,uuid,integer),
  qarar_governance.get_topic_correction(uuid),
  qarar_governance.decide_topic_correction_station(uuid,text,text,integer,uuid),
  qarar_governance.list_topic_corrections(uuid),
  qarar_governance.withdraw_topic_correction(uuid,integer,uuid),
  qarar_governance.sign_corrected_minutes(uuid,jsonb,integer),
  qarar_governance.revise_topic_correction(uuid,text,jsonb,integer,uuid),
  qarar_topics.get_topic_detail_with_corrections(uuid),
  qarar_topics.get_topic_meeting_history_with_corrections(uuid),
  qarar_meetings.save_council_meeting_plan_v2(uuid,jsonb,uuid),
  qarar_meetings.list_meetings_calendar_v2(date,date,uuid[])
to qarar_api_executor;

alter function qarar_meetings.council_plan_materialization_horizon_v2(date,date,date)
  security definer;

insert into qarar_architecture.module_function_execute_allowlist(
  source_module,
  target_schema,
  function_name,
  identity_arguments,
  rationale
)
values
  ('meetings', 'qarar_governance', 'assert_topic_not_under_correction',
   'p_topic_id uuid, p_organization_id uuid',
   'Block agenda insertion while a formal topic correction is active'),
  ('voting', 'qarar_governance', 'assert_topic_not_under_correction',
   'p_topic_id uuid, p_organization_id uuid',
   'Block opening a vote while a formal topic correction is active')
on conflict do nothing;

create or replace function qarar_iam.system_permission_catalog()
returns table(code text, module text, action text, context_scope text, name_ar text, name_en text)
language sql
immutable
security definer
set search_path = pg_catalog
as $$
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
    ('execution.tasks.manage', 'execution', 'tasks.manage', 'organization', 'إدارة التكليفات', 'Manage assignments')
  ) as definitions(code, module, action, context_scope, name_ar, name_en)
$$;

revoke all on function qarar_iam.system_permission_catalog()
from public, anon, authenticated, service_role;

do $$
declare
  v_org uuid;
begin
  for v_org in select id from qarar_core.organizations order by id loop
    perform qarar_iam.sync_system_permission_catalog(v_org);
  end loop;
end;
$$;

notify pgrst, 'reload schema';
commit;
