-- Keep the notification workspace directly anchored to its guarded operational
-- delivery reader while layering the new meeting templates and reason copy.
-- Impact map: docs/engineering/impact/WHATSAPP_MESSAGE_CONTENT_20261027_AR.md
begin;

create or replace function qarar_governance.admin_get_notification_workspace(p_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  o uuid := qarar_iam.current_organization_id();
  base jsonb;
  templates jsonb;
  added_templates jsonb;
  deliveries jsonb;
begin
  if not qarar_iam.is_system_admin() then
    raise exception using errcode='42501',message='هذه الصفحة متاحة لمسؤول النظام فقط';
  end if;

  base := qarar_governance.admin_get_notification_workspace_delivery_reason_base(p_limit);

  select jsonb_agg(jsonb_build_object(
    'code',v.code,'label',v.label,'description',v.description,
    'enabled',coalesce(t.enabled,true),'custom_intro',t.custom_intro,'custom_action',t.custom_action
  ) order by v.ord) into added_templates
  from (values
    (1,'meeting_postponed','تأجيل أو تعديل موعد اجتماع','إبلاغ المدعوين بالموعد المحدّث.'),
    (2,'meeting_cancelled','إلغاء اجتماع','إبلاغ المدعوين بإلغاء الاجتماع.'),
    (3,'meeting_invitation_updated','تحديث دعوة اجتماع','إبلاغ المدعوين بتغيير جدول الأعمال.')
  ) v(ord,code,label,description)
  left join qarar_governance.notification_template_settings t
    on t.organization_id=o and t.template_code=v.code;
  templates := coalesce(base->'templates','[]'::jsonb)||coalesce(added_templates,'[]'::jsonb);

  select coalesce(jsonb_agg(item || jsonb_build_object(
    'template_label',case item->>'template_code'
      when 'meeting_postponed' then 'تأجيل أو تعديل موعد اجتماع'
      when 'meeting_cancelled' then 'إلغاء اجتماع'
      when 'meeting_invitation_updated' then 'تحديث دعوة اجتماع'
      else item->>'template_label' end,
    'error_message',case
      when d.status='skipped' and d.last_error_code='DESTINATION_INVALID'
        then 'لم يُرسل الإشعار لأن المستخدم لا يملك رقم جوال صالحًا.'
      when d.status in('failed','dead_letter') and d.last_error_code='OPENWA_HTTP_400'
        then 'رفض واتساب رقم المستلم؛ تحقق من الرقم وأنه مرتبط بحساب واتساب.'
      else item->>'error_message' end
  ) order by ordinal),'[]'::jsonb) into deliveries
  from jsonb_array_elements(coalesce(base->'deliveries','[]'::jsonb)) with ordinality source(item,ordinal)
  left join qarar_governance.notification_deliveries d on d.id=(item->>'id')::uuid;

  return base||jsonb_build_object('templates',templates,'deliveries',deliveries);
end
$$;

alter function qarar_governance.admin_get_notification_workspace(integer)
  owner to qarar_governance_executor;
revoke all on function qarar_governance.admin_get_notification_workspace(integer)
  from public,anon,authenticated,service_role;
grant execute on function qarar_governance.admin_get_notification_workspace(integer)
  to qarar_api_executor;

update qarar_architecture.function_registry
set function_name='admin_get_notification_workspace',
    identity_arguments='p_limit integer',
    module_code='governance',
    owning_schema='qarar_governance',
    is_rls_predicate=false
where function_oid='qarar_governance.admin_get_notification_workspace(integer)'::regprocedure;

notify pgrst,'reload schema';
commit;
