begin;

-- Meeting voting is the only trusted source allowed to complete a voting step.
create or replace function qarar_governance.act_topic_workflow_step(
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
  v_topic qarar_topics.topics%rowtype;
  v_step record;
  v_result jsonb;
  v_is_voting_transition boolean;
begin
  select * into v_topic
  from qarar_topics.topics
  where id=p_topic_id
    and organization_id=qarar_iam.current_organization_id()
  for update;
  if v_topic.id is null then
    raise exception using errcode='P0002',message='الموضوع غير موجود';
  end if;

  select s.id,s.status,ts.step_type,ts.responsibility
    into v_step
  from qarar_governance.workflow_instance_steps s
  join qarar_governance.workflow_template_steps ts on ts.id=s.template_step_id
  where s.id=v_topic.current_workflow_step_id
    and s.workflow_instance_id=v_topic.workflow_instance_id;
  if v_step.id is null or v_step.status<>'active' then
    raise exception using errcode='55000',message='لا توجد خطوة حوكمة نشطة للموضوع';
  end if;

  v_is_voting_transition:=
    current_setting('qarar.voting_transition',true)='on'
    and nullif(current_setting('qarar.voting_round_id',true),'') is not null;

  if v_step.step_type='voting'
     or v_step.responsibility in('initial_approve','final_approve') then
    if not v_is_voting_transition then
      raise exception using errcode='55000',message='خطوة التصويت تُنفذ حصراً عبر جولة تصويت الاجتماع';
    end if;
  elsif v_step.step_type='discussion'
     or v_step.responsibility in('present','discuss','recommend') then
    raise exception using errcode='55000',message='هذه الخطوة تُنفذ من الاجتماع بعد إدراج الموضوع في جدول الأعمال';
  end if;

  if v_step.step_type='review' or v_step.responsibility='review' then
    perform qarar_topics.assert_topic_requirements_ready(p_topic_id,'before_review');
    if v_topic.status='new' then
      perform qarar_topics.review_topic(p_topic_id,'start_review',null,v_topic.updated_at);
      select * into v_topic from qarar_topics.topics where id=p_topic_id for update;
    end if;
    if p_outcome_code in('approved','completed') and v_topic.status='under_review' then
      perform qarar_topics.review_topic(p_topic_id,'approve',p_comment,v_topic.updated_at);
    elsif p_outcome_code='rejected' and v_topic.status in('new','under_review') then
      perform qarar_topics.review_topic(p_topic_id,'reject',p_comment,v_topic.updated_at);
    end if;
  end if;

  v_result:=qarar_governance.act_topic_workflow_step_guarded_core(
    p_topic_id,p_outcome_code,p_comment,p_idempotency_key,p_expected_version
  );
  return v_result||jsonb_build_object(
    'topic_status',(select status from qarar_topics.topics where id=p_topic_id)
  );
end;
$$;

alter function qarar_governance.act_topic_workflow_step(uuid,text,text,uuid,integer)
  owner to qarar_governance_executor;

-- Open-round counts are visible only to the meeting manager and contain no identities.
create or replace function qarar_voting.list_meeting_voting_rounds(p_meeting_id uuid)
returns jsonb
language sql
stable
security definer
set search_path=pg_catalog
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',vr.id,
    'agenda_item_id',vr.agenda_item_id,
    'status',vr.status,
    'result',vr.result,
    'eligible_voter_count',vr.eligible_voter_count,
    'approve_count',case when vr.status='open' and can_manage then live.approve_count else vr.approve_count end,
    'reject_count',case when vr.status='open' and can_manage then live.reject_count else vr.reject_count end,
    'abstain_count',case when vr.status='open' and can_manage then live.abstain_count else vr.abstain_count end,
    'votes_cast_count',case when vr.status='open' and can_manage then live.votes_cast_count
                            when vr.status='closed' then coalesce(vr.approve_count,0)+coalesce(vr.reject_count,0)+coalesce(vr.abstain_count,0)
                            else null end
  ) order by vr.opened_at),'[]'::jsonb)
  from qarar_voting.voting_rounds vr
  join qarar_meetings.meetings m on m.id=vr.meeting_id
  cross join lateral (
    select qarar_attendance.can_manage_live_meeting(vr.meeting_id) as can_manage
  ) permission
  cross join lateral (
    select
      count(*) filter(where v.vote_value='approve')::integer as approve_count,
      count(*) filter(where v.vote_value='reject')::integer as reject_count,
      count(*) filter(where v.vote_value='abstain')::integer as abstain_count,
      count(*)::integer as votes_cast_count
    from qarar_voting.votes v
    where v.voting_round_id=vr.id
  ) live
  where vr.meeting_id=p_meeting_id
    and vr.organization_id=qarar_iam.current_organization_id()
    and (qarar_iam.is_system_admin()
      or qarar_iam.has_permission('voting.read',m.governance_unit_id)
      or qarar_iam.has_permission('voting.manage',m.governance_unit_id));
$$;

alter function qarar_voting.list_meeting_voting_rounds(uuid)
  owner to qarar_voting_executor;
revoke all on function qarar_voting.list_meeting_voting_rounds(uuid)
  from public,anon,authenticated,service_role;
grant execute on function qarar_voting.list_meeting_voting_rounds(uuid)
  to qarar_api_executor;

commit;
