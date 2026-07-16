-- Migration for Sprint 04: AI Minutes & Approvals (PB-022 to PB-028)

-- 1. Schema Updates

-- Add minute_approval_rule to governance_units
alter table public.governance_units 
  add column minute_approval_rule text not null default 'chair_and_rapporteur' 
  check (minute_approval_rule in ('chair_and_rapporteur', 'all_present_members'));

-- Alter meeting_minutes table (PB-022) since it was created in core schema
alter table public.meeting_minutes rename column draft_text to content_draft;
alter table public.meeting_minutes rename column final_text to content_final;
alter table public.meeting_minutes rename column minutes_status to status;

alter table public.meeting_minutes drop constraint meeting_minutes_minutes_status_check;
alter table public.meeting_minutes add constraint meeting_minutes_status_check check (status in ('draft', 'generated', 'ready_for_approval', 'approved'));
alter table public.meeting_minutes alter column status set default 'draft';

alter table public.meeting_minutes add column created_by_user_id uuid references public.users(id) on delete restrict;

-- Create minute_approvals table (PB-027)
create table public.minute_approvals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  minute_id uuid not null references public.meeting_minutes(id) on delete restrict,
  user_id uuid not null references public.users(id) on delete restrict,
  membership_id uuid references public.memberships(id) on delete set null,
  approval_status text not null default 'pending' check (approval_status in ('pending', 'approved', 'rejected')),
  notes text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (minute_id, user_id),
  foreign key (user_id, organization_id) references public.users(id, organization_id)
);

create trigger set_minute_approvals_updated_at before update on public.minute_approvals for each row execute function public.set_updated_at();

-- 2. Row Level Security (RLS)

-- meeting_minutes
-- RLS policies already exist in core schema.

-- minute_approvals
alter table public.minute_approvals enable row level security;
create policy "minute approvals are visible inside organization" on public.minute_approvals for select to authenticated using (organization_id = public.current_organization_id());
create policy "users can update their own approval" on public.minute_approvals for update to authenticated using (
  organization_id = public.current_organization_id() and user_id = auth.uid()
);

-- 3. Automations (PB-026, PB-028)

-- Function and trigger to generate approvals when minute is ready (PB-026)
create or replace function public.on_minute_ready() returns trigger as $$
declare
  v_unit_id uuid;
  v_rule text;
  v_org_id uuid;
begin
  if OLD.status != 'ready_for_approval' and NEW.status = 'ready_for_approval' then
    -- Get Meeting and Unit Info
    select governance_unit_id, organization_id into v_unit_id, v_org_id 
    from public.meetings where id = NEW.meeting_id;
    
    select minute_approval_rule into v_rule 
    from public.governance_units where id = v_unit_id;

    -- Generate approvals based on rule
    if v_rule = 'chair_and_rapporteur' then
      insert into public.minute_approvals (organization_id, minute_id, user_id, membership_id)
      select v_org_id, NEW.id, m.user_id, m.id
      from public.memberships m
      join public.roles r on m.role_id = r.id
      where m.governance_unit_id = v_unit_id 
        and m.membership_status = 'active'
        and r.code in ('council_chair', 'council_rapporteur');

    elsif v_rule = 'all_present_members' then
      insert into public.minute_approvals (organization_id, minute_id, user_id, membership_id)
      select v_org_id, NEW.id, a.user_id, a.membership_id
      from public.attendance_records a
      where a.meeting_id = NEW.meeting_id 
        and a.attendance_status in ('present', 'late');
    end if;

    -- Update meeting status to waiting_for_approval
    update public.meetings set status = 'waiting_for_approval' where id = NEW.meeting_id;
  end if;

  return NEW;
end;
$$ language plpgsql security definer;

create trigger trigger_on_minute_ready
  after update of status on public.meeting_minutes
  for each row execute function public.on_minute_ready();


-- Function and trigger to close meeting when all approvals are met (PB-028)
create or replace function public.on_approval_status_change() returns trigger as $$
declare
  v_total int;
  v_approved int;
  v_meeting_id uuid;
begin
  if NEW.approval_status != OLD.approval_status and NEW.approval_status = 'approved' then
    NEW.resolved_at := now();

    -- Check all approvals for this minute
    select count(*), coalesce(sum(case when approval_status = 'approved' then 1 else 0 end), 0) 
    into v_total, v_approved
    from public.minute_approvals
    where minute_id = NEW.minute_id;

    -- if the current row makes it 100% approved
    if v_total > 0 and (v_approved + 1) >= v_total then
      -- Mark minute as approved
      update public.meeting_minutes set status = 'approved' where id = NEW.minute_id returning meeting_id into v_meeting_id;
      
      -- Close the meeting
      if v_meeting_id is not null then
        update public.meetings set status = 'closed' where id = v_meeting_id;
      end if;
    end if;
  end if;

  return NEW;
end;
$$ language plpgsql security definer;

create trigger trigger_on_approval_status_change
  before update of approval_status on public.minute_approvals
  for each row execute function public.on_approval_status_change();
