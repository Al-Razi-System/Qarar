begin;

-- Every agenda item is decided by the members' vote, and the result moves the
-- topic on its route (product owner, 2026-10-15). The route designer writes one
-- step per council (review, discussion, recommendation or approval) decided
-- "approved" or "rejected"; until now a vote could only bind to a 'voting'
-- step, which that designer never writes, so no topic could be voted on.
-- Impact map: docs/engineering/impact/MEETING_VOTE_EVERY_ITEM_AR.md

-- Which council step the members' vote can decide, and why not otherwise.
create or replace function qarar_governance.meeting_vote_plan(p_step_id uuid)
returns jsonb
language sql
stable
security definer
set search_path=pg_catalog
as $$
  select case
    when s.id is null or s.status<>'active' then
      jsonb_build_object('mode',null,'reason','لا توجد مرحلة نشطة في مسار الموضوع، فلا يُفتح التصويت.')
    when ts.step_type='voting' then
      jsonb_build_object('mode','voting_step','reason',null)
    when ts.step_type in('execution','follow_up') then
      jsonb_build_object('mode',null,'reason',
        format('مرحلة «%s» مرحلة تنفيذ ومتابعة، ولا تُحسم بتصويت المجلس.',ts.name_ar))
    when (exists(select 1 from qarar_governance.workflow_template_transitions tr
                 where tr.from_step_id=ts.id and tr.outcome_code='approved')
          or (ts.is_terminal and 'approved'=any(ts.allowed_outcomes)))
     and (exists(select 1 from qarar_governance.workflow_template_transitions tr
                 where tr.from_step_id=ts.id and tr.outcome_code='rejected')
          or (ts.is_terminal and 'rejected'=any(ts.allowed_outcomes))) then
      jsonb_build_object('mode','council_step','reason',null)
    else
      jsonb_build_object('mode',null,'reason',
        format('مرحلة «%s» في مسار الموضوع لا تحدد ما يحدث عند القبول والرفض؛ عدّل مسار الموضوع أو أجّل البند.',ts.name_ar))
  end
  from (select 1) one
  left join qarar_governance.workflow_instance_steps s on s.id=p_step_id
  left join qarar_governance.workflow_template_steps ts on ts.id=s.template_step_id
$$;

-- True only inside the closing of a real round bound to this very step. The
-- session settings alone are not trusted: a closed round must back them.
create or replace function qarar_voting.is_closing_round_for_step(p_round_id uuid, p_step_id uuid)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog
as $$
  select exists(
    select 1 from qarar_voting.voting_rounds vr
    where vr.id=p_round_id
      and vr.workflow_instance_step_id=p_step_id
      and vr.status='closed'
      and vr.organization_id=qarar_iam.current_organization_id()
  )
$$;

create or replace function qarar_governance.is_verified_vote_transition(p_step_id uuid)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog
as $$
  select coalesce(current_setting('qarar.voting_transition',true),'')='on'
    and coalesce(qarar_voting.is_closing_round_for_step(
      case when current_setting('qarar.voting_round_id',true)
             ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           then current_setting('qarar.voting_round_id',true)::uuid end,
      p_step_id),false)
$$;

-- Opening a vote: bind the round to the council step it will decide.
create or replace function qarar_voting.enforce_governed_voting_round()
returns trigger language plpgsql security definer
set search_path=pg_catalog,qarar_voting
as $$
declare
  v_topic record;
  v_meeting_unit uuid;
  v_step record;
  v_plan jsonb;
