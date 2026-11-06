-- Make existing idempotent schedulers honor each organization's reminder policy.
begin;
do $$
declare d text;
begin
 select pg_get_functiondef('qarar_meetings.generate_meeting_notification_events(date,integer)'::regprocedure) into d;
 d:=replace(d,'m.scheduled_date between p_as_of and p_as_of+p_reminder_days','m.scheduled_date between p_as_of and p_as_of+coalesce((select s.meeting_reminder_days from qarar_governance.notification_settings s where s.organization_id=m.organization_id),p_reminder_days)');
 d:=replace(d,'m.planned_window_end<=p_as_of+p_reminder_days','m.planned_window_end<=p_as_of+coalesce((select s.meeting_reminder_days from qarar_governance.notification_settings s where s.organization_id=m.organization_id),p_reminder_days)');
 if position('notification_settings' in d)=0 then raise exception 'meeting reminder generator shape changed';end if;
 execute d;
 select pg_get_functiondef('qarar_execution.generate_action_item_notification_events(date,integer)'::regprocedure) into d;
 d:=replace(d,'t.due_date<=p_as_of+p_due_soon_days','t.due_date<=p_as_of+coalesce((select s.task_due_soon_days from qarar_governance.notification_settings s where s.organization_id=t.organization_id),p_due_soon_days)');
 if position('notification_settings' in d)=0 then raise exception 'task reminder generator shape changed';end if;
 execute d;
end $$;
commit;
