begin;

create or replace function qarar_governance.admin_import_policy_bundle_v4(
  p_bundle jsonb,
  p_client_request_id uuid
) returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,qarar_governance
as $$
declare
  v_org uuid:=qarar_iam.current_organization_id();
  v_user uuid:=auth.uid();
  v_policy jsonb:=p_bundle->'policy';
  v_version jsonb:=coalesce(p_bundle->'version','{}'::jsonb);
  v_policy_id uuid;
  v_version_id uuid;
  v_workflow_template_id uuid;
  v_workflow_version_id uuid;
  v_step_id uuid;
  v_rule_id uuid;
  v_target_id uuid;
  v_category_id uuid;
  v_existing uuid;
  v_workflow_versions jsonb:='{}'::jsonb;
  v_step_ids jsonb:='{}'::jsonb;
  v_item_ids jsonb:='{}'::jsonb;
  v_workflow jsonb;
  v_step jsonb;
  v_transition jsonb;
  v_item jsonb;
  v_scope jsonb;
  v_rule jsonb;
  v_row jsonb;
  v_workflow_code text;
  v_from_key text;
  v_to_key text;
  v_item_code text;
  v_parent_code text;
  v_seq integer;
  v_items_count integer:=0;
  v_scopes_count integer:=0;
  v_workflows_count integer:=0;
  v_rules_count integer:=0;