begin
  select t.governance_source,t.routing_status,t.workflow_instance_id,
    t.current_workflow_step_id
  into v_topic
  from qarar_meetings.agenda_items a
  join qarar_topics.topics t on t.id=a.topic_id
  where a.id=new.agenda_item_id and a.organization_id=new.organization_id;

  if v_topic.governance_source='legacy' then
    new.workflow_instance_step_id:=null;
    return new;
  end if;
  if v_topic.routing_status<>'routing_ready'
    or v_topic.workflow_instance_id is null
    or v_topic.current_workflow_step_id is null
  then
    raise exception using errcode='55000',
      message='لا يمكن فتح التصويت بلا مسار حوكمة جاهز';
  end if;

  select governance_unit_id into v_meeting_unit
  from qarar_meetings.meetings
  where id=new.meeting_id and organization_id=new.organization_id;

  select s.id,s.assigned_unit_id,s.status,s.workflow_instance_id,
    ts.step_type,ts.responsibility
  into v_step
  from qarar_governance.workflow_instance_steps s
  join qarar_governance.workflow_template_steps ts on ts.id=s.template_step_id
  where s.id=v_topic.current_workflow_step_id
    and s.organization_id=new.organization_id;

  if v_step.id is null or v_step.status<>'active'
    or v_step.workflow_instance_id is distinct from v_topic.workflow_instance_id
  then
    raise exception using errcode='55000',
      message='خطوة الحوكمة الحالية غير نشطة أو لا تتبع المسار';
  end if;
  if v_step.assigned_unit_id is distinct from v_meeting_unit then
    raise exception using errcode='42501',
      message='التصويت ليس في المجلس المسؤول عن الخطوة الحالية';
  end if;
  v_plan:=qarar_governance.meeting_vote_plan(v_step.id);
  if v_plan->>'mode' is null then
    raise exception using errcode='55000',message=v_plan->>'reason';
  end if;
  if v_plan->>'mode'='voting_step' and v_step.responsibility not in(
    'discuss','recommend','initial_approve','final_approve'
  ) then
    raise exception using errcode='55000',
      message='مسؤولية الخطوة الحالية لا تسمح بالتصويت';
  end if;

  new.workflow_instance_step_id:=v_step.id;
  return new;
end;
$$;

-- Closing a vote: apply its result to the step it was bound to.
create or replace function qarar_voting.advance_governed_workflow_from_vote()
returns trigger language plpgsql security definer
set search_path=pg_catalog,qarar_voting
as $$
declare
  v_topic_id uuid;
  v_current_step_id uuid;
  v_action_version integer;
  v_step_type text;
  v_outcome text;
begin
  if new.status<>'closed' or old.status='closed'
    or new.workflow_instance_step_id is null
  then
    return new;
  end if;
  if new.result not in('approved','rejected','tied','no_votes') then
    raise exception using errcode='22023',
      message='نتيجة جولة التصويت لا تحرك مسار الحوكمة';
  end if;

  select a.topic_id into v_topic_id
  from qarar_meetings.agenda_items a
  where a.id=new.agenda_item_id and a.organization_id=new.organization_id;
  select t.current_workflow_step_id into v_current_step_id
  from qarar_topics.topics t
  where t.id=v_topic_id and t.organization_id=new.organization_id
    and t.routing_status='routing_ready';
  if v_current_step_id is distinct from new.workflow_instance_step_id then
    raise exception using errcode='40001',
      message='تغيرت خطوة المسار منذ فتح التصويت؛ لا يمكن تطبيق نتيجة جولة قديمة';
  end if;

  select s.action_version,ts.step_type into v_action_version,v_step_type
  from qarar_governance.workflow_instance_steps s
  join qarar_governance.workflow_template_steps ts on ts.id=s.template_step_id
  where s.id=new.workflow_instance_step_id
    and s.organization_id=new.organization_id
    and s.status='active';
  if v_action_version is null then
    raise exception using errcode='40001',
      message='خطوة المسار المرتبطة بالتصويت غير نشطة';
  end if;

  -- A council step is decided approved or rejected. A tie the chair did not
  -- break leaves the topic at its step; the round and its result stay recorded.
  if v_step_type<>'voting' and new.result not in('approved','rejected') then
    perform qarar_audit.append_audit_log(new.organization_id,'voting.route_unchanged',
      'voting_rounds',new.id,jsonb_build_object('result',new.result,
        'workflow_instance_step_id',new.workflow_instance_step_id));
    return new;
  end if;

  v_outcome:=case new.result
    when 'approved' then 'approved'
    when 'rejected' then 'rejected'
    when 'tied' then 'tie'
    when 'no_votes' then 'no_vote'
  end;
  perform set_config('qarar.voting_transition','on',true);
  perform set_config('qarar.voting_round_id',new.id::text,true);
  perform qarar_governance.act_topic_workflow_step(
    v_topic_id,v_outcome,'نتيجة التصويت '||new.id,new.id,v_action_version
  );
  return new;
end;
$$;

