begin;

alter table qarar_governance.governance_bundles_v2
  drop constraint governance_bundles_v2_activation_allowed_check,
  drop constraint governance_bundles_v2_activation_blocked,
  drop constraint governance_bundles_v2_check,
  drop constraint governance_bundles_v2_check2,
  drop constraint governance_bundles_v2_check3;
alter table qarar_governance.governance_bundles_v2
  add constraint governance_bundles_v2_activation_state_check check (
    (status in ('effective','retired')) = activation_allowed
    and ((status in ('effective','retired') and activated_by_user_id is not null and activated_at is not null and effective_from is not null)
      or (status not in ('effective','retired') and activated_by_user_id is null and activated_at is null and effective_from is null))
  ),
  add constraint governance_bundles_v2_lifecycle_evidence_check check (
    (status='draft' and submitted_by_user_id is null)
    or (status in ('under_review','changes_requested') and submitted_by_user_id is not null and reviewed_by_user_id is null)
    or (status in ('approved','effective','retired') and submitted_by_user_id is not null and reviewed_by_user_id is not null and reviewed_at is not null)
  );

alter table qarar_governance.governance_bundle_reviews_v2
  drop constraint governance_bundle_reviews_v2_action_check;
alter table qarar_governance.governance_bundle_reviews_v2
  add constraint governance_bundle_reviews_v2_action_check
  check (action in ('submitted','changes_requested','approved','activated','retired'));

create or replace function qarar_governance.activate_governance_bundle_v2(
  p_bundle_id uuid,p_expected_lock_version integer,p_effective_from date,p_client_request_id uuid
) returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,qarar_governance as $$
declare
  v_org uuid:=qarar_iam.current_organization_id();
  v_actor uuid:=auth.uid();
  v_bundle qarar_governance.governance_bundles_v2%rowtype;
  v_receipt qarar_governance.governance_bundle_command_receipts_v2%rowtype;
  v_validation jsonb;
  v_fingerprint text;
  v_response jsonb;
