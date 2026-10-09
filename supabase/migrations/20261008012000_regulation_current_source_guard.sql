begin;
-- Serialize with legacy inheritance and protect against publishing stale drafts.
create or replace function qarar_governance.admin_save_regulation_library_v2(
 p_policy_id uuid,p_action text,p_payload jsonb,p_expected_revision text,p_client_request_id uuid
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
 v_org uuid:=qarar_iam.current_organization_id(); v_actor uuid:=auth.uid();
 v_version uuid; v_item uuid; v_source_item uuid; v_saved jsonb; v_result jsonb;
 v_fingerprint text; v_existing_fingerprint text; v_status text; v_active boolean;
 v_row qarar_governance.policy_versions%rowtype;
 v_item_row qarar_governance.policy_items%rowtype;
begin
 perform qarar_iam.assert_permission('governance.policies.read',null);
 if p_policy_id is not null then
  perform pg_advisory_xact_lock(hashtextextended(p_policy_id::text,0));
 end if;
 if p_action not in ('publish','set_item_active') or p_action is null then
  return qarar_governance.save_regulation_library_compat_v2(p_policy_id,p_action,p_payload,p_expected_revision,p_client_request_id);
 end if;
 perform qarar_iam.assert_permission('governance.policies.read',null);
 perform qarar_iam.assert_permission('governance.policies.manage',null);
 if v_actor is null or p_client_request_id is null or jsonb_typeof(p_payload) is distinct from 'object'
  or octet_length(p_payload::text)>131072
  or not (array(select jsonb_object_keys(p_payload)) <@ (case when p_action='publish' then array['version_id'] else array['version_id','item_id','is_active'] end)) then
  raise exception using errcode='22023',message='LIBRARY_INVALID_INPUT';
 end if;
 if p_action='set_item_active' and jsonb_typeof(p_payload->'is_active') is distinct from 'boolean' then
  raise exception using errcode='22023',message='LIBRARY_INVALID_INPUT'; end if;
 v_fingerprint:=md5(jsonb_build_array(p_policy_id,p_action,p_payload,p_expected_revision)::text);
 perform pg_advisory_xact_lock(hashtextextended(v_org::text||':library:'||v_actor::text||':'||p_client_request_id::text,0));
 select result,fingerprint into v_saved,v_existing_fingerprint from qarar_governance.regulation_library_commands_v2
  where organization_id=v_org and actor_id=v_actor and request_id=p_client_request_id;
 if found then
  if v_existing_fingerprint<>v_fingerprint then raise exception using errcode='22023',message='LIBRARY_REQUEST_REUSED'; end if;
  return qarar_governance.admin_get_regulation_library_v2(p_policy_id)||v_saved||jsonb_build_object('idempotent_replay',true);
 end if;
 select status into v_status from qarar_governance.policies where id=p_policy_id and organization_id=v_org for update;
 if not found then raise exception using errcode='P0002',message='LIBRARY_NOT_FOUND'; end if;
 v_result:=qarar_governance.admin_get_regulation_library_v2(p_policy_id);
 if p_expected_revision is null or p_expected_revision<>v_result->>'revision' then
  raise exception using errcode='PT409',message='LIBRARY_CONFLICT'; end if;
 if v_status<>'active' then raise exception using errcode='55000',message='LIBRARY_ARCHIVED'; end if;
 v_version:=nullif(p_payload->>'version_id','')::uuid;
 select * into v_row from qarar_governance.policy_versions where id=v_version and policy_id=p_policy_id and organization_id=v_org for update;
 if not found then raise exception using errcode='P0002',message='LIBRARY_NOT_FOUND'; end if;
 if not v_row.library_mode then raise exception using errcode='55000',message='LIBRARY_LEGACY_REVIEW'; end if;
 if v_row.legal_status not in ('draft','under_review','approved','effective') then
  raise exception using errcode='PT409',message='LIBRARY_HISTORICAL_SOURCE'; end if;
 if exists(select 1 from qarar_governance.policy_versions where policy_id=p_policy_id and version_no>v_row.version_no) then
  raise exception using errcode='PT409',message='LIBRARY_PENDING_CHANGES'; end if;
 if p_action='publish' and v_row.legal_status='effective' then
  raise exception using errcode='PT409',message='LIBRARY_ALREADY_PUBLISHED'; end if;
 if p_action='set_item_active' then
  v_item:=nullif(p_payload->>'item_id','')::uuid; v_active:=(p_payload->>'is_active')::boolean;
  select * into v_item_row from qarar_governance.policy_items where id=v_item and policy_version_id=v_version and organization_id=v_org for update;
  if not found then raise exception using errcode='P0002',message='LIBRARY_NOT_FOUND'; end if;
  v_source_item:=v_item;
  if v_row.legal_status='effective' then
   -- Never publish someone else's unrelated unfinished text when toggling the
   -- currently effective source. The actor must open that draft explicitly.
   if exists(select 1 from qarar_governance.policy_versions where policy_id=p_policy_id
      and library_mode and legal_status in ('draft','under_review','approved')) then
    raise exception using errcode='PT409',message='LIBRARY_PENDING_CHANGES'; end if;
   if v_item_row.is_active is distinct from v_active then
    -- The inheritance command copies the latest version; refuse old-current
    -- selection if a newer legacy process exists instead of copying wrong text.
    if exists(select 1 from qarar_governance.policy_versions where policy_id=p_policy_id and version_no>v_row.version_no) then
     raise exception using errcode='PT409',message='LIBRARY_PENDING_CHANGES'; end if;
    v_result:=qarar_governance.admin_create_policy_version(p_policy_id,null,'تغيير حالة بند مباشرة');
    v_version:=(v_result->>'id')::uuid;
    update qarar_governance.policy_versions set library_mode=true,reference_number=qarar_governance.next_v2_reference('REV') where id=v_version;
    select id into v_item from qarar_governance.policy_items where policy_version_id=v_version and supersedes_item_id=v_source_item;
    if v_item is null then raise exception using errcode='23514',message='LIBRARY_INHERITANCE_FAILED'; end if;
    select * into v_row from qarar_governance.policy_versions where id=v_version;
   end if;
  elsif v_row.legal_status in ('under_review','approved') then
   if exists(select 1 from qarar_governance.topic_governance_mappings where policy_version_id=v_version) then
    raise exception using errcode='55000',message='LIBRARY_LEGACY_REVIEW'; end if;
   update qarar_governance.policy_versions set legal_status='draft' where id=v_version;
   v_row.legal_status:='draft';
  end if;
  if v_row.legal_status='draft' then
   perform qarar_governance.assert_policy_version_editable(v_version);
   update qarar_governance.policy_items set is_active=v_active where id=v_item;
  end if;
 end if;
 if v_row.legal_status<>'effective' then
  if exists(select 1 from qarar_governance.topic_governance_mappings where policy_version_id=v_version) then
   raise exception using errcode='55000',message='LIBRARY_LEGACY_REVIEW'; end if;
  if not exists(select 1 from qarar_governance.policy_items where policy_version_id=v_version and item_type not in ('chapter','section'))
   or exists(select 1 from qarar_governance.policy_items where policy_version_id=v_version and item_type not in ('chapter','section')
    and nullif(btrim(coalesce(nullif(btrim(official_text),''),body_text)),'') is null) then
   raise exception using errcode='23514',message='LIBRARY_CONTENT_REQUIRED'; end if;
  if exists(select 1 from qarar_governance.policy_versions where policy_id=p_policy_id and legal_status='effective' and effective_from>current_date) then
   raise exception using errcode='22023',message='LIBRARY_INVALID_DATE'; end if;
  update qarar_governance.policy_versions set legal_status='expired',effective_to=greatest(effective_from,current_date-1)
   where policy_id=p_policy_id and legal_status='effective';
  update qarar_governance.policy_versions set legal_status='effective',effective_from=current_date,effective_to=null,
   approved_by_user_id=v_actor,approved_at=clock_timestamp(),activated_by_user_id=v_actor,activated_at=clock_timestamp()
   where id=v_version;
 end if;
 perform qarar_audit.append_audit_log(v_org,'governance.library.'||p_action,'policies',p_policy_id,
  jsonb_build_object('version_id',v_version,'item_id',v_item,'source_item_id',v_source_item,'is_active',v_active,'request_id',p_client_request_id,'direct_activation',true));
 v_saved:=jsonb_build_object('policy_id',p_policy_id,'selected_version_id',v_version,'item_id',v_item);
 insert into qarar_governance.regulation_library_commands_v2(organization_id,actor_id,request_id,fingerprint,result)
  values(v_org,v_actor,p_client_request_id,v_fingerprint,v_saved);
 return qarar_governance.admin_get_regulation_library_v2(p_policy_id)||v_saved||jsonb_build_object('idempotent_replay',false);
end $$;
alter function qarar_governance.admin_save_regulation_library_v2(uuid,text,jsonb,text,uuid) owner to qarar_governance_executor;
revoke all on function qarar_governance.admin_save_regulation_library_v2(uuid,text,jsonb,text,uuid) from public,anon,authenticated,service_role;
grant execute on function qarar_governance.admin_save_regulation_library_v2(uuid,text,jsonb,text,uuid) to qarar_api_executor;
create or replace function qarar_governance.admin_get_regulation_library_v2(p_policy_id uuid)
 returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare v_result jsonb; v_ids jsonb;
begin
 v_result:=qarar_governance.get_regulation_library_compat_v2(p_policy_id);
 select coalesce(jsonb_agg(v.id),'[]') into v_ids from qarar_governance.policy_versions v
 where v.policy_id=p_policy_id and v.organization_id=qarar_iam.current_organization_id()
  and v.library_mode and (v_result->'capabilities'->>'can_manage')::boolean
  and v_result->'policy'->>'status'='active'
  and not exists(select 1 from qarar_governance.policy_versions n where n.policy_id=p_policy_id and n.version_no>v.version_no)
  and ((v.legal_status in ('draft','under_review','approved') and not exists(
    select 1 from qarar_governance.topic_governance_mappings m where m.policy_version_id=v.id))
   or (v.legal_status='effective' and not exists(select 1 from qarar_governance.policy_versions n
     where n.policy_id=p_policy_id and n.id<>v.id and n.library_mode and n.legal_status in ('draft','under_review','approved'))));
 return v_result||jsonb_build_object('direct_activation_version_ids',v_ids);
end $$;
alter function qarar_governance.admin_get_regulation_library_v2(uuid) owner to qarar_governance_executor;
revoke all on function qarar_governance.admin_get_regulation_library_v2(uuid) from public,anon,authenticated,service_role;
grant execute on function qarar_governance.admin_get_regulation_library_v2(uuid) to qarar_api_executor;

-- Renaming preserves OIDs. Keep the registry aligned with both compatibility
-- implementations and the newly allocated dispatcher/read function OIDs.
update qarar_architecture.function_registry r set function_name=p.proname
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where r.function_oid=p.oid and n.nspname='qarar_governance'
 and p.proname in ('save_regulation_library_compat_v2','get_regulation_library_compat_v2');
insert into qarar_architecture.function_registry(function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate)
 select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),'governance',n.nspname,false
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='qarar_governance' and p.proname in ('admin_get_regulation_library_v2','admin_save_regulation_library_v2')
 on conflict(function_oid) do nothing;
notify pgrst,'reload schema';
commit;
