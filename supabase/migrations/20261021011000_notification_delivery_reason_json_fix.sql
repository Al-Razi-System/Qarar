-- Correct the JSON/text branch type in the delivery reason enrichment added
-- by the preceding forward migration.
-- Impact map: docs/engineering/impact/WHATSAPP_NOTIFICATIONS_AR.md
begin;

create or replace function qarar_governance.admin_get_notification_workspace(p_limit integer default 50)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare
  base jsonb;
  enriched jsonb;
begin
  base:=qarar_governance.admin_get_notification_workspace_delivery_reason_base(p_limit);
  select coalesce(jsonb_agg(item || jsonb_build_object(
    'error_message',case
      when d.status='skipped' and d.last_error_code='DESTINATION_INVALID'
        then 'لم يُرسل الإشعار لأن المستخدم لا يملك رقم جوال صالحًا.'
      when d.status in('failed','dead_letter') and d.last_error_code='OPENWA_HTTP_400'
        then 'رفض واتساب رقم المستلم؛ تحقق من الرقم وأنه مرتبط بحساب واتساب.'
      else item->>'error_message'
    end
  ) order by ord),'[]'::jsonb) into enriched
  from jsonb_array_elements(coalesce(base->'deliveries','[]'::jsonb)) with ordinality entries(item,ord)
  left join qarar_governance.notification_deliveries d on d.id=(item->>'id')::uuid;
  return jsonb_set(base,'{deliveries}',enriched,true);
end $$;

alter function qarar_governance.admin_get_notification_workspace(integer) owner to qarar_governance_executor;
notify pgrst,'reload schema';
commit;
