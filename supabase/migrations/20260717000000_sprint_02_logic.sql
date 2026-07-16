-- Migration for Sprint 02: Meetings & Agenda Logic (PB-006, PB-008, PB-010, PB-012, PB-014)

-- 1. PB-006 & PB-008: Topic Referrals (إحالة الموضوع)
create table public.topic_referrals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  topic_id uuid not null references public.topics(id) on delete restrict,
  from_unit_id uuid references public.governance_units(id) on delete restrict,
  to_unit_id uuid not null references public.governance_units(id) on delete restrict,
  referred_by_user_id uuid not null references public.users(id) on delete restrict,
  referral_reason text not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  referred_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (topic_id, organization_id) references public.topics(id, organization_id),
  foreign key (from_unit_id, organization_id) references public.governance_units(id, organization_id),
  foreign key (to_unit_id, organization_id) references public.governance_units(id, organization_id),
  foreign key (referred_by_user_id, organization_id) references public.users(id, organization_id)
);

create trigger set_topic_referrals_updated_at before update on public.topic_referrals for each row execute function public.set_updated_at();

alter table public.topic_referrals enable row level security;
create policy "topic referrals are visible inside organization" on public.topic_referrals for select to authenticated using (organization_id = public.current_organization_id());
create policy "users can refer topics" on public.topic_referrals for insert to authenticated with check (organization_id = public.current_organization_id() and referred_by_user_id = auth.uid());
create policy "unit members can manage referrals" on public.topic_referrals for all to authenticated using (organization_id = public.current_organization_id() and (public.is_system_admin() or public.has_role_code(array['governance_admin']) or public.has_unit_role_code(to_unit_id, array['council_chair', 'council_rapporteur'])));

-- 2. PB-012 & PB-014: Agenda Items Eligibility and Exceptions
alter table public.agenda_items 
  add column is_exception boolean not null default false,
  add column exception_reason text;

create or replace function public.check_agenda_item_eligibility() returns trigger as $$
declare
  v_topic_status text;
begin
  select status into v_topic_status from public.topics where id = NEW.topic_id;
  
  -- Topic must be 'approved' to be eligible for normal agenda insertion
  if v_topic_status != 'approved' and NEW.is_exception = false then
    raise exception 'Topic is not eligible for agenda without an exception. Topic status is %', v_topic_status;
  end if;
  
  -- If it's an exception, reason must be provided
  if NEW.is_exception = true and (NEW.exception_reason is null or trim(NEW.exception_reason) = '') then
    raise exception 'An exception reason must be provided when adding an ineligible topic to the agenda.';
  end if;
  
  -- Check permission for exception (Must be System Admin or Governance Admin)
  if NEW.is_exception = true then
    if not (public.is_system_admin() or public.has_role_code(array['governance_admin'])) then
      raise exception 'User does not have permission to grant an exception for ineligible topics.';
    end if;
  end if;
  
  return NEW;
end;
$$ language plpgsql security definer;

create trigger enforce_agenda_item_eligibility
  before insert or update on public.agenda_items
  for each row execute function public.check_agenda_item_eligibility();


-- 3. PB-010: Meeting Status Transitions Guard
create or replace function public.guard_meeting_status_transitions() returns trigger as $$
begin
  if OLD.status = NEW.status then
    return NEW;
  end if;

  -- Allowed Transitions Mapping
  if OLD.status = 'draft' and NEW.status not in ('scheduled', 'cancelled') then
    raise exception 'Invalid transition from % to %', OLD.status, NEW.status;
  elsif OLD.status = 'scheduled' and NEW.status not in ('ready_to_start', 'cancelled', 'draft') then
    raise exception 'Invalid transition from % to %', OLD.status, NEW.status;
  elsif OLD.status = 'ready_to_start' and NEW.status not in ('in_progress', 'scheduled', 'cancelled') then
    raise exception 'Invalid transition from % to %', OLD.status, NEW.status;
  elsif OLD.status = 'in_progress' and NEW.status not in ('waiting_for_minutes') then
    raise exception 'Invalid transition from % to %', OLD.status, NEW.status;
  elsif OLD.status = 'waiting_for_minutes' and NEW.status not in ('waiting_for_approval') then
    raise exception 'Invalid transition from % to %', OLD.status, NEW.status;
  elsif OLD.status = 'waiting_for_approval' and NEW.status not in ('closed') then
    raise exception 'Invalid transition from % to %', OLD.status, NEW.status;
  elsif OLD.status = 'closed' and NEW.status not in ('archived') then
    raise exception 'Invalid transition from % to %', OLD.status, NEW.status;
  elsif OLD.status = 'cancelled' and NEW.status not in ('archived') then
    raise exception 'Invalid transition from % to %', OLD.status, NEW.status;
  elsif OLD.status = 'archived' then
    raise exception 'Cannot transition from archived status.';
  end if;

  return NEW;
end;
$$ language plpgsql security definer;

create trigger enforce_meeting_status_transitions
  before update of status on public.meetings
  for each row execute function public.guard_meeting_status_transitions();
