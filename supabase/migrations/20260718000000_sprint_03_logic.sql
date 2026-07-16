-- Migration for Sprint 03: Attendance, Quorum & Voting (PB-015 to PB-020)

-- 1. Schema Updates

-- Add quorum_percentage to governance_units
alter table public.governance_units 
  add column quorum_percentage integer not null default 51 check (quorum_percentage between 1 and 100);

-- Update meetings.status to include 'postponed'
do $$
declare
  v_const_name text;
begin
  select conname into v_const_name
  from pg_constraint
  where conrelid = 'public.meetings'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%draft%';
  
  if v_const_name is not null then
    execute 'alter table public.meetings drop constraint ' || v_const_name;
  end if;
end $$;

alter table public.meetings add constraint meetings_status_check check (status in ('draft', 'scheduled', 'ready_to_start', 'in_progress', 'waiting_for_minutes', 'waiting_for_approval', 'closed', 'archived', 'cancelled', 'postponed'));

-- Add voting fields to agenda_items
alter table public.agenda_items
  add column voting_status text not null default 'not_started' check (voting_status in ('not_started', 'open', 'closed')),
  add column voting_result text not null default 'pending' check (voting_result in ('pending', 'approved', 'rejected', 'tied'));

-- 2. Attendance RLS (PB-015)
alter table public.attendance_records enable row level security;

create policy "attendance records are visible inside organization" 
  on public.attendance_records for select to authenticated 
  using (organization_id = public.current_organization_id());

-- Only council chair or rapporteur can insert/update attendance
create policy "chair and rapporteur can manage attendance" 
  on public.attendance_records for all to authenticated 
  using (
    organization_id = public.current_organization_id() 
    and (
      public.is_system_admin() 
      or public.has_role_code(array['governance_admin']) 
      or public.has_unit_role_code((select governance_unit_id from public.meetings where id = meeting_id), array['council_chair', 'council_rapporteur'])
    )
  );

-- 3. Quorum Logic (PB-016 & PB-017)
create or replace function public.calculate_meeting_quorum(p_meeting_id uuid) returns text as $$
declare
  v_unit_id uuid;
  v_quorum_pct integer;
  v_total_members integer;
  v_present_members integer;
  v_actual_pct numeric;
  v_status text;
begin
  -- Get unit and quorum setting
  select governance_unit_id into v_unit_id from public.meetings where id = p_meeting_id;
  select quorum_percentage into v_quorum_pct from public.governance_units where id = v_unit_id;

  -- Count total active members in the unit
  select count(*) into v_total_members 
  from public.memberships 
  where governance_unit_id = v_unit_id and membership_status = 'active';

  -- Count present/late members in attendance_records
  select count(*) into v_present_members 
  from public.attendance_records 
  where meeting_id = p_meeting_id and attendance_status in ('present', 'late');

  if v_total_members = 0 then
    v_status := 'not_met';
  else
    v_actual_pct := (v_present_members::numeric / v_total_members::numeric) * 100;
    if v_actual_pct >= v_quorum_pct then
      v_status := 'met';
    else
      v_status := 'not_met';
    end if;
  end if;

  -- Update meeting quorum status
  update public.meetings set quorum_status = v_status where id = p_meeting_id;

  return v_status;
end;
$$ language plpgsql security definer;

create or replace function public.on_attendance_change() returns trigger as $$
begin
  if TG_OP = 'DELETE' then
    perform public.calculate_meeting_quorum(OLD.meeting_id);
  else
    perform public.calculate_meeting_quorum(NEW.meeting_id);
  end if;
  return null; -- After trigger
end;
$$ language plpgsql security definer;

create trigger auto_calculate_quorum
  after insert or update of attendance_status or delete on public.attendance_records
  for each row execute function public.on_attendance_change();

