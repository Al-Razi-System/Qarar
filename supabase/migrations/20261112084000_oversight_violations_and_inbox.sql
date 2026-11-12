-- Oversight violations, escalation along the follow-up tree, and the in-app inbox behind the bell.
-- A violation opens when something measurable is late in a council and closes on its own when the cause
-- goes away. Its chair and rapporteur hear first; unresolved, it escalates to the nearest follower, then
-- upward. Every outbox alert with a recipient also lands in that person's bell.
-- Impact map: docs/engineering/impact/OVERSIGHT_VIOLATIONS_AND_INBOX_20261112_AR.md
begin;

-- 1. Follow-up coverage with the root each follower's scope starts from (to order escalation levels).
create function qarar_iam.oversight_coverage_detail(
  p_org uuid, p_holder_kind text, p_holder_user_id uuid, p_holder_council_id uuid, p_holder_role_code text,
  p_holder_class_id uuid, p_target_mode text, p_root_unit_id uuid, p_target_class_ids uuid[], p_council_ids uuid[])
returns table(holder_user_id uuid, council_id uuid, root_unit_id uuid) language sql stable security definer set search_path=pg_catalog
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
  select distinct h.user_id, c.id, case when p_target_mode='selected' then c.scope_unit_id else h.root end
  from holders h
  join councils c on case
    when p_target_mode='selected' then c.id = any(p_council_ids)
    else c.scope_unit_id in (select qarar_iam.unit_subtree(p_org, h.root))
      and (cardinality(p_target_class_ids)=0 or c.governance_class_id = any(p_target_class_ids)) end
  where h.user_id is not null
$$;

-- Same signature and result as before; now one implementation for both.
create or replace function qarar_iam.oversight_coverage(
  p_org uuid, p_holder_kind text, p_holder_user_id uuid, p_holder_council_id uuid, p_holder_role_code text,
  p_holder_class_id uuid, p_target_mode text, p_root_unit_id uuid, p_target_class_ids uuid[], p_council_ids uuid[])
returns table(holder_user_id uuid, council_id uuid) language sql stable security definer set search_path=pg_catalog
as $$
  select distinct d.holder_user_id, d.council_id
  from qarar_iam.oversight_coverage_detail(p_org, p_holder_kind, p_holder_user_id, p_holder_council_id, p_holder_role_code,
    p_holder_class_id, p_target_mode, p_root_unit_id, p_target_class_ids, p_council_ids) d
$$;

create function qarar_iam.unit_depth(p_org uuid, p_unit uuid)
returns integer language sql stable security definer set search_path=pg_catalog
as $$
  with recursive up(id, parent, depth) as (
    select u.id, u.parent_unit_id, 0 from qarar_core.governance_units u where u.id=p_unit and u.organization_id=p_org
    union all
    select p.id, p.parent_unit_id, up.depth+1 from qarar_core.governance_units p join up on p.id=up.parent where p.organization_id=p_org and up.depth < 50
  ) select max(depth) from up
$$;

/** Followers of a council by escalation level: 1 is the nearest (deepest root in the tree). Leaders excluded. */
create function qarar_iam.council_follower_tiers(p_org uuid, p_council uuid)
returns table(user_id uuid, tier integer) language sql stable security definer set search_path=pg_catalog
as $$
  with followers as (
    select d.holder_user_id, coalesce(qarar_iam.unit_depth(p_org, d.root_unit_id), 0) depth
    from qarar_iam.oversight_assignments a
    cross join lateral qarar_iam.oversight_coverage_detail(a.organization_id, a.holder_kind, a.holder_user_id, a.holder_council_id,
      a.holder_role_code, a.holder_class_id, a.target_mode, a.root_unit_id, a.target_class_ids, a.council_ids) d
    where a.organization_id=p_org and a.status='active' and a.starts_on<=current_date and (a.ends_on is null or a.ends_on>=current_date)
      and d.council_id=p_council
  ), leaders as (
    select m.user_id from qarar_iam.memberships m join qarar_iam.roles r on r.id=m.role_id and r.organization_id=m.organization_id
    where m.organization_id=p_org and m.governance_unit_id=p_council and r.code in ('council_chair','council_rapporteur')
      and m.membership_status='active' and m.start_date<=current_date and (m.end_date is null or m.end_date>=current_date)
  ), nearest as (
    select holder_user_id, max(depth) depth from followers where holder_user_id not in (select user_id from leaders) group by holder_user_id
  )
  select holder_user_id, dense_rank() over (order by depth desc)::integer from nearest
