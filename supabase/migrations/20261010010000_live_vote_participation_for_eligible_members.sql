-- Members who are voting in an open round may see who has voted, never how.
-- Product decision of 2026-10-10 (docs/design/HANDOFF_AR.md). Until now the
-- participation list and the count of votes cast were returned only to callers
-- holding voting.manage or agenda.manage. This widens the read to the members
-- snapshotted as eligible for that same round. Nothing else changes: option
-- totals stay hidden while the round is open, no vote value or note is ever
-- part of this contract, and callers outside the round still get an empty list.
-- Impact map: docs/engineering/impact/LIVE_VOTE_PARTICIPATION_FOR_MEMBERS_AR.md
begin;

create or replace function qarar_voting.list_meeting_voting_rounds(p_meeting_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', vr.id,
    'agenda_item_id', vr.agenda_item_id,
    'status', vr.status,
    'result', vr.result,
    'eligible_voter_count', vr.eligible_voter_count,
    -- Never expose option totals while a round is open.
    'approve_count', case when vr.status = 'closed' then vr.approve_count else null end,
    'reject_count', case when vr.status = 'closed' then vr.reject_count else null end,
    'abstain_count', case when vr.status = 'closed' then vr.abstain_count else null end,
    'votes_cast_count', case
      when vr.status = 'open' and permission.can_follow then participation.votes_cast_count
      when vr.status = 'closed' then coalesce(vr.approve_count, 0) + coalesce(vr.reject_count, 0) + coalesce(vr.abstain_count, 0)
      else null
    end,
    'participation', case
      when vr.status = 'open' and permission.can_follow then participation.people
      else '[]'::jsonb
    end,
    'tie_break_applied', vr.tie_break_applied,
    'chair_vote', vr.chair_vote,
    'closed_at', vr.closed_at
  ) order by vr.opened_at), '[]'::jsonb)
  from qarar_voting.voting_rounds vr
  join qarar_meetings.meetings meeting on meeting.id = vr.meeting_id
  cross join lateral (
    select qarar_iam.is_system_admin()
      or qarar_iam.has_permission('voting.manage', meeting.governance_unit_id)
      or qarar_iam.has_permission('agenda.manage', meeting.governance_unit_id)
      -- A member snapshotted as eligible for this round follows its participation.
      or exists (
        select 1
        from qarar_voting.voting_eligible_members own_seat
        where own_seat.voting_round_id = vr.id
          and own_seat.organization_id = vr.organization_id
          and own_seat.user_id = auth.uid()
      )
      as can_follow
  ) permission
  cross join lateral (
    select
      count(vote.user_id)::integer as votes_cast_count,
      coalesce(jsonb_agg(jsonb_build_object(
        'user_id', eligible.user_id,
        'full_name_ar', app_user.full_name_ar,
        'has_voted', vote.user_id is not null
      ) order by (vote.user_id is not null) desc, app_user.full_name_ar), '[]'::jsonb) as people
    from qarar_voting.voting_eligible_members eligible
    join qarar_iam.users app_user on app_user.id = eligible.user_id
    left join qarar_voting.votes vote
      on vote.voting_round_id = eligible.voting_round_id
     and vote.user_id = eligible.user_id
    where eligible.voting_round_id = vr.id
  ) participation
  where vr.meeting_id = p_meeting_id
    and vr.organization_id = qarar_iam.current_organization_id()
    and (
      qarar_iam.is_system_admin()
      or qarar_iam.has_permission('voting.read', meeting.governance_unit_id)
      or qarar_iam.has_permission('voting.manage', meeting.governance_unit_id)
    );
$$;

alter function qarar_voting.list_meeting_voting_rounds(uuid) owner to qarar_voting_executor;
revoke all on function qarar_voting.list_meeting_voting_rounds(uuid) from public,anon,authenticated,service_role;
grant execute on function qarar_voting.list_meeting_voting_rounds(uuid) to qarar_api_executor;

select pg_notify('pgrst','reload schema');
commit;
