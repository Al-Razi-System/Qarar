begin;
create or replace function qarar_governance.create_regulation_snapshot_v2(
  p_policy_id uuid,p_source_version_id uuid
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,qarar_governance
as $$
declare
  v_org uuid:=qarar_iam.current_organization_id();
  v_user uuid:=auth.uid();
  v_id uuid;
  v_source_id uuid;
  v_no integer;
  v_items integer:=0;
  v_rules integer:=0;
begin
  perform qarar_iam.assert_permission('governance.policies.manage',null);
  if not exists(
    select 1 from qarar_governance.policies
    where id=p_policy_id and organization_id=v_org and status='active'
  ) then
    raise exception using errcode='P0002',message='اللائحة غير موجودة أو غير نشطة';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_policy_id::text,0));
  v_source_id:=p_source_version_id;
  if v_source_id is not null and not exists(select 1 from qarar_governance.policy_versions where id=v_source_id and policy_id=p_policy_id and organization_id=v_org) then raise exception using errcode='P0002',message='LIBRARY_NOT_FOUND'; end if;
  select max(version_no) into v_no from qarar_governance.policy_versions where policy_id=p_policy_id and organization_id=v_org;
  v_no:=coalesce(v_no,0)+1;

  insert into qarar_governance.policy_versions(
    organization_id,policy_id,version_no,version_label,change_summary,
    supersedes_version_id,created_by_user_id
  ) values(
    v_org,p_policy_id,v_no,null,
    'تغيير بند واحد',v_source_id,v_user
  ) returning id into v_id;

  if v_source_id is not null then
    insert into qarar_governance.policy_items(
      organization_id,policy_version_id,parent_item_id,item_code,item_type,title_ar,title_en,
      body_text,sort_order,governance_mode,topic_category_id,match_criteria,is_active,
      workflow_template_version_id,official_text,interpretation_text,source_page_from,
      source_page_to,source_locator,legal_status,amendment_note,requires_executable_rule,
      supersedes_item_id
    )
    select
      v_org,v_id,null,i.item_code,i.item_type,i.title_ar,i.title_en,i.body_text,i.sort_order,
      i.governance_mode,i.topic_category_id,i.match_criteria,i.is_active,
      i.workflow_template_version_id,i.official_text,i.interpretation_text,i.source_page_from,
      i.source_page_to,i.source_locator,i.legal_status,i.amendment_note,i.requires_executable_rule,i.id
    from qarar_governance.policy_items i
    where i.organization_id=v_org and i.policy_version_id=v_source_id
    order by i.sort_order;
    get diagnostics v_items=row_count;

    update qarar_governance.policy_items child
    set parent_item_id=new_parent.id
    from qarar_governance.policy_items old_child
    join qarar_governance.policy_items new_parent
      on new_parent.policy_version_id=v_id
     and new_parent.supersedes_item_id=old_child.parent_item_id
    where child.policy_version_id=v_id
      and child.supersedes_item_id=old_child.id
      and old_child.policy_version_id=v_source_id
      and old_child.parent_item_id is not null;

    insert into qarar_governance.policy_scope_assignments(
      organization_id,policy_version_id,scope_type,governance_unit_type_id,
      governance_class_id,governance_level,governance_unit_id,include_descendants,priority,
      valid_from,valid_to,is_active,created_by_user_id
    )
    select v_org,v_id,s.scope_type,s.governance_unit_type_id,s.governance_class_id,
      s.governance_level,s.governance_unit_id,s.include_descendants,s.priority,
      s.valid_from,s.valid_to,s.is_active,v_user
    from qarar_governance.policy_scope_assignments s
    where s.organization_id=v_org and s.policy_version_id=v_source_id;

    insert into qarar_governance.policy_rules(
      organization_id,policy_item_id,rule_code,name_ar,description,rule_type,status,priority,
      applies_when,effect_payload,requires_workflow,valid_from,valid_to,created_by_user_id
    )
    select v_org,new_item.id,r.rule_code,r.name_ar,r.description,r.rule_type,r.status,r.priority,
      r.applies_when,r.effect_payload,r.requires_workflow,r.valid_from,r.valid_to,v_user
    from qarar_governance.policy_rules r
    join qarar_governance.policy_items old_item on old_item.id=r.policy_item_id
    join qarar_governance.policy_items new_item
      on new_item.policy_version_id=v_id and new_item.supersedes_item_id=old_item.id
    where r.organization_id=v_org and old_item.policy_version_id=v_source_id;
    get diagnostics v_rules=row_count;

    insert into qarar_governance.rule_conditions(
      organization_id,policy_rule_id,condition_code,field_path,operator,expected_value,
      failure_action,failure_message_ar,sequence_no
    )
    select v_org,new_rule.id,c.condition_code,c.field_path,c.operator,c.expected_value,
      c.failure_action,c.failure_message_ar,c.sequence_no
    from qarar_governance.rule_conditions c
    join qarar_governance.policy_rules old_rule on old_rule.id=c.policy_rule_id
    join qarar_governance.policy_items old_item on old_item.id=old_rule.policy_item_id
    join qarar_governance.policy_items new_item
      on new_item.policy_version_id=v_id and new_item.supersedes_item_id=old_item.id
    join qarar_governance.policy_rules new_rule
      on new_rule.policy_item_id=new_item.id and new_rule.rule_code=old_rule.rule_code
    where c.organization_id=v_org and old_item.policy_version_id=v_source_id;

    insert into qarar_governance.rule_requirements(
      organization_id,policy_rule_id,requirement_code,name_ar,requirement_type,is_mandatory,
      timing,validation_spec,sequence_no
    )
    select v_org,new_rule.id,q.requirement_code,q.name_ar,q.requirement_type,q.is_mandatory,
      q.timing,q.validation_spec,q.sequence_no
    from qarar_governance.rule_requirements q
    join qarar_governance.policy_rules old_rule on old_rule.id=q.policy_rule_id
    join qarar_governance.policy_items old_item on old_item.id=old_rule.policy_item_id
    join qarar_governance.policy_items new_item
      on new_item.policy_version_id=v_id and new_item.supersedes_item_id=old_item.id
    join qarar_governance.policy_rules new_rule
      on new_rule.policy_item_id=new_item.id and new_rule.rule_code=old_rule.rule_code
    where q.organization_id=v_org and old_item.policy_version_id=v_source_id;

    insert into qarar_governance.rule_authorities(
      organization_id,policy_rule_id,governance_unit_id,governance_class_id,responsibility,
      authority_action,required_permission_code,sequence_no,is_final
    )
    select v_org,new_rule.id,a.governance_unit_id,a.governance_class_id,a.responsibility,
      a.authority_action,a.required_permission_code,a.sequence_no,a.is_final
    from qarar_governance.rule_authorities a
    join qarar_governance.policy_rules old_rule on old_rule.id=a.policy_rule_id
    join qarar_governance.policy_items old_item on old_item.id=old_rule.policy_item_id
    join qarar_governance.policy_items new_item
      on new_item.policy_version_id=v_id and new_item.supersedes_item_id=old_item.id
    join qarar_governance.policy_rules new_rule
      on new_rule.policy_item_id=new_item.id and new_rule.rule_code=old_rule.rule_code
    where a.organization_id=v_org and old_item.policy_version_id=v_source_id;

    insert into qarar_governance.rule_actions(
      organization_id,policy_rule_id,action_code,label_ar,action_type,is_terminal,
      requires_reason,result_payload,sequence_no
    )
    select v_org,new_rule.id,a.action_code,a.label_ar,a.action_type,a.is_terminal,
      a.requires_reason,a.result_payload,a.sequence_no
    from qarar_governance.rule_actions a
    join qarar_governance.policy_rules old_rule on old_rule.id=a.policy_rule_id
    join qarar_governance.policy_items old_item on old_item.id=old_rule.policy_item_id
    join qarar_governance.policy_items new_item
      on new_item.policy_version_id=v_id and new_item.supersedes_item_id=old_item.id
    join qarar_governance.policy_rules new_rule
      on new_rule.policy_item_id=new_item.id and new_rule.rule_code=old_rule.rule_code
    where a.organization_id=v_org and old_item.policy_version_id=v_source_id;

    insert into qarar_governance.rule_workflow_bindings(
      organization_id,policy_rule_id,workflow_template_version_id,binding_type,
      selection_conditions,priority
    )
    select v_org,new_rule.id,b.workflow_template_version_id,b.binding_type,
      b.selection_conditions,b.priority
    from qarar_governance.rule_workflow_bindings b
    join qarar_governance.policy_rules old_rule on old_rule.id=b.policy_rule_id
    join qarar_governance.policy_items old_item on old_item.id=old_rule.policy_item_id
    join qarar_governance.policy_items new_item
      on new_item.policy_version_id=v_id and new_item.supersedes_item_id=old_item.id
    join qarar_governance.policy_rules new_rule
      on new_rule.policy_item_id=new_item.id and new_rule.rule_code=old_rule.rule_code
    where b.organization_id=v_org and old_item.policy_version_id=v_source_id;

    insert into qarar_governance.policy_references(
      organization_id,source_policy_item_id,target_policy_id,target_policy_version_id,
      target_policy_item_id,external_reference,reference_type,citation_text,notes,
      created_by_user_id
    )
    select v_org,new_source.id,ref.target_policy_id,
      case when ref.target_policy_version_id=v_source_id then v_id else ref.target_policy_version_id end,
      case when ref.target_policy_version_id=v_source_id then new_target.id else ref.target_policy_item_id end,
      ref.external_reference,ref.reference_type,ref.citation_text,ref.notes,v_user
    from qarar_governance.policy_references ref
    join qarar_governance.policy_items old_source on old_source.id=ref.source_policy_item_id
    join qarar_governance.policy_items new_source
      on new_source.policy_version_id=v_id and new_source.supersedes_item_id=old_source.id
    left join qarar_governance.policy_items new_target
      on new_target.policy_version_id=v_id and new_target.supersedes_item_id=ref.target_policy_item_id
    where ref.organization_id=v_org and old_source.policy_version_id=v_source_id;

    insert into qarar_governance.policy_attachments(
      organization_id,policy_id,policy_version_id,policy_item_id,file_name,file_url,mime_type,
      file_size_bytes,description,created_by_user_id
    )
    select v_org,null,
      case when a.policy_version_id is not null then v_id else null end,
      case when a.policy_item_id is not null then new_item.id else null end,
      a.file_name,a.file_url,a.mime_type,
      a.file_size_bytes,a.description,v_user
    from qarar_governance.policy_attachments a
    left join qarar_governance.policy_items new_item
      on new_item.policy_version_id=v_id and new_item.supersedes_item_id=a.policy_item_id
    left join qarar_governance.policy_items old_item on old_item.id=a.policy_item_id
    where a.organization_id=v_org
      and (a.policy_version_id=v_source_id or old_item.policy_version_id=v_source_id);
  end if;

  perform qarar_audit.append_audit_log(v_org,'governance.policy_version.create','policy_versions',v_id,
    jsonb_build_object('policy_id',p_policy_id,'version_no',v_no,'source_version_id',v_source_id,
      'inherited_items',v_items,'inherited_rules',v_rules));
  return jsonb_build_object('id',v_id,'version_no',v_no,'legal_status','draft',
    'automation_status','not_configured','source_version_id',v_source_id,
    'inherited_items',v_items,'inherited_rules',v_rules);