begin
  perform qarar_iam.assert_permission('governance.policies.manage',null);
  if jsonb_array_length(coalesce(p_bundle->'workflows','[]'::jsonb))>0 then
    perform qarar_iam.assert_permission('governance.workflows.manage',null);
  end if;
  if p_client_request_id is null then
    raise exception using errcode='22023',message='client_request_id is required';
  end if;
  if p_bundle is null or jsonb_typeof(p_bundle)<>'object' then
    raise exception using errcode='22023',message='حزمة الاستيراد يجب أن تكون كائن JSON';
  end if;
  if coalesce(p_bundle->>'schema_version','')<>'qarar.policy_import.v4' then
    raise exception using errcode='22023',message='إصدار الحزمة غير مدعوم؛ المطلوب qarar.policy_import.v4';
  end if;
  if v_policy is null or nullif(btrim(v_policy->>'code'),'') is null or nullif(btrim(v_policy->>'name_ar'),'') is null then
    raise exception using errcode='22023',message='الحزمة تحتاج policy.code و policy.name_ar';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_org::text||':'||v_user::text||':'||p_client_request_id::text,0));
  select id into v_existing
  from qarar_governance.policies
  where organization_id=v_org and created_by_user_id=v_user and client_request_id=p_client_request_id;
  if v_existing is not null then
    select id into v_version_id
    from qarar_governance.policy_versions
    where organization_id=v_org and policy_id=v_existing
    order by version_no desc limit 1;
    return jsonb_build_object(
      'policy_id',v_existing,
      'version_id',v_version_id,
      'items_count',(select count(*) from qarar_governance.policy_items where policy_version_id=v_version_id),
      'rules_count',(select count(*) from qarar_governance.policy_rules r join qarar_governance.policy_items i on i.id=r.policy_item_id where i.policy_version_id=v_version_id),
      'idempotent_replay',true
    );
  end if;

  if exists(
    select 1 from qarar_governance.policies
    where organization_id=v_org and code=lower(btrim(v_policy->>'code'))
  ) then
    raise exception using errcode='23505',message='رمز اللائحة موجود مسبقاً؛ نفذ التنظيف المقيد قبل إعادة البناء';
  end if;

  insert into qarar_governance.policies(
    organization_id,code,name_ar,name_en,policy_type,description,owner_user_id,status,
    created_by_user_id,client_request_id
  ) values(
    v_org,lower(btrim(v_policy->>'code')),btrim(v_policy->>'name_ar'),nullif(btrim(coalesce(v_policy->>'name_en','')),''),
    coalesce(nullif(v_policy->>'policy_type',''),'regulation'),nullif(btrim(coalesce(v_policy->>'description','')),''),
    nullif(v_policy->>'owner_user_id','')::uuid,coalesce(nullif(v_policy->>'status',''),'active'),v_user,p_client_request_id
  ) returning id into v_policy_id;

  for v_workflow in select value from jsonb_array_elements(coalesce(p_bundle->'workflows','[]'::jsonb)) loop
    v_workflow_code:=lower(btrim(v_workflow->>'code'));
    if nullif(v_workflow_code,'') is null or nullif(btrim(v_workflow->>'name_ar'),'') is null then
      raise exception using errcode='22023',message='كل مسار يحتاج code و name_ar';
    end if;
    if exists(select 1 from qarar_governance.workflow_templates where organization_id=v_org and code=v_workflow_code) then
      raise exception using errcode='23505',message='رمز المسار موجود مسبقاً: '||v_workflow_code;
    end if;
    insert into qarar_governance.workflow_templates(
      organization_id,code,name_ar,name_en,description,created_by_user_id
    ) values(
      v_org,v_workflow_code,btrim(v_workflow->>'name_ar'),nullif(v_workflow->>'name_en',''),
      nullif(v_workflow->>'description',''),v_user
    ) returning id into v_workflow_template_id;
    insert into qarar_governance.workflow_template_versions(
      organization_id,workflow_template_id,version_no,allow_cycles,created_by_user_id
    ) values(
      v_org,v_workflow_template_id,coalesce((v_workflow->>'version_no')::integer,1),
      coalesce((v_workflow->>'allow_cycles')::boolean,false),v_user
    ) returning id into v_workflow_version_id;
    v_workflow_versions:=v_workflow_versions||jsonb_build_object(v_workflow_code,v_workflow_version_id);
    v_workflows_count:=v_workflows_count+1;

    for v_step in select value from jsonb_array_elements(coalesce(v_workflow->'steps','[]'::jsonb)) loop
      v_target_id:=nullif(v_step->>'governance_class_id','')::uuid;
      if v_target_id is null and nullif(v_step->>'governance_class_code','') is not null then
        select id into v_target_id
        from qarar_governance.governance_unit_classes
        where organization_id=v_org and code=v_step->>'governance_class_code';
        if v_target_id is null then
          raise exception using errcode='P0002',message='فئة المجلس غير موجودة: '||(v_step->>'governance_class_code');
        end if;
      end if;
      insert into qarar_governance.workflow_template_steps(
        organization_id,workflow_template_version_id,step_code,name_ar,sequence_no,step_type,responsibility,
        governance_unit_id,governance_class_id,required_permission_code,is_initial,is_terminal,
        entry_conditions,exit_conditions,allowed_outcomes
      ) values(
        v_org,v_workflow_version_id,btrim(v_step->>'code'),btrim(v_step->>'name_ar'),(v_step->>'sequence_no')::integer,
        coalesce(nullif(v_step->>'step_type',''),'review'),coalesce(nullif(v_step->>'responsibility',''),'review'),
        nullif(v_step->>'governance_unit_id','')::uuid,v_target_id,nullif(v_step->>'required_permission_code',''),
        coalesce((v_step->>'is_initial')::boolean,false),coalesce((v_step->>'is_terminal')::boolean,false),
        coalesce(v_step->'entry_conditions','{}'::jsonb),coalesce(v_step->'exit_conditions','{}'::jsonb),
        array(select jsonb_array_elements_text(coalesce(v_step->'allowed_outcomes','["approved"]'::jsonb)))
      ) returning id into v_step_id;
      v_step_ids:=v_step_ids||jsonb_build_object(v_workflow_code||'.'||(v_step->>'code'),v_step_id);
    end loop;

    for v_transition in select value from jsonb_array_elements(coalesce(v_workflow->'transitions','[]'::jsonb)) loop
      v_from_key:=v_workflow_code||'.'||(v_transition->>'from');
      v_to_key:=case when nullif(v_transition->>'to','') is null then null else v_workflow_code||'.'||(v_transition->>'to') end;
      if v_step_ids->>v_from_key is null or (v_to_key is not null and v_step_ids->>v_to_key is null) then
        raise exception using errcode='22023',message='انتقال يشير إلى خطوة غير موجودة في المسار: '||v_workflow_code;
      end if;
      insert into qarar_governance.workflow_template_transitions(
        organization_id,workflow_template_version_id,from_step_id,to_step_id,outcome_code,transition_type,conditions
      ) values(
        v_org,v_workflow_version_id,(v_step_ids->>v_from_key)::uuid,
        case when v_to_key is null then null else (v_step_ids->>v_to_key)::uuid end,
        v_transition->>'outcome',coalesce(nullif(v_transition->>'transition_type',''),'forward'),
        coalesce(v_transition->'conditions','{}'::jsonb)
      );
    end loop;
    if coalesce((v_workflow->>'activate')::boolean,false) then
      perform qarar_governance.admin_activate_workflow_template_version(v_workflow_version_id);
    end if;
  end loop;

  insert into qarar_governance.policy_versions(
    organization_id,policy_id,version_no,version_label,change_summary,created_by_user_id,
    issuing_authority,approval_authority,approval_decision_number,approval_date,issue_reason,source_document_hash
  ) values(
    v_org,v_policy_id,coalesce((v_version->>'version_no')::integer,1),nullif(v_version->>'version_label',''),
    nullif(v_version->>'change_summary',''),v_user,nullif(v_version->>'issuing_authority',''),
    nullif(v_version->>'approval_authority',''),nullif(v_version->>'approval_decision_number',''),
    nullif(v_version->>'approval_date','')::date,nullif(v_version->>'issue_reason',''),
    nullif(lower(v_version->>'source_document_hash'),'')
  ) returning id into v_version_id;

  for v_item in select value from jsonb_array_elements(coalesce(v_version->'items','[]'::jsonb)) loop
    v_item_code:=v_item->>'item_code';
    if nullif(v_item_code,'') is null or v_item_ids ? v_item_code then
      raise exception using errcode='22023',message='رمز عنصر مفقود أو مكرر في الحزمة';
    end if;
    v_category_id:=nullif(v_item->>'topic_category_id','')::uuid;
    if v_category_id is null and nullif(v_item->>'topic_category_code','') is not null then
      select id into v_category_id
      from qarar_topics.topic_categories
      where organization_id=v_org and code=v_item->>'topic_category_code';
      if v_category_id is null then
        raise exception using errcode='P0002',message='فئة الموضوع غير موجودة: '||(v_item->>'topic_category_code');
      end if;
    end if;
    v_workflow_code:=lower(nullif(v_item->>'workflow_code',''));
    if v_workflow_code is not null and v_workflow_versions->>v_workflow_code is null then
      raise exception using errcode='P0002',message='المسار المشار إليه غير موجود في الحزمة: '||v_workflow_code;
    end if;
    insert into qarar_governance.policy_items(
      organization_id,policy_version_id,item_code,item_type,title_ar,title_en,body_text,official_text,
      interpretation_text,source_page_from,source_page_to,source_locator,legal_status,amendment_note,
      requires_executable_rule,sort_order,governance_mode,topic_category_id,match_criteria,
      workflow_template_version_id
    ) values(
      v_org,v_version_id,v_item_code,coalesce(nullif(v_item->>'item_type',''),'article'),btrim(v_item->>'title_ar'),
      nullif(v_item->>'title_en',''),nullif(v_item->>'body_text',''),nullif(v_item->>'official_text',''),
      nullif(v_item->>'interpretation_text',''),nullif(v_item->>'source_page_from','')::integer,
      nullif(v_item->>'source_page_to','')::integer,nullif(v_item->>'source_locator',''),
      coalesce(nullif(v_item->>'legal_status',''),'active'),nullif(v_item->>'amendment_note',''),
      coalesce((v_item->>'requires_executable_rule')::boolean,false),(v_item->>'sort_order')::integer,
      coalesce(nullif(v_item->>'governance_mode',''),'regulation_required'),v_category_id,
      coalesce(v_item->'match_criteria','{}'::jsonb),
      case when v_workflow_code is null then null else (v_workflow_versions->>v_workflow_code)::uuid end
    ) returning id into v_target_id;
    v_item_ids:=v_item_ids||jsonb_build_object(v_item_code,v_target_id);
    v_items_count:=v_items_count+1;
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(v_version->'items','[]'::jsonb)) loop
    v_item_code:=v_item->>'item_code';
    v_parent_code:=nullif(v_item->>'parent_item_code','');
    if v_parent_code is not null then
      if v_item_ids->>v_parent_code is null then
        raise exception using errcode='22023',message='العنصر الأب غير موجود: '||v_parent_code;
      end if;
      update qarar_governance.policy_items
      set parent_item_id=(v_item_ids->>v_parent_code)::uuid
      where id=(v_item_ids->>v_item_code)::uuid;
    end if;
  end loop;

  for v_scope in select value from jsonb_array_elements(coalesce(v_version->'scopes','[]'::jsonb)) loop
    v_target_id:=nullif(v_scope->>'target_id','')::uuid;
    perform qarar_governance.admin_set_policy_scope(
      v_version_id,v_scope->>'scope_type',v_target_id,nullif(v_scope->>'governance_level',''),
      coalesce((v_scope->>'include_descendants')::boolean,false),coalesce((v_scope->>'priority')::integer,0),
      nullif(v_scope->>'valid_from','')::date,nullif(v_scope->>'valid_to','')::date
    );
    v_scopes_count:=v_scopes_count+1;
  end loop;

  for v_rule in select value from jsonb_array_elements(coalesce(p_bundle->'rules','[]'::jsonb)) loop
    v_item_code:=v_rule->>'policy_item_code';
    if v_item_ids->>v_item_code is null then
      raise exception using errcode='P0002',message='القاعدة تشير إلى عنصر غير موجود: '||coalesce(v_item_code,'');
    end if;
    insert into qarar_governance.policy_rules(
      organization_id,policy_item_id,rule_code,name_ar,description,rule_type,status,priority,
      applies_when,effect_payload,requires_workflow,valid_from,valid_to,created_by_user_id
    ) values(
      v_org,(v_item_ids->>v_item_code)::uuid,lower(btrim(v_rule->>'code')),btrim(v_rule->>'name_ar'),
      nullif(v_rule->>'description',''),coalesce(nullif(v_rule->>'rule_type',''),'informational'),
      coalesce(nullif(v_rule->>'status',''),'active'),coalesce((v_rule->>'priority')::integer,100),
      coalesce(v_rule->'applies_when','{}'::jsonb),coalesce(v_rule->'effect_payload','{}'::jsonb),
      coalesce((v_rule->>'requires_workflow')::boolean,false),nullif(v_rule->>'valid_from','')::date,
      nullif(v_rule->>'valid_to','')::date,v_user
    ) returning id into v_rule_id;

    v_seq:=0;
    for v_row in select value from jsonb_array_elements(coalesce(v_rule->'conditions','[]'::jsonb)) loop
      v_seq:=v_seq+1;
      insert into qarar_governance.rule_conditions(
        organization_id,policy_rule_id,condition_code,field_path,operator,expected_value,
        failure_action,failure_message_ar,sequence_no
      ) values(
        v_org,v_rule_id,coalesce(nullif(v_row->>'code',''),'condition_'||v_seq),v_row->>'field_path',
        v_row->>'operator',coalesce(v_row->'expected_value','null'::jsonb),
        coalesce(nullif(v_row->>'failure_action',''),'block'),nullif(v_row->>'failure_message_ar',''),v_seq
      );
    end loop;

    v_seq:=0;
    for v_row in select value from jsonb_array_elements(coalesce(v_rule->'requirements','[]'::jsonb)) loop
      v_seq:=v_seq+1;
      insert into qarar_governance.rule_requirements(
        organization_id,policy_rule_id,requirement_code,name_ar,requirement_type,is_mandatory,
        timing,validation_spec,sequence_no
      ) values(
        v_org,v_rule_id,coalesce(nullif(v_row->>'code',''),'requirement_'||v_seq),v_row->>'name_ar',
        coalesce(nullif(v_row->>'requirement_type',''),'document'),coalesce((v_row->>'is_mandatory')::boolean,true),
        coalesce(nullif(v_row->>'timing',''),'before_submission'),coalesce(v_row->'validation_spec','{}'::jsonb),v_seq
      );
    end loop;

    v_seq:=0;
    for v_row in select value from jsonb_array_elements(coalesce(v_rule->'authorities','[]'::jsonb)) loop
      v_seq:=v_seq+1;
      v_target_id:=nullif(v_row->>'governance_class_id','')::uuid;
      if v_target_id is null and nullif(v_row->>'governance_class_code','') is not null then
        select id into v_target_id
        from qarar_governance.governance_unit_classes
        where organization_id=v_org and code=v_row->>'governance_class_code';
      end if;
      if v_target_id is null and nullif(v_row->>'governance_unit_id','') is null then
        raise exception using errcode='P0002',message='جهة القاعدة غير موجودة أو غير محددة';
      end if;
      insert into qarar_governance.rule_authorities(
        organization_id,policy_rule_id,governance_unit_id,governance_class_id,responsibility,
        authority_action,required_permission_code,sequence_no,is_final
      ) values(
        v_org,v_rule_id,nullif(v_row->>'governance_unit_id','')::uuid,v_target_id,
        v_row->>'responsibility',v_row->>'authority_action',nullif(v_row->>'required_permission_code',''),
        v_seq,coalesce((v_row->>'is_final')::boolean,false)
      );
    end loop;

    v_seq:=0;
    for v_row in select value from jsonb_array_elements(coalesce(v_rule->'actions','[]'::jsonb)) loop
      v_seq:=v_seq+1;
      insert into qarar_governance.rule_actions(
        organization_id,policy_rule_id,action_code,label_ar,action_type,is_terminal,requires_reason,
        result_payload,sequence_no
      ) values(
        v_org,v_rule_id,v_row->>'code',v_row->>'label_ar',v_row->>'action_type',
        coalesce((v_row->>'is_terminal')::boolean,false),coalesce((v_row->>'requires_reason')::boolean,false),
        coalesce(v_row->'result_payload','{}'::jsonb),v_seq
      );
    end loop;

    for v_row in select value from jsonb_array_elements(coalesce(v_rule->'workflow_bindings','[]'::jsonb)) loop
      v_workflow_code:=lower(v_row->>'workflow_code');
      if v_workflow_versions->>v_workflow_code is null then
        raise exception using errcode='P0002',message='ربط القاعدة يشير إلى مسار غير موجود: '||coalesce(v_workflow_code,'');
      end if;
      insert into qarar_governance.rule_workflow_bindings(
        organization_id,policy_rule_id,workflow_template_version_id,binding_type,selection_conditions,priority
      ) values(
        v_org,v_rule_id,(v_workflow_versions->>v_workflow_code)::uuid,
        coalesce(nullif(v_row->>'binding_type',''),'primary'),coalesce(v_row->'selection_conditions','{}'::jsonb),
        coalesce((v_row->>'priority')::integer,100)
      );
    end loop;
    v_rules_count:=v_rules_count+1;
  end loop;

  perform qarar_audit.append_audit_log(
    v_org,'governance.policy_bundle.import_v4','policies',v_policy_id,
    jsonb_build_object(
      'client_request_id',p_client_request_id,'items',v_items_count,'scopes',v_scopes_count,
      'workflows',v_workflows_count,'rules',v_rules_count
    )
  );
  return jsonb_build_object(
    'policy_id',v_policy_id,'version_id',v_version_id,'items_count',v_items_count,
    'scopes_count',v_scopes_count,'workflows_count',v_workflows_count,'rules_count',v_rules_count,
    'idempotent_replay',false
  );
