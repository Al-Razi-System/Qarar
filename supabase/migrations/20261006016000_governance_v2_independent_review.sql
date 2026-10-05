begin;

alter table qarar_governance.governance_bundle_command_receipts_v2
  drop constraint if exists governance_bundle_command_receipts_v2_command_name_check;
alter table qarar_governance.governance_bundle_command_receipts_v2
  add constraint governance_bundle_command_receipts_v2_command_name_check check (command_name in (
    'save_governance_bundle_draft_v2','submit_governance_bundle_v2',
    'request_governance_bundle_changes_v2','approve_governance_bundle_v2',
    'activate_governance_bundle_v2'
  ));

create or replace function qarar_governance.review_governance_bundle_v2_core(
  p_bundle_id uuid,p_action text,p_expected_lock_version integer,
  p_review_comment text,p_client_request_id uuid
) returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,qarar_governance as $$
declare
  v_org uuid:=qarar_iam.current_organization_id();
  v_actor uuid:=auth.uid();
  v_bundle qarar_governance.governance_bundles_v2%rowtype;
  v_receipt qarar_governance.governance_bundle_command_receipts_v2%rowtype;
  v_command text;
  v_target_status text;
  v_audit_action text;
  v_fingerprint text;
  v_response jsonb;
begin
  if p_action not in('changes_requested','approved') then
    raise exception using errcode='22023',message='إجراء المراجعة غير صالح';
  end if;
  if p_bundle_id is null or p_expected_lock_version is null or p_client_request_id is null
     or char_length(btrim(coalesce(p_review_comment,'')))<3 then
    raise exception using errcode='22023',message='الحزمة ونسختها وتعليق المراجعة ومفتاح التكرار مطلوبة';
  end if;
  v_command:=case p_action when 'approved' then 'approve_governance_bundle_v2'
    else 'request_governance_bundle_changes_v2' end;
  v_target_status:=case p_action when 'approved' then 'approved' else 'changes_requested' end;
  v_audit_action:=case p_action when 'approved' then 'governance.model.approved'
    else 'governance.model.changes_requested' end;
  v_fingerprint:=encode(pg_catalog.sha256(convert_to(
    p_bundle_id::text||':'||p_expected_lock_version::text||':'||p_action||':'||btrim(p_review_comment),'UTF8')),'hex');
  perform pg_advisory_xact_lock(hashtextextended(v_org::text||':'||v_actor::text||':'||p_client_request_id::text,0));
  select * into v_receipt from qarar_governance.governance_bundle_command_receipts_v2
  where organization_id=v_org and actor_user_id=v_actor
    and command_name=v_command and client_request_id=p_client_request_id;
  if v_receipt.id is not null then
    if v_receipt.request_fingerprint<>v_fingerprint then
      raise exception using errcode='40001',message='استُخدم مفتاح التكرار نفسه لطلب مختلف';
    end if;
    return v_receipt.response_payload||jsonb_build_object('idempotent_replay',true);
  end if;
  select * into v_bundle from qarar_governance.governance_bundles_v2
  where id=p_bundle_id and organization_id=v_org for update;
  if v_bundle.id is null then raise exception using errcode='P0002',message='تعذر العثور على حزمة الحوكمة المطلوبة'; end if;
  if v_bundle.created_by_user_id=v_actor then
    raise exception using errcode='42501',message='لا يجوز لمعد الحزمة مراجعتها أو اعتمادها بنفسه';
  end if;
  if v_bundle.status<>'under_review' then
    raise exception using errcode='55000',message='الحزمة ليست بانتظار المراجعة';
  end if;
  if v_bundle.lock_version<>p_expected_lock_version then
    raise exception using errcode='40001',message='تم تعديل الحزمة في جلسة أخرى؛ حدّث البيانات ثم أعد المحاولة';
  end if;
  if p_action='approved' and not (qarar_governance.validate_governance_bundle_v2_core(p_bundle_id)->>'is_valid')::boolean then
    raise exception using errcode='23514',message='تعذر الاعتماد لأن متطلبات الحزمة لم تعد مكتملة';
  end if;

  if p_action='changes_requested' then
    update qarar_governance.topic_classifications_v2 c set status='draft',updated_at=clock_timestamp()
    from qarar_governance.topic_type_versions_v2 v
    where v.id=v_bundle.topic_type_version_id and c.id=v.classification_id
      and c.organization_id=v_org and v.organization_id=v_org and c.status='under_review';
    update qarar_governance.topic_type_versions_v2 set status='draft',updated_at=clock_timestamp()
    where id=v_bundle.topic_type_version_id and organization_id=v_org and status='under_review';
    update qarar_governance.topic_type_workflow_bindings_v2 set status='draft',updated_at=clock_timestamp()
    where topic_type_version_id=v_bundle.topic_type_version_id and organization_id=v_org and status='validated';
    update qarar_governance.topic_schedule_policies_v2 set status='draft',updated_at=clock_timestamp()
    where topic_type_version_id=v_bundle.topic_type_version_id and organization_id=v_org and status='validated';
  else
    update qarar_governance.topic_classifications_v2 c set status='approved',updated_at=clock_timestamp()
    from qarar_governance.topic_type_versions_v2 v
    where v.id=v_bundle.topic_type_version_id and c.id=v.classification_id
      and c.organization_id=v_org and v.organization_id=v_org and c.status='under_review';
    update qarar_governance.topic_type_versions_v2 set
      status='approved',approved_by_user_id=v_actor,approved_at=clock_timestamp(),updated_at=clock_timestamp()
    where id=v_bundle.topic_type_version_id and organization_id=v_org and status='under_review';
  end if;

  update qarar_governance.governance_bundles_v2 set
    status=v_target_status,
    reviewed_by_user_id=case when p_action='approved' then v_actor else null end,
    reviewed_at=case when p_action='approved' then clock_timestamp() else null end,
    review_comment=case when p_action='approved' then btrim(p_review_comment) else null end,
    lock_version=lock_version+1,updated_at=clock_timestamp()
  where id=v_bundle.id returning * into v_bundle;
  insert into qarar_governance.governance_bundle_reviews_v2(
    organization_id,bundle_id,action,comment,bundle_lock_version,actor_user_id
  ) values(v_org,v_bundle.id,p_action,btrim(p_review_comment),v_bundle.lock_version,v_actor);
  v_response:=jsonb_build_object('bundle_id',v_bundle.id,'status',v_bundle.status,
    'lock_version',v_bundle.lock_version,'reviewed_at',v_bundle.reviewed_at,
    'idempotent_replay',false);
  insert into qarar_governance.governance_bundle_command_receipts_v2(
    organization_id,bundle_id,actor_user_id,command_name,client_request_id,request_fingerprint,response_payload
  ) values(v_org,v_bundle.id,v_actor,v_command,p_client_request_id,v_fingerprint,v_response);
  perform qarar_audit.append_audit_log(v_org,v_audit_action,'governance_bundles_v2',v_bundle.id,
    jsonb_build_object('client_request_id',p_client_request_id,'lock_version',v_bundle.lock_version,'comment',btrim(p_review_comment)));
  return v_response;
