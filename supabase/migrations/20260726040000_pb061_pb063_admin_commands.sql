begin;

create or replace function qarar_governance.assert_policy_version_editable(p_policy_version_id uuid)
returns void language plpgsql security invoker
set search_path=pg_catalog,qarar_governance
as $$
declare v_status text;
begin
  select legal_status into v_status from qarar_governance.policy_versions
  where id=p_policy_version_id;
  if v_status is null then raise exception using errcode='P0002',message='إصدار اللائحة غير موجود'; end if;
  if v_status<>'draft' then
    raise exception using errcode='55000',message='لا يمكن تعديل إصدار لائحة غير مسودة';
  end if;
  if exists(select 1 from qarar_governance.topic_governance_mappings
            where policy_version_id=p_policy_version_id) then
    raise exception using errcode='55000',message='لا يمكن تعديل إصدار مستخدم تاريخيًا';
  end if;
end;
$$;

create or replace function qarar_governance.guard_policy_draft_mutation()
returns trigger language plpgsql security invoker
set search_path=pg_catalog,qarar_governance
as $$
declare v_version uuid;
begin
  if tg_table_name='policy_items' then
    v_version:=coalesce(new.policy_version_id,old.policy_version_id);
  elsif tg_table_name='policy_scope_assignments' then
    v_version:=coalesce(new.policy_version_id,old.policy_version_id);
  elsif tg_table_name='policy_item_roles' then
    select policy_version_id into v_version from qarar_governance.policy_items
    where id=coalesce(new.policy_item_id,old.policy_item_id);
  else
    select i.policy_version_id into v_version from qarar_governance.policy_items i
    where i.id=coalesce(new.policy_item_id,old.policy_item_id);
  end if;
  perform qarar_governance.assert_policy_version_editable(v_version);
  return coalesce(new,old);
end;
$$;

create trigger policy_items_draft_guard before insert or update or delete
on qarar_governance.policy_items for each row
execute function qarar_governance.guard_policy_draft_mutation();
create trigger policy_scopes_draft_guard before insert or update or delete
on qarar_governance.policy_scope_assignments for each row
execute function qarar_governance.guard_policy_draft_mutation();
create trigger policy_roles_draft_guard before insert or update or delete
on qarar_governance.policy_item_roles for each row
execute function qarar_governance.guard_policy_draft_mutation();
create trigger policy_overrides_draft_guard before insert or update or delete
on qarar_governance.policy_item_scope_overrides for each row
execute function qarar_governance.guard_policy_draft_mutation();

create or replace function qarar_governance.admin_create_policy(
  p_code text,p_name_ar text,p_name_en text default null,
  p_policy_type text default 'regulation',p_description text default null,
  p_owner_user_id uuid default null
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,qarar_governance
as $$
declare v_org uuid:=qarar_iam.current_organization_id();v_user uuid:=auth.uid();v_id uuid;
begin
  perform qarar_iam.assert_permission('governance.policies.manage',null);
  insert into qarar_governance.policies(
    organization_id,code,name_ar,name_en,policy_type,description,owner_user_id,created_by_user_id
  ) values(v_org,lower(btrim(p_code)),btrim(p_name_ar),nullif(btrim(coalesce(p_name_en,'')),''),
    p_policy_type,nullif(btrim(coalesce(p_description,'')),''),p_owner_user_id,v_user)
  returning id into v_id;
  perform qarar_audit.append_audit_log(v_org,'governance.policy.create','policies',v_id,
    jsonb_build_object('code',p_code,'policy_type',p_policy_type));
  return jsonb_build_object('id',v_id,'status','active');
end;
$$;

create or replace function qarar_governance.admin_create_policy_version(
  p_policy_id uuid,p_version_label text default null,p_change_summary text default null
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,qarar_governance
as $$
declare v_org uuid:=qarar_iam.current_organization_id();v_user uuid:=auth.uid();v_id uuid;v_no integer;
begin
  perform qarar_iam.assert_permission('governance.policies.manage',null);
  if not exists(select 1 from qarar_governance.policies where id=p_policy_id and organization_id=v_org and status='active')
  then raise exception using errcode='P0002',message='اللائحة غير موجودة أو غير نشطة'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_policy_id::text,0));
  select coalesce(max(version_no),0)+1 into v_no from qarar_governance.policy_versions where policy_id=p_policy_id;
  insert into qarar_governance.policy_versions(
    organization_id,policy_id,version_no,version_label,change_summary,created_by_user_id
  ) values(v_org,p_policy_id,v_no,p_version_label,p_change_summary,v_user) returning id into v_id;
  perform qarar_audit.append_audit_log(v_org,'governance.policy_version.create','policy_versions',v_id,
    jsonb_build_object('policy_id',p_policy_id,'version_no',v_no));
  return jsonb_build_object('id',v_id,'version_no',v_no,'legal_status','draft','automation_status','not_configured');
