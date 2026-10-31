-- A meeting referral is a temporary consultation. For governed topics, accepting
-- it must not move ownership away from the active workflow step. Legacy topics
-- retain their established direct-routing behaviour.

create or replace function qarar_governance.topic_route_matches_active_step(
  p_topic_id uuid,
  p_workflow_instance_id uuid,
  p_workflow_instance_step_id uuid,
  p_current_unit_id uuid
) returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1
    from qarar_governance.workflow_instances instance
    join qarar_governance.workflow_instance_steps step
      on step.id=instance.current_step_id
     and step.workflow_instance_id=instance.id
     and step.organization_id=instance.organization_id
    where instance.id=p_workflow_instance_id
      and instance.topic_id=p_topic_id
      and instance.organization_id=qarar_iam.current_organization_id()
      and instance.status='active'
      and step.id=p_workflow_instance_step_id
      and step.status='active'
      and step.assigned_unit_id=p_current_unit_id
  )
$function$;

alter function qarar_governance.topic_route_matches_active_step(uuid,uuid,uuid,uuid) owner to qarar_governance_executor;
revoke all on function qarar_governance.topic_route_matches_active_step(uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function qarar_governance.topic_route_matches_active_step(uuid,uuid,uuid,uuid) to qarar_topics_executor;

insert into qarar_architecture.function_registry(
  function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate
)
select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),'governance',n.nspname,false
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='qarar_governance' and p.proname='topic_route_matches_active_step'
on conflict do nothing;

insert into qarar_architecture.module_function_execute_allowlist(
  source_module,target_schema,function_name,identity_arguments,rationale
) values (
  'topics','qarar_governance','topic_route_matches_active_step',
  'p_topic_id uuid, p_workflow_instance_id uuid, p_workflow_instance_step_id uuid, p_current_unit_id uuid',
  'Keep governed-topic ownership aligned with its current active workflow step when a consultation is accepted'
) on conflict do nothing;

create or replace function qarar_topics.respond_topic_referral(
  p_referral_id uuid,
  p_decision text,
  p_reason text default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_org uuid := qarar_iam.current_organization_id();
  v_ref qarar_topics.topic_referrals%rowtype;
  v_topic qarar_topics.topics%rowtype;
  v_governed boolean;
begin
  if p_decision not in ('accept','reject') then
    raise exception using errcode='22023', message='decision must be accept or reject';
  end if;
  if p_decision='reject' and (p_reason is null or char_length(btrim(p_reason))<5) then
    raise exception using errcode='22023', message='rejection reason must contain at least 5 characters';
  end if;

  select * into v_ref
  from qarar_topics.topic_referrals
  where id=p_referral_id and organization_id=v_org
  for update;
  if v_ref.id is null or v_ref.status<>'pending' then
    raise exception using errcode='P0002', message='pending referral not found';
  end if;
  perform qarar_iam.assert_permission('topics.refer',v_ref.to_unit_id);

  select * into strict v_topic
  from qarar_topics.topics
  where id=v_ref.topic_id and organization_id=v_org
  for update;
  v_governed := v_topic.workflow_instance_id is not null;

  if v_governed and not qarar_governance.topic_route_matches_active_step(
    v_topic.id,
    v_topic.workflow_instance_id,
    v_topic.current_workflow_step_id,
    v_topic.current_unit_id
  ) then
    raise exception using errcode='40001', message='governed topic route changed; refresh referral';
  end if;

  update qarar_topics.topic_referrals
  set status=case p_decision when 'accept' then 'accepted' else 'rejected' end,
      response_reason=nullif(btrim(coalesce(p_reason,'')),''),
      responded_by_user_id=auth.uid(),
      responded_at=now()
  where id=v_ref.id;

  if p_decision='accept' and not v_governed then
    update qarar_topics.topics
    set current_unit_id=v_ref.to_unit_id
    where id=v_ref.topic_id and current_unit_id=v_ref.from_unit_id;
    if not found then
      raise exception using errcode='40001', message='topic route changed; refresh referral';
    end if;
    v_topic.current_unit_id := v_ref.to_unit_id;
  end if;

  perform qarar_audit.append_audit_log(
    v_org,
    'topics.referral.'||p_decision,
    'topic_referrals',
    v_ref.id,
    jsonb_build_object(
      'topic_id',v_ref.topic_id,
      'from_unit_id',v_ref.from_unit_id,
      'to_unit_id',v_ref.to_unit_id,
      'reason',p_reason,
      'route_effect',case when v_governed then 'temporary_consultation' else 'legacy_ownership_transfer' end
    )
  );

  return jsonb_build_object(
    'referral_id',v_ref.id,
    'topic_id',v_ref.topic_id,
    'status',case p_decision when 'accept' then 'accepted' else 'rejected' end,
    'current_unit_id',v_topic.current_unit_id,
    'route_effect',case when v_governed then 'temporary_consultation' else 'legacy_ownership_transfer' end
  );
end
$function$;

comment on function qarar_topics.respond_topic_referral(uuid,text,text) is
  'Accept/reject a referral; governed topics remain owned by their active workflow step while legacy topics keep direct routing.';
