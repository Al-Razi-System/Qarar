-- Expose approved minutes and the persisted cross-module activity of one topic.
-- Impact map: docs/engineering/impact/TOPIC_PRIOR_MINUTES_AUDIT_TIMELINE_20261022_AR.md
begin;

create or replace function qarar_topics.get_topic_meeting_history(p_topic_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,qarar_topics as $$
declare v_unit uuid;
begin
  select current_unit_id into v_unit from qarar_topics.topics
    where id=p_topic_id and organization_id=qarar_iam.current_organization_id();
  if v_unit is null then raise exception using errcode='P0002',message='الموضوع غير موجود';end if;
  perform qarar_iam.assert_permission('topics.read',v_unit);
  return coalesce((select jsonb_agg(jsonb_build_object(
    'agenda_item_id',a.id,'agenda_status',a.agenda_status,'discussion_notes',a.discussion_notes,
    'meeting',jsonb_build_object('id',m.id,'meeting_no',m.meeting_no,'title',m.title_ar,'status',m.status,
      'scheduled_date',m.scheduled_date,'unit_name',u.name_ar),
    'minutes',case when mm.id is null then null else jsonb_build_object(
      'id',mm.id,'status',mm.status,
      'content',case when mm.status='approved' then mm.content_final else null end,
      'submitted_at',mm.reviewed_at,'approved_at',mm.approved_at,'updated_at',mm.updated_at
    ) end,
    'voting_rounds',coalesce((select jsonb_agg(jsonb_build_object(
      'id',vr.id,'round_number',vr.round_number,'status',vr.status,'result',vr.result,
      'eligible_voter_count',vr.eligible_voter_count,'approve_count',vr.approve_count,
      'reject_count',vr.reject_count,'abstain_count',vr.abstain_count,'opened_at',vr.opened_at,'closed_at',vr.closed_at
    ) order by vr.round_number) from qarar_voting.voting_rounds vr where vr.agenda_item_id=a.id),'[]'::jsonb),
    'decisions',coalesce((select jsonb_agg(jsonb_build_object(
      'id',d.id,'decision_no',d.decision_no,'decision_text',d.decision_text,
      'decision_status',d.decision_status,'requires_approval',d.requires_approval,'issued_at',d.issued_at
    ) order by d.created_at) from qarar_decisions.decisions d where d.agenda_item_id=a.id),'[]'::jsonb)
  ) order by m.scheduled_date desc,m.created_at desc)
  from qarar_meetings.agenda_items a
  join qarar_meetings.meetings m on m.id=a.meeting_id and m.organization_id=a.organization_id
  join qarar_core.governance_units u on u.id=m.governance_unit_id and u.organization_id=m.organization_id
  left join qarar_minutes.meeting_minutes mm on mm.meeting_id=m.id and mm.organization_id=m.organization_id
  where a.topic_id=p_topic_id and a.organization_id=qarar_iam.current_organization_id()),'[]'::jsonb);
end $$;

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

  return coalesce((
    with related as (
      select 'agenda_items'::text entity_type,a.id entity_id from qarar_meetings.agenda_items a
       where a.organization_id=v_org and a.topic_id=p_topic_id
      union all select 'agenda_item',a.id from qarar_meetings.agenda_items a where a.organization_id=v_org and a.topic_id=p_topic_id
      union all select 'meetings',a.meeting_id from qarar_meetings.agenda_items a where a.organization_id=v_org and a.topic_id=p_topic_id
      union all select 'voting_rounds',vr.id from qarar_voting.voting_rounds vr join qarar_meetings.agenda_items a on a.id=vr.agenda_item_id and a.organization_id=vr.organization_id where a.organization_id=v_org and a.topic_id=p_topic_id
      union all select 'decisions',d.id from qarar_decisions.decisions d join qarar_meetings.agenda_items a on a.id=d.agenda_item_id and a.organization_id=d.organization_id where a.organization_id=v_org and a.topic_id=p_topic_id
      union all select 'topic_referrals',r.id from qarar_topics.topic_referrals r where r.organization_id=v_org and r.topic_id=p_topic_id
      union all select 'meeting_minutes',mm.id from qarar_minutes.meeting_minutes mm join qarar_meetings.agenda_items a on a.meeting_id=mm.meeting_id and a.organization_id=mm.organization_id where a.organization_id=v_org and a.topic_id=p_topic_id
    ), events as (
      select h.id,'status_history'::text source,'topic.status.changed'::text action,'topics'::text entity_type,
        h.topic_id entity_id,h.changed_at occurred_at,h.changed_by_user_id actor_user_id,
        h.from_status,h.to_status,h.change_reason summary
      from qarar_topics.topic_status_history h where h.organization_id=v_org and h.topic_id=p_topic_id
      union all
      select al.id,'audit'::text,al.action,al.entity_type,al.entity_id,al.occurred_at,al.actor_user_id,
        null::text,null::text,null::text
      from qarar_audit.audit_logs al
      where al.organization_id=v_org and al.result='success'
        and ((al.entity_type='topics' and al.entity_id=p_topic_id)
          or exists(select 1 from related r where r.entity_type=al.entity_type and r.entity_id=al.entity_id)
          or al.metadata->>'topic_id'=p_topic_id::text)
    )
    select jsonb_agg(jsonb_build_object(
      'id',e.id,'source',e.source,'action',e.action,'entity_type',e.entity_type,'entity_id',e.entity_id,
      'occurred_at',e.occurred_at,'actor_user_id',e.actor_user_id,'actor_name_ar',u.full_name_ar,
      'from_status',e.from_status,'to_status',e.to_status,'summary',e.summary
    ) order by e.occurred_at,e.id)
    from events e left join qarar_iam.users u on u.id=e.actor_user_id and u.organization_id=v_org
  ),'[]'::jsonb);
end $$;

alter function qarar_topics.get_topic_meeting_history(uuid) owner to qarar_topics_executor;
alter function qarar_topics.get_topic_activity_timeline(uuid) owner to qarar_topics_executor;
grant select on qarar_minutes.meeting_minutes,qarar_audit.audit_logs,qarar_iam.users to qarar_topics_executor;

create or replace function api_v1.get_topic_activity_timeline(p_topic_id uuid) returns jsonb
language sql stable security definer set search_path=pg_catalog as $$select qarar_topics.get_topic_activity_timeline($1)$$;
alter function api_v1.get_topic_activity_timeline(uuid) owner to qarar_api_executor;
revoke all on function api_v1.get_topic_activity_timeline(uuid) from public,anon;
grant execute on function api_v1.get_topic_activity_timeline(uuid) to authenticated,service_role;

insert into qarar_architecture.function_registry(function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate)
select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),'topics',n.nspname,false
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='qarar_topics' and p.proname in ('get_topic_meeting_history','get_topic_activity_timeline')
on conflict(function_name,identity_arguments) do update set function_oid=excluded.function_oid,module_code=excluded.module_code,owning_schema=excluded.owning_schema,is_rls_predicate=false;

insert into qarar_architecture.api_contract_registry(api_version,contract_name,implementation_schema,implementation_name,identity_arguments,module_code,audience)
values('v1','get_topic_activity_timeline','qarar_topics','get_topic_activity_timeline','p_topic_id uuid','topics','authenticated')
on conflict(api_version,contract_name,identity_arguments) do update set implementation_schema=excluded.implementation_schema,implementation_name=excluded.implementation_name,module_code=excluded.module_code,audience=excluded.audience;

update qarar_architecture.api_release_registry r set
 contract_count=(select count(*) from qarar_architecture.api_contract_registry where api_version='v1'),
 contract_hash=(select md5(string_agg(p.proname||'|'||pg_get_function_identity_arguments(p.oid)||'|'||pg_get_function_result(p.oid)||'|'||c.audience,E'\n' order by p.proname,pg_get_function_identity_arguments(p.oid))) from pg_proc p join pg_namespace n on n.oid=p.pronamespace and n.nspname='api_v1' join qarar_architecture.api_contract_registry c on c.api_version='v1' and c.contract_name=p.proname and c.identity_arguments=pg_get_function_identity_arguments(p.oid))
where r.api_version='v1';

notify pgrst,'reload schema';
commit;