end;
$$;

create or replace function qarar_governance.admin_add_policy_item(
  p_policy_version_id uuid,p_item_code text,p_title_ar text,p_sort_order integer,
  p_parent_item_id uuid default null,p_item_type text default 'article',
  p_title_en text default null,p_body_text text default null,
  p_governance_mode text default 'regulation_required',
  p_topic_category_id uuid default null,p_match_criteria jsonb default '{}'::jsonb,
  p_workflow_template_version_id uuid default null
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,qarar_governance
as $$
declare v_org uuid:=qarar_iam.current_organization_id();v_id uuid;
begin
  perform qarar_iam.assert_permission('governance.policies.manage',null);
  perform qarar_governance.assert_policy_version_editable(p_policy_version_id);
  insert into qarar_governance.policy_items(
    organization_id,policy_version_id,parent_item_id,item_code,item_type,title_ar,title_en,
    body_text,sort_order,governance_mode,topic_category_id,match_criteria,workflow_template_version_id
  ) values(v_org,p_policy_version_id,p_parent_item_id,p_item_code,p_item_type,btrim(p_title_ar),
    p_title_en,p_body_text,p_sort_order,p_governance_mode,p_topic_category_id,p_match_criteria,
    p_workflow_template_version_id) returning id into v_id;
  perform qarar_audit.append_audit_log(v_org,'governance.policy_item.create','policy_items',v_id,
    jsonb_build_object('policy_version_id',p_policy_version_id,'item_code',p_item_code));
  return jsonb_build_object('id',v_id,'policy_version_id',p_policy_version_id);
end;
$$;

create or replace function qarar_governance.admin_set_policy_scope(
  p_policy_version_id uuid,p_scope_type text,p_target_id uuid default null,
  p_governance_level text default null,p_include_descendants boolean default false,
  p_priority integer default 0,p_valid_from date default null,p_valid_to date default null
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,qarar_governance
as $$
declare v_org uuid:=qarar_iam.current_organization_id();v_user uuid:=auth.uid();v_id uuid;
begin
  perform qarar_iam.assert_permission('governance.policies.manage',null);
  perform qarar_governance.assert_policy_version_editable(p_policy_version_id);
  insert into qarar_governance.policy_scope_assignments(
    organization_id,policy_version_id,scope_type,governance_unit_type_id,governance_class_id,
    governance_level,governance_unit_id,include_descendants,priority,valid_from,valid_to,created_by_user_id
  ) values(
    v_org,p_policy_version_id,p_scope_type,
    case when p_scope_type='governance_unit_type' then p_target_id end,
    case when p_scope_type='governance_class' then p_target_id end,
    case when p_scope_type='governance_level' then p_governance_level end,
    case when p_scope_type in('governance_unit','unit_subtree') then p_target_id end,
    p_include_descendants,p_priority,p_valid_from,p_valid_to,v_user
  ) returning id into v_id;
  perform qarar_audit.append_audit_log(v_org,'governance.policy_scope.create','policy_scope_assignments',v_id,
    jsonb_build_object('policy_version_id',p_policy_version_id,'scope_type',p_scope_type,'target_id',p_target_id));
  return jsonb_build_object('id',v_id,'scope_type',p_scope_type);
end;
$$;

create or replace function qarar_governance.admin_set_policy_item_scope_override(
  p_policy_item_id uuid,p_scope_assignment_id uuid,p_governance_unit_id uuid,
  p_is_included boolean,p_reason text,p_priority integer default 0,
  p_valid_from date default null,p_valid_to date default null
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,qarar_governance
as $$
declare v_org uuid:=qarar_iam.current_organization_id();v_user uuid:=auth.uid();v_id uuid;
begin
  perform qarar_iam.assert_permission('governance.policies.manage',p_governance_unit_id);
  insert into qarar_governance.policy_item_scope_overrides(
    organization_id,policy_item_id,scope_assignment_id,governance_unit_id,is_included,
    priority,reason,valid_from,valid_to,created_by_user_id
  ) values(v_org,p_policy_item_id,p_scope_assignment_id,p_governance_unit_id,p_is_included,
    p_priority,btrim(p_reason),p_valid_from,p_valid_to,v_user) returning id into v_id;
  perform qarar_audit.append_audit_log(v_org,'governance.policy_scope.override','policy_item_scope_overrides',v_id,
    jsonb_build_object('included',p_is_included,'reason',p_reason));
  return jsonb_build_object('id',v_id,'is_included',p_is_included);
end;
$$;

create or replace function qarar_governance.admin_create_workflow_template(
  p_code text,p_name_ar text,p_name_en text default null,p_description text default null
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,qarar_governance
as $$
declare v_org uuid:=qarar_iam.current_organization_id();v_user uuid:=auth.uid();v_template uuid;v_version uuid;
begin
  perform qarar_iam.assert_permission('governance.workflows.manage',null);
  insert into qarar_governance.workflow_templates(
    organization_id,code,name_ar,name_en,description,created_by_user_id
  ) values(v_org,lower(btrim(p_code)),btrim(p_name_ar),p_name_en,p_description,v_user)
  returning id into v_template;
  insert into qarar_governance.workflow_template_versions(
    organization_id,workflow_template_id,version_no,created_by_user_id
  ) values(v_org,v_template,1,v_user) returning id into v_version;
  perform qarar_audit.append_audit_log(v_org,'governance.workflow_template.create','workflow_templates',v_template,
    jsonb_build_object('code',p_code,'initial_version_id',v_version));
  return jsonb_build_object('id',v_template,'draft_version_id',v_version,'version_no',1);
end;
$$;

create or replace function qarar_governance.admin_add_workflow_step(
  p_workflow_template_version_id uuid,p_step_code text,p_name_ar text,p_sequence_no integer,
  p_step_type text,p_responsibility text,p_governance_unit_id uuid default null,
  p_governance_class_id uuid default null,p_required_permission_code text default null,
  p_is_initial boolean default false,p_is_terminal boolean default false,
  p_entry_conditions jsonb default '{}'::jsonb,p_exit_conditions jsonb default '{}'::jsonb,
  p_allowed_outcomes text[] default array['approved']::text[]
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,qarar_governance
as $$
declare v_org uuid:=qarar_iam.current_organization_id();v_id uuid;
begin
  perform qarar_iam.assert_permission('governance.workflows.manage',p_governance_unit_id);
  perform qarar_governance.assert_workflow_version_editable(p_workflow_template_version_id);
  insert into qarar_governance.workflow_template_steps(
    organization_id,workflow_template_version_id,step_code,name_ar,sequence_no,step_type,
    responsibility,governance_unit_id,governance_class_id,required_permission_code,
    is_initial,is_terminal,entry_conditions,exit_conditions,allowed_outcomes
  ) values(v_org,p_workflow_template_version_id,p_step_code,btrim(p_name_ar),p_sequence_no,p_step_type,
    p_responsibility,p_governance_unit_id,p_governance_class_id,p_required_permission_code,
    p_is_initial,p_is_terminal,p_entry_conditions,p_exit_conditions,p_allowed_outcomes)
  returning id into v_id;
  return jsonb_build_object('id',v_id,'sequence_no',p_sequence_no);
end;
$$;

create or replace function qarar_governance.admin_add_workflow_transition(
  p_workflow_template_version_id uuid,p_from_step_id uuid,p_outcome_code text,
  p_to_step_id uuid default null,p_transition_type text default 'forward',
  p_conditions jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,qarar_governance
as $$
declare v_org uuid:=qarar_iam.current_organization_id();v_id uuid;
begin
  perform qarar_iam.assert_permission('governance.workflows.manage',null);
  perform qarar_governance.assert_workflow_version_editable(p_workflow_template_version_id);
  insert into qarar_governance.workflow_template_transitions(
    organization_id,workflow_template_version_id,from_step_id,to_step_id,
    outcome_code,transition_type,conditions
  ) values(v_org,p_workflow_template_version_id,p_from_step_id,p_to_step_id,
    p_outcome_code,p_transition_type,p_conditions) returning id into v_id;
  return jsonb_build_object('id',v_id,'outcome_code',p_outcome_code);
end;
$$;

create or replace function qarar_governance.admin_submit_policy_for_review(p_policy_version_id uuid)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,qarar_governance
as $$
declare v_org uuid:=qarar_iam.current_organization_id();v_user uuid:=auth.uid();v_missing integer;
begin
  perform qarar_iam.assert_permission('governance.policies.manage',null);
  perform qarar_governance.assert_policy_version_editable(p_policy_version_id);
  if not exists(select 1 from qarar_governance.policy_items where policy_version_id=p_policy_version_id and is_active)
  then raise exception using errcode='23514',message='لا يمكن إرسال إصدار بلا بنود'; end if;
  if not exists(select 1 from qarar_governance.policy_scope_assignments where policy_version_id=p_policy_version_id and is_active)
  then raise exception using errcode='23514',message='لا يمكن إرسال إصدار بلا نطاق تطبيق'; end if;
  select count(*) into v_missing from qarar_governance.policy_items i
  where i.policy_version_id=p_policy_version_id and i.is_active
    and i.governance_mode='regulation_required'
    and (i.workflow_template_version_id is null or not exists(
      select 1 from qarar_governance.workflow_template_versions w
      where w.id=i.workflow_template_version_id and w.status='active' and w.validation_status='valid'));
  update qarar_governance.policy_versions set legal_status='under_review',
    submitted_by_user_id=v_user,submitted_at=now(),
    automation_status=case when v_missing=0 then 'validation_pending' else 'partially_ready' end,
    readiness_percent=case when v_missing=0 then 100 else greatest(0,100-v_missing*10) end
  where id=p_policy_version_id and organization_id=v_org;
  perform qarar_audit.append_audit_log(v_org,'governance.policy_version.submit','policy_versions',
    p_policy_version_id,jsonb_build_object('missing_workflows',v_missing));
  return jsonb_build_object('id',p_policy_version_id,'legal_status','under_review',
    'automation_status',case when v_missing=0 then 'validation_pending' else 'partially_ready' end);
end;
$$;

create or replace function qarar_governance.admin_approve_policy_version(p_policy_version_id uuid)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,qarar_governance
as $$
declare v_org uuid:=qarar_iam.current_organization_id();v_user uuid:=auth.uid();v_submitted uuid;
begin
  perform qarar_iam.assert_permission('governance.policies.approve',null);
  select submitted_by_user_id into v_submitted from qarar_governance.policy_versions
  where id=p_policy_version_id and organization_id=v_org and legal_status='under_review' for update;
  if v_submitted is null then raise exception using errcode='55000',message='الإصدار ليس قيد المراجعة'; end if;
  if v_submitted=v_user then raise exception using errcode='42501',message='لا يجوز لمقدم الإصدار اعتماده'; end if;
  update qarar_governance.policy_versions set legal_status='approved',
    approved_by_user_id=v_user,approved_at=now(),
    automation_status=case when readiness_percent=100 then 'ready' else automation_status end
  where id=p_policy_version_id;
  perform qarar_audit.append_audit_log(v_org,'governance.policy_version.approve','policy_versions',
    p_policy_version_id,'{}'::jsonb);
  return jsonb_build_object('id',p_policy_version_id,'legal_status','approved');
end;
$$;

create or replace function qarar_governance.admin_activate_policy_version(
  p_policy_version_id uuid,p_effective_from date,p_effective_to date default null
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,qarar_governance
as $$
declare v_org uuid:=qarar_iam.current_organization_id();v_user uuid:=auth.uid();
begin
  perform qarar_iam.assert_permission('governance.policies.approve',null);
  update qarar_governance.policy_versions set legal_status='effective',
    effective_from=p_effective_from,effective_to=p_effective_to,
    activated_by_user_id=v_user,activated_at=now()
  where id=p_policy_version_id and organization_id=v_org
    and legal_status='approved' and automation_status='ready';
  if not found then raise exception using errcode='55000',
    message='يلزم إصدار معتمد وجاهز تقنيًا قبل التفعيل'; end if;
  perform qarar_audit.append_audit_log(v_org,'governance.policy_version.activate','policy_versions',
    p_policy_version_id,jsonb_build_object('effective_from',p_effective_from,'effective_to',p_effective_to));
  return jsonb_build_object('id',p_policy_version_id,'legal_status','effective',
    'effective_from',p_effective_from,'effective_to',p_effective_to);
end;
$$;

create or replace function qarar_governance.admin_suspend_policy_version(
  p_policy_version_id uuid,p_reason text
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,qarar_governance
as $$
declare v_org uuid:=qarar_iam.current_organization_id();v_user uuid:=auth.uid();
begin
  perform qarar_iam.assert_permission('governance.policies.approve',null);
  if char_length(btrim(coalesce(p_reason,'')))<10 then
    raise exception using errcode='22023',message='سبب التعليق مطلوب وبحد أدنى عشرة أحرف';
  end if;
  update qarar_governance.policy_versions set legal_status='suspended',
    suspended_by_user_id=v_user,suspended_at=now(),suspension_reason=btrim(p_reason)
  where id=p_policy_version_id and organization_id=v_org and legal_status='effective';
  if not found then raise exception using errcode='55000',message='لا يمكن تعليق إصدار غير نافذ'; end if;
  perform qarar_audit.append_audit_log(v_org,'governance.policy_version.suspend','policy_versions',
    p_policy_version_id,jsonb_build_object('reason',p_reason));
  return jsonb_build_object('id',p_policy_version_id,'legal_status','suspended');
end;
$$;

do $$
declare f record;
begin
  for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='qarar_governance' and
      (p.proname like 'admin\_%' escape '\' or p.proname in(
        'assert_policy_version_editable','guard_policy_draft_mutation'))
  loop
    execute format('alter function %s owner to qarar_governance_executor',f.oid::regprocedure);
    execute format('revoke all on function %s from public,anon,authenticated,service_role',f.oid::regprocedure);
  end loop;
end;
$$;

grant execute on function qarar_audit.append_audit_log(uuid,text,text,uuid,jsonb)
  to qarar_governance_executor;

insert into qarar_architecture.module_function_execute_allowlist(
  source_module,target_schema,function_name,identity_arguments,rationale
) values(
  'governance','qarar_audit','append_audit_log',
  'p_organization_id uuid, p_action text, p_entity_type text, p_entity_id uuid, p_metadata jsonb',
  'Append immutable audit events for policy and workflow administration'
) on conflict do nothing;

commit;