$$;

-- 2. Rules, violations, inbox.
create table qarar_governance.oversight_rules (
  organization_id uuid not null references qarar_core.organizations(id) on delete restrict,
  rule_code text not null check (rule_code in ('meeting_cycle_missed','task_overdue','minutes_pending','topic_stalled','quorum_continuation')),
  enabled boolean not null default true,
  threshold_days integer not null check (threshold_days between 0 and 365),
  escalation_days integer not null check (escalation_days between 1 and 90),
  escalate_immediately boolean not null default false,
  version integer not null default 1,
  updated_by_user_id uuid references qarar_iam.users(id),
  updated_at timestamptz not null default now(),
  primary key (organization_id, rule_code)
);

create table qarar_governance.oversight_violations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references qarar_core.organizations(id) on delete restrict,
  rule_code text not null,
  council_id uuid not null references qarar_core.governance_units(id),
  subject_type text not null check (subject_type in ('meeting','action_item','topic')),
  subject_id uuid not null,
  subject_label text not null,
  subject_link text not null,
  due_since timestamptz not null,
  detected_at timestamptz not null,
  backlog boolean not null default false,
  status text not null default 'open' check (status in ('open','resolved')),
  resolved_at timestamptz,
  escalation_level integer not null default 0,
  last_escalated_at timestamptz,
  created_at timestamptz not null default now(),
  check (status <> 'resolved' or resolved_at is not null)
);
create unique index oversight_violations_one_open on qarar_governance.oversight_violations(organization_id, rule_code, subject_type, subject_id) where status='open';
create index oversight_violations_council_open on qarar_governance.oversight_violations(organization_id, council_id) where status='open';

create table qarar_governance.user_notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references qarar_core.organizations(id) on delete restrict,
  user_id uuid not null references qarar_iam.users(id) on delete cascade,
  category text not null check (category in ('violation','escalation','digest','meeting','task','other')),
  title_ar text not null,
  body_ar text,
  link_path text check (link_path is null or link_path ~ '^/[A-Za-z0-9/_?=&%.-]*$'),
  source_type text,
  source_id uuid,
  dedupe_key text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  unique (user_id, dedupe_key)
);
create index user_notifications_user_time on qarar_governance.user_notifications(user_id, created_at desc);
create index user_notifications_user_unread on qarar_governance.user_notifications(user_id) where read_at is null;

insert into qarar_architecture.entity_registry(entity_name,module_code,legacy_public_view) values
('oversight_rules','governance',false), ('oversight_violations','governance',false), ('user_notifications','governance',false)
on conflict(entity_name) do update set module_code=excluded.module_code, legacy_public_view=false;

do $tables$
declare t text;
begin
  foreach t in array array['qarar_governance.oversight_rules','qarar_governance.oversight_violations','qarar_governance.user_notifications'] loop
    execute format('alter table %s enable row level security', t);
    execute format('revoke all on %s from public, anon, authenticated, service_role', t);
    execute format('grant select, insert, update on %s to qarar_governance_executor', t);
  end loop;
end
$tables$;
create trigger audit_oversight_rules_changes after insert or update or delete on qarar_governance.oversight_rules
  for each row execute function qarar_audit.audit_row_change();

-- Read-only access the detector needs in other modules, column by column.
grant select (id, organization_id, meeting_id, to_status, changed_at) on qarar_meetings.meeting_status_history to qarar_governance_executor;
grant select (id, organization_id, user_id, governance_unit_id, role_id, membership_status, start_date, end_date) on qarar_iam.memberships to qarar_governance_executor;
grant select (id, organization_id, code, is_active) on qarar_iam.roles to qarar_governance_executor;
grant execute on function qarar_iam.council_follower_tiers(uuid,uuid), qarar_iam.oversight_coverage_detail(uuid,text,uuid,uuid,text,uuid,text,uuid,uuid[],uuid[]),
  qarar_iam.unit_depth(uuid,uuid) to qarar_governance_executor;

