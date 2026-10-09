begin;
-- An optimistic business conflict is terminal HTTP 409, not a retryable
-- PostgreSQL serialization failure (40xxx maps to HTTP 500).
create or replace function qarar_governance.admin_save_regulation_library_v2(
 p_policy_id uuid,p_action text,p_payload jsonb,p_expected_revision text,p_client_request_id uuid
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
 v_org uuid:=qarar_iam.current_organization_id(); v_actor uuid:=auth.uid();
 v_policy uuid:=p_policy_id; v_version uuid; v_item uuid; v_parent uuid;
 v_reference text; v_result jsonb; v_saved jsonb; v_fingerprint text; v_allowed text[];
 v_row qarar_governance.policy_versions%rowtype;
 v_item_row qarar_governance.policy_items%rowtype;
 v_current qarar_governance.policy_versions%rowtype;
 v_from date; v_order integer; v_status text;
begin
 perform qarar_iam.assert_permission('governance.policies.read',null);
 if p_action in ('approve','activate','return') then
  perform qarar_iam.assert_permission('governance.policies.approve',null);
 else perform qarar_iam.assert_permission('governance.policies.manage',null); end if;
 if v_actor is null or p_client_request_id is null or jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>131072 then
  raise exception using errcode='22023',message='LIBRARY_INVALID_INPUT'; end if;
 v_allowed:=case p_action
  when 'create' then array['name_ar','description']
  when 'save_identity' then array['name_ar','description']
  when 'begin_edit' then array[]::text[]
  when 'save_item' then array['version_id','item_id','parent_item_id','item_type','title_ar','body_text','interpretation_text','source_locator','source_page_from','source_page_to']
  when 'remove_item' then array['version_id','item_id']
  when 'submit' then array['version_id']
  when 'approve' then array['version_id']
  when 'return' then array['version_id','reason']
  when 'activate' then array['version_id','effective_from']
  when 'set_status' then array['status']
  else null end;
 if v_allowed is null or not array(select jsonb_object_keys(p_payload)) <@ v_allowed then
  raise exception using errcode='22023',message='LIBRARY_INVALID_INPUT'; end if;
 v_fingerprint:=md5(jsonb_build_array(p_policy_id,p_action,p_payload,p_expected_revision)::text);
 perform pg_advisory_xact_lock(hashtextextended(v_org::text||':library:'||v_actor::text||':'||p_client_request_id::text,0));
 select result,fingerprint into v_saved,v_reference from qarar_governance.regulation_library_commands_v2
  where organization_id=v_org and actor_id=v_actor and request_id=p_client_request_id;
 if found then
  if v_reference<>v_fingerprint then raise exception using errcode='22023',message='LIBRARY_REQUEST_REUSED'; end if;
  return qarar_governance.admin_get_regulation_library_v2((v_saved->>'policy_id')::uuid)||v_saved||jsonb_build_object('idempotent_replay',true);
 end if;
 if p_action='create' then
  if p_policy_id is not null or p_expected_revision is not null then raise exception using errcode='22023',message='LIBRARY_INVALID_INPUT'; end if;
  if jsonb_typeof(p_payload->'name_ar') is distinct from 'string' or char_length(btrim(p_payload->>'name_ar')) not between 3 and 300 then
   raise exception using errcode='22023',message='LIBRARY_NAME_REQUIRED'; end if;
  loop
   v_reference:=qarar_governance.next_v2_reference('REG');
   exit when not exists(select 1 from qarar_governance.policies where organization_id=v_org and code=lower(v_reference));
  end loop;
  v_result:=qarar_governance.admin_create_policy_idempotent(lower(v_reference),p_payload->>'name_ar',null,'regulation',p_payload->>'description',null,p_client_request_id);
  v_policy:=(v_result->>'id')::uuid;
  update qarar_governance.policies set reference_number=v_reference where id=v_policy;
  v_result:=qarar_governance.admin_create_policy_version(v_policy,null,null);
  v_version:=(v_result->>'id')::uuid;
  update qarar_governance.policy_versions set library_mode=true,reference_number=qarar_governance.next_v2_reference('REV') where id=v_version;
 else
  select status into v_status from qarar_governance.policies where id=v_policy and organization_id=v_org for update;
  if not found then raise exception using errcode='P0002',message='LIBRARY_NOT_FOUND'; end if;
  v_result:=qarar_governance.admin_get_regulation_library_v2(v_policy);
  if p_expected_revision is null or p_expected_revision<>v_result->>'revision' then
   raise exception using errcode='PT409',message='LIBRARY_CONFLICT'; end if;
  if v_status<>'active' and p_action<>'set_status' then raise exception using errcode='55000',message='LIBRARY_ARCHIVED'; end if;
  if p_action='save_identity' then
   if jsonb_typeof(p_payload->'name_ar') is distinct from 'string' or char_length(btrim(p_payload->>'name_ar')) not between 3 and 300 then
    raise exception using errcode='22023',message='LIBRARY_NAME_REQUIRED'; end if;
   update qarar_governance.policies set name_ar=btrim(p_payload->>'name_ar'),description=nullif(btrim(p_payload->>'description'),'') where id=v_policy;
  elsif p_action='set_status' then
   if coalesce(p_payload->>'status','') not in ('active','inactive','archived') then raise exception using errcode='22023',message='LIBRARY_INVALID_INPUT'; end if;
   update qarar_governance.policies set status=p_payload->>'status' where id=v_policy;
  elsif p_action='begin_edit' then
   if exists(select 1 from qarar_governance.policy_versions where policy_id=v_policy and legal_status='under_review') then
    raise exception using errcode='55000',message='LIBRARY_IN_REVIEW'; end if;
   select id into v_version from qarar_governance.policy_versions where policy_id=v_policy and legal_status='draft' and library_mode and not exists(select 1 from qarar_governance.topic_governance_mappings m where m.policy_version_id=policy_versions.id) order by version_no desc limit 1 for update;
   if v_version is null then
    v_result:=qarar_governance.admin_create_policy_version(v_policy,null,null); v_version:=(v_result->>'id')::uuid;
    update qarar_governance.policy_versions set library_mode=true,reference_number=qarar_governance.next_v2_reference('REV'),automation_status='not_configured',readiness_percent=0 where id=v_version;
   end if;
   perform qarar_governance.assert_policy_version_editable(v_version);
  else
   v_version:=(p_payload->>'version_id')::uuid;
   select * into v_row from qarar_governance.policy_versions where id=v_version and policy_id=v_policy and organization_id=v_org for update;
   if not found then raise exception using errcode='P0002',message='LIBRARY_NOT_FOUND'; end if;
   if p_action in ('save_item','remove_item') then
    perform qarar_governance.assert_policy_version_editable(v_version);
    v_item:=nullif(p_payload->>'item_id','')::uuid;
    if v_item is not null then
     select * into v_item_row from qarar_governance.policy_items where id=v_item and policy_version_id=v_version and organization_id=v_org for update;
     if not found then raise exception using errcode='P0002',message='LIBRARY_NOT_FOUND'; end if;
    end if;
    if p_action='remove_item' then
     if v_item is null then raise exception using errcode='22023',message='LIBRARY_INVALID_INPUT'; end if;
     if exists(select 1 from qarar_governance.policy_items where parent_item_id=v_item)
       or exists(select 1 from qarar_governance.policy_attachments where policy_item_id=v_item) then
      raise exception using errcode='23503',message='LIBRARY_ITEM_LINKED'; end if;
     delete from qarar_governance.policy_items where id=v_item;
    else
     if jsonb_typeof(p_payload->'title_ar') is distinct from 'string' or char_length(btrim(p_payload->>'title_ar')) not between 2 and 500
      or coalesce(p_payload->>'item_type','') not in ('article','clause','chapter','section','procedure')
      or jsonb_typeof(p_payload->'body_text') is distinct from 'string'
      or (p_payload->>'item_type' not in ('chapter','section') and nullif(btrim(p_payload->>'body_text'),'') is null) then
      raise exception using errcode='22023',message='LIBRARY_TEXT_REQUIRED'; end if;
     v_parent:=nullif(p_payload->>'parent_item_id','')::uuid;
     if v_parent is not null then
      if not exists(select 1 from qarar_governance.policy_items where id=v_parent and policy_version_id=v_version and organization_id=v_org)
        or v_parent=v_item or exists(with recursive descendants as (
         select id from qarar_governance.policy_items where parent_item_id=v_item
         union select i.id from qarar_governance.policy_items i join descendants d on i.parent_item_id=d.id
        ) select 1 from descendants where id=v_parent) then
       raise exception using errcode='22023',message='LIBRARY_PARENT_INVALID'; end if;
     end if;
     if v_item is null then
      select coalesce(max(sort_order),0)+10 into v_order from qarar_governance.policy_items where policy_version_id=v_version;
      insert into qarar_governance.policy_items(organization_id,policy_version_id,item_code,title_ar,body_text,official_text,item_type,sort_order,parent_item_id,governance_mode)
       values(v_org,v_version,qarar_governance.next_v2_reference('ART'),btrim(p_payload->>'title_ar'),p_payload->>'body_text',p_payload->>'body_text',p_payload->>'item_type',v_order,v_parent,'custom_route_allowed') returning id into v_item;
     else
      update qarar_governance.policy_items set title_ar=btrim(p_payload->>'title_ar'),body_text=p_payload->>'body_text',official_text=p_payload->>'body_text',item_type=p_payload->>'item_type',parent_item_id=v_parent where id=v_item;
     end if;
     if (nullif(p_payload->>'source_page_to','') is not null and nullif(p_payload->>'source_page_from','') is null)
       or (nullif(p_payload->>'source_page_from','')::integer is not null and nullif(p_payload->>'source_page_from','')::integer<1)
       or (nullif(p_payload->>'source_page_to','')::integer<nullif(p_payload->>'source_page_from','')::integer) then
      raise exception using errcode='22023',message='LIBRARY_PAGE_RANGE_INVALID'; end if;
     update qarar_governance.policy_items set interpretation_text=nullif(btrim(p_payload->>'interpretation_text'),''),source_locator=nullif(btrim(p_payload->>'source_locator'),''),
      source_page_from=nullif(p_payload->>'source_page_from','')::integer,source_page_to=nullif(p_payload->>'source_page_to','')::integer where id=v_item;
    end if;
   elsif p_action='submit' then
    perform qarar_governance.assert_policy_version_editable(v_version);
    if not v_row.library_mode then raise exception using errcode='55000',message='LIBRARY_LEGACY_REVIEW'; end if;
    update qarar_governance.policy_versions set legal_status='under_review',submitted_by_user_id=v_actor,submitted_at=clock_timestamp() where id=v_version;
   elsif p_action='approve' then
    if not v_row.library_mode then raise exception using errcode='55000',message='LIBRARY_LEGACY_REVIEW'; end if;
    perform qarar_governance.admin_approve_policy_version(v_version);
   elsif p_action='return' then
    if not v_row.library_mode or v_row.legal_status<>'under_review' then raise exception using errcode='55000',message='LIBRARY_IN_REVIEW'; end if;
    if v_row.submitted_by_user_id=v_actor then raise exception using errcode='42501',message='LIBRARY_INDEPENDENT_REVIEW'; end if;
    if nullif(btrim(p_payload->>'reason'),'') is null then raise exception using errcode='22023',message='LIBRARY_REASON_REQUIRED'; end if;
    update qarar_governance.policy_versions set legal_status='draft',submitted_by_user_id=null,submitted_at=null,change_summary=p_payload->>'reason' where id=v_version;
   elsif p_action='activate' then
    if not v_row.library_mode or v_row.legal_status<>'approved' then raise exception using errcode='55000',message='LIBRARY_APPROVAL_REQUIRED'; end if;
    v_from:=coalesce(nullif(p_payload->>'effective_from','')::date,current_date);
    if v_from>current_date then raise exception using errcode='22023',message='LIBRARY_FUTURE_DATE'; end if;
    select * into v_current from qarar_governance.policy_versions where policy_id=v_policy and legal_status='effective' order by version_no desc limit 1 for update;
    if v_current.id is not null and v_from<v_current.effective_from then raise exception using errcode='22023',message='LIBRARY_INVALID_DATE'; end if;
    update qarar_governance.policy_versions set legal_status='expired',effective_to=greatest(effective_from,v_from-1) where policy_id=v_policy and legal_status='effective';
    update qarar_governance.policy_versions set legal_status='effective',effective_from=v_from,effective_to=null,activated_by_user_id=v_actor,activated_at=clock_timestamp() where id=v_version;
   end if;
  end if;
 end if;
 perform qarar_audit.append_audit_log(v_org,'governance.library.'||p_action,'policies',v_policy,
  jsonb_build_object('version_id',v_version,'item_id',v_item,'request_id',p_client_request_id,'reason',p_payload->>'reason'));
 v_saved:=jsonb_build_object('policy_id',v_policy,'selected_version_id',v_version,'item_id',v_item);
 insert into qarar_governance.regulation_library_commands_v2(organization_id,actor_id,request_id,fingerprint,result)
  values(v_org,v_actor,p_client_request_id,v_fingerprint,v_saved);
 return qarar_governance.admin_get_regulation_library_v2(v_policy)||v_saved||jsonb_build_object('idempotent_replay',false);
end $$;

notify pgrst,'reload schema';
commit;
