begin;

create or replace function qarar_governance.admin_list_governance_unit_classes(
 p_query text default null,p_is_active boolean default null,p_limit integer default 50,p_offset integer default 0
)returns jsonb language plpgsql stable security definer set search_path=pg_catalog,qarar_governance as $$
declare o uuid:=qarar_iam.current_organization_id();
begin
 perform qarar_iam.assert_permission('governance.policies.manage',null);
 return jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(x) order by x.code)from(
  select c.*,count(u.id) council_count from qarar_governance.governance_unit_classes c
  left join qarar_core.governance_units u on u.governance_class_id=c.id and u.organization_id=c.organization_id
  where c.organization_id=o and(p_is_active is null or c.is_active=p_is_active)
   and(p_query is null or c.code ilike '%'||p_query||'%' or c.name_ar ilike '%'||p_query||'%')
  group by c.id limit least(greatest(p_limit,1),100) offset greatest(p_offset,0))x),'[]'),
  'limit',least(greatest(p_limit,1),100),'offset',greatest(p_offset,0));
end $$;

create or replace function qarar_governance.admin_create_governance_unit_class(
 p_code text,p_name_ar text,p_name_en text,p_governance_level text,p_description text default null
)returns jsonb language plpgsql security definer set search_path=pg_catalog,qarar_governance as $$
declare o uuid:=qarar_iam.current_organization_id();id uuid;
begin
 perform qarar_iam.assert_permission('governance.policies.manage',null);
 insert into qarar_governance.governance_unit_classes(organization_id,code,name_ar,name_en,governance_level,description)
 values(o,lower(btrim(p_code)),btrim(p_name_ar),p_name_en,p_governance_level,p_description)returning governance_unit_classes.id into id;
 return jsonb_build_object('id',id,'code',lower(btrim(p_code)),'is_active',true);
end $$;

create or replace function qarar_governance.admin_update_governance_unit_class(
 p_class_id uuid,p_name_ar text,p_name_en text,p_governance_level text,p_description text,p_is_active boolean,
 p_expected_updated_at timestamptz
)returns jsonb language plpgsql security definer set search_path=pg_catalog,qarar_governance as $$
declare o uuid:=qarar_iam.current_organization_id();changed timestamptz;
begin
 perform qarar_iam.assert_permission('governance.policies.manage',null);
 update qarar_governance.governance_unit_classes set name_ar=btrim(p_name_ar),name_en=p_name_en,
  governance_level=p_governance_level,description=p_description,is_active=p_is_active
 where id=p_class_id and organization_id=o and updated_at=p_expected_updated_at returning updated_at into changed;
 if changed is null then
  if exists(select 1 from qarar_governance.governance_unit_classes where id=p_class_id and organization_id=o)
  then raise exception using errcode='40001',message='تم تعديل التصنيف؛ حدّث البيانات';else raise exception using errcode='P0002',message='التصنيف غير موجود';end if;
 end if;return jsonb_build_object('id',p_class_id,'updated_at',changed,'is_active',p_is_active);
end $$;

create or replace function qarar_core.admin_assign_governance_unit_class(
 p_governance_unit_id uuid,p_class_id uuid,p_expected_updated_at timestamptz
)returns jsonb language plpgsql security definer set search_path=pg_catalog,qarar_core as $$
declare o uuid:=qarar_iam.current_organization_id();changed timestamptz;
begin
 perform qarar_iam.assert_permission('governance.policies.manage',p_governance_unit_id);
 if not exists(select 1 from qarar_governance.governance_unit_classes where id=p_class_id and organization_id=o and is_active)
 then raise exception using errcode='P0002',message='تصنيف المجلس غير موجود أو غير نشط';end if;
 update qarar_core.governance_units set governance_class_id=p_class_id where id=p_governance_unit_id
  and organization_id=o and updated_at=p_expected_updated_at returning updated_at into changed;
 if changed is null then
  if exists(select 1 from qarar_core.governance_units where id=p_governance_unit_id and organization_id=o)
  then raise exception using errcode='40001',message='تم تعديل المجلس؛ حدّث البيانات';else raise exception using errcode='P0002',message='المجلس غير موجود';end if;
 end if;return jsonb_build_object('governance_unit_id',p_governance_unit_id,'governance_class_id',p_class_id,'updated_at',changed);
end $$;

