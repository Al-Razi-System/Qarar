begin;

-- Preserve genuine historical reviews; direct publication records activation, not a fake review.
alter table qarar_governance.governance_bundles_v2 add column publication_mode text not null default 'independent' check(publication_mode in ('independent','direct'));
alter table qarar_governance.topic_type_versions_v2 add column publication_mode text not null default 'independent' check(publication_mode in ('independent','direct'));
alter table qarar_governance.governance_bundles_v2 drop constraint governance_bundles_v2_lifecycle_evidence_check;
alter table qarar_governance.governance_bundles_v2 add constraint governance_bundles_v2_lifecycle_evidence_check check(
 (publication_mode='direct' and status in ('approved','effective','retired') and reviewed_by_user_id is null and reviewed_at is null)
 or (publication_mode='independent' and (
  (status='draft' and submitted_by_user_id is null)
  or (status in ('under_review','changes_requested') and submitted_by_user_id is not null and reviewed_by_user_id is null)
  or (status in ('approved','effective','retired') and submitted_by_user_id is not null and reviewed_by_user_id is not null and reviewed_at is not null))));
alter table qarar_governance.topic_type_versions_v2 drop constraint topic_type_versions_v2_check1;
alter table qarar_governance.topic_type_versions_v2 add constraint topic_type_versions_v2_publication_evidence_check check(
 status<>'effective' or (activation_allowed and effective_from is not null and activated_by_user_id is not null and activated_at is not null
 and ((publication_mode='independent' and approved_by_user_id is not null) or (publication_mode='direct' and approved_by_user_id is null and approved_at is null))));

alter function qarar_governance.manage_topic_type_v2(uuid,text,integer,uuid,text) rename to manage_topic_type_before_direct_v2;
update qarar_architecture.function_registry set function_name='manage_topic_type_before_direct_v2' where function_oid='qarar_governance.manage_topic_type_before_direct_v2(uuid,text,integer,uuid,text)'::regprocedure;
create function qarar_governance.manage_topic_type_v2(p_bundle_id uuid,p_action text,p_expected_lock_version integer,p_client_request_id uuid,p_comment text default null)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog as $$
declare o uuid:=qarar_iam.current_organization_id(); actor uuid:=auth.uid(); b qarar_governance.governance_bundles_v2%rowtype; validation jsonb; result jsonb;
begin
 if p_action<>'activate' or p_action is null then
  return qarar_governance.manage_topic_type_before_direct_v2(p_bundle_id,p_action,p_expected_lock_version,p_client_request_id,p_comment);
 end if;
 perform qarar_iam.assert_permission('governance.model.activate',null);
 if o is null or actor is null or p_bundle_id is null or p_expected_lock_version is null or p_client_request_id is null then raise exception using errcode='22023',message='حدد التصنيف ونسخة البيانات ومفتاح الطلب'; end if;
 perform pg_advisory_xact_lock(hashtextextended(o::text||':'||actor::text||':'||p_client_request_id::text,0));
 if exists(select 1 from qarar_governance.governance_bundle_command_receipts_v2 where organization_id=o and actor_user_id=actor and command_name='manage_topic_type_v2' and client_request_id=p_client_request_id) then
  return qarar_governance.manage_topic_type_before_direct_v2(p_bundle_id,p_action,p_expected_lock_version,p_client_request_id,p_comment);
 end if;
 perform 1 from qarar_governance.topic_types_v2 t join qarar_governance.topic_type_versions_v2 v on v.topic_type_id=t.id and v.organization_id=t.organization_id join qarar_governance.governance_bundles_v2 gb on gb.topic_type_version_id=v.id and gb.organization_id=v.organization_id where gb.id=p_bundle_id and gb.organization_id=o for update of t;
 select * into b from qarar_governance.governance_bundles_v2 where id=p_bundle_id and organization_id=o for update;
 if not found then raise exception using errcode='P0002',message='تعذر العثور على التصنيف'; end if;
 if b.lock_version<>p_expected_lock_version then raise exception using errcode='40001',message='تم تعديل التصنيف في جلسة أخرى؛ حدّث البيانات'; end if;
 if b.status in ('draft','changes_requested','under_review') then
  perform qarar_iam.assert_permission('governance.model.edit',null);
  if not exists(select 1 from qarar_governance.topic_type_authoring_profiles_v2 where topic_type_version_id=b.topic_type_version_id and organization_id=o) then raise exception using errcode='55000',message='يحتاج التصنيف السابق إلى استكمال متطلبات التقديم قبل التنشيط المباشر'; end if;
  validation:=qarar_governance.validate_governance_bundle_v2_core(b.id);
  if not coalesce((validation->>'is_valid')::boolean,false) then raise exception using errcode='23514',message='أكمل متطلبات التصنيف قبل تنشيطه',detail=(validation->'blocking_issues')::text; end if;
  update qarar_governance.topic_classifications_v2 c set status='approved',updated_at=clock_timestamp()
   from qarar_governance.topic_type_versions_v2 v where v.id=b.topic_type_version_id and v.classification_id=c.id and v.organization_id=o and c.organization_id=o and c.status in ('draft','under_review');
  update qarar_governance.topic_type_workflow_bindings_v2 set status='validated',updated_at=clock_timestamp() where topic_type_version_id=b.topic_type_version_id and organization_id=o and status='draft';
  update qarar_governance.topic_schedule_policies_v2 set status='validated',updated_at=clock_timestamp() where topic_type_version_id=b.topic_type_version_id and organization_id=o and status='draft';
  update qarar_governance.topic_type_versions_v2 set status='approved',publication_mode='direct',approved_by_user_id=null,approved_at=null,updated_at=clock_timestamp() where id=b.topic_type_version_id and organization_id=o;
  update qarar_governance.governance_bundles_v2 set status='approved',publication_mode='direct',reviewed_by_user_id=null,reviewed_at=null,review_comment=null,updated_at=clock_timestamp() where id=b.id and organization_id=o;
  perform qarar_audit.append_audit_log(o,'governance.topic_type.direct_publication','governance_bundles_v2',b.id,jsonb_build_object('client_request_id',p_client_request_id,'previous_status',b.status,'actor_user_id',actor));
 end if;
 -- Existing retirement, receipts and activation remain one transaction, including replacement publication.
 result:=qarar_governance.manage_topic_type_before_direct_v2(p_bundle_id,p_action,p_expected_lock_version,p_client_request_id,p_comment);
 return result;
