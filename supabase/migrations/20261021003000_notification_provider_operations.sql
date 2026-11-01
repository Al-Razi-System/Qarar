-- System-admin provider operations and auditable test delivery lifecycle.
-- Impact map: docs/engineering/impact/WHATSAPP_NOTIFICATIONS_AR.md
begin;

create function qarar_governance.admin_begin_notification_test(p_destination text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,auth as $$
declare
  o uuid:=qarar_iam.current_organization_id();
  u uuid:=auth.uid();
  event_id uuid:=gen_random_uuid();
  delivery_id uuid:=gen_random_uuid();
  token uuid:=gen_random_uuid();
  normalized text:=regexp_replace(coalesce(p_destination,''),'[^0-9+]','','g');
begin
  if not qarar_iam.is_system_admin() then
    raise exception using errcode='42501',message='هذه العملية متاحة لمسؤول النظام فقط';
  end if;
  if normalized !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception using errcode='22023',message='أدخل رقمًا دوليًا صحيحًا يبدأ بعلامة +';
  end if;
  if not exists(select 1 from qarar_iam.users where id=u and organization_id=o and status='active') then
    raise exception using errcode='42501',message='تعذر التحقق من حساب مسؤول النظام';
  end if;

  insert into qarar_governance.notification_outbox(
    id,organization_id,aggregate_type,aggregate_id,event_type,payload,deduplication_key,status,processed_at
  ) values(
    event_id,o,'notification_test',delivery_id,'notification.test.requested',
    jsonb_build_object('recipient_user_id',u,'destination',normalized),
    'notification-test:'||delivery_id::text,'processed',clock_timestamp()
  );

  insert into qarar_governance.notification_deliveries(
    id,organization_id,outbox_event_id,recipient_user_id,channel,template_code,template_version,
    destination,destination_masked,variables,status,attempts,locked_at,locked_by_worker_id,lock_token,lease_expires_at
  ) values(
    delivery_id,o,event_id,u,'whatsapp','notification_test','v1',normalized,
    qarar_governance.mask_notification_destination(normalized),jsonb_build_object('initiated_by',u),
    'processing',1,clock_timestamp(),u,token,clock_timestamp()+interval '5 minutes'
  );

  perform qarar_audit.append_audit_log(o,'notifications.test.started','notification_deliveries',delivery_id,jsonb_build_object('channel','whatsapp'));
  return jsonb_build_object('delivery_id',delivery_id,'completion_token',token,'destination',normalized);
end $$;

create function qarar_governance.admin_finish_notification_test(
  p_delivery_id uuid,p_completion_token uuid,p_succeeded boolean,p_provider_code text,
  p_provider_message_id text default null,p_error_code text default null,p_http_status integer default null
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
  o uuid:=qarar_iam.current_organization_id();
  d qarar_governance.notification_deliveries%rowtype;
  final_status text:=case when p_succeeded then 'accepted' else 'failed' end;
begin
  if not qarar_iam.is_system_admin() then
    raise exception using errcode='42501',message='هذه العملية متاحة لمسؤول النظام فقط';
  end if;
  select * into d from qarar_governance.notification_deliveries
   where id=p_delivery_id and organization_id=o for update;
  if d.id is null or d.template_code<>'notification_test' then
    raise exception using errcode='P0002',message='عملية اختبار الإرسال غير موجودة';
  end if;
  if d.status<>'processing' or d.lock_token is distinct from p_completion_token then
    raise exception using errcode='40001',message='انتهت أو أُغلقت محاولة الاختبار؛ حدّث السجل قبل المحاولة';
  end if;
  if nullif(btrim(p_provider_code),'') is null then
    raise exception using errcode='22023',message='تعذر توثيق مزود الإرسال';
  end if;

  update qarar_governance.notification_deliveries set
    status=final_status,
    provider_code=left(btrim(p_provider_code),50),
    provider_message_id=case when p_succeeded then left(nullif(btrim(p_provider_message_id),''),255) end,
    last_error_code=case when not p_succeeded then left(coalesce(nullif(btrim(p_error_code),''),'PROVIDER_FAILURE'),100) end,
    accepted_at=case when p_succeeded then clock_timestamp() end,
    locked_at=null,locked_by_worker_id=null,lock_token=null,lease_expires_at=null,updated_at=clock_timestamp()
   where id=d.id;

  insert into qarar_governance.notification_delivery_attempts(
    organization_id,delivery_id,attempt_no,outcome,provider_code,provider_message_id,error_code,http_status
  ) values(
    o,d.id,1,case when p_succeeded then 'accepted' else 'failed' end,left(btrim(p_provider_code),50),
    case when p_succeeded then left(nullif(btrim(p_provider_message_id),''),255) end,
    case when not p_succeeded then left(coalesce(nullif(btrim(p_error_code),''),'PROVIDER_FAILURE'),100) end,
    p_http_status
  );
  perform qarar_audit.append_audit_log(o,'notifications.test.'||case when p_succeeded then 'accepted' else 'failed' end,'notification_deliveries',d.id,jsonb_build_object('provider',left(btrim(p_provider_code),50)));
  return jsonb_build_object('delivery_id',d.id,'status',final_status,'provider_message_id',case when p_succeeded then p_provider_message_id end);
end $$;

alter function qarar_governance.admin_get_notification_workspace(integer) rename to admin_get_notification_workspace_settings_base;
update qarar_architecture.function_registry r
set function_name=p.proname,identity_arguments=pg_get_function_identity_arguments(p.oid)
from pg_proc p where p.oid=r.function_oid and p.proname='admin_get_notification_workspace_settings_base';

create function qarar_governance.admin_get_notification_workspace(p_limit integer default 50)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare o uuid:=qarar_iam.current_organization_id();base jsonb;items jsonb;
begin
  if not qarar_iam.is_system_admin() then raise exception using errcode='42501',message='هذه الصفحة متاحة لمسؤول النظام فقط';end if;
  select qarar_governance.admin_get_notification_workspace_settings_base(p_limit) into base;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',d.id,'recipient_name_ar',coalesce(u.full_name_ar,'مستخدم غير متاح'),
    'destination',d.destination,'destination_masked',d.destination_masked,
    'template_code',d.template_code,'template_label',case d.template_code
      when 'notification_test' then 'اختبار اتصال واتساب'
      when 'meeting_invitation' then 'دعوة اجتماع' when 'meeting_reminder' then 'تذكير باجتماع'
      when 'meeting_cycle_due_soon' then 'قرب انتهاء دورة اجتماع' when 'meeting_cycle_overdue' then 'انتهاء دورة اجتماع'
      when 'task_created_assignee' then 'تكليف جديد' when 'task_created_follower' then 'متابعة تكليف جديد'
      when 'task_due_soon' then 'قرب استحقاق تكليف' when 'task_overdue' then 'تكليف متأخر'
      when 'task_submitted' then 'تكليف بانتظار التحقق' when 'task_returned' then 'إعادة تكليف للاستكمال'
      when 'task_completed' then 'اكتمال تكليف' else 'إشعار قرار' end,
    'status_key',case when d.status in('accepted','sent','delivered','read') then 'accepted' when d.status in('queued','retry_wait') then 'queued' when d.status='skipped' then 'skipped' else 'needs_review' end,
    'status_label',case when d.status in('accepted','sent','delivered','read') then 'تم الإرسال' when d.status='queued' then 'بانتظار الإرسال' when d.status='retry_wait' then 'ستعاد المحاولة' when d.status='skipped' then 'تم التجاوز' when d.status='processing' and d.lease_expires_at>=clock_timestamp() then 'جارٍ الإرسال' else 'يحتاج مراجعة' end,
    'error_message',case when d.status in('failed','dead_letter') then case when d.last_error_code like '%AMBIGUOUS' then 'قد تكون الرسالة وصلت؛ تحقق قبل إعادة الإرسال.' else 'تعذر تسليم الرسالة. راجع اتصال الخدمة قبل اتخاذ إجراء.' end end,
    'provider_code',d.provider_code,'provider_message_id',d.provider_message_id,'attempts',d.attempts,
    'created_at',d.created_at,'accepted_at',d.accepted_at,'sent_at',d.sent_at,'delivered_at',d.delivered_at,'read_at',d.read_at
  ) order by d.created_at desc),'[]'::jsonb) into items
  from (select * from qarar_governance.notification_deliveries where organization_id=o order by created_at desc limit p_limit) d
  left join qarar_iam.users u on u.id=d.recipient_user_id and u.organization_id=d.organization_id;
  return base||jsonb_build_object('deliveries',items);