end;
$$;

alter function qarar_governance.create_regulation_snapshot_v2(uuid,uuid) owner to qarar_governance_executor;
revoke all on function qarar_governance.create_regulation_snapshot_v2(uuid,uuid) from public,anon,authenticated,service_role,qarar_api_executor;

create function qarar_governance.copy_regulation_source_item_v2(p_item_id uuid,p_target_version_id uuid) returns uuid
 language plpgsql security definer set search_path=pg_catalog as $$
declare s qarar_governance.policy_items%rowtype; c qarar_governance.policy_items%rowtype;
 v_target uuid; v_parent uuid; v_source_parent qarar_governance.policy_items%rowtype; v_org uuid:=qarar_iam.current_organization_id(); v_order integer;
begin
 perform qarar_governance.assert_policy_version_editable(p_target_version_id);
 select * into s from qarar_governance.policy_items where id=p_item_id and organization_id=v_org;
 if not found or not exists(select 1 from qarar_governance.policy_versions a join qarar_governance.policy_versions b on b.policy_id=a.policy_id where a.id=s.policy_version_id and b.id=p_target_version_id and b.organization_id=v_org) then
  raise exception using errcode='P0002',message='LIBRARY_NOT_FOUND'; end if;
 if s.parent_item_id is not null then
  select * into v_source_parent from qarar_governance.policy_items where id=s.parent_item_id;
  select id into v_parent from qarar_governance.policy_items where policy_version_id=p_target_version_id and item_code=v_source_parent.item_code;
  if v_parent is null then
   if v_source_parent.item_type not in ('chapter','section') then raise exception using errcode='55000',message='LIBRARY_PARENT_NOT_PUBLISHED'; end if;
   v_parent:=qarar_governance.copy_regulation_source_item_v2(s.parent_item_id,p_target_version_id);
  end if;
 end if;
 select id into v_target from qarar_governance.policy_items where policy_version_id=p_target_version_id and item_code=s.item_code;
 if v_target is null then
  select coalesce(max(sort_order),0)+10 into v_order from qarar_governance.policy_items where policy_version_id=p_target_version_id;
  c:=jsonb_populate_record(s,jsonb_build_object('id',gen_random_uuid(),'policy_version_id',p_target_version_id,'parent_item_id',v_parent,'supersedes_item_id',s.id,'sort_order',v_order,'created_at',clock_timestamp(),'updated_at',clock_timestamp()));
  insert into qarar_governance.policy_items select (c).* returning id into v_target;
 else
  update qarar_governance.policy_items set title_ar=s.title_ar,title_en=s.title_en,body_text=s.body_text,official_text=s.official_text,
    interpretation_text=s.interpretation_text,source_locator=s.source_locator,source_page_from=s.source_page_from,source_page_to=s.source_page_to,
    item_type=s.item_type,parent_item_id=v_parent,supersedes_item_id=s.id where id=v_target;
 end if;
 insert into qarar_governance.policy_attachments(organization_id,policy_item_id,file_name,file_url,mime_type,file_size_bytes,description,created_by_user_id)
  select v_org,v_target,a.file_name,a.file_url,a.mime_type,a.file_size_bytes,a.description,auth.uid()
  from qarar_governance.policy_attachments a where a.policy_item_id=s.id
  and not exists(select 1 from qarar_governance.policy_attachments b where b.policy_item_id=v_target and b.file_name=a.file_name and b.file_url=a.file_url);
 return v_target;
