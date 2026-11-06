-- Task notification domain events. External delivery remains asynchronous.
-- Impact map: docs/engineering/impact/WHATSAPP_NOTIFICATIONS_AR.md
begin;

grant usage on schema qarar_governance to qarar_execution_executor;
grant insert on qarar_governance.notification_outbox to qarar_execution_executor;
grant select(organization_id,deduplication_key) on qarar_governance.notification_outbox to qarar_execution_executor;

create function qarar_execution.enqueue_action_item_created_notifications()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare r record;
begin
  for r in
    select recipient_user_id,min(recipient_role) as recipient_role
    from (values(new.assigned_user_id,'assignee'),(new.follow_up_user_id,'follower')) recipients(recipient_user_id,recipient_role)
    where recipient_user_id is not null
    group by recipient_user_id
  loop
    insert into qarar_governance.notification_outbox(organization_id,aggregate_type,aggregate_id,event_type,payload,deduplication_key)
    values(new.organization_id,'action_item',new.id,'execution.task.created',jsonb_build_object(
      'action_item_id',new.id,'action_no',new.action_no,'title_ar',new.title_ar,'due_date',new.due_date,
      'recipient_user_id',r.recipient_user_id,'recipient_role',r.recipient_role
    ),'execution.task.created:'||new.id||':'||r.recipient_user_id)
    on conflict(organization_id,deduplication_key) do nothing;
  end loop;
  return new;
end $$;

create trigger action_item_created_notification_events
after insert on qarar_execution.action_items
for each row execute function qarar_execution.enqueue_action_item_created_notifications();

create function qarar_execution.generate_action_item_notification_events(p_as_of date,p_due_soon_days integer)
returns integer language plpgsql security definer set search_path=pg_catalog as $$
declare r record; v_event text; v_count integer:=0;
begin
  if p_as_of is null or p_due_soon_days not between 0 and 30 then
    raise exception using errcode='22023',message='حدد تاريخ تشغيل وفترة تذكير صحيحة';
  end if;
  for r in
    select t.id,t.organization_id,t.action_no,t.title_ar,t.due_date,x.recipient_user_id,min(x.recipient_role) as recipient_role
    from qarar_execution.action_items t
    cross join lateral (values(t.assigned_user_id,'assignee'),(t.follow_up_user_id,'follower')) x(recipient_user_id,recipient_role)
    where t.status in ('new','in_progress','overdue') and t.due_date is not null and x.recipient_user_id is not null
      and t.due_date<=p_as_of+p_due_soon_days
    group by t.id,t.organization_id,t.action_no,t.title_ar,t.due_date,x.recipient_user_id
  loop
    v_event:=case when r.due_date<p_as_of then 'execution.task.overdue' else 'execution.task.due_soon' end;
    insert into qarar_governance.notification_outbox(organization_id,aggregate_type,aggregate_id,event_type,payload,deduplication_key)
    values(r.organization_id,'action_item',r.id,v_event,jsonb_build_object(
      'action_item_id',r.id,'action_no',r.action_no,'title_ar',r.title_ar,'due_date',r.due_date,
      'recipient_user_id',r.recipient_user_id,'recipient_role',r.recipient_role
    ),v_event||':'||r.id||':'||r.recipient_user_id||':'||r.due_date)
    on conflict(organization_id,deduplication_key) do nothing;
    if found then v_count:=v_count+1;end if;
  end loop;
  return v_count;
end $$;

alter function qarar_execution.enqueue_action_item_created_notifications() owner to qarar_execution_executor;
alter function qarar_execution.generate_action_item_notification_events(date,integer) owner to qarar_execution_executor;
revoke all on function qarar_execution.enqueue_action_item_created_notifications(),qarar_execution.generate_action_item_notification_events(date,integer) from public,anon,authenticated,service_role;

insert into qarar_architecture.function_registry(function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate)
select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),'execution','qarar_execution',false from pg_proc p
where p.pronamespace='qarar_execution'::regnamespace and p.proname in ('enqueue_action_item_created_notifications','generate_action_item_notification_events')
on conflict(function_oid) do update set function_name=excluded.function_name,identity_arguments=excluded.identity_arguments,module_code=excluded.module_code,owning_schema=excluded.owning_schema,is_rls_predicate=false;

do $$begin
 if exists(select 1 from pg_extension where extname='pg_cron') then
  perform cron.schedule('qarar-task-notification-events','15 * * * *',
    'select qarar_execution.generate_action_item_notification_events((clock_timestamp() at time zone ''Asia/Riyadh'')::date,3)');
 end if;
end $$;

commit;
