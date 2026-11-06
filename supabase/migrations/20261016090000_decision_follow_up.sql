-- Following decisions, managing their tasks and closing them (phase 3b).
-- The council's chair, or a holder of the new management permission, cancels,
-- reassigns or extends a task with a written reason, and closes a decision
-- only once every task is done or cancelled.
-- Impact map: docs/engineering/impact/DECISION_FOLLOW_UP_AR.md
begin;

-- 1. One more formal permission, granted to nobody until an administrator does.
create or replace function qarar_iam.system_permission_catalog()
returns table(code text, module text, action text, context_scope text, name_ar text, name_en text)
language sql immutable security definer set search_path = pg_catalog as $catalog$
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
$catalog$;

do $sync$
declare v_org uuid;
begin
  for v_org in select id from qarar_core.organizations order by id loop
    perform qarar_iam.sync_system_permission_catalog(v_org);
  end loop;
end
$sync$;

alter table qarar_execution.action_item_events drop constraint action_item_events_event_type_check;
alter table qarar_execution.action_item_events add constraint action_item_events_event_type_check
  check (event_type in ('start', 'progress', 'evidence_added', 'evidence_removed', 'submit', 'verify', 'return', 'cancel', 'reassign', 'extend'));

-- 2. Managing a task: the chair of the decision's council or the management permission.
create function qarar_execution.can_manage_task(p_task qarar_execution.action_items)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select qarar_iam.has_permission('execution.tasks.manage', null)
    or coalesce((
      select qarar_iam.has_unit_role_code(d.governance_unit_id, array['council_chair'])
      from qarar_decisions.decisions d
      where d.id = p_task.decision_id and d.organization_id = p_task.organization_id
    ), false)
$$;

create function qarar_execution.lock_task_for_management(p_task_id uuid, p_reason text, p_expected_updated_at timestamptz)
returns qarar_execution.action_items
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare t qarar_execution.action_items%rowtype;
begin
  if p_reason is null or char_length(btrim(p_reason)) not between 5 and 2000 then
    raise exception using errcode = '22023', message = 'اكتب السبب من 5 إلى 2000 حرف.';
  end if;
  t := qarar_execution.lock_task(p_task_id, p_expected_updated_at);
  if not qarar_execution.can_manage_task(t) then
    raise exception using errcode = '42501', message = 'إدارة المهمة لرئيس مجلس القرار أو من يحمل صلاحية إدارة التكليفات.';
  end if;
  return t;
end;
$$;

create function qarar_execution.cancel_task(p_task_id uuid, p_reason text, p_expected_updated_at timestamptz)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare t qarar_execution.action_items%rowtype;
begin
  t := qarar_execution.lock_task_for_management(p_task_id, p_reason, p_expected_updated_at);
  update qarar_execution.action_items set status = 'cancelled'
  where id = t.id and organization_id = t.organization_id returning * into t;
  perform qarar_execution.record_task_step(t, 'cancel', t.progress_percent, p_reason);
  return jsonb_build_object('id', t.id, 'status', t.status, 'updated_at', t.updated_at);
end;
$$;

create function qarar_execution.reassign_task(
  p_task_id uuid, p_assigned_user_id uuid, p_assigned_unit_id uuid, p_reason text, p_expected_updated_at timestamptz
)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  t qarar_execution.action_items%rowtype;
  v_previous jsonb;
begin
  t := qarar_execution.lock_task_for_management(p_task_id, p_reason, p_expected_updated_at);
  if (p_assigned_user_id is null) = (p_assigned_unit_id is null) then
    raise exception using errcode = '22023', message = 'اختر مكلَّفاً واحداً: شخصاً أو جهة.';
  end if;
  if p_assigned_user_id is not null and not exists (
    select 1 from qarar_iam.users where id = p_assigned_user_id and organization_id = t.organization_id and status = 'active'
  ) then
    raise exception using errcode = '22023', message = 'المكلَّف غير موجود أو غير نشط.';
  end if;
  if p_assigned_unit_id is not null and not exists (
    select 1 from qarar_core.governance_units where id = p_assigned_unit_id and organization_id = t.organization_id and status = 'active'
  ) then
    raise exception using errcode = '22023', message = 'الجهة غير موجودة أو غير نشطة.';
  end if;
  if t.status = 'submitted' then
    raise exception using errcode = '23514', message = 'سُلّمت المهمة للتحقق؛ تحقق منها أو أعدها قبل إعادة إسنادها.';
  end if;
  v_previous := jsonb_build_object('assigned_user_id', t.assigned_user_id, 'assigned_unit_id', t.assigned_unit_id);
  update qarar_execution.action_items set assigned_user_id = p_assigned_user_id, assigned_unit_id = p_assigned_unit_id
  where id = t.id and organization_id = t.organization_id returning * into t;
  perform qarar_execution.record_task_step(t, 'reassign', t.progress_percent, p_reason);
  perform qarar_audit.append_audit_log(t.organization_id, 'execution.task.reassign.detail', 'action_items', t.id,
    jsonb_build_object('previous', v_previous, 'assigned_user_id', p_assigned_user_id, 'assigned_unit_id', p_assigned_unit_id));
  return jsonb_build_object('id', t.id, 'status', t.status, 'assigned_user_id', t.assigned_user_id,
    'assigned_unit_id', t.assigned_unit_id, 'updated_at', t.updated_at);