-- 3. Rules: product defaults, overridden per organisation.
create function qarar_governance.effective_oversight_rules(p_org uuid)
returns table(rule_code text, name_ar text, enabled boolean, threshold_days integer, escalation_days integer, escalate_immediately boolean, version integer)
language sql stable security definer set search_path=pg_catalog
as $$
  select d.rule_code, d.name_ar, coalesce(r.enabled, true), coalesce(r.threshold_days, d.threshold_days),
    coalesce(r.escalation_days, d.escalation_days), coalesce(r.escalate_immediately, d.escalate_immediately), coalesce(r.version, 0)
  from (values
    ('meeting_cycle_missed', 'اجتماع دوري لم ينعقد في موعده', 0, 3, false, 1),
    ('task_overdue', 'تكليف متأخر عن موعده', 0, 3, false, 2),
    ('minutes_pending', 'محضر لم يُعتمد بعد', 7, 3, false, 3),
    ('topic_stalled', 'موضوع متوقف في المجلس', 30, 7, false, 4),
    ('quorum_continuation', 'اجتماع عُقد بنصاب غير مكتمل', 0, 3, true, 5)
  ) d(rule_code, name_ar, threshold_days, escalation_days, escalate_immediately, sort_order)
  left join qarar_governance.oversight_rules r on r.organization_id=p_org and r.rule_code=d.rule_code
  order by d.sort_order
$$;

/** Everything late right now, per rule, in one organisation. */
create function qarar_governance.oversight_candidates(p_org uuid, p_as_of timestamptz)
returns table(rule_code text, council_id uuid, subject_type text, subject_id uuid, subject_label text, subject_link text, due_since timestamptz)
language sql stable security definer set search_path=pg_catalog
as $$
  with rules as (select * from qarar_governance.effective_oversight_rules(p_org) where enabled)
  select 'meeting_cycle_missed', m.governance_unit_id, 'meeting', m.id, m.title_ar, '/admin/meetings/'||m.id,
    (m.planned_window_end + 1)::timestamptz + make_interval(days => r.threshold_days)
  from qarar_meetings.meetings m join rules r on r.rule_code='meeting_cycle_missed'
  where m.organization_id=p_org and m.status='draft' and not m.schedule_date_confirmed and m.planned_window_end is not null
    and (m.planned_window_end + 1)::timestamptz + make_interval(days => r.threshold_days) <= p_as_of
  union all
  select 'task_overdue', d.governance_unit_id, 'action_item', a.id, a.action_no||' '||a.title_ar, '/admin/tasks?task='||a.id,
    (a.due_date + 1)::timestamptz + make_interval(days => r.threshold_days)
  from qarar_execution.action_items a join rules r on r.rule_code='task_overdue'
  join qarar_decisions.decisions d on d.id=a.decision_id and d.organization_id=a.organization_id
  where a.organization_id=p_org and a.status not in ('completed','cancelled') and a.due_date is not null
    and (a.due_date + 1)::timestamptz + make_interval(days => r.threshold_days) <= p_as_of
  union all
  select 'minutes_pending', m.governance_unit_id, 'meeting', m.id, m.title_ar, '/admin/meetings/'||m.id,
    coalesce(h.entered_at, m.updated_at) + make_interval(days => r.threshold_days)
  from qarar_meetings.meetings m join rules r on r.rule_code='minutes_pending'
  left join lateral (
    select coalesce(max(x.changed_at) filter (where x.to_status='waiting_for_minutes'), max(x.changed_at)) entered_at
    from qarar_meetings.meeting_status_history x
    where x.meeting_id=m.id and x.organization_id=m.organization_id and x.to_status in ('waiting_for_minutes','waiting_for_approval')
  ) h on true
  where m.organization_id=p_org and m.status in ('waiting_for_minutes','waiting_for_approval')
    and coalesce(h.entered_at, m.updated_at) + make_interval(days => r.threshold_days) <= p_as_of
  union all
  select 'topic_stalled', s.assigned_unit_id, 'topic', t.id, t.topic_no||' '||t.title_ar, '/admin/topics/'||t.id,
    s.opened_at + make_interval(days => r.threshold_days)
  from qarar_governance.workflow_instance_steps s join rules r on r.rule_code='topic_stalled'
  join qarar_governance.workflow_instances i on i.id=s.workflow_instance_id and i.organization_id=s.organization_id
  join qarar_topics.topics t on t.id=i.topic_id and t.organization_id=i.organization_id
  join qarar_core.governance_units g on g.id=s.assigned_unit_id and g.organization_id=s.organization_id
  join qarar_core.governance_unit_types gt on gt.id=g.unit_type_id and gt.is_council_type
  where s.organization_id=p_org and s.status='active' and s.opened_at is not null
    and s.opened_at + make_interval(days => r.threshold_days) <= p_as_of
  union all
  select 'quorum_continuation', m.governance_unit_id, 'meeting', m.id, m.title_ar, '/admin/meetings/'||m.id,
    coalesce((m.quorum_continuation->>'authorized_at')::timestamptz, m.updated_at)
  from qarar_meetings.meetings m join rules r on r.rule_code='quorum_continuation'
  where m.organization_id=p_org and m.quorum_continuation is not null and m.status not in ('closed','archived','cancelled')