begin
  perform qarar_iam.assert_permission('governance.model.activate',null);
  if p_bundle_id is null or p_expected_lock_version is null or p_effective_from is null or p_client_request_id is null then
    raise exception using errcode='22023',message='الحزمة ونسختها وتاريخ السريان ومفتاح التكرار مطلوبة';
  end if;
  v_fingerprint:=encode(pg_catalog.sha256(convert_to(
    p_bundle_id::text||':'||p_expected_lock_version::text||':'||p_effective_from::text,'UTF8')),'hex');
  perform pg_advisory_xact_lock(hashtextextended(v_org::text||':'||v_actor::text||':'||p_client_request_id::text,0));
  select * into v_receipt from qarar_governance.governance_bundle_command_receipts_v2
  where organization_id=v_org and actor_user_id=v_actor
    and command_name='activate_governance_bundle_v2' and client_request_id=p_client_request_id;
  if v_receipt.id is not null then
    if v_receipt.request_fingerprint<>v_fingerprint then
      raise exception using errcode='40001',message='استُخدم مفتاح التكرار نفسه لطلب مختلف';
    end if;
    return v_receipt.response_payload||jsonb_build_object('idempotent_replay',true);
  end if;
  select * into v_bundle from qarar_governance.governance_bundles_v2
  where id=p_bundle_id and organization_id=v_org for update;
  if v_bundle.id is null then
    raise exception using errcode='P0002',message='تعذر العثور على حزمة الحوكمة المطلوبة';
  end if;
  if v_bundle.status<>'approved' then
    raise exception using errcode='55000',message='الحزمة غير معتمدة ولا يمكن تفعيلها';
  end if;
  if v_bundle.lock_version<>p_expected_lock_version then
    raise exception using errcode='40001',message='تم تعديل الحزمة في جلسة أخرى؛ حدّث البيانات ثم أعد المحاولة';
  end if;
  v_validation:=qarar_governance.validate_governance_bundle_v2_core(p_bundle_id);
  if not (v_validation->>'is_valid')::boolean then
    raise exception using errcode='23514',message='لا يمكن التفعيل قبل معالجة جميع الموانع',detail=(v_validation->'blocking_issues')::text;
  end if;
  if exists(
    select 1 from qarar_governance.topic_type_versions_v2 current_version
    join qarar_governance.topic_type_versions_v2 effective_version
      on effective_version.topic_type_id=current_version.topic_type_id
     and effective_version.organization_id=current_version.organization_id
    where current_version.id=v_bundle.topic_type_version_id and current_version.organization_id=v_org
      and effective_version.id<>current_version.id and effective_version.status='effective'
  ) then
    raise exception using errcode='23P01',message='توجد نسخة فعالة أخرى لنوع الموضوع؛ أنهِ سريانها بإجراء مستقل قبل التفعيل';
  end if;

  update qarar_governance.topic_classifications_v2 c
  set status='effective',activation_allowed=true,effective_from=coalesce(c.effective_from,p_effective_from),updated_at=clock_timestamp()
  from qarar_governance.topic_type_versions_v2 v
  where v.id=v_bundle.topic_type_version_id and c.id=v.classification_id
    and c.organization_id=v_org and v.organization_id=v_org and c.status in('approved','effective');
  update qarar_governance.topic_type_workflow_bindings_v2
  set status='effective',activation_allowed=true,valid_from=p_effective_from,updated_at=clock_timestamp()
  where topic_type_version_id=v_bundle.topic_type_version_id and organization_id=v_org and status='validated';
  update qarar_governance.topic_schedule_policies_v2
  set status='effective',activation_allowed=true,effective_from=p_effective_from,updated_at=clock_timestamp()
  where topic_type_version_id=v_bundle.topic_type_version_id and organization_id=v_org and status='validated';
  update qarar_governance.topic_type_versions_v2
  set status='effective',activation_allowed=true,effective_from=p_effective_from,
      activated_by_user_id=v_actor,activated_at=clock_timestamp(),updated_at=clock_timestamp()
  where id=v_bundle.topic_type_version_id and organization_id=v_org and status='approved';
  update qarar_governance.governance_bundles_v2
  set status='effective',activation_allowed=true,effective_from=p_effective_from,
      activated_by_user_id=v_actor,activated_at=clock_timestamp(),lock_version=lock_version+1,updated_at=clock_timestamp()
  where id=v_bundle.id returning * into v_bundle;

  insert into qarar_governance.governance_bundle_reviews_v2(
    organization_id,bundle_id,action,bundle_lock_version,actor_user_id
  ) values(v_org,v_bundle.id,'activated',v_bundle.lock_version,v_actor);
  v_response:=jsonb_build_object('bundle_id',v_bundle.id,'status',v_bundle.status,
    'lock_version',v_bundle.lock_version,'activated_at',v_bundle.activated_at,
    'effective_from',v_bundle.effective_from,'idempotent_replay',false);
  insert into qarar_governance.governance_bundle_command_receipts_v2(
    organization_id,bundle_id,actor_user_id,command_name,client_request_id,request_fingerprint,response_payload
  ) values(v_org,v_bundle.id,v_actor,'activate_governance_bundle_v2',p_client_request_id,v_fingerprint,v_response);
  perform qarar_audit.append_audit_log(v_org,'governance.model.activated','governance_bundles_v2',v_bundle.id,
    jsonb_build_object('client_request_id',p_client_request_id,'lock_version',v_bundle.lock_version,'effective_from',p_effective_from));
  return v_response;
end;
$$;

alter function qarar_governance.activate_governance_bundle_v2(uuid,integer,date,uuid) owner to qarar_governance_executor;
revoke all on function qarar_governance.activate_governance_bundle_v2(uuid,integer,date,uuid)
from public,anon,authenticated,service_role;
grant execute on function qarar_governance.activate_governance_bundle_v2(uuid,integer,date,uuid)
to qarar_governance_executor;

commit;