end $$;
alter function qarar_governance.copy_regulation_source_item_v2(uuid,uuid) owner to qarar_governance_executor;
revoke all on function qarar_governance.copy_regulation_source_item_v2(uuid,uuid) from public,anon,authenticated,service_role,qarar_api_executor;

alter function qarar_governance.admin_save_regulation_library_v2(uuid,text,jsonb,text,uuid) rename to save_regulation_library_batch_compat_v2;
revoke all on function qarar_governance.save_regulation_library_batch_compat_v2(uuid,text,jsonb,text,uuid) from public,anon,authenticated,service_role,qarar_api_executor;
create function qarar_governance.admin_save_regulation_library_v2(p_policy_id uuid,p_action text,p_payload jsonb,p_expected_revision text,p_client_request_id uuid)
 returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_org uuid:=qarar_iam.current_organization_id(); v_actor uuid:=auth.uid();
 v_requested qarar_governance.policy_versions%rowtype; v_source qarar_governance.policy_items%rowtype;
 v_current uuid; v_snapshot uuid; v_target uuid; v_requested_item uuid; v_published_item uuid;
 v_active boolean; v_fingerprint text; v_saved jsonb; v_prior text; v_status text; v_result jsonb;
begin
 perform qarar_iam.assert_permission('governance.policies.read',null);
 if p_policy_id is not null then perform pg_advisory_xact_lock(hashtextextended(p_policy_id::text,0)); end if;
 if p_action is distinct from 'set_item_publication' then
  if p_action='remove_item' then
   perform qarar_iam.assert_permission('governance.policies.manage',null);
   if exists(select 1 from qarar_governance.policy_items d join qarar_governance.policy_items p on p.item_code=d.item_code
     join qarar_governance.policy_versions v on v.id=p.policy_version_id
     where d.id=nullif(p_payload->>'item_id','')::uuid and d.organization_id=v_org and v.policy_id=p_policy_id and v.legal_status='effective') then
    raise exception using errcode='23503',message='LIBRARY_ITEM_PUBLISHED'; end if;
  end if;
  return qarar_governance.save_regulation_library_batch_compat_v2(p_policy_id,p_action,p_payload,p_expected_revision,p_client_request_id);
 end if;
 perform qarar_iam.assert_permission('governance.policies.manage',null);
 if v_actor is null or p_client_request_id is null or jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>131072
  or jsonb_typeof(p_payload->'is_active') is distinct from 'boolean'
  or not (array(select jsonb_object_keys(p_payload)) <@ array['version_id','item_id','is_active']) then
  raise exception using errcode='22023',message='LIBRARY_INVALID_INPUT'; end if;
 v_active:=(p_payload->>'is_active')::boolean;
 v_fingerprint:=md5(jsonb_build_array(p_policy_id,p_action,p_payload,p_expected_revision)::text);
 perform pg_advisory_xact_lock(hashtextextended(v_org::text||':library:'||v_actor::text||':'||p_client_request_id::text,0));
 select result,fingerprint into v_saved,v_prior from qarar_governance.regulation_library_commands_v2 where organization_id=v_org and actor_id=v_actor and request_id=p_client_request_id;
 if found then
  if v_prior<>v_fingerprint then raise exception using errcode='22023',message='LIBRARY_REQUEST_REUSED'; end if;
  return qarar_governance.admin_get_regulation_library_v2(p_policy_id)||v_saved||jsonb_build_object('idempotent_replay',true);
 end if;
 select status into v_status from qarar_governance.policies where id=p_policy_id and organization_id=v_org for update;
 if not found then raise exception using errcode='P0002',message='LIBRARY_NOT_FOUND'; end if;
 if v_status<>'active' then raise exception using errcode='55000',message='LIBRARY_ARCHIVED'; end if;
 v_result:=qarar_governance.admin_get_regulation_library_v2(p_policy_id);
 if p_expected_revision is null or p_expected_revision<>v_result->>'revision' then raise exception using errcode='PT409',message='LIBRARY_CONFLICT'; end if;
 select * into v_requested from qarar_governance.policy_versions where id=nullif(p_payload->>'version_id','')::uuid and policy_id=p_policy_id and organization_id=v_org for update;
 if not found then raise exception using errcode='P0002',message='LIBRARY_NOT_FOUND'; end if;
 if not (v_result->'item_action_version_ids' ? v_requested.id::text) then raise exception using errcode='55000',message='LIBRARY_HISTORICAL_SOURCE'; end if;
 v_requested_item:=nullif(p_payload->>'item_id','')::uuid;
 select * into v_source from qarar_governance.policy_items where id=v_requested_item and policy_version_id=v_requested.id and organization_id=v_org;
 if not found then raise exception using errcode='P0002',message='LIBRARY_NOT_FOUND'; end if;
 if v_source.item_type in ('chapter','section') then raise exception using errcode='22023',message='LIBRARY_STRUCTURAL_ITEM'; end if;
 if v_active and nullif(btrim(coalesce(nullif(btrim(v_source.official_text),''),v_source.body_text)),'') is null then raise exception using errcode='23514',message='LIBRARY_CONTENT_REQUIRED'; end if;
 select id into v_current from qarar_governance.policy_versions where policy_id=p_policy_id and legal_status='effective' for update;
 select id into v_published_item from qarar_governance.policy_items where policy_version_id=v_current and item_code=v_source.item_code;
 if not v_active and v_published_item is null then raise exception using errcode='55000',message='LIBRARY_ITEM_NOT_PUBLISHED'; end if;
 -- Snapshot inheritance uses the current source, never other pending drafts.
 v_result:=qarar_governance.create_regulation_snapshot_v2(p_policy_id,v_current);
 v_snapshot:=(v_result->>'id')::uuid;
 update qarar_governance.policy_versions set library_mode=true,reference_number=qarar_governance.next_v2_reference('REV') where id=v_snapshot;
 if v_active then
  v_target:=qarar_governance.copy_regulation_source_item_v2(v_source.id,v_snapshot);
 else
  select id into v_target from qarar_governance.policy_items where policy_version_id=v_snapshot and item_code=v_source.item_code;
 end if;
 update qarar_governance.policy_items set is_active=v_active where id=v_target;
 -- Working copy remains available and other unpublished text is untouched.
 if v_requested.legal_status in ('under_review','approved') then
  update qarar_governance.policy_versions set legal_status='draft' where id=v_requested.id;
 end if;
 if v_requested.legal_status<>'effective' then
  perform qarar_governance.assert_policy_version_editable(v_requested.id);
  update qarar_governance.policy_items set is_active=v_active where id=v_requested_item;
 end if;
 update qarar_governance.policy_versions set legal_status='expired',effective_to=greatest(effective_from,current_date-1) where id=v_current;
 update qarar_governance.policy_versions set legal_status='effective',effective_from=current_date,effective_to=null,
   approved_by_user_id=v_actor,approved_at=clock_timestamp(),activated_by_user_id=v_actor,activated_at=clock_timestamp() where id=v_snapshot;
 perform qarar_audit.append_audit_log(v_org,'governance.library.item_publication','policies',p_policy_id,
  jsonb_build_object('source_item_id',v_requested_item,'published_item_id',v_target,'snapshot_id',v_snapshot,'previous_snapshot_id',v_current,'is_active',v_active,'request_id',p_client_request_id));
 v_saved:=jsonb_build_object('policy_id',p_policy_id,'selected_version_id',case when v_requested.legal_status='effective' then v_snapshot else v_requested.id end,
   'item_id',case when v_requested.legal_status='effective' then v_target else v_requested_item end,'published_version_id',v_snapshot,'published_item_id',v_target);
 insert into qarar_governance.regulation_library_commands_v2(organization_id,actor_id,request_id,fingerprint,result) values(v_org,v_actor,p_client_request_id,v_fingerprint,v_saved);
 return qarar_governance.admin_get_regulation_library_v2(p_policy_id)||v_saved||jsonb_build_object('idempotent_replay',false);
