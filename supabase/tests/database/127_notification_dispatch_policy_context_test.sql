-- The service dispatch context must enforce the saved tenant channel/template policy.
-- Impact map: docs/engineering/impact/NOTIFICATION_DISPATCH_POLICY_CONTEXT_20261026_AR.md
begin;
create extension if not exists pgtap;
select plan(6);

insert into qarar_core.organizations(id,code,name_ar)
values('ba000000-0000-0000-0000-000000000001','s127','Dispatch policy context');
insert into auth.users(id,email)
values('ba000000-0000-0000-0000-000000000011','recipient@s127.test');
insert into qarar_iam.users(id,organization_id,email,full_name_ar,mobile)
values(
 'ba000000-0000-0000-0000-000000000011',
 'ba000000-0000-0000-0000-000000000001',
 'recipient@s127.test',
 'مستلم السياسة',
 '+967771234567'
);
insert into qarar_governance.notification_settings(
 organization_id,whatsapp_enabled,meeting_reminder_days,task_due_soon_days
) values('ba000000-0000-0000-0000-000000000001',false,2,3);
insert into qarar_governance.notification_template_settings(
 organization_id,template_code,enabled,custom_intro,custom_action
) values(
 'ba000000-0000-0000-0000-000000000001',
 'task_created_assignee',
 false,
 'مقدمة مخصصة للاختبار',
 'إجراء مخصص للاختبار'
);
insert into qarar_governance.notification_outbox(
 id,organization_id,aggregate_type,aggregate_id,event_type,payload,deduplication_key,
 status,attempts,locked_at,locked_by_worker_id,lock_token,lease_expires_at,last_attempt_at
) values(
 'ba000000-0000-0000-0000-000000000021',
 'ba000000-0000-0000-0000-000000000001',
 'action_item',
 'ba000000-0000-0000-0000-000000000031',
 'execution.task.created',
 '{"recipient_user_id":"ba000000-0000-0000-0000-000000000011","recipient_role":"assignee","action_no":"TSK-127","title_ar":"اختبار السياسة"}',
 's127',
 'processing',
 1,
 clock_timestamp(),
 'ba000000-0000-0000-0000-000000000041',
 'ba000000-0000-0000-0000-000000000051',
 clock_timestamp()+interval '5 minutes',
 clock_timestamp()
);

select ok(
 has_function_privilege('service_role','api_v1.service_get_notification_dispatch_context(uuid,uuid)','execute')
 and not has_function_privilege('authenticated','api_v1.service_get_notification_dispatch_context(uuid,uuid)','execute'),
 'dispatch context remains service-only'
);

set local role service_role;
set local "request.jwt.claims" to '{"role":"service_role"}';

select is(
 (api_v1.service_get_notification_dispatch_context(
  'ba000000-0000-0000-0000-000000000021',
  'ba000000-0000-0000-0000-000000000051'
 )->>'organization_id')::uuid,
 'ba000000-0000-0000-0000-000000000001'::uuid,
 'policy is resolved in the leased event organization'
);
select is(
 api_v1.service_get_notification_dispatch_context(
  'ba000000-0000-0000-0000-000000000021',
  'ba000000-0000-0000-0000-000000000051'
 )->>'channel_enabled','false','disabled WhatsApp channel reaches the worker'
);
select is(
 api_v1.service_get_notification_dispatch_context(
  'ba000000-0000-0000-0000-000000000021',
  'ba000000-0000-0000-0000-000000000051'
 )->>'event_enabled','false','disabled template reaches the worker'
);
select is(
 api_v1.service_get_notification_dispatch_context(
  'ba000000-0000-0000-0000-000000000021',
  'ba000000-0000-0000-0000-000000000051'
 )->>'custom_intro','مقدمة مخصصة للاختبار','custom introduction reaches the worker'
);
select is(
 api_v1.service_get_notification_dispatch_context(
  'ba000000-0000-0000-0000-000000000021',
  'ba000000-0000-0000-0000-000000000051'
 )->>'custom_action','إجراء مخصص للاختبار','custom action reaches the worker'
);

select * from finish();
rollback;
