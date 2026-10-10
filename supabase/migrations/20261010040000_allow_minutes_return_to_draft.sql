-- Returning the minutes from approval to draft failed every time: the approver's
-- return moves the meeting from waiting_for_approval back to waiting_for_minutes,
-- but the status guard only allowed waiting_for_approval -> closed, so the whole
-- operation was rejected with a raw English error. Allow that one backward edge;
-- every other transition is unchanged.
-- Impact map: docs/engineering/impact/MINUTES_RETURN_FIX_AR.md
begin;

CREATE OR REPLACE FUNCTION qarar_meetings.guard_meeting_status_transitions()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
  -- An approver may return the minutes for correction (respond_meeting_minutes_approval).
  elsif OLD.status = 'waiting_for_approval' and NEW.status not in ('closed', 'waiting_for_minutes') then
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
$function$;

commit;