-- Update the guard to prevent 'waiting_for_minutes' if quorum is not met
create or replace function public.guard_meeting_status_transitions() returns trigger as $$
begin
  if OLD.status = NEW.status then
    return NEW;
  end if;

  if OLD.status = 'draft' and NEW.status not in ('scheduled', 'cancelled') then
    raise exception 'Invalid transition from % to %', OLD.status, NEW.status;
  elsif OLD.status = 'scheduled' and NEW.status not in ('ready_to_start', 'cancelled', 'draft') then
    raise exception 'Invalid transition from % to %', OLD.status, NEW.status;
  elsif OLD.status = 'ready_to_start' and NEW.status not in ('in_progress', 'scheduled', 'cancelled') then
    raise exception 'Invalid transition from % to %', OLD.status, NEW.status;
  elsif OLD.status = 'in_progress' and NEW.status not in ('waiting_for_minutes', 'postponed', 'cancelled') then
    raise exception 'Invalid transition from % to %', OLD.status, NEW.status;
  elsif OLD.status = 'waiting_for_minutes' and NEW.status not in ('waiting_for_approval') then
    raise exception 'Invalid transition from % to %', OLD.status, NEW.status;
  elsif OLD.status = 'waiting_for_approval' and NEW.status not in ('closed') then
    raise exception 'Invalid transition from % to %', OLD.status, NEW.status;
  elsif OLD.status = 'closed' and NEW.status not in ('archived') then
    raise exception 'Invalid transition from % to %', OLD.status, NEW.status;
  elsif OLD.status = 'cancelled' and NEW.status not in ('archived') then
    raise exception 'Invalid transition from % to %', OLD.status, NEW.status;
  elsif OLD.status = 'postponed' and NEW.status not in ('archived') then
    raise exception 'Invalid transition from % to %', OLD.status, NEW.status;
  elsif OLD.status = 'archived' then
    raise exception 'Cannot transition from archived status.';
  end if;

  -- Check Quorum before moving to waiting_for_minutes
  if NEW.status = 'waiting_for_minutes' and NEW.quorum_status != 'met' then
    raise exception 'Cannot proceed to minutes phase. Quorum is not met.';
  end if;

  return NEW;
end;
$$ language plpgsql security definer;

-- 4. Voting RLS & Triggers (PB-018, PB-019)
alter table public.votes enable row level security;

create policy "votes are visible inside organization" 
  on public.votes for select to authenticated 
  using (organization_id = public.current_organization_id());

create policy "users can cast votes if they are members" 
  on public.votes for insert to authenticated 
  with check (
    organization_id = public.current_organization_id() 
    and user_id = auth.uid()
  );

-- Block update/delete on votes (Immutable rule)
create policy "votes cannot be updated" on public.votes for update to authenticated using (false);
create policy "votes cannot be deleted" on public.votes for delete to authenticated using (false);

create or replace function public.enforce_voting_context() returns trigger as $$
declare
  v_meeting_status text;
  v_voting_status text;
begin
  select status into v_meeting_status from public.meetings where id = NEW.meeting_id;
  if v_meeting_status != 'in_progress' then
    raise exception 'Votes can only be cast when the meeting is in progress.';
  end if;

  if NEW.topic_id is not null then
    select voting_status into v_voting_status from public.agenda_items where meeting_id = NEW.meeting_id and topic_id = NEW.topic_id;
    if v_voting_status != 'open' then
      raise exception 'Voting is not currently open for this agenda item.';
    end if;
  end if;

  return NEW;
end;
$$ language plpgsql security definer;

create trigger enforce_voting_context_trigger
  before insert on public.votes
  for each row execute function public.enforce_voting_context();

-- 5. Voting Results View & Immutability Trigger (PB-020)
create or replace view public.voting_results_view as
select 
  v.meeting_id,
  v.topic_id,
  count(v.id) as total_votes,
  sum(case when v.vote_value = 'approve' then 1 else 0 end) as approve_count,
  sum(case when v.vote_value = 'reject' then 1 else 0 end) as reject_count,
  sum(case when v.vote_value = 'abstain' then 1 else 0 end) as abstain_count,
  case 
    when sum(case when v.vote_value = 'approve' then 1 else 0 end) > sum(case when v.vote_value = 'reject' then 1 else 0 end) then 'approved'
    when sum(case when v.vote_value = 'reject' then 1 else 0 end) > sum(case when v.vote_value = 'approve' then 1 else 0 end) then 'rejected'
    else 'tied'
  end as calculated_result
from public.votes v
group by v.meeting_id, v.topic_id;

create or replace function public.on_voting_closed() returns trigger as $$
declare
  v_result text;
begin
  if OLD.voting_status = 'open' and NEW.voting_status = 'closed' then
    -- Freeze the result
    select calculated_result into v_result 
    from public.voting_results_view 
    where meeting_id = NEW.meeting_id and topic_id = NEW.topic_id;

    if v_result is null then
      NEW.voting_result := 'tied'; -- No votes cast
    else
      NEW.voting_result := v_result;
    end if;
  end if;

  return NEW;
end;
$$ language plpgsql security definer;

create trigger freeze_voting_result
  before update of voting_status on public.agenda_items
  for each row execute function public.on_voting_closed();
