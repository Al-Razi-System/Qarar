-- Each committed task transition is its own notification event. The task row lock
-- serializes transitions; a transaction rollback also rolls back its event.
begin;

create or replace function qarar_execution.enqueue_action_item_transition_notifications()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare r record; v_event text; v_transition_id uuid:=gen_random_uuid();
begin
  if old.status=new.status then return new;end if;
  v_event:=case
    when new.status='submitted' then 'execution.task.submitted'
    when old.status='submitted' and new.status='in_progress' then 'execution.task.returned'
    when new.status='completed' then 'execution.task.completed'
    else null end;
  if v_event is null then return new;end if;

  for r in
    select recipient_user_id,min(recipient_role) recipient_role
    from (
      select new.assigned_user_id recipient_user_id,'assignee'::text recipient_role
      where v_event in('execution.task.returned','execution.task.completed')
      union all
      select new.follow_up_user_id,'follower'::text
      where v_event in('execution.task.submitted','execution.task.completed')
    ) recipients where recipient_user_id is not null group by recipient_user_id
  loop
    insert into qarar_governance.notification_outbox(organization_id,aggregate_type,aggregate_id,event_type,payload,deduplication_key)
    values(new.organization_id,'action_item',new.id,v_event,jsonb_build_object(
      'action_item_id',new.id,'action_no',new.action_no,'title_ar',new.title_ar,'due_date',new.due_date,
      'recipient_user_id',r.recipient_user_id,'recipient_role',r.recipient_role,'transition_id',v_transition_id
    ),v_event||':'||new.id||':'||r.recipient_user_id||':'||v_transition_id)
    on conflict(organization_id,deduplication_key) do nothing;
  end loop;
  return new;
end $$;

alter function qarar_execution.enqueue_action_item_transition_notifications() owner to qarar_execution_executor;
revoke all on function qarar_execution.enqueue_action_item_transition_notifications() from public,anon,authenticated,service_role;

commit;