-- The route core. Unchanged except that a verified vote transition is
-- authorized by the meeting (the round was closed by whoever runs it), not by
-- staff review authority, and may decide any council step.
create or replace function qarar_governance.act_topic_workflow_step_core(
  p_topic_id uuid,
  p_outcome_code text,
  p_comment text default null,
  p_idempotency_key uuid default null,
  p_expected_version integer default null
) returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,qarar_governance
as $$
declare
  o uuid:=qarar_iam.current_organization_id();
  actor uuid:=auth.uid();
  i qarar_governance.workflow_instances%rowtype;
  s qarar_governance.workflow_instance_steps%rowtype;
  ts qarar_governance.workflow_template_steps%rowtype;
  t qarar_governance.workflow_template_transitions%rowtype;
  n uuid;
  st text;
  source text;
  ctx jsonb;
  replay qarar_governance.workflow_instance_steps%rowtype;
  v_trusted_vote boolean;
begin
  if p_idempotency_key is null then
    raise exception using errcode='22023',message='مفتاح التكرار مطلوب';
  end if;

  -- The alias must not be "s": that is also a variable here, and PL/pgSQL
  -- rejects the ambiguous reference (42702) on every governed vote.
  select prior.* into replay
  from qarar_governance.workflow_instance_steps prior
  where prior.action_idempotency_key=p_idempotency_key
    and prior.workflow_instance_id in(
      select wi.id from qarar_governance.workflow_instances wi
      where wi.topic_id=p_topic_id and wi.organization_id=o
    );
  if replay.id is not null then
    return jsonb_build_object(
      'topic_id',p_topic_id,
      'workflow_instance_id',replay.workflow_instance_id,
      'completed_step_id',replay.id,
      'outcome',replay.outcome_code,
      'version',replay.action_version,
      'idempotent_replay',true
    );
  end if;

  if exists(
    select 1
    from qarar_governance.topic_governance_mappings m
    join qarar_governance.governance_exceptions e
      on (m.snapshot->>'exception_id')::uuid=e.id
    where m.topic_id=p_topic_id and m.organization_id=o
      and (e.status='expired' or (e.status='approved' and e.valid_until<=now()))
  ) then
    raise exception using errcode='55000',message='انتهت صلاحية المسار المؤقت؛ اطلب تجديده ثم المراجعة المستقلة';
  end if;

  select * into i
  from qarar_governance.workflow_instances
  where topic_id=p_topic_id and organization_id=o and status='active'
  for update;
  if i.id is null then
    raise exception using errcode='55000',message='لا يوجد مسار نشط';
  end if;

  select * into s
  from qarar_governance.workflow_instance_steps
  where id=i.current_step_id
  for update;
  if s.status<>'active' then
    raise exception using errcode='55000',message='لا توجد خطوة نشطة';
  end if;
  if p_expected_version is null or p_expected_version<>s.action_version then
    raise exception using errcode='40001',message='تم تعديل الخطوة؛ حدّث البيانات';
  end if;

  v_trusted_vote:=
    coalesce(current_setting('qarar.voting_transition', true), '')='on'
    and qarar_governance.is_verified_vote_transition(s.id);
  if not v_trusted_vote then
    perform qarar_iam.assert_permission(
      coalesce(s.required_permission_code,'topics.review'),s.assigned_unit_id
    );
  end if;
  select * into ts
  from qarar_governance.workflow_template_steps
  where id=s.template_step_id;

  ctx:=jsonb_build_object(
    'outcome',p_outcome_code,
    'assigned_unit_id',s.assigned_unit_id,
    'topic_id',p_topic_id
  );

  if not qarar_governance.conditions_match(ts.entry_conditions,ctx)
     or (not v_trusted_vote and not qarar_governance.conditions_match(ts.exit_conditions,ctx)) then
    raise exception using errcode='55000',message='شروط الخطوة غير متحققة';
  end if;
  if ts.step_type='voting' and not v_trusted_vote then
    raise exception using errcode='55000',message='الخطوة التصويتية تُحسم من نتيجة التصويت فقط';
  end if;

  select * into t
  from qarar_governance.workflow_template_transitions
  where workflow_template_version_id=i.workflow_template_version_id
    and from_step_id=s.template_step_id
    and outcome_code=p_outcome_code;
  if t.id is null and not(ts.is_terminal and p_outcome_code=any(ts.allowed_outcomes)) then
    raise exception using errcode='22023',message='النتيجة غير مسموحة';
  end if;

  update qarar_governance.workflow_instance_steps
     set status=case when p_outcome_code='rejected' then 'rejected' else 'completed' end,
         acted_by_user_id=actor,
         acted_at=now(),
         outcome_code=p_outcome_code,
         comment=p_comment,
         action_idempotency_key=p_idempotency_key,
         action_version=action_version+1
   where id=s.id;

  if t.to_step_id is not null then
    select id into n
    from qarar_governance.workflow_instance_steps
    where workflow_instance_id=i.id and template_step_id=t.to_step_id;
    update qarar_governance.workflow_instance_steps
       set status='active',opened_at=now()
     where id=n;
    update qarar_governance.workflow_instances
       set current_step_id=n
     where id=i.id;
    st:='active';
  else
    st:=case when p_outcome_code='rejected' then 'rejected' else 'completed' end;
    update qarar_governance.workflow_instances
       set status=st,current_step_id=null,completed_at=now()
     where id=i.id;
  end if;

  select governance_source into source
  from qarar_topics.topics
  where id=p_topic_id and organization_id=o;
  perform qarar_topics.apply_governance_snapshot(
    p_topic_id, source, 'routing_ready',
    (select policy_id from qarar_topics.topics where id=p_topic_id and organization_id=o),
    (select policy_version_id from qarar_topics.topics where id=p_topic_id and organization_id=o),
    (select policy_item_id from qarar_topics.topics where id=p_topic_id and organization_id=o),
    (select policy_scope_assignment_id from qarar_topics.topics where id=p_topic_id and organization_id=o),
    i.workflow_template_version_id, i.id, n,
    (select routing_decision_id from qarar_topics.topics where id=p_topic_id and organization_id=o)
  );
  return jsonb_build_object(
    'topic_id',p_topic_id,
    'completed_step_id',s.id,
    'next_step_id',n,
    'workflow_status',st,
    'version',s.action_version+1
  );