end $$;
alter function qarar_governance.admin_save_regulation_library_v2(uuid,text,jsonb,text,uuid) owner to qarar_governance_executor;
revoke all on function qarar_governance.admin_save_regulation_library_v2(uuid,text,jsonb,text,uuid) from public,anon,authenticated,service_role;
grant execute on function qarar_governance.admin_save_regulation_library_v2(uuid,text,jsonb,text,uuid) to qarar_api_executor;
create or replace function api_v2.admin_save_regulation_library_v2(p_policy_id uuid,p_action text,p_payload jsonb,p_expected_revision text,p_client_request_id uuid) returns jsonb language sql security definer set search_path=pg_catalog as $$
 select qarar_governance.admin_save_regulation_library_v2($1,$2,$3,$4,$5)
$$;

create or replace function qarar_governance.admin_get_regulation_library_v2(p_policy_id uuid)
 returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare v_result jsonb; v_ids jsonb; v_items jsonb; v_current uuid; v_working uuid; v_org uuid:=qarar_iam.current_organization_id();
begin
 v_result:=qarar_governance.get_regulation_library_compat_v2(p_policy_id);
 select id into v_current from qarar_governance.policy_versions where policy_id=p_policy_id and organization_id=v_org and legal_status='effective';
 select id into v_working from qarar_governance.policy_versions v where v.policy_id=p_policy_id and v.organization_id=v_org and v.library_mode
  and v.legal_status in ('draft','under_review','approved') and not exists(select 1 from qarar_governance.topic_governance_mappings m where m.policy_version_id=v.id)
  order by version_no desc limit 1;
 select coalesce(jsonb_object_agg(i.item_code,to_jsonb(i)),'{}') into v_items from qarar_governance.policy_items i where i.policy_version_id=v_current;
 select coalesce(jsonb_agg(v.id),'[]') into v_ids from qarar_governance.policy_versions v where v.policy_id=p_policy_id and v.organization_id=v_org and v.library_mode
  and v.id in (v_current,v_working) and (v_result->'capabilities'->>'can_manage')::boolean and v_result->'policy'->>'status'='active';
 return v_result||jsonb_build_object('item_publications',v_items,'item_action_version_ids',v_ids,'working_version_id',v_working,'published_version_id',v_current);
end $$;

update qarar_architecture.function_registry r set function_name=p.proname from pg_proc p
 where r.function_oid=p.oid and p.proname='save_regulation_library_batch_compat_v2';
insert into qarar_architecture.function_registry(function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate)
 select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),'governance',n.nspname,false from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='qarar_governance' and p.proname in ('create_regulation_snapshot_v2','copy_regulation_source_item_v2','admin_save_regulation_library_v2')
 on conflict(function_oid) do nothing;
notify pgrst,'reload schema';
commit;