$$;

create function qarar_governance.council_leaders(p_org uuid, p_council uuid)
returns setof uuid language sql stable security definer set search_path=pg_catalog
as $$
  select distinct m.user_id from qarar_iam.memberships m join qarar_iam.roles r on r.id=m.role_id and r.organization_id=m.organization_id
  where m.organization_id=p_org and m.governance_unit_id=p_council and r.code in ('council_chair','council_rapporteur') and r.is_active
    and m.membership_status='active' and m.start_date<=current_date and (m.end_date is null or m.end_date>=current_date)
$$;

create function qarar_governance.push_user_notification(p_org uuid, p_user uuid, p_category text, p_title text, p_body text,
  p_link text, p_source_type text, p_source_id uuid, p_dedupe text)
returns boolean language plpgsql security definer set search_path=pg_catalog
as $$
begin
  insert into qarar_governance.user_notifications(organization_id, user_id, category, title_ar, body_ar, link_path, source_type, source_id, dedupe_key)
  values (p_org, p_user, p_category, left(p_title, 200), left(p_body, 1000), p_link, p_source_type, p_source_id, p_dedupe)
  on conflict (user_id, dedupe_key) do nothing;
  return found;
end;
$$;

-- 4. The hourly cycle: detect, close, notify, escalate. One run at a time.
create function qarar_governance.run_oversight_cycle(p_as_of timestamptz default clock_timestamp())
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare
  v_org uuid; v record; f record; u uuid;
  v_opened integer := 0; v_resolved integer := 0; v_escalated integer := 0; v_tier integer;
  v_rule record; v_council text; v_days integer;
