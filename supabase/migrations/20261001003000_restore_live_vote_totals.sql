-- Restore live aggregate counts lost when an older read model replaced the
-- richer implementation. Counts are visible to meeting operators only while
-- the round is open, and to all authorized readers after it closes.
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
    'approve_count', case when vr.status = 'open' and permission.can_view_live then live.approve_count else vr.approve_count end,
    'reject_count', case when vr.status = 'open' and permission.can_view_live then live.reject_count else vr.reject_count end,
    'abstain_count', case when vr.status = 'open' and permission.can_view_live then live.abstain_count else vr.abstain_count end,
    'votes_cast_count', case
      when vr.status = 'open' and permission.can_view_live then live.votes_cast_count
      when vr.status = 'closed' then coalesce(vr.approve_count, 0) + coalesce(vr.reject_count, 0) + coalesce(vr.abstain_count, 0)
      else null
    end,
    'tie_break_applied', vr.tie_break_applied,
    'chair_vote', vr.chair_vote
  ) order by vr.opened_at), '[]'::jsonb)
  from qarar_voting.voting_rounds vr
  join qarar_meetings.meetings m on m.id = vr.meeting_id
  cross join lateral (
    select qarar_iam.is_system_admin()
      or qarar_iam.has_permission('voting.manage', m.governance_unit_id)
      or qarar_iam.has_permission('agenda.manage', m.governance_unit_id)
      as can_view_live
  ) permission
  cross join lateral (
    select
      count(*) filter (where v.vote_value = 'approve')::integer as approve_count,
      count(*) filter (where v.vote_value = 'reject')::integer as reject_count,
      count(*) filter (where v.vote_value = 'abstain')::integer as abstain_count,
      count(*)::integer as votes_cast_count
    from qarar_voting.votes v
    where v.voting_round_id = vr.id
  ) live
  where vr.meeting_id = p_meeting_id
    and vr.organization_id = qarar_iam.current_organization_id()
    and (
      qarar_iam.is_system_admin()
      or qarar_iam.has_permission('voting.read', m.governance_unit_id)
      or qarar_iam.has_permission('voting.manage', m.governance_unit_id)
    );
$$;

alter function qarar_voting.list_meeting_voting_rounds(uuid) owner to qarar_voting_executor;
revoke all on function qarar_voting.list_meeting_voting_rounds(uuid) from public, anon, authenticated, service_role;
grant execute on function qarar_voting.list_meeting_voting_rounds(uuid) to qarar_api_executor;
