-- Read-only, tenant-scoped monitoring surface for the first notification admin UI.
-- Impact map: docs/engineering/impact/WHATSAPP_NOTIFICATIONS_AR.md
begin;

create function qarar_governance.admin_get_notification_workspace(p_limit integer default 50)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare v_org uuid:=qarar_iam.current_organization_id(); v_items jsonb; v_summary jsonb;
begin
 if not qarar_iam.is_system_admin() then raise exception using errcode='42501',message='هذه الصفحة متاحة لمسؤول النظام فقط';end if;
 if p_limit is null or p_limit not between 1 and 100 then raise exception using errcode='22023',message='حدد عدد سجلات بين 1 و100';end if;

 select jsonb_build_object(
  'total',count(*),
  'accepted',count(*) filter(where status in('accepted','sent','delivered','read')),
  'queued',count(*) filter(where status in('queued','retry_wait')),
  'needs_review',count(*) filter(where status in('failed','dead_letter') or(status='processing' and lease_expires_at<clock_timestamp())),
  'skipped',count(*) filter(where status='skipped'),
  'last_accepted_at',max(accepted_at)
 ) into v_summary from qarar_governance.notification_deliveries where organization_id=v_org;

 select coalesce(jsonb_agg(jsonb_build_object(
  'id',d.id,
  'recipient_name_ar',coalesce(u.full_name_ar,'مستخدم غير متاح'),
  'destination_masked',d.destination_masked,
  'template_code',d.template_code,
  'template_label',case d.template_code
   when 'meeting_invitation' then 'دعوة اجتماع' when 'meeting_reminder' then 'تذكير باجتماع'
   when 'meeting_cycle_due_soon' then 'قرب انتهاء دورة اجتماع' when 'meeting_cycle_overdue' then 'انتهاء دورة اجتماع'
   when 'task_created_assignee' then 'تكليف جديد' when 'task_created_follower' then 'متابعة تكليف جديد'
   when 'task_due_soon' then 'قرب استحقاق تكليف' when 'task_overdue' then 'تكليف متأخر'
   when 'task_submitted' then 'تكليف بانتظار التحقق' when 'task_returned' then 'إعادة تكليف للاستكمال'
   when 'task_completed' then 'اكتمال تكليف' else 'إشعار قرار' end,
  'status_key',case when d.status in('accepted','sent','delivered','read') then 'accepted'
   when d.status in('queued','retry_wait') then 'queued'
   when d.status='skipped' then 'skipped' else 'needs_review' end,
  'status_label',case when d.status in('accepted','sent','delivered','read') then 'تم الإرسال'
   when d.status='queued' then 'بانتظار الإرسال' when d.status='retry_wait' then 'ستعاد المحاولة'
   when d.status='skipped' then 'تم التجاوز' when d.status='processing' and d.lease_expires_at>=clock_timestamp() then 'جارٍ الإرسال'
   else 'يحتاج مراجعة' end,
  'error_message',case when d.status in('failed','dead_letter') then
    case when d.last_error_code like '%AMBIGUOUS' then 'قد تكون الرسالة وصلت؛ تحقق قبل إعادة الإرسال.'
      else 'تعذر تسليم الرسالة. راجع اتصال الخدمة قبل اتخاذ إجراء.' end end,
  'created_at',d.created_at,
  'accepted_at',d.accepted_at
 ) order by d.created_at desc),'[]'::jsonb) into v_items
 from (select * from qarar_governance.notification_deliveries where organization_id=v_org order by created_at desc limit p_limit) d
 left join qarar_iam.users u on u.id=d.recipient_user_id and u.organization_id=d.organization_id;

 return jsonb_build_object(
  'channel',jsonb_build_object('code','whatsapp','label','واتساب','connection_evidence',case when (v_summary->>'accepted')::integer>0 then 'messages_accepted' else 'not_verified' end,'last_accepted_at',v_summary->'last_accepted_at'),
  'summary',v_summary-'last_accepted_at',
  'deliveries',v_items
 );
end $$;

create function api_v1.admin_get_notification_workspace(p_limit integer default 50)
returns jsonb language sql stable security definer set search_path=pg_catalog as
$$select qarar_governance.admin_get_notification_workspace(p_limit)$$;

alter function qarar_governance.admin_get_notification_workspace(integer) owner to qarar_governance_executor;
alter function api_v1.admin_get_notification_workspace(integer) owner to qarar_api_executor;
revoke all on function qarar_governance.admin_get_notification_workspace(integer) from public,anon,authenticated,service_role;
grant execute on function qarar_governance.admin_get_notification_workspace(integer) to qarar_api_executor;
revoke all on function api_v1.admin_get_notification_workspace(integer) from public,anon;
grant execute on function api_v1.admin_get_notification_workspace(integer) to authenticated;

insert into qarar_architecture.function_registry(function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate)
select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),'governance','qarar_governance',false from pg_proc p where p.oid='qarar_governance.admin_get_notification_workspace(integer)'::regprocedure;
insert into qarar_architecture.api_contract_registry(api_version,contract_name,implementation_schema,implementation_name,identity_arguments,module_code,audience)
values('v1','admin_get_notification_workspace','qarar_governance','admin_get_notification_workspace','p_limit integer','governance','authenticated');
update qarar_architecture.api_release_registry r set contract_count=(select count(*) from qarar_architecture.api_contract_registry where api_version='v1'),
 contract_hash=(select md5(string_agg(p.proname||'|'||pg_get_function_identity_arguments(p.oid)||'|'||pg_get_function_result(p.oid)||'|'||c.audience,E'\n' order by p.proname,pg_get_function_identity_arguments(p.oid))) from pg_proc p join pg_namespace n on n.oid=p.pronamespace and n.nspname='api_v1' join qarar_architecture.api_contract_registry c on c.api_version='v1' and c.contract_name=p.proname and c.identity_arguments=pg_get_function_identity_arguments(p.oid)) where r.api_version='v1';

notify pgrst,'reload schema';
commit;