begin
  if not pg_try_advisory_xact_lock(hashtextextended('qarar.oversight_cycle', 0)) then
    return jsonb_build_object('skipped', true);
  end if;
  for v_org in select id from qarar_core.organizations order by id loop
    -- Close what is no longer late.
    with current_set as (select * from qarar_governance.oversight_candidates(v_org, p_as_of))
    update qarar_governance.oversight_violations o set status='resolved', resolved_at=p_as_of
    where o.organization_id=v_org and o.status='open'
      and not exists (select 1 from current_set c where c.rule_code=o.rule_code and c.subject_type=o.subject_type and c.subject_id=o.subject_id);
    get diagnostics v_days = row_count; v_resolved := v_resolved + v_days;

    -- Open what is newly late, and tell the council's leaders.
    for v in
      insert into qarar_governance.oversight_violations(organization_id, rule_code, council_id, subject_type, subject_id, subject_label, subject_link, due_since, detected_at, backlog)
      select v_org, c.rule_code, c.council_id, c.subject_type, c.subject_id, c.subject_label, c.subject_link, c.due_since, p_as_of,
        c.due_since < p_as_of - make_interval(days => r.escalation_days)
      from qarar_governance.oversight_candidates(v_org, p_as_of) c
      join qarar_governance.effective_oversight_rules(v_org) r on r.rule_code=c.rule_code
      where c.council_id is not null
      on conflict (organization_id, rule_code, subject_type, subject_id) where status='open' do nothing
      returning *
    loop
      v_opened := v_opened + 1;
      select * into v_rule from qarar_governance.effective_oversight_rules(v_org) r where r.rule_code=v.rule_code;
      select name_ar into v_council from qarar_core.governance_units where id=v.council_id;
      for u in select * from qarar_governance.council_leaders(v_org, v.council_id) loop
        perform qarar_governance.push_user_notification(v_org, u, 'violation', v_rule.name_ar, v_council||': '||v.subject_label,
          v.subject_link, 'oversight_violation', v.id, 'violation:'||v.id);
        -- Rules that already have their own WhatsApp alert, and old backlog at activation, stay in the bell only.
        if v.rule_code in ('minutes_pending','topic_stalled','quorum_continuation') and not v.backlog then
          insert into qarar_governance.notification_outbox(organization_id, aggregate_type, aggregate_id, event_type, payload, deduplication_key)
          values (v_org, 'oversight_violation', v.id, 'oversight.violation.detected', jsonb_build_object(
            'recipient_user_id', u, 'recipient_role', 'council_leader', 'violation_id', v.id, 'rule_code', v.rule_code,
            'rule_name_ar', v_rule.name_ar, 'governance_unit_name_ar', v_council, 'subject_label', v.subject_label,
            'subject_link', v.subject_link, 'due_since', v.due_since::date),
            'oversight.violation.detected:'||v.id||':'||u)
          on conflict (organization_id, deduplication_key) do nothing;
        end if;
      end loop;
    end loop;

    -- Escalate what is still open after its period (or at once for immediate rules), one level at a time.
    for v in
      select o.*, r.name_ar rule_name_ar, r.escalation_days, r.escalate_immediately
      from qarar_governance.oversight_violations o
      join qarar_governance.effective_oversight_rules(v_org) r on r.rule_code=o.rule_code
      where o.organization_id=v_org and o.status='open'
        and ((r.escalate_immediately and o.escalation_level=0)
          or p_as_of >= coalesce(o.last_escalated_at, o.detected_at) + make_interval(days => r.escalation_days))
      order by o.detected_at
    loop
      v_tier := v.escalation_level + 1;
      if not exists (select 1 from qarar_iam.council_follower_tiers(v_org, v.council_id) t where t.tier=v_tier) then continue; end if;
      select name_ar into v_council from qarar_core.governance_units where id=v.council_id;
      v_days := greatest(0, (p_as_of::date - v.due_since::date));
      for f in select * from qarar_iam.council_follower_tiers(v_org, v.council_id) t where t.tier=v_tier loop
        perform qarar_governance.push_user_notification(v_org, f.user_id, 'escalation', 'تصعيد: '||v.rule_name_ar,
          v_council||': '||v.subject_label||case when v_days > 0 then ' (منذ '||v_days||' يومًا)' else '' end,
          v.subject_link, 'oversight_violation', v.id, 'escalation:'||v.id||':'||v_tier);
        insert into qarar_governance.notification_outbox(organization_id, aggregate_type, aggregate_id, event_type, payload, deduplication_key)
        values (v_org, 'oversight_violation', v.id, 'oversight.violation.escalated', jsonb_build_object(
          'recipient_user_id', f.user_id, 'recipient_role', 'follower', 'escalation_level', v_tier, 'violation_id', v.id,
          'rule_code', v.rule_code, 'rule_name_ar', v.rule_name_ar, 'governance_unit_name_ar', v_council,
          'subject_label', v.subject_label, 'subject_link', v.subject_link, 'due_since', v.due_since::date, 'days_open', v_days),
          'oversight.violation.escalated:'||v.id||':'||v_tier||':'||f.user_id)
        on conflict (organization_id, deduplication_key) do nothing;
      end loop;
      update qarar_governance.oversight_violations set escalation_level=v_tier, last_escalated_at=p_as_of where id=v.id;
      v_escalated := v_escalated + 1;
    end loop;
  end loop;
  return jsonb_build_object('opened', v_opened, 'resolved', v_resolved, 'escalated', v_escalated);
end;
$$;

-- 5. Every outbox alert with a recipient also reaches that person's bell.
create function qarar_governance.mirror_outbox_to_inbox()
returns trigger language plpgsql security definer set search_path=pg_catalog
as $$
declare v_user uuid; v_title text; v_category text; v_link text;
begin
  if NEW.event_type like 'oversight.%' then return NEW; end if;
  v_user := qarar_audit.safe_uuid(NEW.payload->>'recipient_user_id');
  if v_user is null or not exists (select 1 from qarar_iam.users u where u.id=v_user and u.organization_id=NEW.organization_id) then return NEW; end if;
  v_title := case NEW.event_type
    when 'meeting.invitation.requested' then 'دعوة إلى اجتماع'
    when 'meeting.invitation.updated' then 'تحديث على دعوة اجتماع'
    when 'meeting.reminder.due' then 'تذكير باجتماع قادم'
    when 'meeting.cycle.due_soon' then 'اقترب موعد اجتماع دوري'
    when 'meeting.cycle.overdue' then 'انتهت فترة اجتماع دوري دون موعد'
    when 'meeting.postponed' then 'تأجيل اجتماع'
    when 'meeting.cancelled' then 'إلغاء اجتماع'
    when 'execution.task.created' then 'تكليف جديد'
    when 'execution.task.due_soon' then 'اقترب موعد تكليف'
    when 'execution.task.overdue' then 'تكليف متأخر'
    when 'execution.task.submitted' then 'تكليف بانتظار المراجعة'
    when 'execution.task.returned' then 'أُعيد تكليف للاستكمال'
    when 'execution.task.completed' then 'اكتمل تكليف'
    else null end;
  if v_title is null then return NEW; end if;
  v_category := case when NEW.aggregate_type='meeting' then 'meeting' when NEW.aggregate_type='action_item' then 'task' else 'other' end;
  v_link := case when NEW.aggregate_type='meeting' then '/admin/meetings/'||NEW.aggregate_id
                 when NEW.aggregate_type='action_item' then '/admin/tasks?task='||NEW.aggregate_id end;
  perform qarar_governance.push_user_notification(NEW.organization_id, v_user, v_category, v_title,
    nullif(NEW.payload->>'title_ar',''), v_link, NEW.aggregate_type, NEW.aggregate_id, 'outbox:'||NEW.deduplication_key);
  return NEW;
