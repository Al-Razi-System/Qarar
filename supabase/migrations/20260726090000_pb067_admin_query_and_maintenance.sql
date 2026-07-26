begin;

create or replace function qarar_governance.admin_search_policies(
  p_query text default null,p_status text default null,p_limit integer default 25,p_offset integer default 0
) returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,qarar_governance
as $$
declare v_org uuid:=qarar_iam.current_organization_id();v_result jsonb;
begin
  perform qarar_iam.assert_permission('governance.policies.read',null);
  if p_limit not between 1 and 100 or p_offset<0 then
    raise exception using errcode='22023',message='قيم pagination غير صالحة';end if;
  with filtered as(
    select p.*,count(v.id) version_count,max(v.version_no) latest_version_no
    from qarar_governance.policies p
    left join qarar_governance.policy_versions v on v.policy_id=p.id
    where p.organization_id=v_org
      and (p_status is null or p.status=p_status)
      and (p_query is null or p.code ilike '%'||p_query||'%' or p.name_ar ilike '%'||p_query||'%'
        or coalesce(p.name_en,'') ilike '%'||p_query||'%')
    group by p.id
  ),paged as(select * from filtered order by updated_at desc,id limit p_limit offset p_offset)
  select jsonb_build_object(
    'items',coalesce((select jsonb_agg(jsonb_build_object(
      'id',id,'code',code,'name_ar',name_ar,'name_en',name_en,'policy_type',policy_type,
      'status',status,'owner_user_id',owner_user_id,'version_count',version_count,
      'latest_version_no',latest_version_no,'updated_at',updated_at
    ) order by updated_at desc,id) from paged),'[]'::jsonb),
    'total',(select count(*) from filtered),'limit',p_limit,'offset',p_offset
  ) into v_result;
  return v_result;
end;
$$;

create or replace function qarar_governance.admin_get_policy_detail(p_policy_id uuid)
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,qarar_governance
as $$
declare v_org uuid:=qarar_iam.current_organization_id();v_result jsonb;
begin
  perform qarar_iam.assert_permission('governance.policies.read',null);
  select to_jsonb(p)||jsonb_build_object(
    'versions',coalesce((select jsonb_agg(to_jsonb(v)||jsonb_build_object(
      'items',coalesce((select jsonb_agg(to_jsonb(i) order by i.sort_order)
        from qarar_governance.policy_items i where i.policy_version_id=v.id),'[]'::jsonb),
      'scopes',coalesce((select jsonb_agg(to_jsonb(s) order by s.priority desc,s.created_at)
        from qarar_governance.policy_scope_assignments s where s.policy_version_id=v.id),'[]'::jsonb)
    ) order by v.version_no desc) from qarar_governance.policy_versions v
      where v.policy_id=p.id),'[]'::jsonb)
  ) into v_result from qarar_governance.policies p
  where p.id=p_policy_id and p.organization_id=v_org;
  if v_result is null then raise exception using errcode='P0002',message='اللائحة غير موجودة';end if;
  return v_result;
end;
$$;