end;
$$;

insert into qarar_architecture.api_contract_registry(
  api_version,contract_name,implementation_schema,implementation_name,identity_arguments,module_code,audience
)
select 'v1','admin_import_policy_bundle_v4','qarar_governance','admin_import_policy_bundle_v4',
       pg_get_function_identity_arguments(p.oid),'governance','authenticated'
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='qarar_governance' and p.proname='admin_import_policy_bundle_v4'
on conflict do nothing;

create or replace function api_v1.admin_import_policy_bundle_v4(p_bundle jsonb,p_client_request_id uuid)
returns jsonb language sql volatile security definer set search_path=pg_catalog
as $$ select qarar_governance.admin_import_policy_bundle_v4($1,$2) $$;

alter function qarar_governance.admin_import_policy_bundle_v4(jsonb,uuid) owner to qarar_governance_executor;
revoke all on function qarar_governance.admin_import_policy_bundle_v4(jsonb,uuid) from public,anon,authenticated,service_role;
alter function api_v1.admin_import_policy_bundle_v4(jsonb,uuid) owner to qarar_api_executor;
revoke all on function api_v1.admin_import_policy_bundle_v4(jsonb,uuid) from public,anon,authenticated,service_role;
grant execute on function api_v1.admin_import_policy_bundle_v4(jsonb,uuid) to authenticated,service_role;
grant execute on function qarar_governance.admin_import_policy_bundle_v4(jsonb,uuid) to qarar_api_executor;

notify pgrst,'reload schema';

commit;
