-- Expose the meeting-scoped marker so the dashboard does not link a private direct topic into the governed topic workspace.
begin;
create or replace function qarar_meetings.get_meeting_detail(p_meeting_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_detail jsonb;v_can_direct boolean;
begin
  v_detail:=qarar_meetings.get_meeting_detail_before_direct_topics(p_meeting_id);
  v_can_direct:=coalesce(v_detail->>'status','') in('draft','scheduled')
    and qarar_iam.has_unit_role_code((v_detail->>'governance_unit_id')::uuid,array['council_chair']);
  v_detail:=jsonb_set(v_detail,'{capabilities,can_add_direct_topic}',to_jsonb(v_can_direct),true);
  return jsonb_set(v_detail,'{agenda_items}',coalesce((
    select jsonb_agg(jsonb_set(item,'{topic}',(item->'topic')||jsonb_build_object('is_direct',t.meeting_scope_id is not null))
      order by (item->>'agenda_order')::integer)
    from jsonb_array_elements(v_detail->'agenda_items') item
    join qarar_topics.topics t on t.id=(item#>>'{topic,id}')::uuid and t.organization_id=qarar_iam.current_organization_id()
  ),'[]'::jsonb),true);
end;
$$;
alter function qarar_meetings.get_meeting_detail(uuid) owner to qarar_meetings_executor;
notify pgrst,'reload schema';
commit;
