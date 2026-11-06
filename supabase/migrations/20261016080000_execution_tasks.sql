-- Executing and verifying assignments (owner decisions 2026-10-16, phase 3a).
-- The assignee, or the holder of the unit's execution permission, works the
-- task and submits it; the follow-up person, the chair who issued it, or a
-- holder of the verification permission verifies it. Nobody verifies their
-- own submission.
-- Impact map: docs/engineering/impact/EXECUTION_TASKS_AR.md
begin;

-- 1. Three formal permissions, granted to nobody until an administrator does.
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
    ('execution.tasks.read', 'execution', 'tasks.read', 'organization', 'عرض كل التكليفات', 'Read all assignments'),
    ('execution.tasks.verify', 'execution', 'tasks.verify', 'organization', 'التحقق من إنجاز التكليفات', 'Verify assignment completion'),
    ('execution.unit_tasks.execute', 'execution', 'unit_tasks.execute', 'governance_unit', 'تنفيذ تكليفات الجهة', 'Execute the unit''s assignments')
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

-- 2. "Submitted, awaiting verification" joins the task states.
alter table qarar_execution.action_items drop constraint action_items_status_check;
alter table qarar_execution.action_items add constraint action_items_status_check
  check (status in ('new', 'in_progress', 'submitted', 'completed', 'overdue', 'cancelled', 'closed'));

alter table qarar_execution.action_evidence
  add column mime_type text,
  add column file_size_bytes bigint check (file_size_bytes is null or file_size_bytes > 0);

-- 3. Every step of a task.
create table qarar_execution.action_item_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  action_item_id uuid not null,
  event_type text not null check (event_type in ('start', 'progress', 'evidence_added', 'evidence_removed', 'submit', 'verify', 'return')),
  progress_percent integer check (progress_percent between 0 and 100),
  note text check (char_length(note) <= 2000),
  actor_user_id uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  foreign key (action_item_id, organization_id) references qarar_execution.action_items(id, organization_id) on delete restrict
);
create index action_item_events_task_idx on qarar_execution.action_item_events(action_item_id, created_at);
alter table qarar_execution.action_item_events enable row level security;
alter table qarar_execution.action_item_events force row level security;
revoke all on qarar_execution.action_item_events from public, anon, authenticated, service_role;
grant select, insert on qarar_execution.action_item_events to qarar_execution_executor;
insert into qarar_architecture.entity_registry(entity_name, module_code, legacy_public_view)
values ('action_item_events', 'execution', false)
on conflict do nothing;

