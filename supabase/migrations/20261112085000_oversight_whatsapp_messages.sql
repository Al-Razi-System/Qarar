-- WhatsApp for oversight: a violation to the council's leaders, an escalation to followers, and a daily
-- digest per follower. The three messages are off until the administrator enables them in the
-- notification settings, so turning on oversight never sends unexpected messages.
-- Impact map: docs/engineering/impact/OVERSIGHT_VIOLATIONS_AND_INBOX_20261112_AR.md (§ الدفعة الثانية)
begin;

alter table qarar_governance.notification_template_settings drop constraint notification_template_settings_template_code_check;
alter table qarar_governance.notification_template_settings add constraint notification_template_settings_template_code_check
  check (template_code = any (array['meeting_invitation','meeting_reminder','meeting_cycle_due_soon','meeting_cycle_overdue','meeting_postponed',
    'meeting_cancelled','meeting_invitation_updated','task_created_assignee','task_created_follower','task_due_soon','task_overdue',
    'task_submitted','task_returned','task_completed','oversight_violation','oversight_escalation','oversight_digest']));

-- The worker only claims listed events; oversight events join the list (still sent only when enabled).
create or replace function qarar_governance.claim_whatsapp_notification_outbox(p_worker_id uuid, p_lock_token uuid, p_limit integer DEFAULT 25, p_lease_seconds integer DEFAULT 60)
 RETURNS TABLE(id uuid, organization_id uuid, aggregate_type text, aggregate_id uuid, event_type text, payload jsonb, deduplication_key text, attempts integer, lock_token uuid, lease_expires_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'auth', 'qarar_governance'
AS $function$
declare v_now timestamptz:=clock_timestamp();
begin
  if auth.role()<>'service_role' then raise exception using errcode='42501',message='service role required';end if;
  if p_worker_id is null or p_lock_token is null then raise exception using errcode='22023',message='worker id and lock token are required';end if;
  if p_limit is null or p_limit not between 1 and 100 then raise exception using errcode='22023',message='claim limit must be between 1 and 100';end if;
  if p_lease_seconds is null or p_lease_seconds not between 30 and 3600 then raise exception using errcode='22023',message='lease duration must be between 30 and 3600 seconds';end if;
  perform qarar_governance.recover_stale_notification_outbox();
  return query
  with candidates as (
    select o.id from qarar_governance.notification_outbox o
    where o.status in('pending','failed') and o.attempts<8 and o.available_at<=v_now
      and o.event_type in(
        'meeting.invitation.requested','meeting.reminder.due','meeting.cycle.due_soon','meeting.cycle.overdue',
        'meeting.postponed','meeting.cancelled','meeting.invitation.updated',
        'execution.task.created','execution.task.due_soon','execution.task.overdue',
        'execution.task.submitted','execution.task.returned','execution.task.completed',
        'oversight.violation.detected','oversight.violation.escalated','oversight.digest')
    order by o.available_at,o.created_at,o.id for update skip locked limit p_limit
  ),claimed as (
    update qarar_governance.notification_outbox o set
      status='processing',attempts=o.attempts+1,locked_at=v_now,locked_by_worker_id=p_worker_id,
      lock_token=p_lock_token,lease_expires_at=v_now+make_interval(secs=>p_lease_seconds),last_attempt_at=v_now
    from candidates where o.id=candidates.id returning o.*
  )
  select c.id,c.organization_id,c.aggregate_type,c.aggregate_id,c.event_type,c.payload,
         c.deduplication_key,c.attempts,c.lock_token,c.lease_expires_at
  from claimed c order by c.available_at,c.created_at,c.id;
end
$function$;

/** One mapping from business event to message template, shared by dispatch and tests. */
create function qarar_governance.notification_template_code(p_event_type text, p_payload jsonb)
returns text language sql immutable set search_path=pg_catalog
as $$
  select case p_event_type
    when 'meeting.invitation.requested' then 'meeting_invitation'
    when 'meeting.reminder.due' then 'meeting_reminder'
    when 'meeting.cycle.due_soon' then 'meeting_cycle_due_soon'
    when 'meeting.cycle.overdue' then 'meeting_cycle_overdue'
    when 'meeting.postponed' then 'meeting_postponed'
    when 'meeting.cancelled' then 'meeting_cancelled'
    when 'meeting.invitation.updated' then 'meeting_invitation_updated'
    when 'execution.task.due_soon' then 'task_due_soon'
    when 'execution.task.overdue' then 'task_overdue'
    when 'execution.task.submitted' then 'task_submitted'
    when 'execution.task.returned' then 'task_returned'
    when 'execution.task.completed' then 'task_completed'
    when 'execution.task.created' then case when p_payload->>'recipient_role'='follower' then 'task_created_follower' else 'task_created_assignee' end
    when 'oversight.violation.detected' then 'oversight_violation'
    when 'oversight.violation.escalated' then 'oversight_escalation'
    when 'oversight.digest' then 'oversight_digest'
  end
$$;

/** Existing messages are on unless turned off; oversight messages are off unless turned on. */
create function qarar_governance.notification_template_enabled(p_org uuid, p_code text)
returns boolean language sql stable security definer set search_path=pg_catalog
as $$
  select coalesce((select t.enabled from qarar_governance.notification_template_settings t where t.organization_id=p_org and t.template_code=p_code),
    p_code is null or p_code not like 'oversight\_%')
$$;

create or replace function qarar_governance.get_notification_dispatch_context(p_event_id uuid, p_lock_token uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare c jsonb; code text; s qarar_governance.notification_settings%rowtype; t qarar_governance.notification_template_settings%rowtype;
begin
  c := qarar_governance.get_notification_dispatch_context_base(p_event_id, p_lock_token);
  code := qarar_governance.notification_template_code(c->>'event_type', c->'payload');
  select * into s from qarar_governance.notification_settings where organization_id=(c->>'organization_id')::uuid;
  select * into t from qarar_governance.notification_template_settings where organization_id=(c->>'organization_id')::uuid and template_code=code;
  return c || jsonb_build_object('channel_enabled', coalesce(s.whatsapp_enabled, true),
    'event_enabled', qarar_governance.notification_template_enabled((c->>'organization_id')::uuid, code),
    'custom_intro', t.custom_intro, 'custom_action', t.custom_action);
end;
$$;

create or replace function qarar_governance.admin_get_notification_workspace(p_limit integer default 50)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare
  o uuid := qarar_iam.current_organization_id();
  base jsonb;
  templates jsonb;
  added_templates jsonb;
  oversight_templates jsonb;
  deliveries jsonb;
begin
  if not qarar_iam.is_system_admin() then
    raise exception using errcode='42501',message='هذه الصفحة متاحة لمسؤول النظام فقط';
  end if;

  base := qarar_governance.admin_get_notification_workspace_delivery_reason_base(p_limit);

  select jsonb_agg(jsonb_build_object(
    'code',v.code,'label',v.label,'description',v.description,
    'enabled',coalesce(t.enabled,true),'custom_intro',t.custom_intro,'custom_action',t.custom_action
  ) order by v.ord) into added_templates
  from (values
    (1,'meeting_postponed','تأجيل أو تعديل موعد اجتماع','إبلاغ المدعوين بالموعد المحدّث.'),
    (2,'meeting_cancelled','إلغاء اجتماع','إبلاغ المدعوين بإلغاء الاجتماع.'),
    (3,'meeting_invitation_updated','تحديث دعوة اجتماع','إبلاغ المدعوين بتغيير جدول الأعمال.')
  ) v(ord,code,label,description)
  left join qarar_governance.notification_template_settings t
    on t.organization_id=o and t.template_code=v.code;

  select jsonb_agg(jsonb_build_object(
    'code',v.code,'label',v.label,'description',v.description,
    'enabled',qarar_governance.notification_template_enabled(o, v.code),'custom_intro',t.custom_intro,'custom_action',t.custom_action
  ) order by v.ord) into oversight_templates
  from (values
    (1,'oversight_violation','تجاوز في المجلس','إبلاغ رئيس المجلس ومقرره بتأخر يحتاج إلى معالجة. معطّل حتى تفعّله.'),
    (2,'oversight_escalation','تصعيد تجاوز','إبلاغ المتابع الأعلى بتجاوز لم يُعالَج في المهلة. معطّل حتى تفعّله.'),
    (3,'oversight_digest','ملخص المتابعة اليومي','ملخص صباحي لكل متابع بالتجاوزات المفتوحة في نطاقه. معطّل حتى تفعّله.')
  ) v(ord,code,label,description)
  left join qarar_governance.notification_template_settings t
    on t.organization_id=o and t.template_code=v.code;
  templates := coalesce(base->'templates','[]'::jsonb)||coalesce(added_templates,'[]'::jsonb)||coalesce(oversight_templates,'[]'::jsonb);

  select coalesce(jsonb_agg(item || jsonb_build_object(
    'template_label',case item->>'template_code'
      when 'meeting_postponed' then 'تأجيل أو تعديل موعد اجتماع'
      when 'meeting_cancelled' then 'إلغاء اجتماع'
      when 'meeting_invitation_updated' then 'تحديث دعوة اجتماع'
      when 'oversight_violation' then 'تجاوز في المجلس'
      when 'oversight_escalation' then 'تصعيد تجاوز'
      when 'oversight_digest' then 'ملخص المتابعة اليومي'
      else item->>'template_label' end,
    'error_message',case
      when d.status='skipped' and d.last_error_code='DESTINATION_INVALID'
        then 'لم يُرسل الإشعار لأن المستخدم لا يملك رقم جوال صالحًا.'
      when d.status='skipped' and d.last_error_code='EVENT_DISABLED'
        then 'لم يُرسل لأن هذا النوع من الرسائل معطّل في الإعدادات.'
      when d.status in('failed','dead_letter') and d.last_error_code='OPENWA_HTTP_400'
        then 'رفض واتساب رقم المستلم؛ تحقق من الرقم وأنه مرتبط بحساب واتساب.'
      else item->>'error_message' end
  ) order by ordinal),'[]'::jsonb) into deliveries
  from jsonb_array_elements(coalesce(base->'deliveries','[]'::jsonb)) with ordinality source(item,ordinal)
  left join qarar_governance.notification_deliveries d on d.id=(item->>'id')::uuid;

  return base||jsonb_build_object('templates',templates,'deliveries',deliveries);
end
$$;

/** Every (organisation, follower, council) in force on a day; read by other modules instead of the table. */
create function qarar_iam.active_oversight_coverage(p_on date)
returns table(organization_id uuid, user_id uuid, council_id uuid) language sql stable security definer set search_path=pg_catalog
as $$
  select distinct a.organization_id, cov.holder_user_id, cov.council_id
  from qarar_iam.oversight_assignments a
  cross join lateral qarar_iam.oversight_coverage(a.organization_id, a.holder_kind, a.holder_user_id, a.holder_council_id,
    a.holder_role_code, a.holder_class_id, a.target_mode, a.root_unit_id, a.target_class_ids, a.council_ids) cov
  where a.status='active' and a.starts_on<=p_on and (a.ends_on is null or a.ends_on>=p_on)
$$;
alter function qarar_iam.active_oversight_coverage(date) owner to qarar_iam_executor;
revoke all on function qarar_iam.active_oversight_coverage(date) from public, anon, authenticated, service_role;
grant execute on function qarar_iam.active_oversight_coverage(date) to qarar_governance_executor;

/** One morning summary per follower who has open violations in scope; once a day. */
create function qarar_governance.generate_oversight_digests(p_as_of timestamptz default clock_timestamp())
returns integer language plpgsql security definer set search_path=pg_catalog
as $$
declare r record; v_date date := (p_as_of at time zone 'Asia/Riyadh')::date; v_count integer := 0; v_payload jsonb;
begin
  for r in
    with coverage as (select * from qarar_iam.active_oversight_coverage(v_date))
    select c.organization_id, c.user_id, count(*) total_open, count(distinct v.council_id) council_count,
      jsonb_agg(jsonb_build_object('council_name_ar', g.name_ar, 'rule_code', v.rule_code, 'subject_label', v.subject_label,
        'days_open', greatest(0, v_date - v.due_since::date)) order by v.due_since) items
    from coverage c
    join qarar_governance.oversight_violations v on v.organization_id=c.organization_id and v.council_id=c.council_id and v.status='open'
    join qarar_core.governance_units g on g.id=v.council_id
    group by c.organization_id, c.user_id
  loop
    v_payload := jsonb_build_object(
      'recipient_user_id', r.user_id, 'recipient_role', 'follower', 'digest_date', v_date,
      'total_open', r.total_open, 'council_count', r.council_count,
      'by_rule', (select jsonb_agg(jsonb_build_object('name_ar', er.name_ar, 'count', x.c) order by x.c desc)
                  from (select i->>'rule_code' code, count(*) c from jsonb_array_elements(r.items) i group by 1) x
                  join qarar_governance.effective_oversight_rules(r.organization_id) er on er.rule_code=x.code),
      'oldest', (select jsonb_agg(top.i || jsonb_build_object('rule_name_ar', er.name_ar) order by top.n)
                 from (select i, n from jsonb_array_elements(r.items) with ordinality e(i, n) order by n limit 5) top
                 join qarar_governance.effective_oversight_rules(r.organization_id) er on er.rule_code=top.i->>'rule_code'));
    insert into qarar_governance.notification_outbox(organization_id, aggregate_type, aggregate_id, event_type, payload, deduplication_key)
    values (r.organization_id, 'oversight_digest', r.user_id, 'oversight.digest', v_payload, 'oversight.digest:'||r.user_id||':'||v_date)
    on conflict (organization_id, deduplication_key) do nothing;
    if found then
      v_count := v_count + 1;
      perform qarar_governance.push_user_notification(r.organization_id, r.user_id, 'digest', 'ملخص المتابعة اليومي',
        r.total_open||' تجاوزًا مفتوحًا في '||r.council_count||' مجلسًا تتابعه', '/admin/violations', 'oversight_digest', null,
        'digest:'||v_date);
    end if;
  end loop;
  return v_count;
end;
$$;

alter function qarar_governance.notification_template_code(text,jsonb) owner to qarar_governance_executor;
alter function qarar_governance.notification_template_enabled(uuid,text) owner to qarar_governance_executor;
alter function qarar_governance.generate_oversight_digests(timestamptz) owner to qarar_governance_executor;
revoke all on function qarar_governance.notification_template_code(text,jsonb), qarar_governance.notification_template_enabled(uuid,text),
  qarar_governance.generate_oversight_digests(timestamptz) from public, anon, authenticated, service_role;

-- Every morning at 07:05 Riyadh (04:05 UTC), after the night's housekeeping.
select cron.schedule('qarar-oversight-digest', '5 4 * * *', $cron$select qarar_governance.generate_oversight_digests(clock_timestamp())$cron$);

notify pgrst, 'reload schema';
commit;
