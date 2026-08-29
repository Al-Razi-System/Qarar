begin;

set local role qarar_governance_executor;

alter table qarar_governance.policy_versions
  add column if not exists issuing_authority text,
  add column if not exists approval_authority text,
  add column if not exists approval_decision_number text,
  add column if not exists approval_date date,
  add column if not exists issue_reason text,
  add column if not exists supersedes_version_id uuid,
  add column if not exists source_document_hash text;

do $$ begin
  if not exists(select 1 from pg_constraint where conname='policy_versions_supersedes_fk') then
    alter table qarar_governance.policy_versions add constraint policy_versions_supersedes_fk
      foreign key(supersedes_version_id,organization_id)
      references qarar_governance.policy_versions(id,organization_id) on delete restrict;
  end if;
end $$;

alter table qarar_governance.policy_items
  add column if not exists official_text text,
  add column if not exists interpretation_text text,
  add column if not exists source_page_from integer,
  add column if not exists source_page_to integer,
  add column if not exists source_locator text,
  add column if not exists legal_status text not null default 'active',
  add column if not exists amendment_note text,
  add column if not exists requires_executable_rule boolean not null default false,
  add column if not exists supersedes_item_id uuid;

update qarar_governance.policy_items
set official_text=body_text
where official_text is null and body_text is not null;

do $$ begin
  if not exists(select 1 from pg_constraint where conname='policy_items_page_range_check') then
    alter table qarar_governance.policy_items add constraint policy_items_page_range_check
      check(source_page_from is null or (source_page_from>0 and (source_page_to is null or source_page_to>=source_page_from)));
  end if;
  if not exists(select 1 from pg_constraint where conname='policy_items_legal_status_check') then
    alter table qarar_governance.policy_items add constraint policy_items_legal_status_check
      check(legal_status in('active','amended','repealed','suspended'));
  end if;
  if not exists(select 1 from pg_constraint where conname='policy_items_supersedes_fk') then
    alter table qarar_governance.policy_items add constraint policy_items_supersedes_fk
      foreign key(supersedes_item_id,organization_id)
      references qarar_governance.policy_items(id,organization_id) on delete restrict;
  end if;
end $$;

reset role;

create table if not exists qarar_governance.policy_rules(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  policy_item_id uuid not null,
  rule_code text not null,
  name_ar text not null,
  description text,
  rule_type text not null,
  status text not null default 'draft',
  priority integer not null default 100,
  applies_when jsonb not null default '{}'::jsonb,
  effect_payload jsonb not null default '{}'::jsonb,
  requires_workflow boolean not null default false,
  valid_from date,
  valid_to date,
  created_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,organization_id),
  unique(policy_item_id,rule_code),
  foreign key(policy_item_id,organization_id) references qarar_governance.policy_items(id,organization_id) on delete restrict,
  foreign key(created_by_user_id,organization_id) references qarar_iam.users(id,organization_id) on delete restrict,
  check(rule_code ~ '^[a-z][a-z0-9_.-]*$'),
  check(char_length(btrim(name_ar)) between 2 and 300),
  check(rule_type in('eligibility','prohibition','requirement','authority','deadline','calculation','routing','exception','informational')),
  check(status in('draft','active','suspended','retired')),
  check(priority between 0 and 10000),
  check(jsonb_typeof(applies_when)='object' and jsonb_typeof(effect_payload)='object'),
  check(valid_to is null or (valid_from is not null and valid_to>=valid_from))
);

create table if not exists qarar_governance.rule_conditions(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  policy_rule_id uuid not null,
  condition_code text not null,
  field_path text not null,
  operator text not null,
  expected_value jsonb not null default 'null'::jsonb,
  failure_action text not null default 'block',
  failure_message_ar text,
  sequence_no integer not null,
  created_at timestamptz not null default now(),
  unique(id,organization_id),
  unique(policy_rule_id,condition_code),
  unique(policy_rule_id,sequence_no),
  foreign key(policy_rule_id,organization_id) references qarar_governance.policy_rules(id,organization_id) on delete cascade,
  check(operator in('eq','neq','gt','gte','lt','lte','in','not_in','contains','exists','not_exists','before','after','matches')),
  check(failure_action in('block','reject','return_for_completion','warn','request_exception')),
  check(sequence_no>0)
);

create table if not exists qarar_governance.rule_requirements(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  policy_rule_id uuid not null,
  requirement_code text not null,
  name_ar text not null,
  requirement_type text not null,
  is_mandatory boolean not null default true,
  timing text not null default 'before_submission',
  validation_spec jsonb not null default '{}'::jsonb,
  sequence_no integer not null,
  created_at timestamptz not null default now(),
  unique(id,organization_id),
  unique(policy_rule_id,requirement_code),
  unique(policy_rule_id,sequence_no),
  foreign key(policy_rule_id,organization_id) references qarar_governance.policy_rules(id,organization_id) on delete cascade,
  check(requirement_type in('document','data','approval','fee','declaration','evidence')),
  check(timing in('before_submission','before_review','before_decision','after_decision')),
  check(jsonb_typeof(validation_spec)='object'),
  check(sequence_no>0)
);