-- 4. Where an assignment came from: the chair who issued it and its meeting.
create function qarar_meetings.assignment_origin(p_assignment_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select jsonb_build_object('issued_by_user_id', a.issued_by_user_id, 'meeting_id', m.id, 'meeting_title_ar', m.title_ar, 'meeting_date', m.scheduled_date)
  from qarar_meetings.meeting_assignments a
  join qarar_meetings.meetings m on m.id = a.meeting_id and m.organization_id = a.organization_id
  where a.id = p_assignment_id and a.organization_id = qarar_iam.current_organization_id()
$$;

-- 5. Who the viewer is to a task. The single place the rules live.
create function qarar_execution.task_roles(p_task qarar_execution.action_items)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_me uuid := auth.uid();
  v_issuer uuid;
  v_submitter uuid;
  v_executor boolean;
  v_verifier boolean;
begin
  if p_task.meeting_assignment_id is not null then
    v_issuer := (qarar_meetings.assignment_origin(p_task.meeting_assignment_id)->>'issued_by_user_id')::uuid;
  end if;
  select actor_user_id into v_submitter from qarar_execution.action_item_events
  where action_item_id = p_task.id and organization_id = p_task.organization_id and event_type = 'submit'
  order by created_at desc limit 1;
  v_executor := p_task.assigned_user_id = v_me
    or (p_task.assigned_unit_id is not null and not qarar_iam.is_system_admin()
        and qarar_iam.has_permission('execution.unit_tasks.execute', p_task.assigned_unit_id));
  v_verifier := p_task.follow_up_user_id = v_me or v_issuer = v_me
    or qarar_iam.has_permission('execution.tasks.verify', null);
  return jsonb_build_object(
    'executor', coalesce(v_executor, false),
    'verifier', coalesce(v_verifier, false),
    'own_submission', v_submitter is not null and v_submitter = v_me,
    'following', coalesce(p_task.follow_up_user_id = v_me or v_issuer = v_me, false),
    'reader', coalesce(v_executor or v_verifier, false) or qarar_iam.has_permission('execution.tasks.read', null)
  );
end;
$$;

create function qarar_execution.task_summary(p_task qarar_execution.action_items)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select jsonb_build_object(
    'id', p_task.id,
    'action_no', p_task.action_no,
    'title_ar', p_task.title_ar,
    'description', p_task.description,
    'status', case when p_task.status = 'overdue' then 'in_progress' else p_task.status end,
    'progress_percent', p_task.progress_percent,
    'due_date', p_task.due_date,
    'is_overdue', p_task.due_date < current_date and p_task.status not in ('submitted', 'completed', 'cancelled', 'closed'),
    'requires_evidence', p_task.requires_evidence,
    'evidence_count', (select count(*) from qarar_execution.action_evidence e where e.action_item_id = p_task.id and e.organization_id = p_task.organization_id),
    'assigned_user_name_ar', (select full_name_ar from qarar_iam.users where id = p_task.assigned_user_id and organization_id = p_task.organization_id),
    'assigned_unit_name_ar', (select name_ar from qarar_core.governance_units where id = p_task.assigned_unit_id and organization_id = p_task.organization_id),
    'follow_up_user_name_ar', (select full_name_ar from qarar_iam.users where id = p_task.follow_up_user_id and organization_id = p_task.organization_id),
    'decision_id', p_task.decision_id,
    'decision_no', (select decision_no from qarar_decisions.decisions where id = p_task.decision_id and organization_id = p_task.organization_id),
    'meeting_title_ar', case when p_task.meeting_assignment_id is not null then qarar_meetings.assignment_origin(p_task.meeting_assignment_id)->>'meeting_title_ar' end,
    'updated_at', p_task.updated_at
  )
$$;

create function qarar_execution.list_my_tasks()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_org uuid := qarar_iam.current_organization_id();
begin
  if v_org is null or auth.uid() is null then
    raise exception using errcode = '42501', message = 'سجّل الدخول لعرض مهامك.';
  end if;
  return (
    with mine as (
      select t, qarar_execution.task_roles(t) as roles
      from qarar_execution.action_items t
      where t.organization_id = v_org
    )
    select jsonb_build_object(
      'to_execute', coalesce(jsonb_agg(qarar_execution.task_summary(t) order by (t).due_date nulls last, (t).created_at)
        filter (where (roles->>'executor')::boolean and (t).status not in ('completed', 'cancelled', 'closed')), '[]'::jsonb),
      'to_verify', coalesce(jsonb_agg(qarar_execution.task_summary(t) order by (t).updated_at)
        filter (where (roles->>'verifier')::boolean and not (roles->>'own_submission')::boolean and (t).status = 'submitted'), '[]'::jsonb),
      'following', coalesce(jsonb_agg(qarar_execution.task_summary(t) order by (t).due_date nulls last, (t).created_at)
        filter (where (roles->>'following')::boolean and (t).status not in ('cancelled')), '[]'::jsonb)
    )
    from mine
  );
end;
$$;

create function qarar_execution.get_task(p_task_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  t qarar_execution.action_items%rowtype;
  r jsonb;
  v_open boolean;
  v_evidence integer;
begin
  select * into t from qarar_execution.action_items
  where id = p_task_id and organization_id = qarar_iam.current_organization_id();
  if t.id is null then
    raise exception using errcode = 'P0002', message = 'المهمة غير موجودة.';
  end if;
  r := qarar_execution.task_roles(t);
  if not (r->>'reader')::boolean and not (r->>'following')::boolean then
    raise exception using errcode = '42501', message = 'هذه المهمة متاحة لمنفّذها ومتابعها ومن يتحقق منها.';
  end if;
  v_open := t.status in ('new', 'in_progress', 'overdue');
  select count(*) into v_evidence from qarar_execution.action_evidence where action_item_id = t.id and organization_id = t.organization_id;
  return qarar_execution.task_summary(t) || jsonb_build_object(
    'decision_text', (select decision_text from qarar_decisions.decisions where id = t.decision_id and organization_id = t.organization_id),
    'started_at', t.started_at,
    'completed_at', t.completed_at,
    'events', coalesce((
      select jsonb_agg(jsonb_build_object('id', e.id, 'event_type', e.event_type, 'progress_percent', e.progress_percent,
        'note', e.note, 'actor_name_ar', u.full_name_ar, 'created_at', e.created_at) order by e.created_at)
      from qarar_execution.action_item_events e
      left join qarar_iam.users u on u.id = e.actor_user_id and u.organization_id = e.organization_id
      where e.action_item_id = t.id and e.organization_id = t.organization_id
    ), '[]'::jsonb),
    'evidence', coalesce((
      select jsonb_agg(jsonb_build_object('id', e.id, 'file_name', e.file_name, 'storage_path', e.storage_path, 'mime_type', e.mime_type,
        'file_size_bytes', e.file_size_bytes, 'description', e.description, 'uploaded_at', e.uploaded_at,
        'uploaded_by_name_ar', u.full_name_ar) order by e.uploaded_at)
      from qarar_execution.action_evidence e
      left join qarar_iam.users u on u.id = e.uploaded_by_user_id and u.organization_id = e.organization_id
      where e.action_item_id = t.id and e.organization_id = t.organization_id
    ), '[]'::jsonb),
    'viewer', jsonb_build_object(
      'is_executor', (r->>'executor')::boolean,
      'is_verifier', (r->>'verifier')::boolean,
      'can_start', (r->>'executor')::boolean and t.status = 'new',
      'can_update', (r->>'executor')::boolean and v_open,
      'can_submit', (r->>'executor')::boolean and v_open and (not t.requires_evidence or v_evidence > 0),
      'submit_blocked_reason', case when (r->>'executor')::boolean and v_open and t.requires_evidence and v_evidence = 0
        then 'تتطلب هذه المهمة دليل إنجاز؛ أرفق ملفاً قبل التسليم.' end,
      'can_verify', (r->>'verifier')::boolean and not (r->>'own_submission')::boolean and t.status = 'submitted',
      'verify_blocked_reason', case when (r->>'verifier')::boolean and (r->>'own_submission')::boolean and t.status = 'submitted'
        then 'سلّمت هذه المهمة بنفسك، فيتحقق منها متحقق آخر.' end
    )
  );
end;
$$;

-- Locks a task for a step and checks the screen's token.
create function qarar_execution.lock_task(p_task_id uuid, p_expected_updated_at timestamptz)
returns qarar_execution.action_items
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  t qarar_execution.action_items%rowtype;
begin
  select * into t from qarar_execution.action_items
  where id = p_task_id and organization_id = qarar_iam.current_organization_id()
  for update;
  if t.id is null then
    raise exception using errcode = 'P0002', message = 'المهمة غير موجودة.';
  end if;
  if p_expected_updated_at is null or p_expected_updated_at <> t.updated_at then
    raise exception using errcode = '40001', message = 'تغيّرت المهمة من شاشة أخرى، فحُدّثت الشاشة. أعد المحاولة.';
  end if;
  if t.status in ('completed', 'cancelled', 'closed') then
    raise exception using errcode = '23514', message = 'أُغلقت هذه المهمة، فلا تقبل إجراءً جديداً.';
  end if;
  return t;
end;
$$;

create function qarar_execution.record_task_step(p_task qarar_execution.action_items, p_event text, p_percent integer, p_note text)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  insert into qarar_execution.action_item_events(organization_id, action_item_id, event_type, progress_percent, note, actor_user_id)
  values (p_task.organization_id, p_task.id, p_event, p_percent, nullif(btrim(coalesce(p_note, '')), ''), auth.uid());
  perform qarar_audit.append_audit_log(p_task.organization_id, 'execution.task.' || p_event, 'action_items', p_task.id,
    jsonb_build_object('action_no', p_task.action_no, 'progress_percent', p_percent));
end;
$$;

create function qarar_execution.require_executor(p_task qarar_execution.action_items)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
begin
  if not (qarar_execution.task_roles(p_task)->>'executor')::boolean then
    raise exception using errcode = '42501', message = 'هذا الإجراء لمنفّذ المهمة.';
  end if;
  if p_task.status not in ('new', 'in_progress', 'overdue') then
    raise exception using errcode = '23514', message = 'المهمة بانتظار التحقق، فلا تتغير حتى يُتحقق منها أو تُعاد.';
  end if;
end;
$$;

create function qarar_execution.start_task(p_task_id uuid, p_expected_updated_at timestamptz)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare t qarar_execution.action_items%rowtype;
begin
  t := qarar_execution.lock_task(p_task_id, p_expected_updated_at);
  perform qarar_execution.require_executor(t);
  if t.status <> 'new' then
    raise exception using errcode = '23514', message = 'بدأ تنفيذ هذه المهمة من قبل.';
  end if;
  update qarar_execution.action_items set status = 'in_progress', started_at = coalesce(started_at, clock_timestamp())
  where id = t.id and organization_id = t.organization_id returning * into t;
  perform qarar_execution.record_task_step(t, 'start', t.progress_percent, null);
  return jsonb_build_object('id', t.id, 'status', t.status, 'updated_at', t.updated_at);
end;
$$;

create function qarar_execution.update_task_progress(p_task_id uuid, p_percent integer, p_note text, p_expected_updated_at timestamptz)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare t qarar_execution.action_items%rowtype;
begin
  if p_percent is null or p_percent < 0 or p_percent > 99 then
    raise exception using errcode = '22023', message = 'نسبة الإنجاز من 0 إلى 99؛ تكتمل المهمة بالتحقق من إنجازها.';
  end if;
  if p_note is not null and char_length(p_note) > 2000 then
    raise exception using errcode = '22023', message = 'الملاحظة لا تتجاوز 2000 حرف.';
  end if;
  t := qarar_execution.lock_task(p_task_id, p_expected_updated_at);
  perform qarar_execution.require_executor(t);
  update qarar_execution.action_items
  set progress_percent = p_percent, status = 'in_progress', started_at = coalesce(started_at, clock_timestamp())
  where id = t.id and organization_id = t.organization_id returning * into t;
  perform qarar_execution.record_task_step(t, 'progress', p_percent, p_note);
  return jsonb_build_object('id', t.id, 'status', t.status, 'progress_percent', t.progress_percent, 'updated_at', t.updated_at);
end;
$$;

create function qarar_execution.submit_task_completion(p_task_id uuid, p_note text, p_expected_updated_at timestamptz)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare t qarar_execution.action_items%rowtype;
begin
  if p_note is not null and char_length(p_note) > 2000 then
    raise exception using errcode = '22023', message = 'الملاحظة لا تتجاوز 2000 حرف.';
  end if;
  t := qarar_execution.lock_task(p_task_id, p_expected_updated_at);
  perform qarar_execution.require_executor(t);
  if t.requires_evidence and not exists (
    select 1 from qarar_execution.action_evidence where action_item_id = t.id and organization_id = t.organization_id
  ) then
    raise exception using errcode = '23514', message = 'تتطلب هذه المهمة دليل إنجاز؛ أرفق ملفاً قبل التسليم.';
  end if;
  update qarar_execution.action_items set status = 'submitted', started_at = coalesce(started_at, clock_timestamp())
  where id = t.id and organization_id = t.organization_id returning * into t;
  perform qarar_execution.record_task_step(t, 'submit', t.progress_percent, p_note);
  return jsonb_build_object('id', t.id, 'status', t.status, 'updated_at', t.updated_at);
end;
$$;

create function qarar_execution.require_verifier(p_task qarar_execution.action_items)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare r jsonb := qarar_execution.task_roles(p_task);
begin
  if not (r->>'verifier')::boolean then
    raise exception using errcode = '42501', message = 'يتحقق من الإنجاز متابع المهمة، أو رئيس المجلس الذي أصدرها، أو من يحمل صلاحية التحقق.';
  end if;
  if (r->>'own_submission')::boolean then
    raise exception using errcode = '42501', message = 'سلّمت هذه المهمة بنفسك، فيتحقق منها متحقق آخر.';
  end if;
  if p_task.status <> 'submitted' then
    raise exception using errcode = '23514', message = 'لم تُسلَّم المهمة للتحقق بعد.';
  end if;
end;
$$;

create function qarar_execution.verify_task_completion(p_task_id uuid, p_note text, p_expected_updated_at timestamptz)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare t qarar_execution.action_items%rowtype;
begin
  if p_note is not null and char_length(p_note) > 2000 then
    raise exception using errcode = '22023', message = 'الملاحظة لا تتجاوز 2000 حرف.';
  end if;
  t := qarar_execution.lock_task(p_task_id, p_expected_updated_at);
  perform qarar_execution.require_verifier(t);
  update qarar_execution.action_items set status = 'completed', progress_percent = 100, completed_at = clock_timestamp()
  where id = t.id and organization_id = t.organization_id returning * into t;
  perform qarar_execution.record_task_step(t, 'verify', 100, p_note);
  return jsonb_build_object('id', t.id, 'status', t.status, 'updated_at', t.updated_at);
end;
$$;

create function qarar_execution.return_task(p_task_id uuid, p_reason text, p_expected_updated_at timestamptz)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare t qarar_execution.action_items%rowtype;
begin
  if p_reason is null or char_length(btrim(p_reason)) not between 5 and 2000 then
    raise exception using errcode = '22023', message = 'اكتب سبب الإعادة من 5 إلى 2000 حرف.';
  end if;
  t := qarar_execution.lock_task(p_task_id, p_expected_updated_at);
  perform qarar_execution.require_verifier(t);
  update qarar_execution.action_items set status = 'in_progress'
  where id = t.id and organization_id = t.organization_id returning * into t;
  perform qarar_execution.record_task_step(t, 'return', t.progress_percent, p_reason);
  return jsonb_build_object('id', t.id, 'status', t.status, 'updated_at', t.updated_at);
end;
$$;

create function qarar_execution.add_task_evidence(
  p_task_id uuid, p_file_name text, p_storage_path text, p_mime_type text, p_file_size_bytes bigint, p_description text
)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  t qarar_execution.action_items%rowtype;
  v_object record;
  v_id uuid;
begin
  select * into t from qarar_execution.action_items
  where id = p_task_id and organization_id = qarar_iam.current_organization_id()
  for update;
  if t.id is null then
    raise exception using errcode = 'P0002', message = 'المهمة غير موجودة.';
  end if;
  perform qarar_execution.require_executor(t);
  if p_storage_path is null or p_storage_path not like 'tasks/' || t.id::text || '/%' or p_storage_path like '%..%' then
    raise exception using errcode = '22023', message = 'مسار الدليل لا يتبع هذه المهمة.';
  end if;
  if p_file_name is null or char_length(btrim(p_file_name)) not between 1 and 255
     or (p_description is not null and char_length(p_description) > 500) then
    raise exception using errcode = '22023', message = 'اسم الملف أو وصفه غير صالح.';
  end if;
  select name, metadata into v_object from storage.objects where bucket_id = 'qarar-evidence' and name = p_storage_path;
  if v_object.name is null
     or coalesce((v_object.metadata->>'size')::bigint, -1) <> p_file_size_bytes
     or coalesce(v_object.metadata->>'mimetype', '') <> p_mime_type then
    raise exception using errcode = '23514', message = 'لم يُعثر على الملف في المخزن، أو لا يطابق بياناته؛ أعد رفعه.';
  end if;
  insert into qarar_execution.action_evidence(organization_id, action_item_id, evidence_type, description, file_name, storage_path, uploaded_by_user_id, mime_type, file_size_bytes)
  values (t.organization_id, t.id, 'document', nullif(btrim(coalesce(p_description, '')), ''), btrim(p_file_name), p_storage_path, auth.uid(), p_mime_type, p_file_size_bytes)
  returning id into v_id;
  update qarar_execution.action_items set updated_at = clock_timestamp() where id = t.id and organization_id = t.organization_id returning * into t;
  perform qarar_execution.record_task_step(t, 'evidence_added', null, btrim(p_file_name));
  return jsonb_build_object('id', v_id, 'action_item_id', t.id, 'updated_at', t.updated_at);
end;
$$;

create function qarar_execution.remove_task_evidence(p_evidence_id uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  e qarar_execution.action_evidence%rowtype;
  t qarar_execution.action_items%rowtype;
begin
  select * into e from qarar_execution.action_evidence
  where id = p_evidence_id and organization_id = qarar_iam.current_organization_id();
  if e.id is null then
    raise exception using errcode = 'P0002', message = 'الدليل غير موجود.';
  end if;
  select * into t from qarar_execution.action_items
  where id = e.action_item_id and organization_id = e.organization_id
  for update;
  perform qarar_execution.require_executor(t);
  delete from qarar_execution.action_evidence where id = e.id and organization_id = e.organization_id;
  update qarar_execution.action_items set updated_at = clock_timestamp() where id = t.id and organization_id = t.organization_id returning * into t;
  perform qarar_execution.record_task_step(t, 'evidence_removed', null, e.file_name);
  return jsonb_build_object('id', e.id, 'storage_path', e.storage_path, 'updated_at', t.updated_at);
end;
$$;

-- Ownership, privileges, API and registries.
do $own$
declare v_fn text;
begin
  foreach v_fn in array array[
    'qarar_execution.task_roles(qarar_execution.action_items)',
    'qarar_execution.task_summary(qarar_execution.action_items)',
    'qarar_execution.list_my_tasks()',
    'qarar_execution.get_task(uuid)',
    'qarar_execution.lock_task(uuid,timestamptz)',
    'qarar_execution.record_task_step(qarar_execution.action_items,text,integer,text)',
    'qarar_execution.require_executor(qarar_execution.action_items)',
    'qarar_execution.require_verifier(qarar_execution.action_items)',
    'qarar_execution.start_task(uuid,timestamptz)',
    'qarar_execution.update_task_progress(uuid,integer,text,timestamptz)',
    'qarar_execution.submit_task_completion(uuid,text,timestamptz)',
    'qarar_execution.verify_task_completion(uuid,text,timestamptz)',
    'qarar_execution.return_task(uuid,text,timestamptz)',
    'qarar_execution.add_task_evidence(uuid,text,text,text,bigint,text)',
    'qarar_execution.remove_task_evidence(uuid)'
  ] loop
    execute format('alter function %s owner to qarar_execution_executor', v_fn);
    execute format('revoke all on function %s from public, anon, authenticated, service_role', v_fn);
  end loop;
end
$own$;
alter function qarar_meetings.assignment_origin(uuid) owner to qarar_meetings_executor;
revoke all on function qarar_meetings.assignment_origin(uuid) from public, anon, authenticated, service_role;
grant execute on function qarar_meetings.assignment_origin(uuid) to qarar_execution_executor;
grant usage on schema storage to qarar_execution_executor;
grant select on storage.objects to qarar_execution_executor;
grant select on qarar_iam.users to qarar_execution_executor;
grant select on qarar_core.governance_units to qarar_execution_executor;
grant usage on schema qarar_core to qarar_execution_executor;
grant execute on function qarar_iam.has_permission(text, uuid), qarar_iam.is_system_admin() to qarar_execution_executor;
grant execute on function
  qarar_execution.list_my_tasks(), qarar_execution.get_task(uuid),
  qarar_execution.start_task(uuid,timestamptz), qarar_execution.update_task_progress(uuid,integer,text,timestamptz),
  qarar_execution.submit_task_completion(uuid,text,timestamptz), qarar_execution.verify_task_completion(uuid,text,timestamptz),
  qarar_execution.return_task(uuid,text,timestamptz), qarar_execution.add_task_evidence(uuid,text,text,text,bigint,text),
  qarar_execution.remove_task_evidence(uuid)
  to qarar_api_executor;

create function api_v2.list_my_tasks_v2() returns jsonb language sql stable security definer set search_path = pg_catalog
as $$ select qarar_execution.list_my_tasks() $$;
create function api_v2.get_task_v2(p_task_id uuid) returns jsonb language sql stable security definer set search_path = pg_catalog
as $$ select qarar_execution.get_task($1) $$;
create function api_v2.start_task_v2(p_task_id uuid, p_expected_updated_at timestamptz) returns jsonb language sql security definer set search_path = pg_catalog
as $$ select qarar_execution.start_task($1, $2) $$;
create function api_v2.update_task_progress_v2(p_task_id uuid, p_percent integer, p_note text, p_expected_updated_at timestamptz) returns jsonb language sql security definer set search_path = pg_catalog
as $$ select qarar_execution.update_task_progress($1, $2, $3, $4) $$;
create function api_v2.submit_task_completion_v2(p_task_id uuid, p_note text, p_expected_updated_at timestamptz) returns jsonb language sql security definer set search_path = pg_catalog
as $$ select qarar_execution.submit_task_completion($1, $2, $3) $$;
create function api_v2.verify_task_completion_v2(p_task_id uuid, p_note text, p_expected_updated_at timestamptz) returns jsonb language sql security definer set search_path = pg_catalog
as $$ select qarar_execution.verify_task_completion($1, $2, $3) $$;
create function api_v2.return_task_v2(p_task_id uuid, p_reason text, p_expected_updated_at timestamptz) returns jsonb language sql security definer set search_path = pg_catalog
as $$ select qarar_execution.return_task($1, $2, $3) $$;
create function api_v2.add_task_evidence_v2(p_task_id uuid, p_file_name text, p_storage_path text, p_mime_type text, p_file_size_bytes bigint, p_description text) returns jsonb language sql security definer set search_path = pg_catalog
as $$ select qarar_execution.add_task_evidence($1, $2, $3, $4, $5, $6) $$;
create function api_v2.remove_task_evidence_v2(p_evidence_id uuid) returns jsonb language sql security definer set search_path = pg_catalog
as $$ select qarar_execution.remove_task_evidence($1) $$;

do $api$
declare v_fn text;
begin
  foreach v_fn in array array[
    'api_v2.list_my_tasks_v2()', 'api_v2.get_task_v2(uuid)', 'api_v2.start_task_v2(uuid,timestamptz)',
    'api_v2.update_task_progress_v2(uuid,integer,text,timestamptz)', 'api_v2.submit_task_completion_v2(uuid,text,timestamptz)',
    'api_v2.verify_task_completion_v2(uuid,text,timestamptz)', 'api_v2.return_task_v2(uuid,text,timestamptz)',
    'api_v2.add_task_evidence_v2(uuid,text,text,text,bigint,text)', 'api_v2.remove_task_evidence_v2(uuid)'
  ] loop
    execute format('alter function %s owner to qarar_api_executor', v_fn);
    execute format('revoke all on function %s from public, anon, service_role', v_fn);
    execute format('grant execute on function %s to authenticated', v_fn);
  end loop;
end
$api$;

insert into qarar_architecture.function_registry(function_oid, function_name, identity_arguments, module_code, owning_schema, is_rls_predicate)
select p.oid, p.proname, pg_get_function_identity_arguments(p.oid), case n.nspname when 'qarar_meetings' then 'meetings' else 'execution' end, n.nspname, false
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where (n.nspname = 'qarar_execution' and p.proname in ('task_roles', 'task_summary', 'list_my_tasks', 'get_task', 'lock_task', 'record_task_step',
    'require_executor', 'require_verifier', 'start_task', 'update_task_progress', 'submit_task_completion', 'verify_task_completion',
    'return_task', 'add_task_evidence', 'remove_task_evidence'))
   or (n.nspname = 'qarar_meetings' and p.proname = 'assignment_origin')
on conflict (function_name, identity_arguments) do update
set function_oid = excluded.function_oid, module_code = excluded.module_code, owning_schema = excluded.owning_schema;

update qarar_architecture.function_registry r set function_oid = p.oid
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where r.function_name = p.proname and r.owning_schema = n.nspname
  and r.identity_arguments = pg_get_function_identity_arguments(p.oid)
  and n.nspname = 'qarar_iam' and p.proname = 'system_permission_catalog';

insert into qarar_architecture.api_contract_registry(api_version, contract_name, implementation_schema, implementation_name, identity_arguments, module_code, audience)
select 'v2', p.proname, 'qarar_execution', regexp_replace(p.proname::text, '_v2$', ''), pg_get_function_identity_arguments(p.oid), 'execution', 'authenticated'
from pg_proc p
where p.pronamespace = 'api_v2'::regnamespace
  and p.proname in ('list_my_tasks_v2', 'get_task_v2', 'start_task_v2', 'update_task_progress_v2', 'submit_task_completion_v2',
    'verify_task_completion_v2', 'return_task_v2', 'add_task_evidence_v2', 'remove_task_evidence_v2');

insert into qarar_architecture.module_table_read_allowlist(source_module, target_schema, table_name, rationale) values
  ('execution', 'storage', 'objects', 'Accept task evidence only when the uploaded file exists in the private store with the stated size and type'),
  ('execution', 'qarar_iam', 'users', 'Name the assignee, the follow-up person and the actors of a task'),
  ('execution', 'qarar_core', 'governance_units', 'Name the unit a task is assigned to')
on conflict do nothing;
insert into qarar_architecture.module_function_execute_allowlist(source_module, target_schema, function_name, identity_arguments, rationale) values
  ('execution', 'qarar_meetings', 'assignment_origin', 'p_assignment_id uuid', 'The chair who issued an assignment verifies its completion'),
  ('execution', 'qarar_iam', 'has_permission', 'permission_code text, target_unit_id uuid', 'Execute and verify tasks by formal, grantable permissions'),
  ('execution', 'qarar_iam', 'is_system_admin', '', 'A system administrator verifies but does not execute a unit''s tasks')
on conflict do nothing;

notify pgrst, 'reload schema';
commit;
