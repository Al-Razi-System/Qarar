-- The direct-topic action is a contextual chair authority, not a global agenda permission.
begin;

create or replace function qarar_meetings.search_eligible_agenda_topics(
  p_meeting_id uuid,p_query text default null,p_limit integer default 25,p_offset integer default 0
) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_meeting qarar_meetings.meetings%rowtype;
begin
  select * into v_meeting from qarar_meetings.meetings
  where id=p_meeting_id and organization_id=qarar_iam.current_organization_id();
  if v_meeting.id is null then raise exception using errcode='P0002',message='الاجتماع غير موجود.';end if;
  if v_meeting.governance_mode='custom' then
    if not qarar_iam.has_unit_role_code(v_meeting.governance_unit_id,array['council_chair']) then
      perform qarar_iam.assert_permission('agenda.manage',v_meeting.governance_unit_id);
    end if;
    return jsonb_build_object('items','[]'::jsonb,'total',0,'locked',v_meeting.status not in('draft','scheduled'),
      'limit',least(greatest(coalesce(p_limit,25),1),100),'offset',greatest(coalesce(p_offset,0),0));
  end if;
  perform qarar_iam.assert_permission('agenda.manage',v_meeting.governance_unit_id);
  return qarar_meetings.search_eligible_agenda_topics_governed_core(p_meeting_id,p_query,p_limit,p_offset);
end;
$$;
alter function qarar_meetings.search_eligible_agenda_topics(uuid,text,integer,integer) owner to qarar_meetings_executor;

create or replace function qarar_meetings.get_meeting_detail(p_meeting_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_detail jsonb;v_can_direct boolean;
begin
  v_detail:=qarar_meetings.get_meeting_detail_before_direct_topics(p_meeting_id);
  v_can_direct:=coalesce(v_detail->>'governance_mode','governed')='custom'
    and coalesce(v_detail->>'status','') in('draft','scheduled')
    and qarar_iam.has_unit_role_code((v_detail->>'governance_unit_id')::uuid,array['council_chair']);
  return jsonb_set(v_detail,'{capabilities,can_add_direct_topic}',to_jsonb(v_can_direct),true);
end;
$$;
alter function qarar_meetings.get_meeting_detail(uuid) owner to qarar_meetings_executor;

notify pgrst,'reload schema';
commit;