create table if not exists qarar_governance.rule_authorities(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  policy_rule_id uuid not null,
  governance_unit_id uuid,
  governance_class_id uuid,
  responsibility text not null,
  authority_action text not null,
  required_permission_code text,
  sequence_no integer not null,
  is_final boolean not null default false,
  created_at timestamptz not null default now(),
  unique(id,organization_id),
  unique(policy_rule_id,sequence_no),
  foreign key(policy_rule_id,organization_id) references qarar_governance.policy_rules(id,organization_id) on delete cascade,
  foreign key(governance_unit_id,organization_id) references qarar_core.governance_units(id,organization_id) on delete restrict,
  foreign key(governance_class_id,organization_id) references qarar_governance.governance_unit_classes(id,organization_id) on delete restrict,
  foreign key(organization_id,required_permission_code) references qarar_iam.permissions(organization_id,code) on delete restrict,
  check((governance_unit_id is null)<>(governance_class_id is null)),
  check(responsibility in('present','review','discuss','recommend','initial_approve','final_approve','execute','follow_up')),
  check(authority_action in('recommend','approve','final_approve','reject','return','refer','execute','verify','follow_up')),
  check(sequence_no>0)
);

create table if not exists qarar_governance.rule_actions(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  policy_rule_id uuid not null,
  action_code text not null,
  label_ar text not null,
  action_type text not null,
  is_terminal boolean not null default false,
  requires_reason boolean not null default false,
  result_payload jsonb not null default '{}'::jsonb,
  sequence_no integer not null,
  created_at timestamptz not null default now(),
  unique(id,organization_id),
  unique(policy_rule_id,action_code),
  unique(policy_rule_id,sequence_no),
  foreign key(policy_rule_id,organization_id) references qarar_governance.policy_rules(id,organization_id) on delete cascade,
  check(action_type in('recommend','approve','reject','return','defer','refer','execute','cancel','request_exception')),
  check(jsonb_typeof(result_payload)='object'),
  check(sequence_no>0)
);

create table if not exists qarar_governance.rule_workflow_bindings(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  policy_rule_id uuid not null,
  workflow_template_version_id uuid not null,
  binding_type text not null default 'primary',
  selection_conditions jsonb not null default '{}'::jsonb,
  priority integer not null default 100,
  created_at timestamptz not null default now(),
  unique(id,organization_id),
  unique(policy_rule_id,workflow_template_version_id,binding_type),
  foreign key(policy_rule_id,organization_id) references qarar_governance.policy_rules(id,organization_id) on delete cascade,
  foreign key(workflow_template_version_id,organization_id) references qarar_governance.workflow_template_versions(id,organization_id) on delete restrict,
  check(binding_type in('primary','objection','exception','fallback')),
  check(jsonb_typeof(selection_conditions)='object')
);

create table if not exists qarar_governance.policy_references(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  source_policy_item_id uuid not null,
  target_policy_id uuid,
  target_policy_version_id uuid,
  target_policy_item_id uuid,
  external_reference text,
  reference_type text not null,
  citation_text text,
  notes text,
  created_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  unique(id,organization_id),
  foreign key(source_policy_item_id,organization_id) references qarar_governance.policy_items(id,organization_id) on delete cascade,
  foreign key(target_policy_id,organization_id) references qarar_governance.policies(id,organization_id) on delete restrict,
  foreign key(target_policy_version_id,organization_id) references qarar_governance.policy_versions(id,organization_id) on delete restrict,
  foreign key(target_policy_item_id,organization_id) references qarar_governance.policy_items(id,organization_id) on delete restrict,
  foreign key(created_by_user_id,organization_id) references qarar_iam.users(id,organization_id) on delete restrict,
  check(reference_type in('implements','amends','repeals','supersedes','interprets','exception_to','related_to','based_on')),
  check(target_policy_id is not null or target_policy_version_id is not null or target_policy_item_id is not null or nullif(btrim(external_reference),'') is not null)
);

