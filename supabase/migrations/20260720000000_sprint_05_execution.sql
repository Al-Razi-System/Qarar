-- Migration for Sprint 05: Decisions & Execution (PB-030 to PB-036)

-- 1. PB-031: Decision Status Transitions (Guard)
create or replace function public.guard_decision_status_transitions() returns trigger as $$
begin
  if OLD.decision_status = NEW.decision_status then
    return NEW;
  end if;

  -- Allowed Transitions Mapping
  if OLD.decision_status = 'draft' and NEW.decision_status not in ('under_review', 'ready_for_approval', 'approved', 'cancelled') then
    raise exception 'Invalid decision transition from % to %', OLD.decision_status, NEW.decision_status;
  elsif OLD.decision_status = 'under_review' and NEW.decision_status not in ('ready_for_approval', 'draft', 'cancelled') then
    raise exception 'Invalid decision transition from % to %', OLD.decision_status, NEW.decision_status;
  elsif OLD.decision_status = 'ready_for_approval' and NEW.decision_status not in ('approved', 'rejected', 'draft') then
    raise exception 'Invalid decision transition from % to %', OLD.decision_status, NEW.decision_status;
  elsif OLD.decision_status = 'approved' and NEW.decision_status not in ('sent_to_execution', 'under_follow_up', 'closed', 'cancelled') then
    raise exception 'Invalid decision transition from % to %', OLD.decision_status, NEW.decision_status;
  elsif OLD.decision_status = 'sent_to_execution' and NEW.decision_status not in ('under_follow_up', 'closed', 'cancelled') then
    raise exception 'Invalid decision transition from % to %', OLD.decision_status, NEW.decision_status;
  elsif OLD.decision_status = 'under_follow_up' and NEW.decision_status not in ('closed', 'cancelled') then
    raise exception 'Invalid decision transition from % to %', OLD.decision_status, NEW.decision_status;
  elsif OLD.decision_status in ('closed', 'cancelled', 'rejected') then
    raise exception 'Cannot transition decision from final status %', OLD.decision_status;
  end if;

  return NEW;
end;
$$ language plpgsql security definer;

create trigger enforce_decision_status_transitions
  before update of decision_status on public.decisions
  for each row execute function public.guard_decision_status_transitions();

-- 2. PB-031: Decision Status History Audit
create or replace function public.audit_decision_status_history() returns trigger as $$
begin
  if OLD.decision_status != NEW.decision_status then
    insert into public.decision_status_history (
      organization_id,
      decision_id,
      from_status,
      to_status,
      changed_by_user_id
    ) values (
      NEW.organization_id,
      NEW.id,
      OLD.decision_status,
      NEW.decision_status,
      auth.uid()
    );
  end if;
  return NEW;
end;
$$ language plpgsql security definer;

create trigger trg_audit_decision_status_history
  after update of decision_status on public.decisions
  for each row execute function public.audit_decision_status_history();

-- 3. PB-034: Action Item Creation Constraints (Guard)
create or replace function public.check_action_item_creation() returns trigger as $$
declare
  v_decision_status text;
begin
  select decision_status into v_decision_status from public.decisions where id = NEW.decision_id;

  if v_decision_status not in ('approved', 'sent_to_execution', 'under_follow_up') then
    raise exception 'Cannot create an action item for a decision in % status. Decision must be approved or sent to execution.', v_decision_status;
  end if;

  return NEW;
end;
$$ language plpgsql security definer;

create trigger trg_check_action_item_creation
  before insert on public.action_items
  for each row execute function public.check_action_item_creation();

-- 4. PB-036: Auto-follow-up when Execution Starts
create or replace function public.auto_update_decision_follow_up() returns trigger as $$
begin
  if (NEW.status = 'in_progress' and (TG_OP = 'INSERT' or OLD.status != 'in_progress')) or 
     (NEW.progress_percent > 0 and (TG_OP = 'INSERT' or OLD.progress_percent = 0)) then
    
    -- Update parent decision if it's not already in under_follow_up or closed
    update public.decisions 
    set decision_status = 'under_follow_up' 
    where id = NEW.decision_id 
      and decision_status in ('approved', 'sent_to_execution');
      
  end if;

  return NEW;
end;
$$ language plpgsql security definer;

create trigger trg_auto_update_decision_follow_up
  after insert or update on public.action_items
  for each row execute function public.auto_update_decision_follow_up();
