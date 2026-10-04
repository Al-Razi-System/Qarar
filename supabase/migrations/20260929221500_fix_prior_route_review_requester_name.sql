begin;

create or replace function qarar_governance.admin_list_topic_prior_route_requests(p_status text default null)
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,qarar_governance as $$
declare v_org uuid:=qarar_iam.current_organization_id();
begin
  perform qarar_iam.assert_permission('governance.prior_route.approve',null);
  return jsonb_build_object('items',coalesce((select jsonb_agg(item order by item->>'submitted_at' desc) from (
    select jsonb_build_object('id',r.id,'topic_id',r.topic_id,'topic_no',t.topic_no,'topic_title_ar',t.title_ar,
      'status',r.status,'requested_by_user_id',r.requested_by_user_id,'submitted_at',r.submitted_at,
      'requester_name_ar',coalesce(u.full_name_ar,u.full_name_en,u.email,'مستخدم غير متاح'),
      'can_review',r.status='submitted' and r.requested_by_user_id<>auth.uid(),
      'review_block_reason',case when r.status='submitted' and r.requested_by_user_id=auth.uid()
        then 'يتطلب الاعتماد مراجعًا مستقلًا؛ لا يمكن لمقدم الطلب اعتماد أدلته بنفسه.' end,
      'steps',coalesce((select jsonb_agg(jsonb_build_object(
        'id',e.id,'sequence_no',e.sequence_no,'step_title',s.snapshot->>'name_ar','responsible_unit_name_ar',gu.name_ar,
        'meeting_date',e.meeting_date,'meeting_reference',e.meeting_reference,'decision_type',e.decision_type,
        'decision_text',e.decision_text,'bypass_reason',e.bypass_reason,'attachments',coalesce((select jsonb_agg(jsonb_build_object(
          'id',ta.id,'file_name',ta.file_name,'file_url',ta.file_url,'mime_type',ta.mime_type))
          from qarar_governance.topic_prior_route_evidence_attachments link
          join qarar_topics.topic_attachments ta on ta.id=link.topic_attachment_id and ta.organization_id=link.organization_id
          where link.step_evidence_id=e.id),'[]'::jsonb)) order by e.sequence_no)
        from qarar_governance.topic_prior_route_step_evidence e
        join qarar_governance.workflow_instance_steps s on s.id=e.workflow_instance_step_id
        left join qarar_core.governance_units gu on gu.id=s.assigned_unit_id
        where e.request_id=r.id),'[]'::jsonb)) item
    from qarar_governance.topic_prior_route_requests r
    join qarar_topics.topics t on t.id=r.topic_id and t.organization_id=r.organization_id
    left join qarar_iam.users u on u.id=r.requested_by_user_id and u.organization_id=r.organization_id
    where r.organization_id=v_org and (p_status is null or r.status=p_status)
  ) rows),'[]'::jsonb));
end $$;

alter function qarar_governance.admin_list_topic_prior_route_requests(text) owner to qarar_governance_executor;
revoke all on function qarar_governance.admin_list_topic_prior_route_requests(text) from public,anon,authenticated,service_role;
grant execute on function qarar_governance.admin_list_topic_prior_route_requests(text) to qarar_governance_executor;

commit;