end $$;

create function api_v1.admin_begin_notification_test(p_destination text) returns jsonb
language sql security definer set search_path=pg_catalog as $$select qarar_governance.admin_begin_notification_test(p_destination)$$;
create function api_v1.admin_finish_notification_test(p_delivery_id uuid,p_completion_token uuid,p_succeeded boolean,p_provider_code text,p_provider_message_id text default null,p_error_code text default null,p_http_status integer default null) returns jsonb
language sql security definer set search_path=pg_catalog as $$select qarar_governance.admin_finish_notification_test(p_delivery_id,p_completion_token,p_succeeded,p_provider_code,p_provider_message_id,p_error_code,p_http_status)$$;

alter function qarar_governance.admin_begin_notification_test(text) owner to qarar_governance_executor;
alter function qarar_governance.admin_finish_notification_test(uuid,uuid,boolean,text,text,text,integer) owner to qarar_governance_executor;
alter function qarar_governance.admin_get_notification_workspace(integer) owner to qarar_governance_executor;
alter function api_v1.admin_begin_notification_test(text) owner to qarar_api_executor;
alter function api_v1.admin_finish_notification_test(uuid,uuid,boolean,text,text,text,integer) owner to qarar_api_executor;
revoke all on function qarar_governance.admin_begin_notification_test(text),qarar_governance.admin_finish_notification_test(uuid,uuid,boolean,text,text,text,integer),qarar_governance.admin_get_notification_workspace(integer) from public,anon,authenticated,service_role;
grant execute on function qarar_governance.admin_begin_notification_test(text),qarar_governance.admin_finish_notification_test(uuid,uuid,boolean,text,text,text,integer),qarar_governance.admin_get_notification_workspace(integer) to qarar_api_executor;
revoke all on function api_v1.admin_begin_notification_test(text),api_v1.admin_finish_notification_test(uuid,uuid,boolean,text,text,text,integer) from public,anon;
grant execute on function api_v1.admin_begin_notification_test(text),api_v1.admin_finish_notification_test(uuid,uuid,boolean,text,text,text,integer) to authenticated;