create or replace function qarar_governance.approve_custom_workflow(
 p_exception_id uuid,p_approve boolean,p_review_comment text
)returns jsonb language plpgsql security definer set search_path=pg_catalog,qarar_governance as $$
declare result jsonb;topic_id uuid;o uuid:=qarar_iam.current_organization_id();
begin
 if not exists(select 1 from qarar_governance.governance_exceptions where id=p_exception_id and organization_id=o and requested_source='custom')
 then raise exception using errcode='P0002',message='طلب المسار المخصص غير موجود';end if;
 result:=qarar_governance.approve_workflow_exception(p_exception_id,p_approve,p_review_comment);
 if p_approve then
  select topic_id into topic_id from qarar_governance.governance_exceptions where id=p_exception_id;
  update qarar_topics.topics set governance_source='custom' where id=topic_id and organization_id=o;
  update qarar_governance.topic_governance_mappings set governance_source='custom' where topic_governance_mappings.topic_id=topic_id and organization_id=o;
 end if;return result||jsonb_build_object('governance_source','custom');
end $$;

create or replace function qarar_governance.act_topic_workflow_step(
 p_topic_id uuid,p_outcome_code text,p_comment text default null
)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
begin
 if qarar_iam.current_organization_id() is null then raise exception using errcode='42501',message='يلزم حساب نشط';end if;
 raise exception using errcode='22023',message='استخدم عقد التنفيذ المتزامن مع idempotency_key وexpected_version';
end $$;
create or replace function qarar_governance.complete_topic_workflow_step(
 p_topic_id uuid,p_outcome_code text default 'approved',p_comment text default null
)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
begin
 if qarar_iam.current_organization_id() is null then raise exception using errcode='42501',message='يلزم حساب نشط';end if;
 raise exception using errcode='22023',message='استخدم act_topic_workflow_step مع idempotency_key وexpected_version';
end $$;

alter function qarar_governance.admin_list_governance_unit_classes(text,boolean,integer,integer) owner to qarar_governance_executor;
alter function qarar_governance.admin_create_governance_unit_class(text,text,text,text,text) owner to qarar_governance_executor;
alter function qarar_governance.admin_update_governance_unit_class(uuid,text,text,text,text,boolean,timestamptz) owner to qarar_governance_executor;
alter function qarar_core.admin_assign_governance_unit_class(uuid,uuid,timestamptz) owner to qarar_core_executor;
alter function qarar_governance.approve_custom_workflow(uuid,boolean,text) owner to qarar_governance_executor;
alter function qarar_governance.act_topic_workflow_step(uuid,text,text) owner to qarar_governance_executor;
alter function qarar_governance.complete_topic_workflow_step(uuid,text,text) owner to qarar_governance_executor;
revoke all on function qarar_governance.admin_list_governance_unit_classes(text,boolean,integer,integer) from public,anon,authenticated,service_role;
revoke all on function qarar_governance.admin_create_governance_unit_class(text,text,text,text,text) from public,anon,authenticated,service_role;
revoke all on function qarar_governance.admin_update_governance_unit_class(uuid,text,text,text,text,boolean,timestamptz) from public,anon,authenticated,service_role;
revoke all on function qarar_core.admin_assign_governance_unit_class(uuid,uuid,timestamptz) from public,anon,authenticated,service_role;
revoke all on function qarar_governance.approve_custom_workflow(uuid,boolean,text) from public,anon,authenticated,service_role;

insert into qarar_architecture.module_table_read_allowlist(source_module,target_schema,table_name,rationale)
values('core','qarar_governance','governance_unit_classes','Validate the tenant-owned active classification before assigning it to a council')
on conflict do nothing;
grant usage on schema qarar_governance to qarar_core_executor;
grant select on qarar_governance.governance_unit_classes to qarar_core_executor;
insert into qarar_architecture.module_function_execute_allowlist(
 source_module,target_schema,function_name,identity_arguments,rationale
)values
 ('core','qarar_iam','current_organization_id','','Bind council classification changes to the authenticated tenant'),
 ('core','qarar_iam','assert_permission','permission_code text, target_unit_id uuid','Authorize council classification changes')
on conflict do nothing;
grant execute on function qarar_iam.current_organization_id() to qarar_core_executor;
grant execute on function qarar_iam.assert_permission(text,uuid) to qarar_core_executor;

