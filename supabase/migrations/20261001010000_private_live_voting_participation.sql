-- Voting operators may monitor who has participated, never how an individual
-- voted. A round cannot close while an eligible member has not voted.
alter function qarar_voting.close_voting_round(uuid,text)
  rename to close_voting_round_after_full_participation;

create or replace function qarar_voting.close_voting_round(
  p_voting_round_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_round qarar_voting.voting_rounds%rowtype;
  v_remaining integer;
begin
  select * into v_round
  from qarar_voting.voting_rounds
  where id = p_voting_round_id
    and organization_id = qarar_iam.current_organization_id()
  for update;

  if v_round.id is null then
    raise exception 'جولة التصويت غير موجودة.' using errcode = 'P0002';
  end if;

  select count(*)::integer into v_remaining
  from qarar_voting.voting_eligible_members eligible
  where eligible.voting_round_id = v_round.id
    and not exists (
      select 1 from qarar_voting.votes vote
      where vote.voting_round_id = eligible.voting_round_id
        and vote.user_id = eligible.user_id
    );

  if v_remaining > 0 then
    raise exception 'لا يمكن إغلاق التصويت؛ ما زال % من الأعضاء المؤهلين بانتظار التصويت.', v_remaining
      using errcode = '23514';
  end if;

  return qarar_voting.close_voting_round_after_full_participation(p_voting_round_id, p_reason);
end;
$$;

alter function qarar_voting.close_voting_round(uuid,text) owner to qarar_voting_executor;
revoke all on function qarar_voting.close_voting_round(uuid,text) from public,anon,authenticated,service_role;
grant execute on function qarar_voting.close_voting_round(uuid,text) to qarar_api_executor;
revoke all on function qarar_voting.close_voting_round_after_full_participation(uuid,text) from public,anon,authenticated,service_role;
grant execute on function qarar_voting.close_voting_round_after_full_participation(uuid,text) to qarar_voting_executor;

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
      when vr.status = 'open' and permission.can_monitor then participation.votes_cast_count
      when vr.status = 'closed' then coalesce(vr.approve_count, 0) + coalesce(vr.reject_count, 0) + coalesce(vr.abstain_count, 0)
      else null
    end,
    'participation', case
      when vr.status = 'open' and permission.can_monitor then participation.people
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
      as can_monitor
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
