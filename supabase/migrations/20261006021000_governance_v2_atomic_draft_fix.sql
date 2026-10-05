begin;

create or replace function qarar_governance.save_governance_bundle_draft_v2(
  p_bundle_id uuid,p_expected_lock_version integer,p_client_request_id uuid,p_bundle jsonb
) returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,qarar_governance as $$
declare
  v_org uuid:=qarar_iam.current_organization_id();v_actor uuid:=auth.uid();v_fingerprint text;
  v_receipt qarar_governance.governance_bundle_command_receipts_v2%rowtype;
  v_classification_id uuid;v_topic_type_id uuid;v_version_id uuid;v_workflow_version_id uuid;
  v_bundle qarar_governance.governance_bundles_v2%rowtype;v_response jsonb;
  v_classification jsonb:=p_bundle->'classification';v_topic_type jsonb:=p_bundle->'topic_type';
  v_version jsonb:=p_bundle->'version';v_workflow jsonb:=p_bundle->'workflow';v_schedule jsonb:=p_bundle->'schedule';
begin
  perform qarar_iam.assert_permission('governance.model.edit',null);
  if v_org is null or v_actor is null then raise exception using errcode='42501',message='تعذر تحديد المؤسسة أو المستخدم الحالي';end if;
  if p_client_request_id is null or p_bundle is null or jsonb_typeof(p_bundle)<>'object' then
    raise exception using errcode='22023',message='مفتاح التكرار ومحتوى الحزمة مطلوبان';end if;
  if p_bundle_id is not null and p_expected_lock_version is null then
    raise exception using errcode='22023',message='نسخة المسودة المتوقعة مطلوبة عند التعديل';end if;
  if p_bundle ? 'id' or p_bundle ? 'reference_number' or p_bundle ? 'status' or p_bundle ? 'activation_allowed'
     or coalesce(v_classification ? 'id',false) or coalesce(v_classification ? 'reference_number',false)
     or coalesce(v_classification ? 'status',false) or coalesce(v_classification ? 'activation_allowed',false)
     or coalesce(v_topic_type ? 'id',false) or coalesce(v_topic_type ? 'reference_number',false)
     or coalesce(v_topic_type ? 'status',false) or coalesce(v_topic_type ? 'activation_allowed',false)
     or coalesce(v_version ? 'id',false) or coalesce(v_version ? 'reference_number',false)
     or coalesce(v_version ? 'status',false) or coalesce(v_version ? 'activation_allowed',false) then
    raise exception using errcode='22023',message='لا ترسل المعرفات أو الحالة أو التفعيل؛ ينشئها النظام تلقائياً';end if;
  if jsonb_typeof(v_classification)<>'object' or jsonb_typeof(v_topic_type)<>'object' or jsonb_typeof(v_version)<>'object'
     or btrim(coalesce(v_classification->>'code',''))!~'^[a-z][a-z0-9_]*$'
     or char_length(btrim(coalesce(v_classification->>'name_ar',''))) not between 2 and 200
     or btrim(coalesce(v_topic_type->>'code',''))!~'^[a-z][a-z0-9_.-]*$'
     or char_length(btrim(coalesce(v_topic_type->>'name_ar',''))) not between 3 and 300
     or coalesce(v_version->>'acceptance_finality','') not in ('advance','complete','return_previous','refer_lower','conditional')
     or coalesce(v_version->>'rejection_finality','') not in ('complete','return_previous','refer_lower','conditional') then
    raise exception using errcode='22023',message='أكمل بيانات التصنيف ونوع الموضوع وقاعدة النتيجة بصيغة صحيحة';end if;
  if v_workflow is not null and (jsonb_typeof(v_workflow)<>'object'
     or coalesce(v_workflow->>'workflow_template_version_id','')!~'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$') then
    raise exception using errcode='22023',message='اختر نسخة مسار صالحة';end if;
  if v_schedule is not null and (jsonb_typeof(v_schedule)<>'object'
     or coalesce(v_schedule->>'rule_type','') not in ('none','fixed_date','monthly_week','seasonal','bounded_recurrence')
     or jsonb_typeof(coalesce(v_schedule->'rule_config','{}'::jsonb))<>'object'
     or coalesce(v_schedule->>'maximum_postponements','0')!~'^\d+$') then
    raise exception using errcode='22023',message='إعداد الجدولة غير صالح';end if;

  v_fingerprint:=encode(pg_catalog.sha256(convert_to(coalesce(p_bundle_id::text,'new')||':'||coalesce(p_expected_lock_version::text,'new')||':'||p_bundle::text,'UTF8')),'hex');
  perform pg_advisory_xact_lock(hashtextextended(v_org::text||':'||v_actor::text||':'||p_client_request_id::text,0));
  select * into v_receipt from qarar_governance.governance_bundle_command_receipts_v2
  where organization_id=v_org and actor_user_id=v_actor and command_name='save_governance_bundle_draft_v2' and client_request_id=p_client_request_id;
  if v_receipt.id is not null then
    if v_receipt.request_fingerprint<>v_fingerprint then raise exception using errcode='40001',message='استُخدم مفتاح التكرار نفسه لطلب مختلف';end if;
    return v_receipt.response_payload||jsonb_build_object('idempotent_replay',true);
  end if;

  insert into qarar_governance.topic_classifications_v2(organization_id,code,name_ar,name_en,description,created_by_user_id)
  values(v_org,lower(btrim(v_classification->>'code')),btrim(v_classification->>'name_ar'),
    nullif(btrim(coalesce(v_classification->>'name_en','')),''),nullif(btrim(coalesce(v_classification->>'description','')),''),v_actor)
  on conflict(organization_id,code) do nothing returning id into v_classification_id;
  if v_classification_id is null then
    select id into v_classification_id from qarar_governance.topic_classifications_v2
    where organization_id=v_org and code=lower(btrim(v_classification->>'code')) and status<>'retired';
    if v_classification_id is null then raise exception using errcode='22023',message='التصنيف المحدد غير متاح';end if;
  end if;

  if p_bundle_id is null then
    insert into qarar_governance.topic_types_v2(organization_id,code,name_ar,name_en,description,created_by_user_id)
    values(v_org,lower(btrim(v_topic_type->>'code')),btrim(v_topic_type->>'name_ar'),
      nullif(btrim(coalesce(v_topic_type->>'name_en','')),''),nullif(btrim(coalesce(v_topic_type->>'description','')),''),v_actor)
    returning id into v_topic_type_id;
    insert into qarar_governance.topic_type_versions_v2(organization_id,topic_type_id,classification_id,version_no,is_governed,acceptance_finality,rejection_finality,created_by_user_id)
    values(v_org,v_topic_type_id,v_classification_id,1,coalesce((v_version->>'is_governed')::boolean,true),v_version->>'acceptance_finality',v_version->>'rejection_finality',v_actor)
    returning id into v_version_id;
    insert into qarar_governance.governance_bundles_v2(organization_id,topic_type_version_id,created_by_user_id)
    values(v_org,v_version_id,v_actor) returning * into v_bundle;
  else
    select * into v_bundle from qarar_governance.governance_bundles_v2
    where id=p_bundle_id and organization_id=v_org and created_by_user_id=v_actor for update;
    if v_bundle.id is null then raise exception using errcode='P0002',message='مسودة حزمة الحوكمة غير موجودة';end if;
    if v_bundle.status not in ('draft','changes_requested') then raise exception using errcode='55000',message='لا يمكن تعديل الحزمة بعد إرسالها للمراجعة';end if;
    if v_bundle.lock_version<>p_expected_lock_version then raise exception using errcode='40001',message='تم تعديل الحزمة في جلسة أخرى؛ حدّث البيانات ثم أعد المحاولة';end if;
    v_version_id:=v_bundle.topic_type_version_id;
    select topic_type_id into v_topic_type_id from qarar_governance.topic_type_versions_v2 where id=v_version_id and organization_id=v_org;
    update qarar_governance.topic_types_v2 set code=lower(btrim(v_topic_type->>'code')),name_ar=btrim(v_topic_type->>'name_ar'),
      name_en=nullif(btrim(coalesce(v_topic_type->>'name_en','')),''),description=nullif(btrim(coalesce(v_topic_type->>'description','')),''),updated_at=clock_timestamp()
    where id=v_topic_type_id and organization_id=v_org;
    update qarar_governance.topic_type_versions_v2 set classification_id=v_classification_id,
      is_governed=coalesce((v_version->>'is_governed')::boolean,true),acceptance_finality=v_version->>'acceptance_finality',
      rejection_finality=v_version->>'rejection_finality',status='draft',updated_at=clock_timestamp()
    where id=v_version_id and organization_id=v_org and status in ('draft','under_review');
    update qarar_governance.governance_bundles_v2 set status='draft',submitted_by_user_id=null,submitted_at=null,
      reviewed_by_user_id=null,reviewed_at=null,review_comment=null,lock_version=lock_version+1,updated_at=clock_timestamp()
    where id=v_bundle.id returning * into v_bundle;
  end if;

  if v_workflow is not null then
    v_workflow_version_id:=(v_workflow->>'workflow_template_version_id')::uuid;
    if not exists(select 1 from qarar_governance.workflow_template_versions w
      join qarar_governance.workflow_templates t on t.id=w.workflow_template_id and t.organization_id=w.organization_id
      where w.id=v_workflow_version_id and w.organization_id=v_org and w.status='active' and w.validation_status='valid' and t.status='active') then
      raise exception using errcode='22023',message='المسار المحدد غير فعال أو لم يجتز التحقق';end if;
    delete from qarar_governance.topic_type_workflow_bindings_v2 where topic_type_version_id=v_version_id and organization_id=v_org and status='draft';
    insert into qarar_governance.topic_type_workflow_bindings_v2(organization_id,topic_type_version_id,workflow_template_version_id,created_by_user_id)
    values(v_org,v_version_id,v_workflow_version_id,v_actor)
    on conflict(topic_type_version_id,workflow_template_version_id) do update set updated_at=clock_timestamp();
  end if;
  if v_schedule is not null then
    insert into qarar_governance.topic_schedule_policies_v2(organization_id,topic_type_version_id,rule_type,rule_config,maximum_postponements,created_by_user_id)
    values(v_org,v_version_id,v_schedule->>'rule_type',coalesce(v_schedule->'rule_config','{}'::jsonb),coalesce((v_schedule->>'maximum_postponements')::integer,0),v_actor)
    on conflict(topic_type_version_id) do update set rule_type=excluded.rule_type,rule_config=excluded.rule_config,
      maximum_postponements=excluded.maximum_postponements,status='draft',updated_at=clock_timestamp();
  end if;

  v_response:=jsonb_build_object('bundle_id',v_bundle.id,'reference_numbers',jsonb_build_object(
    'bundle',v_bundle.reference_number,'classification',(select reference_number from qarar_governance.topic_classifications_v2 where id=v_classification_id),
    'topic_type',(select reference_number from qarar_governance.topic_types_v2 where id=v_topic_type_id),
    'topic_type_version',(select reference_number from qarar_governance.topic_type_versions_v2 where id=v_version_id)),
    'lock_version',v_bundle.lock_version,'status',v_bundle.status,'validation_summary',
      qarar_governance.validate_governance_bundle_v2_core(v_bundle.id)||jsonb_build_object(
        'is_complete',(qarar_governance.validate_governance_bundle_v2_core(v_bundle.id)->>'is_valid')::boolean),
    'idempotent_replay',false);
  insert into qarar_governance.governance_bundle_command_receipts_v2(organization_id,bundle_id,actor_user_id,command_name,client_request_id,request_fingerprint,response_payload)
  values(v_org,v_bundle.id,v_actor,'save_governance_bundle_draft_v2',p_client_request_id,v_fingerprint,v_response);
  perform qarar_audit.append_audit_log(v_org,'governance.model.draft.saved','governance_bundles_v2',v_bundle.id,jsonb_build_object('client_request_id',p_client_request_id,'lock_version',v_bundle.lock_version));
  return v_response;
exception when unique_violation then raise exception using errcode='23505',message='رمز نوع الموضوع مستخدم داخل المؤسسة';
end;
$$;

alter function qarar_governance.save_governance_bundle_draft_v2(uuid,integer,uuid,jsonb) owner to qarar_governance_executor;
revoke all on function qarar_governance.save_governance_bundle_draft_v2(uuid,integer,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function qarar_governance.save_governance_bundle_draft_v2(uuid,integer,uuid,jsonb) to qarar_governance_executor,qarar_api_executor;

commit;
