begin;

create or replace function qarar_governance.validate_governance_bundle_v2_core(p_bundle_id uuid)
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,qarar_governance as $$
declare
  v_org uuid:=qarar_iam.current_organization_id();
  v_bundle qarar_governance.governance_bundles_v2%rowtype;
  v_workflow_id uuid;
  v_issues jsonb:='[]'::jsonb;
begin
  select * into v_bundle from qarar_governance.governance_bundles_v2
  where id=p_bundle_id and organization_id=v_org;
  if v_bundle.id is null then
    raise exception using errcode='P0002',message='تعذر العثور على حزمة الحوكمة المطلوبة';
  end if;
  if not exists(
    select 1 from qarar_governance.topic_type_authorities_v2 a
    join qarar_governance.legal_authorities_v2 l
      on l.id=a.legal_authority_id and l.organization_id=a.organization_id
    where a.topic_type_version_id=v_bundle.topic_type_version_id
      and a.organization_id=v_org and a.authority_role='jurisdiction'
      and l.review_status='approved' and l.activation_allowed
      and (l.effective_to is null or l.effective_to>=current_date)
  ) then v_issues:=v_issues||jsonb_build_array(jsonb_build_object(
    'code','LEGAL_AUTHORITY_MISSING','message_ar','أضف سند اختصاص معتمداً وساري المفعول لنوع الموضوع.'));
  end if;
  select b.workflow_template_version_id into v_workflow_id
  from qarar_governance.topic_type_workflow_bindings_v2 b
  where b.topic_type_version_id=v_bundle.topic_type_version_id and b.organization_id=v_org
    and b.status in('draft','validated','effective') order by b.priority desc limit 1;
  if v_workflow_id is null then
    v_issues:=v_issues||jsonb_build_array(jsonb_build_object(
      'code','WORKFLOW_BINDING_MISSING','message_ar','اربط نوع الموضوع بمسار حوكمة واحد.'));
  elsif not exists(
    select 1 from qarar_governance.workflow_template_versions w
    where w.id=v_workflow_id and w.organization_id=v_org
      and w.status='active' and w.validation_status='valid'
  ) then
    v_issues:=v_issues||jsonb_build_array(jsonb_build_object(
      'code','WORKFLOW_INVALID','message_ar','المسار المرتبط غير فعال أو لم يجتز التحقق.'));
  end if;
  if not exists(
    select 1 from qarar_governance.topic_schedule_policies_v2 s
    where s.topic_type_version_id=v_bundle.topic_type_version_id and s.organization_id=v_org
      and s.status in('draft','validated','effective')
  ) then v_issues:=v_issues||jsonb_build_array(jsonb_build_object(
    'code','SCHEDULE_POLICY_MISSING','message_ar','حدد سياسة توقيت للموضوع أو اختر بوضوح أنه غير مجدول.'));
  end if;
  return jsonb_build_object(
    'bundle_id',v_bundle.id,'is_valid',jsonb_array_length(v_issues)=0,
    'blocking_issues',v_issues,'warnings','[]'::jsonb,'lock_version',v_bundle.lock_version
  );
end;
$$;