end;
$$;

create function qarar_execution.extend_task_due_date(p_task_id uuid, p_due_date date, p_reason text, p_expected_updated_at timestamptz)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  t qarar_execution.action_items%rowtype;
  v_previous date;
begin
  t := qarar_execution.lock_task_for_management(p_task_id, p_reason, p_expected_updated_at);
  if p_due_date is null or p_due_date < current_date then
    raise exception using errcode = '22023', message = 'موعد الإنجاز الجديد لا يكون في الماضي.';
  end if;
  v_previous := t.due_date;
  update qarar_execution.action_items set due_date = p_due_date
  where id = t.id and organization_id = t.organization_id returning * into t;
  perform qarar_execution.record_task_step(t, 'extend', t.progress_percent,
    p_reason || E'\n' || coalesce(v_previous::text, 'بلا موعد') || ' ← ' || p_due_date::text);
  return jsonb_build_object('id', t.id, 'status', t.status, 'due_date', t.due_date, 'updated_at', t.updated_at);
end;
$$;

-- Locks a decision's tasks while it closes, so none changes underneath.
create function qarar_execution.lock_decision_tasks(p_decision_id uuid, p_organization_id uuid)
returns void language sql security definer set search_path = pg_catalog as $$
  select null::void from (
    select 1 from qarar_execution.action_items
    where decision_id = p_decision_id and organization_id = p_organization_id
    for update
  ) locked
$$;

-- 3. The follow-up board, in the decisions module.
create function qarar_decisions.follow_up_access(p_decision qarar_decisions.decisions)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select jsonb_build_object(
    'read', qarar_iam.has_unit_role_code(p_decision.governance_unit_id, array['council_chair', 'council_rapporteur'])
      or qarar_iam.has_permission('execution.tasks.read', null)
      or qarar_iam.has_permission('execution.tasks.manage', null),
    'manage', qarar_iam.has_unit_role_code(p_decision.governance_unit_id, array['council_chair'])
      or qarar_iam.has_permission('execution.tasks.manage', null)
  )
$$;

create function qarar_decisions.decision_follow_up_row(p_decision qarar_decisions.decisions)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_access jsonb := qarar_decisions.follow_up_access(p_decision);
  v_counts record;
  v_closable boolean := p_decision.decision_status in ('approved', 'sent_to_execution', 'under_follow_up');
  v_reason text;
begin
  select count(*) as total,
    count(*) filter (where status in ('new', 'in_progress', 'overdue', 'submitted')) as open,
    count(*) filter (where status = 'completed') as completed,
    count(*) filter (where status in ('cancelled', 'closed')) as cancelled,
    count(*) filter (where status in ('new', 'in_progress', 'overdue') and due_date < current_date) as overdue,
    coalesce(round(avg(progress_percent) filter (where status not in ('cancelled', 'closed'))), 0) as progress
  into v_counts
  from qarar_execution.action_items
  where decision_id = p_decision.id and organization_id = p_decision.organization_id;
  v_reason := case
    when not (v_access->>'manage')::boolean then 'يغلق القرار رئيس مجلسه أو من يحمل صلاحية إدارة التكليفات.'
    when p_decision.decision_status = 'closed' then 'أُغلق القرار.'
    when not v_closable then 'يُغلق القرار بعد اعتماده مع المحضر.'
    when v_counts.open > 0 then format('لم تُنجز %s من مهام القرار أو تُلغَ بعد.', v_counts.open)
  end;
  return jsonb_build_object(
    'id', p_decision.id,
    'decision_no', p_decision.decision_no,
    'decision_text', p_decision.decision_text,
    'decision_status', p_decision.decision_status,
    'outcome_kind', p_decision.outcome_kind,
    'meeting_id', p_decision.meeting_id,
    'meeting_title_ar', (select title_ar from qarar_meetings.meetings where id = p_decision.meeting_id and organization_id = p_decision.organization_id),
    'meeting_date', (select scheduled_date from qarar_meetings.meetings where id = p_decision.meeting_id and organization_id = p_decision.organization_id),
    'council_name_ar', (select name_ar from qarar_core.governance_units where id = p_decision.governance_unit_id and organization_id = p_decision.organization_id),
    'total_tasks', v_counts.total,
    'open_tasks', v_counts.open,
    'completed_tasks', v_counts.completed,
    'cancelled_tasks', v_counts.cancelled,
    'overdue_tasks', v_counts.overdue,
    'progress_percent', v_counts.progress,
    'can_manage', (v_access->>'manage')::boolean and p_decision.decision_status <> 'closed',
    'can_close', v_reason is null,
    'close_blocked_reason', v_reason,
    'updated_at', p_decision.updated_at
  );