end;
$$;

-- Meeting-owned steps (discussion, recommendation, approval, voting) still
-- move only through a vote; the vote must now be a verified closed round.
create or replace function qarar_governance.act_topic_workflow_step_guarded_core(
  p_topic_id uuid,
  p_outcome_code text,
  p_comment text default null,
  p_idempotency_key uuid default null,
  p_expected_version integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_topic qarar_topics.topics%rowtype;
  v_step record;
  v_is_voting_transition boolean;
begin
  select * into v_topic
  from qarar_topics.topics
  where id = p_topic_id
    and organization_id = qarar_iam.current_organization_id();

  if v_topic.id is null then
    raise exception using errcode = 'P0002', message = 'الموضوع غير موجود';
  end if;

  select s.id, s.status, ts.step_type, ts.responsibility
  into v_step
  from qarar_governance.workflow_instance_steps s
  join qarar_governance.workflow_template_steps ts on ts.id = s.template_step_id
  where s.id = v_topic.current_workflow_step_id
    and s.workflow_instance_id = v_topic.workflow_instance_id;

  if v_step.id is null or v_step.status <> 'active' then
    raise exception using errcode = '55000', message = 'لا توجد خطوة حوكمة نشطة للموضوع';
  end if;

  v_is_voting_transition := qarar_governance.is_verified_vote_transition(v_step.id);

  if v_step.step_type = 'voting'
     or v_step.responsibility in ('initial_approve', 'final_approve') then
    if not v_is_voting_transition then
      raise exception using errcode = '55000', message = 'خطوة التصويت تُنفذ حصراً عبر جولة تصويت الاجتماع';
    end if;
  elsif (v_step.step_type = 'discussion'
     or v_step.responsibility in ('present', 'discuss', 'recommend'))
     and not v_is_voting_transition then
    raise exception using errcode = '55000', message = 'هذه الخطوة تُنفذ من الاجتماع بعد إدراج الموضوع في جدول الأعمال';
  end if;

  return qarar_governance.act_topic_workflow_step_core(
    p_topic_id,
    p_outcome_code,
    p_comment,
    p_idempotency_key,
    p_expected_version
  );
end;
$$;

create or replace function qarar_governance.act_topic_workflow_step(
  p_topic_id uuid,
  p_outcome_code text,
  p_comment text default null,
  p_idempotency_key uuid default null,
  p_expected_version integer default null
) returns jsonb
language plpgsql
security definer
set search_path=pg_catalog
as $$
declare
  v_organization_id uuid := qarar_iam.current_organization_id();
  v_topic qarar_topics.topics%rowtype;
  v_step record;
  v_is_voting_transition boolean;
  v_result jsonb;
begin
  if v_organization_id is null then
    raise exception using errcode='42501', message='تعذر تحديد المؤسسة الحالية';
  end if;

  select * into v_topic
  from qarar_topics.topics
  where id=p_topic_id and organization_id=v_organization_id
  for update;
  if v_topic.id is null then
    raise exception using errcode='P0002', message='الموضوع غير موجود';
  end if;

  select s.id,s.status,ts.step_type,ts.responsibility
    into v_step
  from qarar_governance.workflow_instance_steps s
  join qarar_governance.workflow_template_steps ts on ts.id=s.template_step_id
  where s.id=v_topic.current_workflow_step_id
    and s.workflow_instance_id=v_topic.workflow_instance_id;
  if v_step.id is null or v_step.status<>'active' then
    raise exception using errcode='55000', message='لا توجد خطوة حوكمة نشطة للموضوع';
  end if;

  v_is_voting_transition:=qarar_governance.is_verified_vote_transition(v_step.id);

  if v_step.step_type='voting'
     or v_step.responsibility in('initial_approve','final_approve') then
    if not v_is_voting_transition then
      raise exception using errcode='55000', message='خطوة التصويت تُنفذ حصراً عبر جولة تصويت الاجتماع';
    end if;
  elsif (v_step.step_type='discussion'
     or v_step.responsibility in('present','discuss','recommend'))
     and not v_is_voting_transition then
    raise exception using errcode='55000', message='هذه الخطوة تُنفذ من الاجتماع بعد إدراج الموضوع في جدول الأعمال';
  end if;

  -- Staff review moves the topic's own review status. A council's vote on a
  -- review step moves the route only (see the impact map's known limits).
  if (v_step.step_type='review' or v_step.responsibility='review')
     and not v_is_voting_transition then
    perform qarar_topics.assert_topic_requirements_ready(p_topic_id,'before_review');
    if v_topic.status='new' then
      perform qarar_topics.review_topic(p_topic_id,'start_review',null,v_topic.updated_at);
      select * into v_topic
      from qarar_topics.topics
      where id=p_topic_id and organization_id=v_organization_id
      for update;
    end if;
    if p_outcome_code in('approved','completed') and v_topic.status='under_review' then
      perform qarar_topics.review_topic(p_topic_id,'approve',p_comment,v_topic.updated_at);
    elsif p_outcome_code='rejected' and v_topic.status in('new','under_review') then
      perform qarar_topics.review_topic(p_topic_id,'reject',p_comment,v_topic.updated_at);
    end if;
  end if;

  v_result := qarar_governance.act_topic_workflow_step_guarded_core(
    p_topic_id, p_outcome_code, p_comment, p_idempotency_key, p_expected_version
  );

  return v_result || jsonb_build_object(
    'topic_status', (
      select status from qarar_topics.topics
      where id=p_topic_id and organization_id=v_organization_id
    )
  );
end;
$$;

-- What the agenda tells the room: every item requires a vote, whether it can
-- be opened now, and if not, why (shown beside the disabled button).
create or replace function qarar_governance.get_topic_agenda_context(p_topic_id uuid)
returns jsonb
language sql
stable
security definer
set search_path=pg_catalog
as $$
  select jsonb_build_object(
    'workflow_step_type',current_ts.step_type,
    'workflow_responsibility',current_ts.responsibility,
    'workflow_step_name_ar',current_ts.name_ar,
    'requires_voting',true,
    'voting_available_now',plan.value->>'mode' is not null,
    'voting_unavailable_reason',plan.value->>'reason'
  )
  from qarar_topics.topics t
  left join qarar_governance.workflow_instance_steps current_step
    on current_step.id=t.current_workflow_step_id
   and current_step.workflow_instance_id=t.workflow_instance_id
  left join qarar_governance.workflow_template_steps current_ts on current_ts.id=current_step.template_step_id
  cross join lateral (select case
    when t.governance_source='legacy' then jsonb_build_object('mode','legacy','reason',null)
    when t.routing_status<>'routing_ready' or t.workflow_instance_id is null then
      jsonb_build_object('mode',null,'reason','مسار حوكمة الموضوع غير جاهز، فلا يُفتح التصويت.')
    else qarar_governance.meeting_vote_plan(current_step.id)
  end as value) plan
  where t.id=p_topic_id
    and t.organization_id=qarar_iam.current_organization_id()
$$;

-- Pass the reason through the meeting detail the room reads.
do $$
declare
  definition text;
  marker text:='''requires_voting'', coalesce((governance_context ->> ''requires_voting'')::boolean, false),';
begin
  definition:=pg_get_functiondef('qarar_meetings.get_meeting_detail_before_suggestions(uuid)'::regprocedure);
  if position(marker in definition)=0 then
    raise exception 'Meeting detail contract drift: requires_voting marker not found';
  end if;
  definition:=replace(definition,marker,marker||'
          ''voting_unavailable_reason'', governance_context ->> ''voting_unavailable_reason'',');
  execute definition;
end $$;

-- A session ends only when every item that was not postponed has a closed vote.
create or replace function qarar_meetings.require_vote_for_agenda_items()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog
as $$
declare
  v_item record;
begin
  if new.status='waiting_for_minutes' and old.status is distinct from new.status then
    select ai.agenda_order,t.title_ar into v_item
    from qarar_meetings.agenda_items ai
    join qarar_topics.topics t on t.id=ai.topic_id
    where ai.meeting_id=new.id
      and ai.agenda_status<>'postponed'
      and not exists(
        select 1 from qarar_voting.voting_rounds vr
        where vr.agenda_item_id=ai.id and vr.status='closed'
      )
    order by ai.agenda_order
    limit 1;
    if v_item.agenda_order is not null then
      raise exception 'صوّت المجلس على البند % «%» أو أجّله بسبب موثق قبل إنهاء الجلسة.',
        v_item.agenda_order,v_item.title_ar using errcode='23514';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists meetings_require_vote_for_agenda_items on qarar_meetings.meetings;
create trigger meetings_require_vote_for_agenda_items
before update of status on qarar_meetings.meetings
for each row execute function qarar_meetings.require_vote_for_agenda_items();

-- Ownership and privileges: internal functions only, never client-callable.
alter function qarar_governance.meeting_vote_plan(uuid) owner to qarar_governance_executor;
alter function qarar_governance.is_verified_vote_transition(uuid) owner to qarar_governance_executor;
alter function qarar_voting.is_closing_round_for_step(uuid,uuid) owner to qarar_voting_executor;
alter function qarar_meetings.require_vote_for_agenda_items() owner to qarar_meetings_executor;
revoke all on function qarar_governance.meeting_vote_plan(uuid) from public,anon,authenticated,service_role;
revoke all on function qarar_governance.is_verified_vote_transition(uuid) from public,anon,authenticated,service_role;
revoke all on function qarar_voting.is_closing_round_for_step(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function qarar_meetings.require_vote_for_agenda_items() from public,anon,authenticated,service_role;
grant execute on function qarar_governance.meeting_vote_plan(uuid) to qarar_voting_executor;
grant execute on function qarar_voting.is_closing_round_for_step(uuid,uuid) to qarar_governance_executor;

insert into qarar_architecture.function_registry(
  function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate
)
select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),r.module_code,n.nspname,false
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
join (values
  ('qarar_governance','meeting_vote_plan','governance'),
  ('qarar_governance','is_verified_vote_transition','governance'),
  ('qarar_voting','is_closing_round_for_step','voting'),
  ('qarar_meetings','require_vote_for_agenda_items','meetings')
) r(schema_name,function_name,module_code) on r.schema_name=n.nspname and r.function_name=p.proname
on conflict(function_name,identity_arguments) do update
set function_oid=excluded.function_oid,module_code=excluded.module_code,
  owning_schema=excluded.owning_schema;

insert into qarar_architecture.module_function_execute_allowlist(
  source_module,target_schema,function_name,identity_arguments,rationale
) values
  ('voting','qarar_governance','meeting_vote_plan','p_step_id uuid',
   'Bind a meeting vote only to a council step whose approved and rejected outcomes are defined'),
  ('governance','qarar_voting','is_closing_round_for_step','p_round_id uuid, p_step_id uuid',
   'Trust a vote transition only when a closed round bound to the step backs it')
on conflict do nothing;

commit;