end;
$$;
create trigger mirror_outbox_to_inbox after insert on qarar_governance.notification_outbox
  for each row execute function qarar_governance.mirror_outbox_to_inbox();

-- 6. Contracts.
create function qarar_governance.get_my_notifications_v2(p_limit integer default 20, p_before timestamptz default null)
returns jsonb language sql stable security definer set search_path=pg_catalog
as $$
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'category', n.category, 'title_ar', n.title_ar, 'body_ar', n.body_ar,
        'link_path', n.link_path, 'created_at', n.created_at, 'read_at', n.read_at) order by n.created_at desc)
      from (select * from qarar_governance.user_notifications x
            where x.user_id=auth.uid() and x.organization_id=qarar_iam.current_organization_id() and (p_before is null or x.created_at < p_before)
            order by x.created_at desc limit least(greatest(coalesce(p_limit,20),1),100)) n), '[]'),
    'unread_count', (select count(*) from qarar_governance.user_notifications x
      where x.user_id=auth.uid() and x.organization_id=qarar_iam.current_organization_id() and x.read_at is null))
$$;

create function qarar_governance.mark_my_notifications_read_v2(p_ids uuid[] default null)
returns integer language plpgsql security definer set search_path=pg_catalog
as $$
declare v_remaining integer;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
  update qarar_governance.user_notifications set read_at=now()
  where user_id=auth.uid() and read_at is null and (p_ids is null or id = any(p_ids));
  select count(*) into v_remaining from qarar_governance.user_notifications where user_id=auth.uid() and read_at is null;
  return v_remaining;
end;
$$;

create function qarar_governance.get_my_oversight_violations_v2(p_status text default 'open', p_rule_code text default null, p_council_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_org uuid := qarar_iam.current_organization_id(); v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'authentication required' using errcode='42501'; end if;
  if coalesce(p_status,'open') not in ('open','resolved','all') then raise exception 'invalid violation status' using errcode='22023'; end if;
  return (
    with scope as (
      select c council_id, 'leader' relation from qarar_governance.council_leaders(v_org, null) c where false
      union
      select m.governance_unit_id, 'leader' from qarar_iam.memberships m join qarar_iam.roles r on r.id=m.role_id and r.organization_id=m.organization_id
      where m.organization_id=v_org and m.user_id=v_user and r.code in ('council_chair','council_rapporteur') and r.is_active
        and m.membership_status='active' and m.start_date<=current_date and (m.end_date is null or m.end_date>=current_date)
      union
      select o.council_id, 'follower' from qarar_iam.overseen_councils(v_user) o
    ), relation as (
      select council_id, case when bool_or(relation='leader') then 'leader' else 'follower' end relation from scope group by council_id
    ), matched as (
      select v.*, rl.relation, r.name_ar rule_name_ar, g.name_ar council_name_ar
      from qarar_governance.oversight_violations v
      join relation rl on rl.council_id=v.council_id
      join qarar_governance.effective_oversight_rules(v_org) r on r.rule_code=v.rule_code
      join qarar_core.governance_units g on g.id=v.council_id
      where v.organization_id=v_org and (coalesce(p_status,'open')='all' or v.status=coalesce(p_status,'open'))
        and (p_rule_code is null or v.rule_code=p_rule_code) and (p_council_id is null or v.council_id=p_council_id)
    )
    select jsonb_build_object(
      'items', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'rule_code', m.rule_code, 'rule_name_ar', m.rule_name_ar,
          'council_id', m.council_id, 'council_name_ar', m.council_name_ar, 'subject_type', m.subject_type, 'subject_label', m.subject_label,
          'subject_link', m.subject_link, 'due_since', m.due_since, 'detected_at', m.detected_at, 'status', m.status, 'resolved_at', m.resolved_at,
          'days_open', greatest(0, current_date - m.due_since::date), 'escalation_level', m.escalation_level, 'relation', m.relation)
        order by m.status, m.due_since) from (select * from matched order by status, due_since limit 500) m), '[]'),
      'total', (select count(*) from matched),
      'councils', coalesce((select jsonb_agg(distinct jsonb_build_object('id', g.id, 'name_ar', g.name_ar)) from relation rl join qarar_core.governance_units g on g.id=rl.council_id), '[]'),
      'rules', coalesce((select jsonb_agg(jsonb_build_object('rule_code', r.rule_code, 'name_ar', r.name_ar)) from qarar_governance.effective_oversight_rules(v_org) r), '[]'))
  );