end;
$$;

create function qarar_decisions.list_decision_follow_up(p_status text)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
begin
  if coalesce(p_status, 'open') not in ('open', 'closed', 'all') then
    raise exception using errcode = '22023', message = 'فلتر الحالة غير معروف.';
  end if;
  return coalesce((
    select jsonb_agg(qarar_decisions.decision_follow_up_row(d) order by d.issued_at desc nulls last, d.created_at desc)
    from qarar_decisions.decisions d
    where d.organization_id = qarar_iam.current_organization_id()
      and d.meeting_id is not null
      and d.decision_status in ('ready_for_approval', 'approved', 'sent_to_execution', 'under_follow_up', 'closed')
      and (coalesce(p_status, 'open') = 'all'
        or (p_status = 'closed' and d.decision_status = 'closed')
        or (coalesce(p_status, 'open') = 'open' and d.decision_status <> 'closed'))
      and (qarar_decisions.follow_up_access(d)->>'read')::boolean
  ), '[]'::jsonb);
end;
$$;

create function qarar_decisions.list_decision_tasks(p_decision_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  d qarar_decisions.decisions%rowtype;
  v_access jsonb;
begin
  select * into d from qarar_decisions.decisions
  where id = p_decision_id and organization_id = qarar_iam.current_organization_id();
  if d.id is null then
    raise exception using errcode = 'P0002', message = 'القرار غير موجود.';
  end if;
  v_access := qarar_decisions.follow_up_access(d);
  if not (v_access->>'read')::boolean then
    raise exception using errcode = '42501', message = 'متابعة القرار لرئيس مجلسه ومقرره ومن يحمل صلاحية عرض التكليفات.';
  end if;
  return qarar_decisions.decision_follow_up_row(d) || jsonb_build_object(
    'tasks', coalesce((
      select jsonb_agg(qarar_execution.task_summary(t) || jsonb_build_object(
          'can_manage', (v_access->>'manage')::boolean and t.status in ('new', 'in_progress', 'overdue', 'submitted'))
        order by t.due_date nulls last, t.created_at)
      from qarar_execution.action_items t
      where t.decision_id = d.id and t.organization_id = d.organization_id
    ), '[]'::jsonb),
    'units', case when (v_access->>'manage')::boolean then coalesce((
      select jsonb_agg(jsonb_build_object('id', g.id, 'name_ar', g.name_ar) order by g.name_ar)
      from qarar_core.governance_units g where g.organization_id = d.organization_id and g.status = 'active'
    ), '[]'::jsonb) end
  );
end;
$$;

create function qarar_decisions.close_decision(p_decision_id uuid, p_note text, p_expected_updated_at timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  d qarar_decisions.decisions%rowtype;
  v_row jsonb;
begin
  if p_note is not null and char_length(p_note) > 2000 then
    raise exception using errcode = '22023', message = 'الملاحظة لا تتجاوز 2000 حرف.';
  end if;
  select * into d from qarar_decisions.decisions
  where id = p_decision_id and organization_id = qarar_iam.current_organization_id()
  for update;
  if d.id is null then
    raise exception using errcode = 'P0002', message = 'القرار غير موجود.';
  end if;
  if p_expected_updated_at is null or p_expected_updated_at <> d.updated_at then
    raise exception using errcode = '40001', message = 'تغيّر القرار من شاشة أخرى، فحُدّثت الشاشة. أعد المحاولة.';
  end if;
  -- Lock the tasks so none opens again while the decision closes.
  perform qarar_execution.lock_decision_tasks(d.id, d.organization_id);
  v_row := qarar_decisions.decision_follow_up_row(d);
  if not (qarar_decisions.follow_up_access(d)->>'manage')::boolean then
    raise exception using errcode = '42501', message = v_row->>'close_blocked_reason';
  end if;
  if not (v_row->>'can_close')::boolean then
    raise exception using errcode = '23514', message = v_row->>'close_blocked_reason';
  end if;
  update qarar_decisions.decisions set decision_status = 'closed'
  where id = d.id and organization_id = d.organization_id returning * into d;
  update qarar_decisions.decision_status_history
  set reason = nullif(btrim(coalesce(p_note, '')), '')
  where decision_id = d.id and organization_id = d.organization_id and to_status = 'closed'
    and changed_at = (select max(changed_at) from qarar_decisions.decision_status_history
                      where decision_id = d.id and organization_id = d.organization_id and to_status = 'closed');
  perform qarar_audit.append_audit_log(d.organization_id, 'decisions.close', 'decisions', d.id, jsonb_build_object('note', p_note));
  return jsonb_build_object('id', d.id, 'decision_status', d.decision_status, 'updated_at', d.updated_at);
end;
$$;

-- Ownership, privileges, API and registries.
do $own$
declare v_fn text;
begin
  foreach v_fn in array array[
    'qarar_execution.can_manage_task(qarar_execution.action_items)',
    'qarar_execution.lock_task_for_management(uuid,text,timestamptz)',
    'qarar_execution.cancel_task(uuid,text,timestamptz)',
    'qarar_execution.reassign_task(uuid,uuid,uuid,text,timestamptz)',
    'qarar_execution.extend_task_due_date(uuid,date,text,timestamptz)',
    'qarar_execution.lock_decision_tasks(uuid,uuid)'
  ] loop
    execute format('alter function %s owner to qarar_execution_executor', v_fn);
    execute format('revoke all on function %s from public, anon, authenticated, service_role', v_fn);
  end loop;
  foreach v_fn in array array[
    'qarar_decisions.follow_up_access(qarar_decisions.decisions)',
    'qarar_decisions.decision_follow_up_row(qarar_decisions.decisions)',
    'qarar_decisions.list_decision_follow_up(text)',
    'qarar_decisions.list_decision_tasks(uuid)',
    'qarar_decisions.close_decision(uuid,text,timestamptz)'
  ] loop
    execute format('alter function %s owner to qarar_decisions_executor', v_fn);
    execute format('revoke all on function %s from public, anon, authenticated, service_role', v_fn);
  end loop;
end
$own$;
grant execute on function qarar_iam.has_unit_role_code(uuid, text[]) to qarar_execution_executor;
grant usage on schema qarar_execution, qarar_core to qarar_decisions_executor;
grant select on qarar_execution.action_items to qarar_decisions_executor;
grant execute on function qarar_execution.lock_decision_tasks(uuid, uuid) to qarar_decisions_executor;
grant select on qarar_core.governance_units to qarar_decisions_executor;
grant execute on function qarar_execution.task_summary(qarar_execution.action_items) to qarar_decisions_executor;
grant execute on function
  qarar_execution.cancel_task(uuid,text,timestamptz), qarar_execution.reassign_task(uuid,uuid,uuid,text,timestamptz),
  qarar_execution.extend_task_due_date(uuid,date,text,timestamptz)
  to qarar_api_executor;
grant execute on function
  qarar_decisions.list_decision_follow_up(text), qarar_decisions.list_decision_tasks(uuid), qarar_decisions.close_decision(uuid,text,timestamptz)
  to qarar_api_executor;

create function api_v2.list_decision_follow_up_v2(p_status text default 'open') returns jsonb language sql stable security definer set search_path = pg_catalog
as $$ select qarar_decisions.list_decision_follow_up($1) $$;
create function api_v2.list_decision_tasks_v2(p_decision_id uuid) returns jsonb language sql stable security definer set search_path = pg_catalog
as $$ select qarar_decisions.list_decision_tasks($1) $$;
create function api_v2.close_decision_v2(p_decision_id uuid, p_note text, p_expected_updated_at timestamptz) returns jsonb language sql security definer set search_path = pg_catalog
as $$ select qarar_decisions.close_decision($1, $2, $3) $$;
create function api_v2.cancel_task_v2(p_task_id uuid, p_reason text, p_expected_updated_at timestamptz) returns jsonb language sql security definer set search_path = pg_catalog
as $$ select qarar_execution.cancel_task($1, $2, $3) $$;
create function api_v2.reassign_task_v2(p_task_id uuid, p_assigned_user_id uuid, p_assigned_unit_id uuid, p_reason text, p_expected_updated_at timestamptz) returns jsonb language sql security definer set search_path = pg_catalog
as $$ select qarar_execution.reassign_task($1, $2, $3, $4, $5) $$;
create function api_v2.extend_task_due_date_v2(p_task_id uuid, p_due_date date, p_reason text, p_expected_updated_at timestamptz) returns jsonb language sql security definer set search_path = pg_catalog
as $$ select qarar_execution.extend_task_due_date($1, $2, $3, $4) $$;

do $api$
declare v_fn text;
begin
  foreach v_fn in array array[
    'api_v2.list_decision_follow_up_v2(text)', 'api_v2.list_decision_tasks_v2(uuid)', 'api_v2.close_decision_v2(uuid,text,timestamptz)',
    'api_v2.cancel_task_v2(uuid,text,timestamptz)', 'api_v2.reassign_task_v2(uuid,uuid,uuid,text,timestamptz)',
    'api_v2.extend_task_due_date_v2(uuid,date,text,timestamptz)'
  ] loop
    execute format('alter function %s owner to qarar_api_executor', v_fn);
    execute format('revoke all on function %s from public, anon, service_role', v_fn);
    execute format('grant execute on function %s to authenticated', v_fn);
  end loop;
end
$api$;

insert into qarar_architecture.function_registry(function_oid, function_name, identity_arguments, module_code, owning_schema, is_rls_predicate)
select p.oid, p.proname, pg_get_function_identity_arguments(p.oid), case n.nspname when 'qarar_decisions' then 'decisions' else 'execution' end, n.nspname, false
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where (n.nspname = 'qarar_execution' and p.proname in ('lock_decision_tasks', 'can_manage_task', 'lock_task_for_management', 'cancel_task', 'reassign_task', 'extend_task_due_date'))
   or (n.nspname = 'qarar_decisions' and p.proname in ('follow_up_access', 'decision_follow_up_row', 'list_decision_follow_up', 'list_decision_tasks', 'close_decision'))
on conflict (function_name, identity_arguments) do update
set function_oid = excluded.function_oid, module_code = excluded.module_code, owning_schema = excluded.owning_schema;

update qarar_architecture.function_registry r set function_oid = p.oid
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where r.function_name = p.proname and r.owning_schema = n.nspname
  and r.identity_arguments = pg_get_function_identity_arguments(p.oid)
  and n.nspname = 'qarar_iam' and p.proname = 'system_permission_catalog';

insert into qarar_architecture.api_contract_registry(api_version, contract_name, implementation_schema, implementation_name, identity_arguments, module_code, audience)
select 'v2', p.proname,
  case when p.proname in ('list_decision_follow_up_v2', 'list_decision_tasks_v2', 'close_decision_v2') then 'qarar_decisions' else 'qarar_execution' end,
  regexp_replace(p.proname::text, '_v2$', ''), pg_get_function_identity_arguments(p.oid),
  case when p.proname in ('list_decision_follow_up_v2', 'list_decision_tasks_v2', 'close_decision_v2') then 'decisions' else 'execution' end,
  'authenticated'
from pg_proc p
where p.pronamespace = 'api_v2'::regnamespace
  and p.proname in ('list_decision_follow_up_v2', 'list_decision_tasks_v2', 'close_decision_v2', 'cancel_task_v2', 'reassign_task_v2', 'extend_task_due_date_v2');

insert into qarar_architecture.module_table_read_allowlist(source_module, target_schema, table_name, rationale) values
  ('decisions', 'qarar_execution', 'action_items', 'Count a decision''s tasks and refuse to close it while one is open'),
  ('decisions', 'qarar_core', 'governance_units', 'Name the council of a followed decision and the units a task may go to')
on conflict do nothing;
insert into qarar_architecture.module_function_execute_allowlist(source_module, target_schema, function_name, identity_arguments, rationale) values
  ('execution', 'qarar_iam', 'has_unit_role_code', 'target_unit_id uuid, role_codes text[]', 'The chair of the decision''s council manages its tasks'),
  ('decisions', 'qarar_execution', 'task_summary', 'p_task qarar_execution.action_items', 'Show a decision''s tasks on the follow-up board'),
  ('decisions', 'qarar_execution', 'lock_decision_tasks', 'p_decision_id uuid, p_organization_id uuid', 'Hold a decision''s tasks still while the decision closes')
on conflict do nothing;

notify pgrst, 'reload schema';
commit;