insert into qarar_architecture.function_registry(function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate)
select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),'governance','qarar_governance',false from pg_proc p where p.oid in(
 'qarar_governance.admin_begin_notification_test(text)'::regprocedure,
 'qarar_governance.admin_finish_notification_test(uuid,uuid,boolean,text,text,text,integer)'::regprocedure,
 'qarar_governance.admin_get_notification_workspace(integer)'::regprocedure
);
insert into qarar_architecture.api_contract_registry(api_version,contract_name,implementation_schema,implementation_name,identity_arguments,module_code,audience) values
('v1','admin_begin_notification_test','qarar_governance','admin_begin_notification_test','p_destination text','governance','authenticated'),
('v1','admin_finish_notification_test','qarar_governance','admin_finish_notification_test','p_delivery_id uuid, p_completion_token uuid, p_succeeded boolean, p_provider_code text, p_provider_message_id text, p_error_code text, p_http_status integer','governance','authenticated');
update qarar_architecture.api_release_registry r set contract_count=(select count(*) from qarar_architecture.api_contract_registry where api_version='v1'),contract_hash=(select md5(string_agg(p.proname||'|'||pg_get_function_identity_arguments(p.oid)||'|'||pg_get_function_result(p.oid)||'|'||c.audience,E'\n' order by p.proname,pg_get_function_identity_arguments(p.oid))) from pg_proc p join pg_namespace n on n.oid=p.pronamespace and n.nspname='api_v1' join qarar_architecture.api_contract_registry c on c.api_version='v1' and c.contract_name=p.proname and c.identity_arguments=pg_get_function_identity_arguments(p.oid)) where r.api_version='v1';

notify pgrst,'reload schema';
commit;
