-- Meeting-wide operations (invitations, attendance, scheduling) are not topic
-- events merely because the topic appeared on that meeting's agenda.
begin;
create or replace function qarar_topics.get_topic_activity_timeline(p_topic_id uuid)
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,qarar_topics as $$
declare v_org uuid:=qarar_iam.current_organization_id(); v_unit uuid; v_submitter uuid;
begin
  select current_unit_id,submitted_by_user_id into v_unit,v_submitter
  from qarar_topics.topics where id=p_topic_id and organization_id=v_org;
  if v_unit is null then raise exception using errcode='P0002',message='الموضوع غير موجود';end if;
  if auth.uid() is distinct from v_submitter and not qarar_iam.is_system_admin()
     and not qarar_iam.has_permission('topics.read',v_unit)
     and not qarar_iam.has_permission('topics.review',v_unit) then
    raise exception using errcode='42501',message='لا تملك صلاحية عرض سجل هذا الموضوع';
  end if;
  return coalesce((with related as (
    select 'agenda_items'::text entity_type,a.id entity_id from qarar_meetings.agenda_items a where a.organization_id=v_org and a.topic_id=p_topic_id
    union all select 'agenda_item',a.id from qarar_meetings.agenda_items a where a.organization_id=v_org and a.topic_id=p_topic_id
    union all select 'voting_rounds',vr.id from qarar_voting.voting_rounds vr join qarar_meetings.agenda_items a on a.id=vr.agenda_item_id and a.organization_id=vr.organization_id where a.organization_id=v_org and a.topic_id=p_topic_id
    union all select 'decisions',d.id from qarar_decisions.decisions d join qarar_meetings.agenda_items a on a.id=d.agenda_item_id and a.organization_id=d.organization_id where a.organization_id=v_org and a.topic_id=p_topic_id
    union all select 'topic_referrals',r.id from qarar_topics.topic_referrals r where r.organization_id=v_org and r.topic_id=p_topic_id
    union all select 'meeting_minutes',mm.id from qarar_minutes.meeting_minutes mm join qarar_meetings.agenda_items a on a.meeting_id=mm.meeting_id and a.organization_id=mm.organization_id where a.organization_id=v_org and a.topic_id=p_topic_id
  ), events as (
    select h.id,'status_history'::text source,'topic.status.changed'::text action,'topics'::text entity_type,h.topic_id entity_id,h.changed_at occurred_at,h.changed_by_user_id actor_user_id,h.from_status,h.to_status,h.change_reason summary
    from qarar_topics.topic_status_history h where h.organization_id=v_org and h.topic_id=p_topic_id
    union all
    select al.id,'audit'::text,al.action,al.entity_type,al.entity_id,al.occurred_at,al.actor_user_id,null::text,null::text,null::text
    from qarar_audit.audit_logs al where al.organization_id=v_org and al.result='success'
      and ((al.entity_type='topics' and al.entity_id=p_topic_id)
        or exists(select 1 from related r where r.entity_type=al.entity_type and r.entity_id=al.entity_id)
        or al.metadata->>'topic_id'=p_topic_id::text)
  ) select jsonb_agg(jsonb_build_object(
    'id',e.id,'source',e.source,'action',e.action,'entity_type',e.entity_type,'entity_id',e.entity_id,
    'occurred_at',e.occurred_at,'actor_user_id',e.actor_user_id,'actor_name_ar',u.full_name_ar,
    'from_status',e.from_status,'to_status',e.to_status,'summary',e.summary
  ) order by e.occurred_at,e.id) from events e left join qarar_iam.users u on u.id=e.actor_user_id and u.organization_id=v_org),'[]'::jsonb);
end $$;
alter function qarar_topics.get_topic_activity_timeline(uuid) owner to qarar_topics_executor;
notify pgrst,'reload schema';
commit;