end;
$$;

create or replace function qarar_governance.request_governance_bundle_changes_v2(
  p_bundle_id uuid,p_expected_lock_version integer,p_review_comment text,p_client_request_id uuid
) returns jsonb language plpgsql volatile security definer set search_path=pg_catalog as $$
begin
  perform qarar_iam.assert_permission('governance.model.review',null);
  return qarar_governance.review_governance_bundle_v2_core(
    p_bundle_id,'changes_requested',p_expected_lock_version,p_review_comment,p_client_request_id);
end;
$$;

create or replace function qarar_governance.approve_governance_bundle_v2(
  p_bundle_id uuid,p_expected_lock_version integer,p_review_comment text,p_client_request_id uuid
) returns jsonb language plpgsql volatile security definer set search_path=pg_catalog as $$
begin
  perform qarar_iam.assert_permission('governance.model.approve',null);
  return qarar_governance.review_governance_bundle_v2_core(
    p_bundle_id,'approved',p_expected_lock_version,p_review_comment,p_client_request_id);
end;
$$;

alter function qarar_governance.review_governance_bundle_v2_core(uuid,text,integer,text,uuid) owner to qarar_governance_executor;
alter function qarar_governance.request_governance_bundle_changes_v2(uuid,integer,text,uuid) owner to qarar_governance_executor;
alter function qarar_governance.approve_governance_bundle_v2(uuid,integer,text,uuid) owner to qarar_governance_executor;
revoke all on function qarar_governance.review_governance_bundle_v2_core(uuid,text,integer,text,uuid),
  qarar_governance.request_governance_bundle_changes_v2(uuid,integer,text,uuid),
  qarar_governance.approve_governance_bundle_v2(uuid,integer,text,uuid)
from public,anon,authenticated,service_role;
grant execute on function qarar_governance.review_governance_bundle_v2_core(uuid,text,integer,text,uuid),
  qarar_governance.request_governance_bundle_changes_v2(uuid,integer,text,uuid),
  qarar_governance.approve_governance_bundle_v2(uuid,integer,text,uuid)
to qarar_governance_executor;

commit;
