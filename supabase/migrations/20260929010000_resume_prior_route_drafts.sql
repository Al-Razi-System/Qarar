begin;

create or replace function qarar_governance.get_topic_prior_route_request(p_topic_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog,qarar_governance
as $$
declare
  v_org uuid:=qarar_iam.current_organization_id();
  v_unit uuid;
  v_request_id uuid;
begin
  select current_unit_id into v_unit
  from qarar_topics.topics
  where id=p_topic_id and organization_id=v_org;
  if v_unit is null then
    raise exception using errcode='P0002',message='الموضوع غير موجود';
  end if;
  perform qarar_iam.assert_permission('topics.read',v_unit);

  select id into v_request_id
  from qarar_governance.topic_prior_route_requests
  where topic_id=p_topic_id and organization_id=v_org;
  if v_request_id is null then return null; end if;

  return (
    select jsonb_build_object(
      'id',r.id,
      'topic_id',r.topic_id,
      'status',r.status,
      'requested_by_user_id',r.requested_by_user_id,
      'is_requester',r.requested_by_user_id=auth.uid(),
      'submitted_at',r.submitted_at,
      'reviewed_at',r.reviewed_at,
      'review_comment',r.review_comment,
      'steps',coalesce((
        select jsonb_agg(jsonb_build_object(
          'id',e.id,
          'sequence_no',e.sequence_no,
          'step_title',s.snapshot->>'name_ar',
          'responsible_unit_name_ar',gu.name_ar,
          'meeting_date',e.meeting_date,
          'meeting_reference',e.meeting_reference,
          'decision_type',e.decision_type,
          'decision_text',e.decision_text,
          'bypass_reason',e.bypass_reason,
          'attachments',coalesce((
            select jsonb_agg(jsonb_build_object(
              'id',ta.id,
              'file_name',ta.file_name,
              'file_url',ta.file_url,
              'mime_type',ta.mime_type,
              'file_size_bytes',ta.file_size_bytes
            ) order by ta.created_at)
            from qarar_governance.topic_prior_route_evidence_attachments link
            join qarar_topics.topic_attachments ta
              on ta.id=link.topic_attachment_id and ta.organization_id=link.organization_id
            where link.step_evidence_id=e.id
          ),'[]'::jsonb)
        ) order by e.sequence_no)
        from qarar_governance.topic_prior_route_step_evidence e
        join qarar_governance.workflow_instance_steps s on s.id=e.workflow_instance_step_id
        left join qarar_core.governance_units gu on gu.id=s.assigned_unit_id
        where e.request_id=r.id
      ),'[]'::jsonb)
    )
    from qarar_governance.topic_prior_route_requests r
    where r.id=v_request_id
  );
end
$$;

alter function qarar_governance.get_topic_prior_route_request(uuid) owner to qarar_governance_executor;
revoke all on function qarar_governance.get_topic_prior_route_request(uuid) from public,anon,authenticated,service_role;
grant execute on function qarar_governance.get_topic_prior_route_request(uuid) to qarar_api_executor;

create or replace function api_v1.get_topic_prior_route_request(p_topic_id uuid)
returns jsonb
language sql
stable
security definer
set search_path=pg_catalog
as $$select qarar_governance.get_topic_prior_route_request(p_topic_id)$$;

alter function api_v1.get_topic_prior_route_request(uuid) owner to qarar_api_executor;
revoke all on function api_v1.get_topic_prior_route_request(uuid) from public,anon,authenticated,service_role;
grant execute on function api_v1.get_topic_prior_route_request(uuid) to authenticated,service_role;

insert into qarar_architecture.api_contract_registry(
  api_version,contract_name,implementation_schema,implementation_name,identity_arguments,module_code,audience
) values(
  'v1','get_topic_prior_route_request','qarar_governance','get_topic_prior_route_request',
  'p_topic_id uuid','governance','authenticated'
)
on conflict(api_version,contract_name,identity_arguments) do update set
  implementation_schema=excluded.implementation_schema,
  implementation_name=excluded.implementation_name,
  module_code=excluded.module_code,
  audience=excluded.audience,
  deprecated_at=null,
  replacement_contract=null;

select pg_notify('pgrst','reload schema');
commit;
