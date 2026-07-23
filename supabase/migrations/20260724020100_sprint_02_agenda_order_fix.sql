-- Keep agenda ordering valid while avoiding transient unique-key collisions.

create or replace function public.reorder_agenda_items(
 p_meeting_id uuid,p_ordered_item_ids uuid[],p_expected_meeting_updated_at timestamptz
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_m public.meetings%rowtype;v_count int;v_offset int;
begin
 select * into v_m from public.meetings where id=p_meeting_id and organization_id=public.current_organization_id() for update;
 if v_m.id is null then raise exception 'meeting not found'; end if;
 perform public.assert_permission('agenda.manage',v_m.governance_unit_id);
 if v_m.status not in('draft','scheduled') then raise exception 'agenda is locked in meeting status %',v_m.status; end if;
 if p_expected_meeting_updated_at is null or p_expected_meeting_updated_at<>v_m.updated_at then raise exception 'meeting was modified; refresh agenda' using errcode='40001'; end if;
 select count(*),coalesce(max(agenda_order),0)+count(*)+1 into v_count,v_offset
 from public.agenda_items where meeting_id=v_m.id;
 if cardinality(coalesce(p_ordered_item_ids,array[]::uuid[]))<>v_count
 or (select count(distinct x) from unnest(coalesce(p_ordered_item_ids,array[]::uuid[]))x)<>v_count
 or exists(select 1 from unnest(coalesce(p_ordered_item_ids,array[]::uuid[]))x left join public.agenda_items ai on ai.id=x and ai.meeting_id=v_m.id where ai.id is null)
 then raise exception 'ordered item ids must contain every agenda item exactly once'; end if;
 update public.agenda_items set agenda_order=agenda_order+v_offset where meeting_id=v_m.id;
 update public.agenda_items ai set agenda_order=o.ord from unnest(p_ordered_item_ids) with ordinality o(id,ord) where ai.id=o.id and ai.meeting_id=v_m.id;
 update public.meetings set updated_at=now() where id=v_m.id;
 perform public.append_audit_log(v_m.organization_id,'agenda.reorder','meetings',v_m.id,jsonb_build_object('ordered_item_ids',p_ordered_item_ids));
 return public.get_meeting_detail(v_m.id)->'agenda_items';
end $$;

create or replace function public.remove_agenda_item(p_agenda_item_id uuid,p_reason text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_ai public.agenda_items%rowtype;v_m public.meetings%rowtype;v_offset int;
begin
 select * into v_ai from public.agenda_items where id=p_agenda_item_id and organization_id=public.current_organization_id() for update;
 if v_ai.id is null then raise exception 'agenda item not found'; end if;
 select * into v_m from public.meetings where id=v_ai.meeting_id for update;
 perform public.assert_permission('agenda.manage',v_m.governance_unit_id);
 if v_m.status not in('draft','scheduled') then raise exception 'agenda is locked in meeting status %',v_m.status; end if;
 delete from public.agenda_items where id=v_ai.id;
 select coalesce(max(agenda_order),0)+count(*)+1 into v_offset from public.agenda_items where meeting_id=v_m.id;
 update public.agenda_items set agenda_order=agenda_order+v_offset where meeting_id=v_m.id;
 with ordered as(
  select id,row_number() over(order by agenda_order,id)::int n
  from public.agenda_items where meeting_id=v_m.id
 )
 update public.agenda_items ai set agenda_order=o.n from ordered o where ai.id=o.id;
 update public.meetings set updated_at=now() where id=v_m.id;
 perform public.append_audit_log(v_m.organization_id,'agenda.item.remove','agenda_items',v_ai.id,jsonb_build_object('meeting_id',v_m.id,'topic_id',v_ai.topic_id,'reason',p_reason));
 return jsonb_build_object('removed',true,'agenda_item_id',v_ai.id);
end $$;

grant execute on function public.reorder_agenda_items(uuid,uuid[],timestamptz),
 public.remove_agenda_item(uuid,text) to authenticated;