insert into qarar_architecture.function_registry(
 function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate
)
select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),
 case when n.nspname='qarar_core' then 'core' else 'governance' end,n.nspname,false
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where (n.nspname,p.proname) in(
 ('qarar_governance','admin_list_governance_unit_classes'),
 ('qarar_governance','admin_create_governance_unit_class'),
 ('qarar_governance','admin_update_governance_unit_class'),
 ('qarar_core','admin_assign_governance_unit_class'),
 ('qarar_governance','request_custom_workflow'),
 ('qarar_governance','approve_custom_workflow'),
 ('qarar_governance','act_topic_workflow_step')
) and not(n.nspname='qarar_governance' and p.proname='act_topic_workflow_step'
  and pg_get_function_identity_arguments(p.oid)<>
  'p_topic_id uuid, p_outcome_code text, p_comment text, p_idempotency_key uuid, p_expected_version integer')
on conflict(function_name,identity_arguments) do update
set function_oid=excluded.function_oid,module_code=excluded.module_code,owning_schema=excluded.owning_schema;

insert into qarar_architecture.api_contract_registry(api_version,contract_name,implementation_schema,implementation_name,identity_arguments,module_code,audience)
values
 ('v1','admin_list_governance_unit_classes','qarar_governance','admin_list_governance_unit_classes','p_query text, p_is_active boolean, p_limit integer, p_offset integer','governance','authenticated'),
 ('v1','admin_create_governance_unit_class','qarar_governance','admin_create_governance_unit_class','p_code text, p_name_ar text, p_name_en text, p_governance_level text, p_description text','governance','authenticated'),
 ('v1','admin_update_governance_unit_class','qarar_governance','admin_update_governance_unit_class','p_class_id uuid, p_name_ar text, p_name_en text, p_governance_level text, p_description text, p_is_active boolean, p_expected_updated_at timestamp with time zone','governance','authenticated'),
 ('v1','admin_assign_governance_unit_class','qarar_core','admin_assign_governance_unit_class','p_governance_unit_id uuid, p_class_id uuid, p_expected_updated_at timestamp with time zone','core','authenticated'),
 ('v1','request_custom_workflow','qarar_governance','request_custom_workflow','p_topic_id uuid, p_workflow_template_version_id uuid, p_reason text, p_valid_until timestamp with time zone','governance','authenticated'),
 ('v1','approve_custom_workflow','qarar_governance','approve_custom_workflow','p_exception_id uuid, p_approve boolean, p_review_comment text','governance','authenticated'),
 ('v1','act_topic_workflow_step','qarar_governance','act_topic_workflow_step','p_topic_id uuid, p_outcome_code text, p_comment text, p_idempotency_key uuid, p_expected_version integer','governance','authenticated')
on conflict do nothing;

do $$
declare c record;p record;args text;call_args text;sql text;
begin
 for c in select * from qarar_architecture.api_contract_registry where api_version='v1' and contract_name in(
  'admin_list_governance_unit_classes','admin_create_governance_unit_class','admin_update_governance_unit_class',
  'admin_assign_governance_unit_class','request_custom_workflow','approve_custom_workflow','act_topic_workflow_step')
 loop
  select x.oid,pg_get_function_arguments(x.oid) args,pg_get_function_result(x.oid) result into p
  from pg_proc x join pg_namespace n on n.oid=x.pronamespace
  where n.nspname=c.implementation_schema and x.proname=c.implementation_name
   and pg_get_function_identity_arguments(x.oid)=c.identity_arguments;
  select string_agg('p_'||i,',' order by i) into call_args from generate_series(1,array_length(string_to_array(c.identity_arguments,','),1))i;
  args:=p.args;
  select string_agg(split_part(btrim(a),' ',1),',' order by ord) into call_args
   from unnest(string_to_array(c.identity_arguments,','))with ordinality z(a,ord);
  sql:=format('create or replace function api_v1.%I(%s) returns %s language sql volatile security definer set search_path=pg_catalog as $f$ select %I.%I(%s) $f$',
    c.contract_name,args,p.result,c.implementation_schema,c.implementation_name,call_args);
  execute sql;
  execute format('alter function api_v1.%I(%s) owner to qarar_api_executor',c.contract_name,c.identity_arguments);
  execute format('revoke all on function api_v1.%I(%s) from public,anon,service_role',c.contract_name,c.identity_arguments);
  execute format('grant execute on function api_v1.%I(%s) to authenticated',c.contract_name,c.identity_arguments);
  execute format('grant usage on schema %I to qarar_api_executor',c.implementation_schema);
  execute format('grant execute on function %I.%I(%s) to qarar_api_executor',c.implementation_schema,c.implementation_name,c.identity_arguments);
 end loop;
end $$;

commit;