end $$;
alter function qarar_governance.manage_topic_type_v2(uuid,text,integer,uuid,text) owner to qarar_governance_executor;
revoke all on function qarar_governance.manage_topic_type_v2(uuid,text,integer,uuid,text) from public,anon,authenticated,service_role;
grant execute on function qarar_governance.manage_topic_type_v2(uuid,text,integer,uuid,text) to qarar_api_executor;

alter function qarar_governance.get_governance_bundle_v2(uuid) rename to get_governance_bundle_before_direct_v2;
update qarar_architecture.function_registry set function_name='get_governance_bundle_before_direct_v2' where function_oid='qarar_governance.get_governance_bundle_before_direct_v2(uuid)'::regprocedure;
create function qarar_governance.get_governance_bundle_v2(p_bundle_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare o uuid:=qarar_iam.current_organization_id(); result jsonb; validation jsonb; b qarar_governance.governance_bundles_v2%rowtype; actions jsonb; reasons jsonb;
begin
 result:=qarar_governance.get_governance_bundle_before_direct_v2(p_bundle_id);
 select * into b from qarar_governance.governance_bundles_v2 where id=p_bundle_id and organization_id=o;
 if result->'authoring' is null or result->'authoring'='null'::jsonb then return result; end if;
 validation:=qarar_governance.validate_governance_bundle_v2_core(b.id);
 actions:=(result#>'{management,actions}')||jsonb_build_object('submit',false,'approve',false,'request_changes',false,
  'activate',b.status in ('draft','changes_requested','under_review','approved') and qarar_iam.has_permission('governance.model.activate',null) and (b.status='approved' or qarar_iam.has_permission('governance.model.edit',null)) and coalesce((validation->>'is_valid')::boolean,false));
 reasons:=coalesce((select jsonb_agg(x->>'message_ar') from jsonb_array_elements(validation->'blocking_issues') x),'[]'::jsonb);
 if b.status in ('draft','changes_requested','under_review','approved') and not qarar_iam.has_permission('governance.model.activate',null) then reasons:=reasons||jsonb_build_array('لا تملك صلاحية تنشيط التصنيفات.'); end if;
 if b.status in ('draft','changes_requested','under_review') and not qarar_iam.has_permission('governance.model.edit',null) then reasons:=reasons||jsonb_build_array('يلزم امتلاك صلاحية تحرير التصنيف لتنشيطه مباشرة.'); end if;
 return jsonb_set(jsonb_set(result,'{management,actions}',actions),'{management,reasons}',reasons);
end $$;
alter function qarar_governance.get_governance_bundle_v2(uuid) owner to qarar_governance_executor;
revoke all on function qarar_governance.get_governance_bundle_v2(uuid) from public,anon,authenticated,service_role;
grant execute on function qarar_governance.get_governance_bundle_v2(uuid) to qarar_api_executor;
insert into qarar_architecture.function_registry(function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate) values
 ('qarar_governance.manage_topic_type_v2(uuid,text,integer,uuid,text)'::regprocedure,'manage_topic_type_v2','p_bundle_id uuid, p_action text, p_expected_lock_version integer, p_client_request_id uuid, p_comment text','governance','qarar_governance',false),
 ('qarar_governance.get_governance_bundle_v2(uuid)'::regprocedure,'get_governance_bundle_v2','p_bundle_id uuid','governance','qarar_governance',false);
notify pgrst,'reload schema';
commit;