create or replace function qarar_governance.validate_governance_bundle_v2(p_bundle_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
begin
  perform qarar_iam.assert_permission('governance.model.review',null);
  return qarar_governance.validate_governance_bundle_v2_core(p_bundle_id);
end;
$$;

create or replace function qarar_governance.submit_governance_bundle_v2(
  p_bundle_id uuid,p_expected_lock_version integer,p_client_request_id uuid
) returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,qarar_governance as $$
declare
  v_org uuid:=qarar_iam.current_organization_id();
  v_actor uuid:=auth.uid();
  v_bundle qarar_governance.governance_bundles_v2%rowtype;
  v_receipt qarar_governance.governance_bundle_command_receipts_v2%rowtype;
  v_fingerprint text;
  v_validation jsonb;
  v_response jsonb;
begin
  perform qarar_iam.assert_permission('governance.model.edit',null);
  if p_bundle_id is null or p_expected_lock_version is null or p_client_request_id is null then
    raise exception using errcode='22023',message='الحزمة ونسختها المتوقعة ومفتاح التكرار مطلوبة';
  end if;
  v_fingerprint:=encode(pg_catalog.sha256(convert_to(
    p_bundle_id::text||':'||p_expected_lock_version::text,'UTF8')),'hex');
  perform pg_advisory_xact_lock(hashtextextended(v_org::text||':'||v_actor::text||':'||p_client_request_id::text,0));
  select * into v_receipt from qarar_governance.governance_bundle_command_receipts_v2
  where organization_id=v_org and actor_user_id=v_actor
    and command_name='submit_governance_bundle_v2' and client_request_id=p_client_request_id;
  if v_receipt.id is not null then
    if v_receipt.request_fingerprint<>v_fingerprint then
      raise exception using errcode='40001',message='استُخدم مفتاح التكرار نفسه لطلب مختلف';
    end if;
    return v_receipt.response_payload||jsonb_build_object('idempotent_replay',true);
  end if;
  select * into v_bundle from qarar_governance.governance_bundles_v2
  where id=p_bundle_id and organization_id=v_org and created_by_user_id=v_actor for update;
  if v_bundle.id is null then raise exception using errcode='P0002',message='مسودة حزمة الحوكمة غير موجودة'; end if;
  if v_bundle.status not in('draft','changes_requested') then
    raise exception using errcode='55000',message='الحزمة مرسلة للمراجعة أو لم تعد قابلة للإرسال';
  end if;
  if v_bundle.lock_version<>p_expected_lock_version then
    raise exception using errcode='40001',message='تم تعديل الحزمة في جلسة أخرى؛ حدّث البيانات ثم أعد المحاولة';
  end if;
  v_validation:=qarar_governance.validate_governance_bundle_v2_core(p_bundle_id);
  if not (v_validation->>'is_valid')::boolean then
    raise exception using errcode='23514',message='أكمل متطلبات الحزمة الموضحة قبل إرسالها للمراجعة',
      detail=(v_validation->'blocking_issues')::text;
  end if;
  update qarar_governance.topic_classifications_v2 c set status='under_review',updated_at=clock_timestamp()
  from qarar_governance.topic_type_versions_v2 v
  where v.id=v_bundle.topic_type_version_id and c.id=v.classification_id
    and c.organization_id=v_org and v.organization_id=v_org and c.status='draft';
  update qarar_governance.topic_type_versions_v2 set status='under_review',updated_at=clock_timestamp()
  where id=v_bundle.topic_type_version_id and organization_id=v_org and status='draft';
  update qarar_governance.topic_type_workflow_bindings_v2 set status='validated',updated_at=clock_timestamp()
  where topic_type_version_id=v_bundle.topic_type_version_id and organization_id=v_org and status='draft';
  update qarar_governance.topic_schedule_policies_v2 set status='validated',updated_at=clock_timestamp()
  where topic_type_version_id=v_bundle.topic_type_version_id and organization_id=v_org and status='draft';
  update qarar_governance.governance_bundles_v2 set
    status='under_review',submitted_by_user_id=v_actor,submitted_at=clock_timestamp(),
    lock_version=lock_version+1,updated_at=clock_timestamp()
  where id=v_bundle.id returning * into v_bundle;
  insert into qarar_governance.governance_bundle_reviews_v2(
    organization_id,bundle_id,action,bundle_lock_version,actor_user_id
  ) values(v_org,v_bundle.id,'submitted',v_bundle.lock_version,v_actor);
  v_response:=jsonb_build_object('bundle_id',v_bundle.id,'status',v_bundle.status,
    'submitted_at',v_bundle.submitted_at,'lock_version',v_bundle.lock_version,
    'validation_summary',v_validation,'idempotent_replay',false);
  insert into qarar_governance.governance_bundle_command_receipts_v2(
    organization_id,bundle_id,actor_user_id,command_name,client_request_id,request_fingerprint,response_payload
  ) values(v_org,v_bundle.id,v_actor,'submit_governance_bundle_v2',p_client_request_id,v_fingerprint,v_response);
  perform qarar_audit.append_audit_log(v_org,'governance.model.submitted','governance_bundles_v2',v_bundle.id,
    jsonb_build_object('client_request_id',p_client_request_id,'lock_version',v_bundle.lock_version));
  return v_response;
end;
$$;

alter function qarar_governance.validate_governance_bundle_v2_core(uuid) owner to qarar_governance_executor;
alter function qarar_governance.validate_governance_bundle_v2(uuid) owner to qarar_governance_executor;
alter function qarar_governance.submit_governance_bundle_v2(uuid,integer,uuid) owner to qarar_governance_executor;
revoke all on function qarar_governance.validate_governance_bundle_v2_core(uuid),
  qarar_governance.validate_governance_bundle_v2(uuid),
  qarar_governance.submit_governance_bundle_v2(uuid,integer,uuid)
from public,anon,authenticated,service_role;
grant execute on function qarar_governance.validate_governance_bundle_v2_core(uuid),
  qarar_governance.validate_governance_bundle_v2(uuid),
  qarar_governance.submit_governance_bundle_v2(uuid,integer,uuid)
to qarar_governance_executor;

commit;