end;
$$;

create function qarar_governance.admin_get_oversight_rules_v2()
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
begin
  perform qarar_iam.assert_permission('governance.oversight.manage', null);
  return coalesce((select jsonb_agg(jsonb_build_object('rule_code', r.rule_code, 'name_ar', r.name_ar, 'enabled', r.enabled,
    'threshold_days', r.threshold_days, 'escalation_days', r.escalation_days, 'escalate_immediately', r.escalate_immediately, 'version', r.version))
    from qarar_governance.effective_oversight_rules(qarar_iam.current_organization_id()) r), '[]');
end;
$$;

create function qarar_governance.admin_save_oversight_rules_v2(p_rules jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare v_org uuid := qarar_iam.current_organization_id(); v_item jsonb; v_current record;
begin
  perform qarar_iam.assert_permission('governance.oversight.manage', null);
  if jsonb_typeof(p_rules) is distinct from 'array' then raise exception 'rules must be a list' using errcode='22023'; end if;
  for v_item in select * from jsonb_array_elements(p_rules) loop
    select * into v_current from qarar_governance.effective_oversight_rules(v_org) r where r.rule_code=v_item->>'rule_code';
    if v_current.rule_code is null then raise exception 'unknown oversight rule' using errcode='22023'; end if;
    if (v_item->>'version') is not null and (v_item->>'version')::integer <> v_current.version then
      raise exception 'oversight rule changed since it was read' using errcode='40001';
    end if;
    begin
      insert into qarar_governance.oversight_rules(organization_id, rule_code, enabled, threshold_days, escalation_days, escalate_immediately, updated_by_user_id)
      values (v_org, v_current.rule_code, coalesce((v_item->>'enabled')::boolean, v_current.enabled),
        coalesce((v_item->>'threshold_days')::integer, v_current.threshold_days), coalesce((v_item->>'escalation_days')::integer, v_current.escalation_days),
        coalesce((v_item->>'escalate_immediately')::boolean, v_current.escalate_immediately), auth.uid())
      on conflict (organization_id, rule_code) do update set enabled=excluded.enabled, threshold_days=excluded.threshold_days,
        escalation_days=excluded.escalation_days, escalate_immediately=excluded.escalate_immediately,
        updated_by_user_id=excluded.updated_by_user_id, updated_at=now(), version=qarar_governance.oversight_rules.version+1;
    exception when check_violation or invalid_text_representation then
      raise exception 'invalid oversight rule value' using errcode='22023';
    end;
  end loop;
  return qarar_governance.admin_get_oversight_rules_v2();
end;
$$;

do $owners$
declare f text;
begin
  foreach f in array array[
    'qarar_iam.oversight_coverage_detail(uuid,text,uuid,uuid,text,uuid,text,uuid,uuid[],uuid[])',
    'qarar_iam.unit_depth(uuid,uuid)', 'qarar_iam.council_follower_tiers(uuid,uuid)'] loop
    execute format('alter function %s owner to qarar_iam_executor', f);
    execute format('revoke all on function %s from public, anon, authenticated, service_role', f);
  end loop;
  foreach f in array array[
    'qarar_governance.effective_oversight_rules(uuid)', 'qarar_governance.oversight_candidates(uuid,timestamptz)',
    'qarar_governance.council_leaders(uuid,uuid)',
    'qarar_governance.push_user_notification(uuid,uuid,text,text,text,text,text,uuid,text)',
    'qarar_governance.run_oversight_cycle(timestamptz)', 'qarar_governance.mirror_outbox_to_inbox()',
    'qarar_governance.get_my_notifications_v2(integer,timestamptz)', 'qarar_governance.mark_my_notifications_read_v2(uuid[])',
    'qarar_governance.get_my_oversight_violations_v2(text,text,uuid)', 'qarar_governance.admin_get_oversight_rules_v2()',
    'qarar_governance.admin_save_oversight_rules_v2(jsonb)'] loop
    execute format('alter function %s owner to qarar_governance_executor', f);
    execute format('revoke all on function %s from public, anon, authenticated, service_role', f);
  end loop;
end
$owners$;
grant execute on function qarar_iam.oversight_coverage_detail(uuid,text,uuid,uuid,text,uuid,text,uuid,uuid[],uuid[]) to qarar_api_executor;
grant execute on function qarar_governance.get_my_notifications_v2(integer,timestamptz), qarar_governance.mark_my_notifications_read_v2(uuid[]),
  qarar_governance.get_my_oversight_violations_v2(text,text,uuid), qarar_governance.admin_get_oversight_rules_v2(),
  qarar_governance.admin_save_oversight_rules_v2(jsonb) to qarar_api_executor;
-- Every module that writes the outbox fires the mirror trigger, which runs as its owner.
grant execute on function qarar_governance.push_user_notification(uuid,uuid,text,text,text,text,text,uuid,text) to qarar_governance_executor;
grant execute on function qarar_audit.safe_uuid(text) to qarar_governance_executor;

create function api_v2.get_my_notifications_v2(p_limit integer default 20, p_before timestamptz default null) returns jsonb
language sql security definer set search_path=pg_catalog as $$ select qarar_governance.get_my_notifications_v2($1,$2) $$;
create function api_v2.mark_my_notifications_read_v2(p_ids uuid[] default null) returns integer
language sql security definer set search_path=pg_catalog as $$ select qarar_governance.mark_my_notifications_read_v2($1) $$;
create function api_v2.get_my_oversight_violations_v2(p_status text default 'open', p_rule_code text default null, p_council_id uuid default null) returns jsonb
language sql security definer set search_path=pg_catalog as $$ select qarar_governance.get_my_oversight_violations_v2($1,$2,$3) $$;
create function api_v2.admin_get_oversight_rules_v2() returns jsonb
language sql security definer set search_path=pg_catalog as $$ select qarar_governance.admin_get_oversight_rules_v2() $$;
create function api_v2.admin_save_oversight_rules_v2(p_rules jsonb) returns jsonb
language sql security definer set search_path=pg_catalog as $$ select qarar_governance.admin_save_oversight_rules_v2($1) $$;

do $api$
declare f text;
begin
  foreach f in array array['api_v2.get_my_notifications_v2(integer,timestamptz)', 'api_v2.mark_my_notifications_read_v2(uuid[])',
    'api_v2.get_my_oversight_violations_v2(text,text,uuid)', 'api_v2.admin_get_oversight_rules_v2()', 'api_v2.admin_save_oversight_rules_v2(jsonb)'] loop
    execute format('alter function %s owner to qarar_api_executor', f);
    execute format('revoke all on function %s from public, anon, service_role', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end
$api$;

insert into qarar_architecture.api_contract_registry(api_version,contract_name,implementation_schema,implementation_name,identity_arguments,module_code,audience) values
('v2','get_my_notifications_v2','qarar_governance','get_my_notifications_v2','p_limit integer, p_before timestamp with time zone','governance','authenticated'),
('v2','mark_my_notifications_read_v2','qarar_governance','mark_my_notifications_read_v2','p_ids uuid[]','governance','authenticated'),
('v2','get_my_oversight_violations_v2','qarar_governance','get_my_oversight_violations_v2','p_status text, p_rule_code text, p_council_id uuid','governance','authenticated'),
('v2','admin_get_oversight_rules_v2','qarar_governance','admin_get_oversight_rules_v2','','governance','authenticated'),
('v2','admin_save_oversight_rules_v2','qarar_governance','admin_save_oversight_rules_v2','p_rules jsonb','governance','authenticated');

-- Hourly, offset from the existing notification jobs.
select cron.schedule('qarar-oversight-cycle', '50 * * * *', $cron$select qarar_governance.run_oversight_cycle(clock_timestamp())$cron$);

notify pgrst, 'reload schema';
commit;
