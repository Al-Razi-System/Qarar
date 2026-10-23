-- Notification settings are tenant-scoped, atomic, audited and enforced at dispatch.
begin;
create extension if not exists pgtap;
select plan(14);

select has_table('qarar_governance','notification_settings','organization notification policy exists');
select has_table('qarar_governance','notification_template_settings','per-template policy exists');
select has_function('api_v1','admin_save_notification_settings',array['boolean','integer','integer','jsonb','integer'],'atomic save contract exists');
select function_returns('api_v1','admin_save_notification_settings',array['boolean','integer','integer','jsonb','integer'],'jsonb','save returns versioned policy');
select ok(has_function_privilege('authenticated','api_v1.admin_save_notification_settings(boolean,integer,integer,jsonb,integer)','execute'),'authenticated reaches contextual guard');
select ok(not has_function_privilege('anon','api_v1.admin_save_notification_settings(boolean,integer,integer,jsonb,integer)','execute'),'anonymous is denied');
select matches((select prosrc from pg_proc where oid='qarar_governance.admin_save_notification_settings(boolean,integer,integer,jsonb,integer)'::regprocedure),'is_system_admin','save enforces system admin');
select matches((select prosrc from pg_proc where oid='qarar_governance.admin_save_notification_settings(boolean,integer,integer,jsonb,integer)'::regprocedure),'p_expected_version','save detects stale editors');
select matches((select prosrc from pg_proc where oid='qarar_governance.admin_save_notification_settings(boolean,integer,integer,jsonb,integer)'::regprocedure),'append_audit_log','save is audited');
select matches((select prosrc from pg_proc where oid='qarar_governance.get_notification_dispatch_context(uuid,uuid)'::regprocedure),'channel_enabled','dispatcher receives channel policy');
select matches((select prosrc from pg_proc where oid='qarar_governance.get_notification_dispatch_context(uuid,uuid)'::regprocedure),'custom_intro','dispatcher receives safe template customization');
select ok((select relrowsecurity from pg_class where oid='qarar_governance.notification_settings'::regclass),'settings use RLS');
select matches((select prosrc from pg_proc where oid='qarar_meetings.generate_meeting_notification_events(date,integer)'::regprocedure),'meeting_reminder_days','meeting scheduler uses organization policy');
select matches((select prosrc from pg_proc where oid='qarar_execution.generate_action_item_notification_events(date,integer)'::regprocedure),'task_due_soon_days','task scheduler uses organization policy');

select * from finish();
rollback;
