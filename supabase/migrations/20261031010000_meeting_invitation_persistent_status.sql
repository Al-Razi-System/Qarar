-- Keep invitation preparation visible after refresh and distinguish queued,
-- accepted and failed delivery work without exposing destinations or provider data.
-- Impact map: docs/engineering/impact/MEETING_INVITATION_PERSISTENT_STATUS_20261031_AR.md
begin;

create function qarar_governance.get_meeting_invitation_summary(
  p_organization_id uuid,
  p_meeting_id uuid
) returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_summary jsonb;
begin
  if p_organization_id is distinct from qarar_iam.current_organization_id() then
    raise exception using errcode='42501',message='لا تملك صلاحية عرض حالة دعوات هذا الاجتماع';
  end if;
  select jsonb_build_object(
    'prepared',count(*)>0,
    'requested_count',count(*),
    'accepted_count',count(*) filter(where exists(
      select 1 from qarar_governance.notification_deliveries d
      where d.organization_id=o.organization_id and d.outbox_event_id=o.id
        and d.status in('accepted','sent','delivered','read')
    )),
    'delivered_count',count(*) filter(where exists(
      select 1 from qarar_governance.notification_deliveries d
      where d.organization_id=o.organization_id and d.outbox_event_id=o.id
        and d.status in('delivered','read')
    )),
    'failed_count',count(*) filter(where
      not exists(
        select 1 from qarar_governance.notification_deliveries d
        where d.organization_id=o.organization_id and d.outbox_event_id=o.id
          and d.status in('accepted','sent','delivered','read')
      ) and (
        o.last_error is not null or o.status in('failed','dead_letter') or exists(
          select 1 from qarar_governance.notification_deliveries d
          where d.organization_id=o.organization_id and d.outbox_event_id=o.id
            and d.status in('skipped','failed','dead_letter')
        )
      )
    ),
    'pending_count',count(*) filter(where
      not exists(
        select 1 from qarar_governance.notification_deliveries d
        where d.organization_id=o.organization_id and d.outbox_event_id=o.id
          and d.status in('accepted','sent','delivered','read','skipped','failed','dead_letter')
      ) and o.last_error is null and o.status not in('failed','dead_letter')
    ),
    'prepared_at',min(o.created_at)
  ) into v_summary
  from qarar_governance.notification_outbox o
  where o.organization_id=p_organization_id
    and o.aggregate_type='meeting'
    and o.aggregate_id=p_meeting_id
    and o.event_type='meeting.invitation.requested';
  return v_summary;
end;
$$;

alter function qarar_governance.get_meeting_invitation_summary(uuid,uuid) owner to qarar_governance_executor;
revoke all on function qarar_governance.get_meeting_invitation_summary(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function qarar_governance.get_meeting_invitation_summary(uuid,uuid) to qarar_meetings_executor;

create or replace function qarar_meetings.get_meeting_detail(p_meeting_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare
  v_detail jsonb;
  v_can_direct boolean;
  v_summary jsonb;
begin
  v_detail:=qarar_meetings.get_meeting_detail_before_direct_topics(p_meeting_id);
  v_can_direct:=coalesce(v_detail->>'status','') in('draft','scheduled')
    and qarar_iam.has_unit_role_code((v_detail->>'governance_unit_id')::uuid,array['council_chair']);
  v_detail:=jsonb_set(v_detail,'{capabilities,can_add_direct_topic}',to_jsonb(v_can_direct),true);
  v_detail:=jsonb_set(v_detail,'{agenda_items}',coalesce((
    select jsonb_agg(jsonb_set(item,'{topic}',(item->'topic')||jsonb_build_object('is_direct',t.meeting_scope_id is not null))
      order by (item->>'agenda_order')::integer)
    from jsonb_array_elements(v_detail->'agenda_items') item
    join qarar_topics.topics t on t.id=(item#>>'{topic,id}')::uuid and t.organization_id=qarar_iam.current_organization_id()
  ),'[]'::jsonb),true);

  v_summary:=qarar_governance.get_meeting_invitation_summary(
    (v_detail->>'organization_id')::uuid,
    p_meeting_id
  );

  return jsonb_set(v_detail,'{invitation_summary}',v_summary,true);
end;
$$;

alter function qarar_meetings.get_meeting_detail(uuid) owner to qarar_meetings_executor;
revoke all on function qarar_meetings.get_meeting_detail(uuid) from public,anon,authenticated,service_role;
grant execute on function qarar_meetings.get_meeting_detail(uuid) to qarar_api_executor;

insert into qarar_architecture.function_registry(
  function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate
)
select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),'governance','qarar_governance',false
from pg_proc p
where p.oid='qarar_governance.get_meeting_invitation_summary(uuid,uuid)'::regprocedure;

notify pgrst,'reload schema';
commit;