do $$ declare t text; begin
  foreach t in array array['policy_rules','rule_conditions','rule_requirements','rule_authorities','rule_actions','rule_workflow_bindings','policy_references'] loop
    execute format('alter table qarar_governance.%I owner to qarar_governance_executor',t);
    execute format('alter table qarar_governance.%I enable row level security',t);
    execute format('revoke all on qarar_governance.%I from public,anon,authenticated,service_role',t);
    if not exists (select 1 from pg_policies where schemaname='qarar_governance' and tablename=t and policyname=t||'_read') then
      execute format('create policy %I on qarar_governance.%I for select to qarar_governance_executor using(organization_id=qarar_iam.current_organization_id())',t||'_read',t);
    end if;
    if not exists (select 1 from pg_policies where schemaname='qarar_governance' and tablename=t and policyname=t||'_write') then
      execute format('create policy %I on qarar_governance.%I for all to qarar_governance_executor using(organization_id=qarar_iam.current_organization_id()) with check(organization_id=qarar_iam.current_organization_id())',t||'_write',t);
    end if;
  end loop;
end $$;

create or replace function qarar_governance.admin_update_policy_version_legal_metadata(p_policy_version_id uuid,p_issuing_authority text,p_approval_authority text,p_approval_decision_number text,p_approval_date date,p_issue_reason text,p_supersedes_version_id uuid,p_source_document_hash text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,qarar_governance as $$
declare v_org uuid:=qarar_iam.current_organization_id();
begin
  perform qarar_iam.assert_permission('governance.policies.manage',null);
  perform qarar_governance.assert_policy_version_editable(p_policy_version_id);
  update qarar_governance.policy_versions set issuing_authority=nullif(btrim(p_issuing_authority),''),approval_authority=nullif(btrim(p_approval_authority),''),approval_decision_number=nullif(btrim(p_approval_decision_number),''),approval_date=p_approval_date,issue_reason=nullif(btrim(p_issue_reason),''),supersedes_version_id=p_supersedes_version_id,source_document_hash=nullif(lower(btrim(p_source_document_hash)),'') where id=p_policy_version_id and organization_id=v_org;
  if not found then raise exception using errcode='P0002',message='إصدار اللائحة غير موجود';end if;
  return jsonb_build_object('id',p_policy_version_id,'updated',true);
end $$;

create or replace function qarar_governance.admin_update_policy_item_legal_text(p_policy_item_id uuid,p_official_text text,p_interpretation_text text,p_source_page_from integer,p_source_page_to integer,p_source_locator text,p_legal_status text,p_amendment_note text,p_requires_executable_rule boolean,p_supersedes_item_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,qarar_governance as $$
declare v_org uuid:=qarar_iam.current_organization_id();v_version uuid;
begin
  perform qarar_iam.assert_permission('governance.policies.manage',null);
  select policy_version_id into v_version from qarar_governance.policy_items where id=p_policy_item_id and organization_id=v_org;
  perform qarar_governance.assert_policy_version_editable(v_version);
  update qarar_governance.policy_items set official_text=nullif(btrim(p_official_text),''),body_text=nullif(btrim(p_official_text),''),interpretation_text=nullif(btrim(p_interpretation_text),''),source_page_from=p_source_page_from,source_page_to=p_source_page_to,source_locator=nullif(btrim(p_source_locator),''),legal_status=p_legal_status,amendment_note=nullif(btrim(p_amendment_note),''),requires_executable_rule=coalesce(p_requires_executable_rule,false),supersedes_item_id=p_supersedes_item_id where id=p_policy_item_id and organization_id=v_org;
  if not found then raise exception using errcode='P0002',message='المادة غير موجودة';end if;
  return jsonb_build_object('id',p_policy_item_id,'updated',true);
end $$;

create or replace function qarar_governance.admin_save_policy_rule(p_policy_item_id uuid,p_rule jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,qarar_governance as $$
declare v_org uuid:=qarar_iam.current_organization_id();v_user uuid:=auth.uid();v_version uuid;v_id uuid;v_row jsonb;v_seq integer;
begin
  perform qarar_iam.assert_permission('governance.policies.manage',null);
  if p_rule is null or jsonb_typeof(p_rule)<>'object' then raise exception using errcode='22023',message='بيانات القاعدة غير صالحة';end if;
  select policy_version_id into v_version from qarar_governance.policy_items where id=p_policy_item_id and organization_id=v_org;
  perform qarar_governance.assert_policy_version_editable(v_version);
  v_id:=nullif(p_rule->>'id','')::uuid;
  if v_id is null then
    insert into qarar_governance.policy_rules(organization_id,policy_item_id,rule_code,name_ar,description,rule_type,status,priority,applies_when,effect_payload,requires_workflow,valid_from,valid_to,created_by_user_id)
    values(v_org,p_policy_item_id,lower(btrim(p_rule->>'code')),btrim(p_rule->>'name_ar'),nullif(btrim(coalesce(p_rule->>'description','')),''),coalesce(nullif(p_rule->>'rule_type',''),'requirement'),coalesce(nullif(p_rule->>'status',''),'draft'),coalesce((p_rule->>'priority')::integer,100),coalesce(p_rule->'applies_when','{}'),coalesce(p_rule->'effect_payload','{}'),coalesce((p_rule->>'requires_workflow')::boolean,false),nullif(p_rule->>'valid_from','')::date,nullif(p_rule->>'valid_to','')::date,v_user) returning id into v_id;
  else
    update qarar_governance.policy_rules set rule_code=lower(btrim(p_rule->>'code')),name_ar=btrim(p_rule->>'name_ar'),description=nullif(btrim(coalesce(p_rule->>'description','')),''),rule_type=coalesce(nullif(p_rule->>'rule_type',''),'requirement'),status=coalesce(nullif(p_rule->>'status',''),'draft'),priority=coalesce((p_rule->>'priority')::integer,100),applies_when=coalesce(p_rule->'applies_when','{}'),effect_payload=coalesce(p_rule->'effect_payload','{}'),requires_workflow=coalesce((p_rule->>'requires_workflow')::boolean,false),valid_from=nullif(p_rule->>'valid_from','')::date,valid_to=nullif(p_rule->>'valid_to','')::date,updated_at=now() where id=v_id and policy_item_id=p_policy_item_id and organization_id=v_org;
    if not found then raise exception using errcode='P0002',message='القاعدة التنفيذية غير موجودة';end if;
    delete from qarar_governance.rule_conditions where policy_rule_id=v_id;
    delete from qarar_governance.rule_requirements where policy_rule_id=v_id;
    delete from qarar_governance.rule_authorities where policy_rule_id=v_id;
    delete from qarar_governance.rule_actions where policy_rule_id=v_id;
    delete from qarar_governance.rule_workflow_bindings where policy_rule_id=v_id;
  end if;
  v_seq:=0;for v_row in select value from jsonb_array_elements(coalesce(p_rule->'conditions','[]')) loop v_seq:=v_seq+1;insert into qarar_governance.rule_conditions(organization_id,policy_rule_id,condition_code,field_path,operator,expected_value,failure_action,failure_message_ar,sequence_no) values(v_org,v_id,coalesce(nullif(v_row->>'code',''),'condition_'||v_seq),v_row->>'field_path',v_row->>'operator',coalesce(v_row->'expected_value','null'),coalesce(nullif(v_row->>'failure_action',''),'block'),nullif(v_row->>'failure_message_ar',''),v_seq);end loop;
  v_seq:=0;for v_row in select value from jsonb_array_elements(coalesce(p_rule->'requirements','[]')) loop v_seq:=v_seq+1;insert into qarar_governance.rule_requirements(organization_id,policy_rule_id,requirement_code,name_ar,requirement_type,is_mandatory,timing,validation_spec,sequence_no) values(v_org,v_id,coalesce(nullif(v_row->>'code',''),'requirement_'||v_seq),v_row->>'name_ar',coalesce(nullif(v_row->>'requirement_type',''),'document'),coalesce((v_row->>'is_mandatory')::boolean,true),coalesce(nullif(v_row->>'timing',''),'before_submission'),coalesce(v_row->'validation_spec','{}'),v_seq);end loop;
  v_seq:=0;for v_row in select value from jsonb_array_elements(coalesce(p_rule->'authorities','[]')) loop v_seq:=v_seq+1;insert into qarar_governance.rule_authorities(organization_id,policy_rule_id,governance_unit_id,governance_class_id,responsibility,authority_action,required_permission_code,sequence_no,is_final) values(v_org,v_id,nullif(v_row->>'governance_unit_id','')::uuid,nullif(v_row->>'governance_class_id','')::uuid,v_row->>'responsibility',v_row->>'authority_action',nullif(v_row->>'required_permission_code',''),v_seq,coalesce((v_row->>'is_final')::boolean,false));end loop;
  v_seq:=0;for v_row in select value from jsonb_array_elements(coalesce(p_rule->'actions','[]')) loop v_seq:=v_seq+1;insert into qarar_governance.rule_actions(organization_id,policy_rule_id,action_code,label_ar,action_type,is_terminal,requires_reason,result_payload,sequence_no) values(v_org,v_id,v_row->>'code',v_row->>'label_ar',v_row->>'action_type',coalesce((v_row->>'is_terminal')::boolean,false),coalesce((v_row->>'requires_reason')::boolean,false),coalesce(v_row->'result_payload','{}'),v_seq);end loop;
  v_seq:=0;for v_row in select value from jsonb_array_elements(coalesce(p_rule->'workflow_bindings','[]')) loop v_seq:=v_seq+1;insert into qarar_governance.rule_workflow_bindings(organization_id,policy_rule_id,workflow_template_version_id,binding_type,selection_conditions,priority) values(v_org,v_id,(v_row->>'workflow_template_version_id')::uuid,coalesce(nullif(v_row->>'binding_type',''),'primary'),coalesce(v_row->'selection_conditions','{}'),coalesce((v_row->>'priority')::integer,100));end loop;
  perform qarar_audit.append_audit_log(v_org,'governance.policy_rule.save','policy_rules',v_id,jsonb_build_object('policy_item_id',p_policy_item_id,'code',p_rule->>'code'));
  return jsonb_build_object('id',v_id,'saved',true);
end $$;

create or replace function qarar_governance.admin_remove_policy_rule(p_policy_rule_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,qarar_governance as $$
declare v_org uuid:=qarar_iam.current_organization_id();v_version uuid;
begin perform qarar_iam.assert_permission('governance.policies.manage',null);select i.policy_version_id into v_version from qarar_governance.policy_rules r join qarar_governance.policy_items i on i.id=r.policy_item_id where r.id=p_policy_rule_id and r.organization_id=v_org;perform qarar_governance.assert_policy_version_editable(v_version);delete from qarar_governance.policy_rules where id=p_policy_rule_id and organization_id=v_org;if not found then raise exception using errcode='P0002',message='القاعدة غير موجودة';end if;return jsonb_build_object('id',p_policy_rule_id,'removed',true);end $$;

create or replace function qarar_governance.admin_save_policy_reference(p_policy_reference_id uuid,p_source_policy_item_id uuid,p_target_policy_id uuid,p_target_policy_version_id uuid,p_target_policy_item_id uuid,p_external_reference text,p_reference_type text,p_citation_text text,p_notes text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,qarar_governance as $$
declare v_org uuid:=qarar_iam.current_organization_id();v_user uuid:=auth.uid();v_version uuid;v_id uuid:=p_policy_reference_id;
begin perform qarar_iam.assert_permission('governance.policies.manage',null);select policy_version_id into v_version from qarar_governance.policy_items where id=p_source_policy_item_id and organization_id=v_org;perform qarar_governance.assert_policy_version_editable(v_version);if v_id is null then insert into qarar_governance.policy_references(organization_id,source_policy_item_id,target_policy_id,target_policy_version_id,target_policy_item_id,external_reference,reference_type,citation_text,notes,created_by_user_id) values(v_org,p_source_policy_item_id,p_target_policy_id,p_target_policy_version_id,p_target_policy_item_id,nullif(btrim(p_external_reference),''),p_reference_type,nullif(btrim(p_citation_text),''),nullif(btrim(p_notes),''),v_user) returning id into v_id;else update qarar_governance.policy_references set target_policy_id=p_target_policy_id,target_policy_version_id=p_target_policy_version_id,target_policy_item_id=p_target_policy_item_id,external_reference=nullif(btrim(p_external_reference),''),reference_type=p_reference_type,citation_text=nullif(btrim(p_citation_text),''),notes=nullif(btrim(p_notes),'') where id=v_id and source_policy_item_id=p_source_policy_item_id and organization_id=v_org;if not found then raise exception using errcode='P0002',message='الإحالة غير موجودة';end if;end if;return jsonb_build_object('id',v_id,'saved',true);end $$;

create or replace function qarar_governance.admin_remove_policy_reference(p_policy_reference_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,qarar_governance as $$
declare v_org uuid:=qarar_iam.current_organization_id();v_version uuid;
begin perform qarar_iam.assert_permission('governance.policies.manage',null);select i.policy_version_id into v_version from qarar_governance.policy_references r join qarar_governance.policy_items i on i.id=r.source_policy_item_id where r.id=p_policy_reference_id and r.organization_id=v_org;perform qarar_governance.assert_policy_version_editable(v_version);delete from qarar_governance.policy_references where id=p_policy_reference_id and organization_id=v_org;if not found then raise exception using errcode='P0002',message='الإحالة غير موجودة';end if;return jsonb_build_object('id',p_policy_reference_id,'removed',true);end $$;

create or replace function qarar_governance.admin_get_policy_legislative_model(p_policy_version_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,qarar_governance as $$
declare v_org uuid:=qarar_iam.current_organization_id();v_result jsonb;
begin perform qarar_iam.assert_permission('governance.policies.manage',null);select to_jsonb(v)||jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(i)||jsonb_build_object('rules',coalesce((select jsonb_agg(to_jsonb(r)||jsonb_build_object('conditions',coalesce((select jsonb_agg(to_jsonb(c) order by c.sequence_no)from qarar_governance.rule_conditions c where c.policy_rule_id=r.id),'[]'),'requirements',coalesce((select jsonb_agg(to_jsonb(q) order by q.sequence_no)from qarar_governance.rule_requirements q where q.policy_rule_id=r.id),'[]'),'authorities',coalesce((select jsonb_agg(to_jsonb(a) order by a.sequence_no)from qarar_governance.rule_authorities a where a.policy_rule_id=r.id),'[]'),'actions',coalesce((select jsonb_agg(to_jsonb(x) order by x.sequence_no)from qarar_governance.rule_actions x where x.policy_rule_id=r.id),'[]'),'workflow_bindings',coalesce((select jsonb_agg(to_jsonb(b) order by b.priority desc)from qarar_governance.rule_workflow_bindings b where b.policy_rule_id=r.id),'[]')) order by r.priority desc,r.rule_code)from qarar_governance.policy_rules r where r.policy_item_id=i.id),'[]'),'references',coalesce((select jsonb_agg(to_jsonb(ref) order by ref.created_at)from qarar_governance.policy_references ref where ref.source_policy_item_id=i.id),'[]')) order by i.sort_order)from qarar_governance.policy_items i where i.policy_version_id=v.id),'[]')) into v_result from qarar_governance.policy_versions v where v.id=p_policy_version_id and v.organization_id=v_org;if v_result is null then raise exception using errcode='P0002',message='إصدار اللائحة غير موجود';end if;return v_result;end $$;

create or replace function qarar_governance.admin_validate_policy_version_readiness(p_policy_version_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,qarar_governance as $$
declare v_org uuid:=qarar_iam.current_organization_id();v_errors jsonb:='[]';v_warnings jsonb:='[]';v_total integer;v_ready integer;v_score integer;
begin
  perform qarar_iam.assert_permission('governance.policies.manage',null);
  if not exists(select 1 from qarar_governance.policy_versions where id=p_policy_version_id and organization_id=v_org)then raise exception using errcode='P0002',message='إصدار اللائحة غير موجود';end if;
  if not exists(select 1 from qarar_governance.policy_items where policy_version_id=p_policy_version_id)then v_errors:=v_errors||jsonb_build_array(jsonb_build_object('code','NO_ITEMS','message','أضف مادة واحدة على الأقل.'));end if;
  if not exists(select 1 from qarar_governance.policy_scope_assignments where policy_version_id=p_policy_version_id and is_active)then v_errors:=v_errors||jsonb_build_array(jsonb_build_object('code','NO_SCOPE','message','حدد نطاق تطبيق واحدًا على الأقل.'));end if;
  if exists(select 1 from qarar_governance.policy_items where policy_version_id=p_policy_version_id and item_type in('article','clause') and nullif(btrim(coalesce(official_text,body_text,'')),'') is null)then v_errors:=v_errors||jsonb_build_array(jsonb_build_object('code','MISSING_OFFICIAL_TEXT','message','توجد مواد أو فقرات بلا نص رسمي.'));end if;
  if exists(select 1 from qarar_governance.policy_items i where i.policy_version_id=p_policy_version_id and i.requires_executable_rule and not exists(select 1 from qarar_governance.policy_rules r where r.policy_item_id=i.id and r.status<>'retired'))then v_errors:=v_errors||jsonb_build_array(jsonb_build_object('code','MISSING_RULE','message','توجد مواد تنفيذية بلا قواعد رقمية.'));end if;
  if exists(select 1 from qarar_governance.policy_rules r join qarar_governance.policy_items i on i.id=r.policy_item_id where i.policy_version_id=p_policy_version_id and r.requires_workflow and not exists(select 1 from qarar_governance.rule_workflow_bindings b where b.policy_rule_id=r.id))then v_errors:=v_errors||jsonb_build_array(jsonb_build_object('code','MISSING_WORKFLOW','message','توجد قواعد إجرائية بلا مسار اعتماد.'));end if;
  if exists(select 1 from qarar_governance.policy_rules r join qarar_governance.policy_items i on i.id=r.policy_item_id where i.policy_version_id=p_policy_version_id and r.rule_type in('authority','routing') and not exists(select 1 from qarar_governance.rule_authorities a where a.policy_rule_id=r.id))then v_errors:=v_errors||jsonb_build_array(jsonb_build_object('code','MISSING_AUTHORITY','message','توجد قواعد صلاحيات أو إحالة بلا جهة مختصة.'));end if;
  if exists(select 1 from qarar_governance.policy_items where policy_version_id=p_policy_version_id and item_type in('article','clause') and source_page_from is null)then v_warnings:=v_warnings||jsonb_build_array(jsonb_build_object('code','MISSING_PAGE','message','بعض المواد لا تحتوي رقم الصفحة في المصدر.'));end if;
  if not exists(select 1 from qarar_governance.policy_attachments where policy_version_id=p_policy_version_id)then v_warnings:=v_warnings||jsonb_build_array(jsonb_build_object('code','MISSING_SOURCE_FILE','message','لم يرفق ملف المصدر مع الإصدار.'));end if;
  select count(*),count(*)filter(where (not requires_executable_rule)or exists(select 1 from qarar_governance.policy_rules r where r.policy_item_id=i.id))into v_total,v_ready from qarar_governance.policy_items i where policy_version_id=p_policy_version_id;
  v_score:=case when jsonb_array_length(v_errors)>0 then greatest(0,70-jsonb_array_length(v_errors)*15)else least(100,85+v_ready*15/greatest(v_total,1))end;
  return jsonb_build_object('ready',jsonb_array_length(v_errors)=0,'score',v_score,'errors',v_errors,'warnings',v_warnings,'items_total',v_total,'items_ready',v_ready);
end $$;

create or replace function qarar_governance.guard_policy_legislative_readiness()
returns trigger language plpgsql security definer set search_path=pg_catalog,qarar_governance as $$
declare v_check jsonb;
begin
  if old.legal_status='draft' and new.legal_status='under_review' then
    v_check:=qarar_governance.admin_validate_policy_version_readiness(new.id);
    if not coalesce((v_check->>'ready')::boolean,false) then
      raise exception using errcode='23514',message='النموذج التشريعي غير مكتمل؛ أصلح أخطاء الجاهزية قبل الإرسال للمراجعة',detail=(v_check->'errors')::text;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists policy_version_legislative_readiness_guard on qarar_governance.policy_versions;
create trigger policy_version_legislative_readiness_guard before update of legal_status
on qarar_governance.policy_versions for each row execute function qarar_governance.guard_policy_legislative_readiness();

create or replace function qarar_governance.admin_compare_policy_versions(p_left_version_id uuid,p_right_version_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,qarar_governance as $$
declare v_org uuid:=qarar_iam.current_organization_id();
begin perform qarar_iam.assert_permission('governance.policies.manage',null);if not exists(select 1 from qarar_governance.policy_versions where id in(p_left_version_id,p_right_version_id)and organization_id=v_org group by organization_id having count(*)=2)then raise exception using errcode='P0002',message='أحد الإصدارين غير موجود';end if;return jsonb_build_object('added',coalesce((select jsonb_agg(to_jsonb(r))from qarar_governance.policy_items r where r.policy_version_id=p_right_version_id and not exists(select 1 from qarar_governance.policy_items l where l.policy_version_id=p_left_version_id and l.item_code=r.item_code)),'[]'),'removed',coalesce((select jsonb_agg(to_jsonb(l))from qarar_governance.policy_items l where l.policy_version_id=p_left_version_id and not exists(select 1 from qarar_governance.policy_items r where r.policy_version_id=p_right_version_id and r.item_code=l.item_code)),'[]'),'modified',coalesce((select jsonb_agg(jsonb_build_object('item_code',l.item_code,'left',to_jsonb(l),'right',to_jsonb(r)))from qarar_governance.policy_items l join qarar_governance.policy_items r on r.policy_version_id=p_right_version_id and r.item_code=l.item_code where l.policy_version_id=p_left_version_id and (coalesce(l.official_text,l.body_text,'')<>coalesce(r.official_text,r.body_text,'')or l.title_ar<>r.title_ar or l.legal_status<>r.legal_status)),'[]'));end $$;

do $$ declare f regprocedure; begin foreach f in array array[
  'qarar_governance.admin_update_policy_version_legal_metadata(uuid,text,text,text,date,text,uuid,text)'::regprocedure,
  'qarar_governance.admin_update_policy_item_legal_text(uuid,text,text,integer,integer,text,text,text,boolean,uuid)'::regprocedure,
  'qarar_governance.admin_save_policy_rule(uuid,jsonb)'::regprocedure,'qarar_governance.admin_remove_policy_rule(uuid)'::regprocedure,
  'qarar_governance.admin_save_policy_reference(uuid,uuid,uuid,uuid,uuid,text,text,text,text)'::regprocedure,'qarar_governance.admin_remove_policy_reference(uuid)'::regprocedure,
  'qarar_governance.admin_get_policy_legislative_model(uuid)'::regprocedure,'qarar_governance.admin_validate_policy_version_readiness(uuid)'::regprocedure,'qarar_governance.admin_compare_policy_versions(uuid,uuid)'::regprocedure,
  'qarar_governance.guard_policy_legislative_readiness()'::regprocedure
]loop execute format('alter function %s owner to qarar_governance_executor',f);end loop;end $$;

do $$ declare f text; begin
  foreach f in array array['admin_update_policy_version_legal_metadata','admin_update_policy_item_legal_text','admin_save_policy_rule','admin_remove_policy_rule','admin_save_policy_reference','admin_remove_policy_reference','admin_get_policy_legislative_model','admin_validate_policy_version_readiness','admin_compare_policy_versions'] loop
    insert into qarar_architecture.api_contract_registry(api_version,contract_name,implementation_schema,implementation_name,identity_arguments,module_code,audience)
    select 'v1',f,'qarar_governance',f,pg_get_function_identity_arguments(p.oid),'governance','authenticated' from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='qarar_governance'and p.proname=f on conflict do nothing;
  end loop;
end $$;

create or replace function api_v1.admin_update_policy_version_legal_metadata(p_policy_version_id uuid,p_issuing_authority text,p_approval_authority text,p_approval_decision_number text,p_approval_date date,p_issue_reason text,p_supersedes_version_id uuid,p_source_document_hash text)returns jsonb language sql security definer set search_path=pg_catalog as $$select qarar_governance.admin_update_policy_version_legal_metadata($1,$2,$3,$4,$5,$6,$7,$8)$$;
create or replace function api_v1.admin_update_policy_item_legal_text(p_policy_item_id uuid,p_official_text text,p_interpretation_text text,p_source_page_from integer,p_source_page_to integer,p_source_locator text,p_legal_status text,p_amendment_note text,p_requires_executable_rule boolean,p_supersedes_item_id uuid)returns jsonb language sql security definer set search_path=pg_catalog as $$select qarar_governance.admin_update_policy_item_legal_text($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)$$;
create or replace function api_v1.admin_save_policy_rule(p_policy_item_id uuid,p_rule jsonb)returns jsonb language sql security definer set search_path=pg_catalog as $$select qarar_governance.admin_save_policy_rule($1,$2)$$;
create or replace function api_v1.admin_remove_policy_rule(p_policy_rule_id uuid)returns jsonb language sql security definer set search_path=pg_catalog as $$select qarar_governance.admin_remove_policy_rule($1)$$;
create or replace function api_v1.admin_save_policy_reference(p_policy_reference_id uuid,p_source_policy_item_id uuid,p_target_policy_id uuid,p_target_policy_version_id uuid,p_target_policy_item_id uuid,p_external_reference text,p_reference_type text,p_citation_text text,p_notes text)returns jsonb language sql security definer set search_path=pg_catalog as $$select qarar_governance.admin_save_policy_reference($1,$2,$3,$4,$5,$6,$7,$8,$9)$$;
create or replace function api_v1.admin_remove_policy_reference(p_policy_reference_id uuid)returns jsonb language sql security definer set search_path=pg_catalog as $$select qarar_governance.admin_remove_policy_reference($1)$$;
create or replace function api_v1.admin_get_policy_legislative_model(p_policy_version_id uuid)returns jsonb language sql stable security definer set search_path=pg_catalog as $$select qarar_governance.admin_get_policy_legislative_model($1)$$;
create or replace function api_v1.admin_validate_policy_version_readiness(p_policy_version_id uuid)returns jsonb language sql stable security definer set search_path=pg_catalog as $$select qarar_governance.admin_validate_policy_version_readiness($1)$$;
create or replace function api_v1.admin_compare_policy_versions(p_left_version_id uuid,p_right_version_id uuid)returns jsonb language sql stable security definer set search_path=pg_catalog as $$select qarar_governance.admin_compare_policy_versions($1,$2)$$;

do $$ declare f regprocedure; begin foreach f in array array[
  'api_v1.admin_update_policy_version_legal_metadata(uuid,text,text,text,date,text,uuid,text)'::regprocedure,
  'api_v1.admin_update_policy_item_legal_text(uuid,text,text,integer,integer,text,text,text,boolean,uuid)'::regprocedure,
  'api_v1.admin_save_policy_rule(uuid,jsonb)'::regprocedure,'api_v1.admin_remove_policy_rule(uuid)'::regprocedure,
  'api_v1.admin_save_policy_reference(uuid,uuid,uuid,uuid,uuid,text,text,text,text)'::regprocedure,'api_v1.admin_remove_policy_reference(uuid)'::regprocedure,
  'api_v1.admin_get_policy_legislative_model(uuid)'::regprocedure,'api_v1.admin_validate_policy_version_readiness(uuid)'::regprocedure,'api_v1.admin_compare_policy_versions(uuid,uuid)'::regprocedure
]loop execute format('alter function %s owner to qarar_api_executor',f);execute format('revoke all on function %s from public,anon',f);execute format('grant execute on function %s to authenticated,service_role',f);end loop;end $$;

grant execute on function qarar_governance.admin_update_policy_version_legal_metadata(uuid,text,text,text,date,text,uuid,text),qarar_governance.admin_update_policy_item_legal_text(uuid,text,text,integer,integer,text,text,text,boolean,uuid),qarar_governance.admin_save_policy_rule(uuid,jsonb),qarar_governance.admin_remove_policy_rule(uuid),qarar_governance.admin_save_policy_reference(uuid,uuid,uuid,uuid,uuid,text,text,text,text),qarar_governance.admin_remove_policy_reference(uuid),qarar_governance.admin_get_policy_legislative_model(uuid),qarar_governance.admin_validate_policy_version_readiness(uuid),qarar_governance.admin_compare_policy_versions(uuid,uuid) to qarar_api_executor;

commit;
