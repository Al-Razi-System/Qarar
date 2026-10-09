begin;

create or replace function qarar_governance.manage_topic_type_v2(p_bundle_id uuid,p_action text,p_expected_lock_version integer,p_client_request_id uuid,p_comment text default null)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog as $$
declare o uuid:=qarar_iam.current_organization_id(); actor uuid:=auth.uid(); type_id uuid; enabled boolean;
 b qarar_governance.governance_bundles_v2%rowtype; receipt qarar_governance.governance_bundle_command_receipts_v2%rowtype;
 v qarar_governance.topic_type_versions_v2%rowtype; nb uuid; nv uuid; existing uuid; result jsonb; fp text; old record;
begin
 if p_action not in ('begin_edit','enable','disable','submit','approve','activate','request_changes') or p_action is null
 or p_bundle_id is null or p_expected_lock_version is null or p_client_request_id is null then
  raise exception using errcode='22023',message='حدد التصنيف والإجراء ونسخة البيانات ومفتاح الطلب'; end if;
 perform qarar_iam.assert_permission(case when p_action in ('activate','enable','disable') then 'governance.model.activate'
  when p_action='approve' then 'governance.model.approve' when p_action='request_changes' then 'governance.model.review' else 'governance.model.edit' end,null);
 fp:=encode(sha256(convert_to(jsonb_build_array(p_bundle_id,p_action,p_expected_lock_version,p_comment)::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended(o::text||':'||actor::text||':'||p_client_request_id::text,0));
 select * into receipt from qarar_governance.governance_bundle_command_receipts_v2 where organization_id=o and actor_user_id=actor and command_name='manage_topic_type_v2' and client_request_id=p_client_request_id;
 if receipt.id is not null then
  if receipt.request_fingerprint<>fp then raise exception using errcode='40001',message='استُخدم مفتاح التكرار نفسه لطلب مختلف'; end if;
  return receipt.response_payload||jsonb_build_object('idempotent_replay',true);
 end if;
 select tv.topic_type_id into type_id from qarar_governance.governance_bundles_v2 gb join qarar_governance.topic_type_versions_v2 tv on tv.id=gb.topic_type_version_id and tv.organization_id=gb.organization_id where gb.id=p_bundle_id and gb.organization_id=o;
 if type_id is null then raise exception using errcode='P0002',message='تعذر العثور على التصنيف'; end if;
 -- Lock the stable identity first, serializing edits and replacement publication.
 select is_enabled into enabled from qarar_governance.topic_types_v2 where id=type_id and organization_id=o for update;
 select * into b from qarar_governance.governance_bundles_v2 where id=p_bundle_id and organization_id=o for update;
 if b.lock_version<>p_expected_lock_version then raise exception using errcode='40001',message='تم تعديل التصنيف في جلسة أخرى'; end if;
 select * into v from qarar_governance.topic_type_versions_v2 where id=b.topic_type_version_id and organization_id=o;
 if p_action='begin_edit' then
  if b.status not in ('effective','retired') or not exists(select 1 from qarar_governance.topic_type_authoring_profiles_v2 where topic_type_version_id=v.id and organization_id=o) then
   raise exception using errcode='55000',message='التصنيف ليس منشورًا أو يحتاج محررًا متوافقًا مع بياناته السابقة'; end if;
  select gb.id into existing from qarar_governance.governance_bundles_v2 gb join qarar_governance.topic_type_versions_v2 tv on tv.id=gb.topic_type_version_id and tv.organization_id=gb.organization_id
  where tv.topic_type_id=type_id and tv.organization_id=o and gb.status in ('draft','changes_requested','under_review','approved') order by tv.version_no desc limit 1;
  if existing is not null then raise exception using errcode='40001',message='يوجد تعديل غير منشور لهذا التصنيف؛ افتحه من القائمة'; end if;
  insert into qarar_governance.topic_type_versions_v2(organization_id,topic_type_id,classification_id,version_no,is_governed,acceptance_finality,rejection_finality,created_by_user_id)
  values(o,type_id,v.classification_id,(select max(version_no)+1 from qarar_governance.topic_type_versions_v2 where topic_type_id=type_id and organization_id=o),v.is_governed,v.acceptance_finality,v.rejection_finality,actor) returning id into nv;
  insert into qarar_governance.governance_bundles_v2(organization_id,topic_type_version_id,created_by_user_id) values(o,nv,actor) returning id into nb;
  insert into qarar_governance.topic_type_authorities_v2(organization_id,topic_type_version_id,legal_authority_id,authority_role,requirement_level,priority,created_by_user_id)
  select o,nv,legal_authority_id,authority_role,requirement_level,priority,actor from qarar_governance.topic_type_authorities_v2 where topic_type_version_id=v.id and organization_id=o;
  insert into qarar_governance.topic_type_workflow_bindings_v2(organization_id,topic_type_version_id,workflow_template_version_id,priority,source_layout_version_id,stage_policies,created_by_user_id)
  select o,nv,workflow_template_version_id,priority,source_layout_version_id,stage_policies,actor from qarar_governance.topic_type_workflow_bindings_v2 where topic_type_version_id=v.id and organization_id=o;
  insert into qarar_governance.topic_schedule_policies_v2(organization_id,topic_type_version_id,rule_type,rule_config,available_from_offset,target_offset,postpone_until_offset,maximum_postponements,created_by_user_id)
  select o,nv,rule_type,rule_config,available_from_offset,target_offset,postpone_until_offset,maximum_postponements,actor from qarar_governance.topic_schedule_policies_v2 where topic_type_version_id=v.id and organization_id=o;
  insert into qarar_governance.topic_type_authoring_profiles_v2(topic_type_version_id,organization_id,scope_kind,required_attachment_count,submission_mode)
  select nv,o,scope_kind,required_attachment_count,submission_mode from qarar_governance.topic_type_authoring_profiles_v2 where topic_type_version_id=v.id and organization_id=o;
  insert into qarar_governance.topic_type_origin_scopes_v2(topic_type_version_id,organization_id,council_id,governance_class_id)
  select nv,o,council_id,governance_class_id from qarar_governance.topic_type_origin_scopes_v2 where topic_type_version_id=v.id and organization_id=o;
  update qarar_governance.governance_bundles_v2 set lock_version=lock_version+1,updated_at=clock_timestamp() where id=b.id;
  result:=jsonb_build_object('bundle_id',nb,'lock_version',1,'status','draft','idempotent_replay',false);
 elsif p_action in ('enable','disable') then
  if not exists(select 1 from qarar_governance.topic_type_versions_v2 where topic_type_id=type_id and organization_id=o and status='effective') then
   raise exception using errcode='55000',message='يلزم تنشيط نسخة معتمدة قبل تغيير إتاحة التصنيف'; end if;
  update qarar_governance.topic_types_v2 set is_enabled=(p_action='enable'),updated_at=clock_timestamp() where id=type_id and organization_id=o;
  for old in select gb.id from qarar_governance.governance_bundles_v2 gb join qarar_governance.topic_type_versions_v2 tv on tv.id=gb.topic_type_version_id and tv.organization_id=gb.organization_id where tv.topic_type_id=type_id and tv.organization_id=o order by gb.id for update of gb loop
   update qarar_governance.governance_bundles_v2 set lock_version=lock_version+1,updated_at=clock_timestamp() where id=old.id;
  end loop;
  select lock_version into b.lock_version from qarar_governance.governance_bundles_v2 where id=b.id;
  result:=jsonb_build_object('bundle_id',b.id,'lock_version',b.lock_version,'is_enabled',p_action='enable','idempotent_replay',false);
 elsif p_action='submit' then result:=qarar_governance.submit_governance_bundle_v2(b.id,b.lock_version,p_client_request_id);
 elsif p_action='approve' then result:=qarar_governance.approve_governance_bundle_v2(b.id,b.lock_version,p_comment,p_client_request_id);
 elsif p_action='request_changes' then result:=qarar_governance.request_governance_bundle_changes_v2(b.id,b.lock_version,p_comment,p_client_request_id);
 else
  if b.status<>'approved' then raise exception using errcode='55000',message='اعتماد التصنيف مطلوب قبل التنشيط'; end if;
  -- Retire availability only. Executable workflow versions/instances are untouched.
  for old in select gb.id,gb.topic_type_version_id from qarar_governance.governance_bundles_v2 gb join qarar_governance.topic_type_versions_v2 tv on tv.id=gb.topic_type_version_id and tv.organization_id=gb.organization_id
   where tv.topic_type_id=type_id and tv.organization_id=o and tv.status='effective' and tv.id<>v.id order by gb.id for update of gb loop
   update qarar_governance.topic_type_versions_v2 set status='retired',updated_at=clock_timestamp() where id=old.topic_type_version_id;
   update qarar_governance.topic_type_workflow_bindings_v2 set status='retired',updated_at=clock_timestamp() where topic_type_version_id=old.topic_type_version_id;
   update qarar_governance.topic_schedule_policies_v2 set status='retired',updated_at=clock_timestamp() where topic_type_version_id=old.topic_type_version_id;
   update qarar_governance.governance_bundles_v2 set status='retired',lock_version=lock_version+1,updated_at=clock_timestamp() where id=old.id;
   insert into qarar_governance.governance_bundle_reviews_v2(organization_id,bundle_id,action,bundle_lock_version,actor_user_id)
   select o,id,'retired',lock_version,actor from qarar_governance.governance_bundles_v2 where id=old.id;
  end loop;
  result:=qarar_governance.activate_governance_bundle_v2(b.id,b.lock_version,current_date,p_client_request_id);
  -- Activation does not silently override an explicit disabled identity.
 end if;
 insert into qarar_governance.governance_bundle_command_receipts_v2(organization_id,bundle_id,actor_user_id,command_name,client_request_id,request_fingerprint,response_payload)
 values(o,b.id,actor,'manage_topic_type_v2',p_client_request_id,fp,result);
 perform qarar_audit.append_audit_log(o,'governance.topic_type.'||p_action,'topic_types_v2',type_id,jsonb_build_object('bundle_id',b.id,'client_request_id',p_client_request_id,'result',result));
 return result;
end $$;


alter function qarar_governance.save_governance_bundle_draft_v2(uuid,integer,uuid,jsonb) rename to save_governance_bundle_before_identity_lock_v2;
update qarar_architecture.function_registry set function_name='save_governance_bundle_before_identity_lock_v2' where function_oid='qarar_governance.save_governance_bundle_before_identity_lock_v2(uuid,integer,uuid,jsonb)'::regprocedure;
create function qarar_governance.save_governance_bundle_draft_v2(p_bundle_id uuid,p_expected_lock_version integer,p_client_request_id uuid,p_bundle jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
begin
 perform qarar_iam.assert_permission('governance.model.edit',null);
 if p_bundle_id is not null then
  perform 1 from qarar_governance.topic_types_v2 t join qarar_governance.topic_type_versions_v2 v on v.topic_type_id=t.id and v.organization_id=t.organization_id join qarar_governance.governance_bundles_v2 b on b.topic_type_version_id=v.id and b.organization_id=v.organization_id
  where b.id=p_bundle_id and b.organization_id=qarar_iam.current_organization_id() for update of t;
 end if;
 return qarar_governance.save_governance_bundle_before_identity_lock_v2(p_bundle_id,p_expected_lock_version,p_client_request_id,p_bundle);
end $$;
alter function qarar_governance.save_governance_bundle_draft_v2(uuid,integer,uuid,jsonb) owner to qarar_governance_executor;
revoke all on function qarar_governance.save_governance_bundle_draft_v2(uuid,integer,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function qarar_governance.save_governance_bundle_draft_v2(uuid,integer,uuid,jsonb) to qarar_api_executor;
insert into qarar_architecture.function_registry(function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate)
values('qarar_governance.save_governance_bundle_draft_v2(uuid,integer,uuid,jsonb)'::regprocedure,'save_governance_bundle_draft_v2','p_bundle_id uuid, p_expected_lock_version integer, p_client_request_id uuid, p_bundle jsonb','governance','qarar_governance',false);
notify pgrst,'reload schema';
commit;