create or replace function qarar_governance.admin_update_policy(
  p_policy_id uuid,p_name_ar text,p_name_en text default null,p_description text default null,
  p_owner_user_id uuid default null,p_status text default 'active'
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,qarar_governance
as $$
declare v_org uuid:=qarar_iam.current_organization_id();
begin
  perform qarar_iam.assert_permission('governance.policies.manage',null);
  update qarar_governance.policies set name_ar=btrim(p_name_ar),name_en=p_name_en,
    description=p_description,owner_user_id=p_owner_user_id,status=p_status
  where id=p_policy_id and organization_id=v_org;
  if not found then raise exception using errcode='P0002',message='اللائحة غير موجودة';end if;
  return jsonb_build_object('id',p_policy_id,'status',p_status);
end;
$$;

create or replace function qarar_governance.admin_update_policy_item(
  p_policy_item_id uuid,p_title_ar text,p_title_en text default null,p_body_text text default null,
  p_sort_order integer default null,p_governance_mode text default null,
  p_topic_category_id uuid default null,p_match_criteria jsonb default null,
  p_workflow_template_version_id uuid default null,p_is_active boolean default true
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,qarar_governance
as $$
declare v_org uuid:=qarar_iam.current_organization_id();v_version uuid;
begin
  perform qarar_iam.assert_permission('governance.policies.manage',null);
  select policy_version_id into v_version from qarar_governance.policy_items
  where id=p_policy_item_id and organization_id=v_org;
  perform qarar_governance.assert_policy_version_editable(v_version);
  update qarar_governance.policy_items set title_ar=btrim(p_title_ar),title_en=p_title_en,
    body_text=p_body_text,sort_order=coalesce(p_sort_order,sort_order),
    governance_mode=coalesce(p_governance_mode,governance_mode),
    topic_category_id=p_topic_category_id,
    match_criteria=coalesce(p_match_criteria,match_criteria),
    workflow_template_version_id=p_workflow_template_version_id,is_active=p_is_active
  where id=p_policy_item_id and organization_id=v_org;
  if not found then raise exception using errcode='P0002',message='بند اللائحة غير موجود';end if;
  return jsonb_build_object('id',p_policy_item_id,'is_active',p_is_active);
end;
$$;

create or replace function qarar_governance.admin_remove_policy_item(p_policy_item_id uuid)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,qarar_governance
as $$
declare v_org uuid:=qarar_iam.current_organization_id();v_version uuid;
begin
  perform qarar_iam.assert_permission('governance.policies.manage',null);
  select policy_version_id into v_version from qarar_governance.policy_items
  where id=p_policy_item_id and organization_id=v_org;
  perform qarar_governance.assert_policy_version_editable(v_version);
  delete from qarar_governance.policy_items where id=p_policy_item_id and organization_id=v_org;
  return jsonb_build_object('id',p_policy_item_id,'deleted',true);
end;
$$;

create or replace function qarar_governance.admin_remove_policy_scope(p_scope_assignment_id uuid)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,qarar_governance
as $$
declare v_org uuid:=qarar_iam.current_organization_id();v_version uuid;
begin
  perform qarar_iam.assert_permission('governance.policies.manage',null);
  select policy_version_id into v_version from qarar_governance.policy_scope_assignments
  where id=p_scope_assignment_id and organization_id=v_org;
  perform qarar_governance.assert_policy_version_editable(v_version);
  delete from qarar_governance.policy_scope_assignments
  where id=p_scope_assignment_id and organization_id=v_org;
  return jsonb_build_object('id',p_scope_assignment_id,'deleted',true);
end;
$$;

create or replace function qarar_governance.admin_create_workflow_version(
  p_workflow_template_id uuid,p_clone_version_id uuid default null
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,qarar_governance
as $$
declare v_org uuid:=qarar_iam.current_organization_id();v_user uuid:=auth.uid();
  v_id uuid;v_no integer;
begin
  perform qarar_iam.assert_permission('governance.workflows.manage',null);
  perform pg_advisory_xact_lock(hashtextextended(p_workflow_template_id::text,0));
  if not exists(select 1 from qarar_governance.workflow_templates
    where id=p_workflow_template_id and organization_id=v_org and status='active')
  then raise exception using errcode='P0002',message='قالب المسار غير موجود أو غير نشط';end if;
  select coalesce(max(version_no),0)+1 into v_no from qarar_governance.workflow_template_versions
  where workflow_template_id=p_workflow_template_id;
  insert into qarar_governance.workflow_template_versions(
    organization_id,workflow_template_id,version_no,created_by_user_id
  ) values(v_org,p_workflow_template_id,v_no,v_user) returning id into v_id;
  if p_clone_version_id is not null then
    if not exists(select 1 from qarar_governance.workflow_template_versions
      where id=p_clone_version_id and organization_id=v_org
        and workflow_template_id=p_workflow_template_id)
    then raise exception using errcode='P0002',message='إصدار القالب المصدر غير موجود';end if;
    insert into qarar_governance.workflow_template_steps(
      organization_id,workflow_template_version_id,step_code,name_ar,name_en,sequence_no,
      step_type,responsibility,governance_unit_id,governance_class_id,required_permission_code,
      is_initial,is_terminal,entry_conditions,exit_conditions,allowed_outcomes
    ) select organization_id,v_id,step_code,name_ar,null,sequence_no,step_type,responsibility,
      governance_unit_id,governance_class_id,required_permission_code,is_initial,is_terminal,
      entry_conditions,exit_conditions,allowed_outcomes
    from qarar_governance.workflow_template_steps where workflow_template_version_id=p_clone_version_id;
    insert into qarar_governance.workflow_template_transitions(
      organization_id,workflow_template_version_id,from_step_id,to_step_id,
      outcome_code,transition_type,conditions
    )
    select t.organization_id,v_id,nf.id,nt.id,t.outcome_code,t.transition_type,t.conditions
    from qarar_governance.workflow_template_transitions t
    join qarar_governance.workflow_template_steps ofrom on ofrom.id=t.from_step_id
    join qarar_governance.workflow_template_steps nf
      on nf.workflow_template_version_id=v_id and nf.step_code=ofrom.step_code
    left join qarar_governance.workflow_template_steps oto on oto.id=t.to_step_id
    left join qarar_governance.workflow_template_steps nt
      on nt.workflow_template_version_id=v_id and nt.step_code=oto.step_code
    where t.workflow_template_version_id=p_clone_version_id;
  end if;
  return jsonb_build_object('id',v_id,'version_no',v_no,'status','draft');
end;
$$;

create or replace function qarar_governance.admin_update_workflow_step(
  p_step_id uuid,p_name_ar text,p_sequence_no integer,p_responsibility text,
  p_governance_unit_id uuid default null,p_governance_class_id uuid default null,
  p_required_permission_code text default null,p_is_initial boolean default false,
  p_is_terminal boolean default false,p_entry_conditions jsonb default '{}'::jsonb,
  p_exit_conditions jsonb default '{}'::jsonb,p_allowed_outcomes text[] default array['approved']::text[]
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,qarar_governance
as $$
declare v_org uuid:=qarar_iam.current_organization_id();v_version uuid;
begin
  perform qarar_iam.assert_permission('governance.workflows.manage',p_governance_unit_id);
  select workflow_template_version_id into v_version from qarar_governance.workflow_template_steps
  where id=p_step_id and organization_id=v_org;
  perform qarar_governance.assert_workflow_version_editable(v_version);
  update qarar_governance.workflow_template_steps set name_ar=btrim(p_name_ar),
    sequence_no=p_sequence_no,responsibility=p_responsibility,
    governance_unit_id=p_governance_unit_id,governance_class_id=p_governance_class_id,
    required_permission_code=p_required_permission_code,is_initial=p_is_initial,
    is_terminal=p_is_terminal,entry_conditions=p_entry_conditions,
    exit_conditions=p_exit_conditions,allowed_outcomes=p_allowed_outcomes
  where id=p_step_id and organization_id=v_org;
  return jsonb_build_object('id',p_step_id,'sequence_no',p_sequence_no);
end;
$$;

create or replace function qarar_governance.admin_remove_workflow_step(p_step_id uuid)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,qarar_governance
as $$
declare v_org uuid:=qarar_iam.current_organization_id();v_version uuid;
begin
  perform qarar_iam.assert_permission('governance.workflows.manage',null);
  select workflow_template_version_id into v_version from qarar_governance.workflow_template_steps
  where id=p_step_id and organization_id=v_org;
  perform qarar_governance.assert_workflow_version_editable(v_version);
  delete from qarar_governance.workflow_template_transitions
  where from_step_id=p_step_id or to_step_id=p_step_id;
  delete from qarar_governance.workflow_template_steps where id=p_step_id and organization_id=v_org;
  return jsonb_build_object('id',p_step_id,'deleted',true);
end;
$$;

create or replace function qarar_governance.admin_activate_workflow_template_version(
  p_workflow_template_version_id uuid
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,qarar_governance
as $$
declare v_org uuid:=qarar_iam.current_organization_id();v_user uuid:=auth.uid();
  v_template uuid;v_validation jsonb;
begin
  perform qarar_iam.assert_permission('governance.workflows.manage',null);
  select workflow_template_id into v_template from qarar_governance.workflow_template_versions
  where id=p_workflow_template_version_id and organization_id=v_org and status='draft' for update;
  if v_template is null then raise exception using errcode='55000',message='إصدار القالب ليس مسودة';end if;
  v_validation:=qarar_governance.validate_workflow_template_version(p_workflow_template_version_id);
  if not (v_validation->>'valid')::boolean then
    raise exception using errcode='23514',message='قالب المسار غير مكتمل',detail=v_validation::text;end if;
  update qarar_governance.workflow_template_versions set status='retired'
  where workflow_template_id=v_template and status='active';
  update qarar_governance.workflow_template_versions set status='active',
    activated_by_user_id=v_user,activated_at=now()
  where id=p_workflow_template_version_id;
  return jsonb_build_object('id',p_workflow_template_version_id,'status','active');
end;
$$;

do $$
declare f record;
begin
  for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='qarar_governance' and p.proname in(
    'admin_search_policies','admin_get_policy_detail','admin_update_policy',
    'admin_update_policy_item','admin_remove_policy_item','admin_remove_policy_scope',
    'admin_create_workflow_version','admin_update_workflow_step',
    'admin_remove_workflow_step','admin_activate_workflow_template_version')
  loop
    execute format('alter function %s owner to qarar_governance_executor',f.oid::regprocedure);
    execute format('revoke all on function %s from public,anon,authenticated,service_role',f.oid::regprocedure);
  end loop;
end;
$$;

commit;
