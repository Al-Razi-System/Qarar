-- Restore only events incorrectly claimed by the WhatsApp worker before its
-- dedicated claim contract existed. Safe to run repeatedly.
begin;
with repaired as (
 update qarar_governance.notification_outbox o set
   status='pending',attempts=0,available_at=clock_timestamp(),last_error=null,last_attempt_at=null,
   locked_at=null,locked_by_worker_id=null,lock_token=null,lease_expires_at=null,dead_lettered_at=null
 where o.event_type not in(
   'meeting.invitation.requested','meeting.reminder.due','meeting.cycle.due_soon','meeting.cycle.overdue',
   'execution.task.created','execution.task.due_soon','execution.task.overdue',
   'execution.task.submitted','execution.task.returned','execution.task.completed'
 ) and o.last_error like 'UNSUPPORTED_EVENT:%' and o.status in('failed','dead_letter')
 returning o.id
)
select count(*) as restored_event_count from repaired;
commit;
