begin;

create or replace function qarar_governance.admin_create_policy_version(
  p_policy_id uuid,p_version_label text default null,p_change_summary text default null
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
  select id,version_no into v_source_id,v_no
  from qarar_governance.policy_versions
  where policy_id=p_policy_id and organization_id=v_org
  order by version_no desc limit 1;
  v_no:=coalesce(v_no,0)+1;

  insert into qarar_governance.policy_versions(
    organization_id,policy_id,version_no,version_label,change_summary,
    supersedes_version_id,created_by_user_id
  ) values(
    v_org,p_policy_id,v_no,nullif(btrim(p_version_label),''),
    nullif(btrim(p_change_summary),''),v_source_id,v_user
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

alter function qarar_governance.admin_create_policy_version(uuid,text,text) owner to qarar_governance_executor;
notify pgrst,'reload schema';
commit;
