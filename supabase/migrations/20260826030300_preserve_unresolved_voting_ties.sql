begin;

-- A chair vote breaks a tie only when it exists.  A missing chair vote must
-- preserve the tied result; SQL's three-valued NULL comparison previously
-- fell through to the rejection branch.
create or replace function qarar_voting.close_voting_round(
  p_voting_round_id uuid,
  p_reason text default null
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_r qarar_voting.voting_rounds%rowtype;
  v_unit uuid;
  v_approve int;
  v_reject int;
  v_abstain int;
  v_result text;
  v_chair_vote text;
  v_tie_break_applied boolean := false;
begin
  select * into v_r from qarar_voting.voting_rounds
  where id = p_voting_round_id and organization_id = qarar_iam.current_organization_id()
  for update;
  if v_r.id is null then raise exception 'جولة التصويت غير موجودة.' using errcode = 'P0002'; end if;
  if v_r.status <> 'open' then raise exception 'جولة التصويت ليست مفتوحة.' using errcode = '23514'; end if;

  select governance_unit_id into v_unit from qarar_meetings.meetings
  where id = v_r.meeting_id and status = 'in_progress';
  if v_unit is null then raise exception 'الاجتماع ليس قيد الانعقاد.' using errcode = '23514'; end if;
  if not qarar_attendance.can_manage_live_meeting(v_r.meeting_id) then
    raise exception 'إغلاق التصويت من اختصاص رئيس المجلس.' using errcode = '42501';
  end if;

  select count(*) filter (where vote_value = 'approve'),
         count(*) filter (where vote_value = 'reject'),
         count(*) filter (where vote_value = 'abstain')
  into v_approve, v_reject, v_abstain
  from qarar_voting.votes where voting_round_id = v_r.id;

  if v_approve + v_reject + v_abstain = 0 then
    v_result := 'no_votes';
  elsif v_approve > v_reject then
    v_result := 'approved';
  elsif v_reject > v_approve then
    v_result := 'rejected';
  else
    select v.vote_value into v_chair_vote
    from qarar_voting.votes v
    where v.voting_round_id = v_r.id
      and exists (
        select 1 from qarar_iam.memberships ms
        join qarar_iam.roles r on r.id = ms.role_id
        where ms.user_id = v.user_id and ms.governance_unit_id = v_unit
          and ms.membership_status = 'active' and r.code = 'council_chair'
      )
    order by v.voted_at desc limit 1;

    if v_chair_vote in ('approve', 'reject') then
      v_tie_break_applied := true;
      v_result := case v_chair_vote when 'approve' then 'approved' else 'rejected' end;
    else
      v_result := 'tied';
    end if;
  end if;

  update qarar_voting.voting_rounds set
    status = 'closed', approve_count = v_approve, reject_count = v_reject,
    abstain_count = v_abstain, result = v_result,
    tie_break_applied = v_tie_break_applied,
    chair_vote = case when v_tie_break_applied then v_chair_vote else null end,
    closed_by_user_id = auth.uid(), closed_at = clock_timestamp(),
    close_reason = nullif(btrim(coalesce(p_reason, '')), '')
  where id = v_r.id;

  update qarar_meetings.agenda_items set
    voting_status = 'closed', voting_result = case v_result when 'no_votes' then 'tied' else v_result end
  where id = v_r.agenda_item_id;

  perform qarar_audit.append_audit_log(v_r.organization_id, 'voting.close', 'voting_rounds', v_r.id,
    jsonb_build_object('result', v_result, 'approve_count', v_approve,
      'reject_count', v_reject, 'abstain_count', v_abstain,
      'chair_vote', v_chair_vote, 'tie_break_applied', v_tie_break_applied));

  return jsonb_build_object('voting_round_id', v_r.id, 'status', 'closed', 'result', v_result,
    'eligible_voter_count', v_r.eligible_voter_count, 'approve_count', v_approve,
    'reject_count', v_reject, 'abstain_count', v_abstain,
    'chair_vote', v_chair_vote, 'tie_break_applied', v_tie_break_applied);
end
$$;

commit;
