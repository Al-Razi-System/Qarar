begin;
-- Preserve search authorization and v1 signature; add window metadata and interval overlap.
CREATE OR REPLACE FUNCTION qarar_meetings.search_meetings(p_query text DEFAULT NULL::text, p_status text DEFAULT NULL::text, p_unit_id uuid DEFAULT NULL::uuid, p_from_date date DEFAULT NULL::date, p_to_date date DEFAULT NULL::date, p_limit integer DEFAULT 25, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_org uuid:=qarar_iam.current_organization_id();v_limit int:=least(greatest(coalesce(p_limit,25),1),100);v_offset int:=greatest(coalesce(p_offset,0),0);
begin
 if v_org is null then raise exception 'active authenticated account is required' using errcode='42501'; end if;
 return jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(x) order by x.scheduled_date desc,x.created_at desc) from(
  select m.id,m.meeting_no,m.title_ar,m.title_en,m.scheduled_date,m.planned_window_start,m.planned_window_end,m.schedule_date_confirmed,m.start_time,m.end_time,m.location_type,m.status,m.updated_at,m.created_at,
   gu.id governance_unit_id,gu.name_ar governance_unit_name_ar,mt.id meeting_type_id,mt.name_ar meeting_type_name_ar,
   (select count(*) from qarar_meetings.agenda_items ai where ai.meeting_id=m.id) agenda_item_count
  from qarar_meetings.meetings m join qarar_core.governance_units gu on gu.id=m.governance_unit_id left join qarar_meetings.meeting_types mt on mt.id=m.meeting_type_id
  where m.organization_id=v_org and (qarar_iam.is_system_admin() or m.created_by_user_id=auth.uid()
   or qarar_iam.has_permission('meetings.read',m.governance_unit_id) or qarar_iam.has_permission('meetings.manage',m.governance_unit_id))
   and (p_status is null or m.status=p_status) and (p_unit_id is null or m.governance_unit_id=p_unit_id)
   and (p_from_date is null or coalesce(m.planned_window_end,m.scheduled_date)>=p_from_date) and (p_to_date is null or coalesce(m.planned_window_start,m.scheduled_date)<=p_to_date)
   and (nullif(btrim(p_query),'') is null or m.meeting_no ilike '%'||btrim(p_query)||'%' or m.title_ar ilike '%'||btrim(p_query)||'%')
  order by m.scheduled_date desc,m.created_at desc limit v_limit offset v_offset)x),'[]'::jsonb),
  'total',(select count(*) from qarar_meetings.meetings m where m.organization_id=v_org
   and (qarar_iam.is_system_admin() or m.created_by_user_id=auth.uid() or qarar_iam.has_permission('meetings.read',m.governance_unit_id) or qarar_iam.has_permission('meetings.manage',m.governance_unit_id))
   and (p_status is null or m.status=p_status) and (p_unit_id is null or m.governance_unit_id=p_unit_id)
   and (p_from_date is null or coalesce(m.planned_window_end,m.scheduled_date)>=p_from_date) and (p_to_date is null or coalesce(m.planned_window_start,m.scheduled_date)<=p_to_date)
   and (nullif(btrim(p_query),'') is null or m.meeting_no ilike '%'||btrim(p_query)||'%' or m.title_ar ilike '%'||btrim(p_query)||'%')),
  'limit',v_limit,'offset',v_offset);
end $function$;


notify pgrst,'reload schema';
commit;
