-- Rebuild the eleven API contracts consumed by the administration dashboard but
-- missing from the migration ledger.  The implementation layer remains private;
-- api_v1 is the only client surface.

create or replace function qarar_core.admin_list_governance_unit_types(
  p_query text default null, p_active_only boolean default true
) returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, qarar_core as $$
declare v_org uuid := qarar_iam.current_organization_id();
begin
  perform qarar_iam.assert_permission('governance.units.read', null);
  return jsonb_build_object('items', coalesce((
    select jsonb_agg(to_jsonb(t) order by t.name_ar, t.code)
    from qarar_core.governance_unit_types t
    where t.organization_id = v_org
      and (not coalesce(p_active_only, true) or t.is_active)
      and (nullif(btrim(p_query), '') is null or
           t.code ilike '%' || btrim(p_query) || '%' or
           t.name_ar ilike '%' || btrim(p_query) || '%' or
           coalesce(t.name_en, '') ilike '%' || btrim(p_query) || '%')
  ), '[]'::jsonb));
end $$;

create or replace function qarar_core.admin_list_governance_units(
  p_query text default null, p_status text default null,
  p_unit_type_id uuid default null, p_governance_class_id uuid default null,
  p_parent_unit_id uuid default null, p_limit integer default 50,
  p_offset integer default 0
) returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, qarar_core as $$
declare v_org uuid := qarar_iam.current_organization_id(); v_limit int := least(greatest(coalesce(p_limit,50),1),200); v_offset int := greatest(coalesce(p_offset,0),0);
begin
  perform qarar_iam.assert_permission('governance.units.read', null);
  if p_status is not null and p_status not in ('active','inactive','archived') then raise exception using errcode='22023',message='حالة الوحدة غير صالحة'; end if;
  return jsonb_build_object(
    'items', coalesce((select jsonb_agg(to_jsonb(x) order by x.name_ar, x.code) from (
      select u.id,u.code,u.name_ar,u.name_en,u.unit_type_id,u.parent_unit_id,
             u.governance_class_id,u.level_no,u.status,u.updated_at,
             t.name_ar as unit_type_name_ar,p.name_ar as parent_name_ar
      from qarar_core.governance_units u
      join qarar_core.governance_unit_types t on t.id=u.unit_type_id and t.organization_id=u.organization_id
      left join qarar_core.governance_units p on p.id=u.parent_unit_id and p.organization_id=u.organization_id
      where u.organization_id=v_org and (p_status is null or u.status=p_status)
        and (p_unit_type_id is null or u.unit_type_id=p_unit_type_id)
        and (p_governance_class_id is null or u.governance_class_id=p_governance_class_id)
        and (p_parent_unit_id is null or u.parent_unit_id=p_parent_unit_id)
        and (nullif(btrim(p_query),'') is null or u.code ilike '%'||btrim(p_query)||'%' or u.name_ar ilike '%'||btrim(p_query)||'%' or coalesce(u.name_en,'') ilike '%'||btrim(p_query)||'%')
      order by u.name_ar,u.code limit v_limit offset v_offset
    ) x),'[]'::jsonb),
    'total',(select count(*) from qarar_core.governance_units u where u.organization_id=v_org
      and (p_status is null or u.status=p_status) and (p_unit_type_id is null or u.unit_type_id=p_unit_type_id)
      and (p_governance_class_id is null or u.governance_class_id=p_governance_class_id)
      and (p_parent_unit_id is null or u.parent_unit_id=p_parent_unit_id)
      and (nullif(btrim(p_query),'') is null or u.code ilike '%'||btrim(p_query)||'%' or u.name_ar ilike '%'||btrim(p_query)||'%' or coalesce(u.name_en,'') ilike '%'||btrim(p_query)||'%')),
    'limit',v_limit,'offset',v_offset);
end $$;

create or replace function qarar_core.admin_create_governance_unit(
  p_code text,p_name_ar text,p_name_en text,p_unit_type_id uuid,
  p_parent_unit_id uuid,p_governance_class_id uuid,p_level_no integer
) returns jsonb language plpgsql security definer set search_path=pg_catalog,qarar_core as $$
declare v_org uuid:=qarar_iam.current_organization_id(); v_id uuid;
begin
  perform qarar_iam.assert_permission('governance.units.manage',null);
  if btrim(coalesce(p_code,'')) !~ '^[a-z][a-z0-9_.-]{1,63}$' or char_length(btrim(coalesce(p_name_ar,''))) not between 2 and 300 or coalesce(p_level_no,0)<1 then raise exception using errcode='22023',message='بيانات الوحدة غير صالحة';end if;
  if not exists(select 1 from qarar_core.governance_unit_types where id=p_unit_type_id and organization_id=v_org and is_active and not coalesce(is_council_type,false)) then raise exception using errcode='23503',message='نوع الوحدة غير صالح لهذا المسار';end if;
  if p_parent_unit_id is not null and not exists(select 1 from qarar_core.governance_units where id=p_parent_unit_id and organization_id=v_org) then raise exception using errcode='23503',message='الوحدة الأم غير موجودة';end if;
  insert into qarar_core.governance_units(organization_id,code,name_ar,name_en,unit_type_id,parent_unit_id,governance_class_id,level_no)
  values(v_org,lower(btrim(p_code)),btrim(p_name_ar),nullif(btrim(p_name_en),''),p_unit_type_id,p_parent_unit_id,p_governance_class_id,p_level_no) returning id into v_id;
  perform qarar_audit.append_audit_log(v_org,'governance.unit.create','governance_units',v_id,jsonb_build_object('code',lower(btrim(p_code))));
  return (select to_jsonb(u) from qarar_core.governance_units u where u.id=v_id);
end $$;

create or replace function qarar_core.admin_update_governance_unit(
  p_governance_unit_id uuid,p_name_ar text,p_name_en text,p_unit_type_id uuid,
  p_parent_unit_id uuid,p_governance_class_id uuid,p_level_no integer,
  p_status text,p_expected_updated_at timestamptz
) returns jsonb language plpgsql security definer set search_path=pg_catalog,qarar_core as $$
declare v_org uuid:=qarar_iam.current_organization_id(); v_row qarar_core.governance_units%rowtype;
begin
  perform qarar_iam.assert_permission('governance.units.manage',null);
  if char_length(btrim(coalesce(p_name_ar,''))) not between 2 and 300 or coalesce(p_level_no,0)<1 or p_status not in('active','inactive','archived') or p_expected_updated_at is null then raise exception using errcode='22023',message='بيانات تحديث الوحدة غير صالحة';end if;
  if not exists(select 1 from qarar_core.governance_unit_types where id=p_unit_type_id and organization_id=v_org and not coalesce(is_council_type,false)) then raise exception using errcode='23503',message='نوع الوحدة غير صالح لهذا المسار';end if;
  if p_parent_unit_id=p_governance_unit_id then raise exception using errcode='23514',message='لا يمكن أن تكون الوحدة أصلًا لنفسها';end if;
  if p_parent_unit_id is not null and (not exists(select 1 from qarar_core.governance_units where id=p_parent_unit_id and organization_id=v_org) or exists(with recursive d as (select id from qarar_core.governance_units where parent_unit_id=p_governance_unit_id and organization_id=v_org union all select u.id from qarar_core.governance_units u join d on u.parent_unit_id=d.id where u.organization_id=v_org) select 1 from d where id=p_parent_unit_id)) then raise exception using errcode='23514',message='الوحدة الأم ستنشئ دورة هرمية';end if;
  update qarar_core.governance_units set name_ar=btrim(p_name_ar),name_en=nullif(btrim(p_name_en),''),unit_type_id=p_unit_type_id,parent_unit_id=p_parent_unit_id,governance_class_id=p_governance_class_id,level_no=p_level_no,status=p_status
  where id=p_governance_unit_id and organization_id=v_org and updated_at=p_expected_updated_at returning * into v_row;
  if v_row.id is null then raise exception using errcode='40001',message='تم تعديل الوحدة؛ حدّث البيانات وحاول مجددًا';end if;
  perform qarar_audit.append_audit_log(v_org,'governance.unit.update','governance_units',v_row.id,jsonb_build_object('status',v_row.status)); return to_jsonb(v_row);
end $$;

create or replace function qarar_topics.admin_list_topic_categories(p_query text default null,p_is_active boolean default null,p_limit integer default 50,p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,qarar_topics as $$
declare v_org uuid:=qarar_iam.current_organization_id(); l int:=least(greatest(coalesce(p_limit,50),1),200); o int:=greatest(coalesce(p_offset,0),0);
begin perform qarar_iam.assert_permission('governance.policies.read',null);
 return jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(x) order by x.name_ar,x.code) from (select * from qarar_topics.topic_categories c where c.organization_id=v_org and (p_is_active is null or c.is_active=p_is_active) and (nullif(btrim(p_query),'') is null or c.code ilike '%'||btrim(p_query)||'%' or c.name_ar ilike '%'||btrim(p_query)||'%' or coalesce(c.name_en,'') ilike '%'||btrim(p_query)||'%') order by c.name_ar,c.code limit l offset o)x),'[]'::jsonb),'total',(select count(*) from qarar_topics.topic_categories c where c.organization_id=v_org and (p_is_active is null or c.is_active=p_is_active) and (nullif(btrim(p_query),'') is null or c.code ilike '%'||btrim(p_query)||'%' or c.name_ar ilike '%'||btrim(p_query)||'%' or coalesce(c.name_en,'') ilike '%'||btrim(p_query)||'%')),'limit',l,'offset',o); end $$;

create or replace function qarar_topics.admin_create_topic_category(p_code text,p_name_ar text,p_name_en text,p_description text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,qarar_topics as $$ declare v_org uuid:=qarar_iam.current_organization_id();r qarar_topics.topic_categories%rowtype;
begin perform qarar_iam.assert_permission('governance.policies.manage',null); if btrim(coalesce(p_code,''))!~'^[a-z][a-z0-9_.-]{1,63}$' or char_length(btrim(coalesce(p_name_ar,''))) not between 2 and 300 then raise exception using errcode='22023',message='بيانات التصنيف غير صالحة';end if; insert into qarar_topics.topic_categories(organization_id,code,name_ar,name_en,description) values(v_org,lower(btrim(p_code)),btrim(p_name_ar),nullif(btrim(p_name_en),''),nullif(btrim(p_description),'')) returning * into r; perform qarar_audit.append_audit_log(v_org,'topic.category.create','topic_categories',r.id,jsonb_build_object('code',r.code));return to_jsonb(r);end $$;

create or replace function qarar_topics.admin_update_topic_category(p_category_id uuid,p_name_ar text,p_name_en text,p_description text,p_is_active boolean,p_expected_updated_at timestamptz)
returns jsonb language plpgsql security definer set search_path=pg_catalog,qarar_topics as $$ declare v_org uuid:=qarar_iam.current_organization_id();r qarar_topics.topic_categories%rowtype;
begin perform qarar_iam.assert_permission('governance.policies.manage',null);if char_length(btrim(coalesce(p_name_ar,''))) not between 2 and 300 or p_is_active is null or p_expected_updated_at is null then raise exception using errcode='22023',message='بيانات تحديث التصنيف غير صالحة';end if;update qarar_topics.topic_categories set name_ar=btrim(p_name_ar),name_en=nullif(btrim(p_name_en),''),description=nullif(btrim(p_description),''),is_active=p_is_active where id=p_category_id and organization_id=v_org and updated_at=p_expected_updated_at returning * into r;if r.id is null then raise exception using errcode='40001',message='تم تعديل التصنيف؛ حدّث البيانات';end if;perform qarar_audit.append_audit_log(v_org,'topic.category.update','topic_categories',r.id,jsonb_build_object('is_active',r.is_active));return to_jsonb(r);end $$;

create or replace function qarar_governance.admin_list_governance_exceptions(p_status text default null,p_limit integer default 50,p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,qarar_governance as $$ declare v_org uuid:=qarar_iam.current_organization_id();l int:=least(greatest(coalesce(p_limit,50),1),200);o int:=greatest(coalesce(p_offset,0),0);
begin perform qarar_iam.assert_permission('governance.exceptions.approve',null);if p_status is not null and p_status not in('pending','approved','rejected','expired','revoked') then raise exception using errcode='22023',message='حالة الاستثناء غير صالحة';end if;return jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(x) order by x.requested_at desc) from (select e.*,t.title_ar as topic_title_ar from qarar_governance.governance_exceptions e join qarar_topics.topics t on t.id=e.topic_id and t.organization_id=e.organization_id where e.organization_id=v_org and(p_status is null or e.status=p_status) order by e.requested_at desc limit l offset o)x),'[]'::jsonb),'total',(select count(*) from qarar_governance.governance_exceptions e where e.organization_id=v_org and(p_status is null or e.status=p_status)),'limit',l,'offset',o);end $$;

create or replace function qarar_governance.admin_list_workflow_templates()
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,qarar_governance as $$ declare v_org uuid:=qarar_iam.current_organization_id();
begin perform qarar_iam.assert_permission('governance.workflows.manage',null);return jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'code',t.code,'name_ar',t.name_ar,'name_en',t.name_en,'description',t.description,'status',t.status,'versions',coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'version_no',v.version_no,'status',v.status,'validation_status',v.validation_status,'updated_at',v.updated_at) order by v.version_no desc) from qarar_governance.workflow_template_versions v where v.workflow_template_id=t.id and v.organization_id=v_org),'[]'::jsonb)) order by t.name_ar,t.code) from qarar_governance.workflow_templates t where t.organization_id=v_org),'[]'::jsonb));end $$;

create or replace function qarar_governance.create_topic_exception_request(p_title_ar text,p_description text,p_category_id uuid,p_current_unit_id uuid,p_workflow_template_version_id uuid,p_reason text,p_valid_until timestamptz,p_priority text default 'medium',p_source_type text default 'new',p_title_en text default null,p_client_request_id uuid default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,qarar_governance as $$ declare t jsonb;e jsonb;
begin if qarar_iam.current_organization_id() is null or auth.uid() is null then raise exception using errcode='42501',message='يلزم حساب نشط';end if;t:=qarar_topics.create_topic_with_workflow(p_title_ar,p_description,p_category_id,p_current_unit_id,p_priority,p_source_type,p_title_en,p_client_request_id);if coalesce(t->>'routing_status','')<>'routing_exception_pending' then raise exception using errcode='55000',message='الموضوع لا يتطلب مسار استثناء؛ لم يتم حفظ الطلب';end if;e:=qarar_governance.request_custom_workflow((t->>'id')::uuid,p_workflow_template_version_id,p_reason,p_valid_until);return t||jsonb_build_object('exception',e);end $$;

create or replace function qarar_governance.get_topic_governance_summary(p_topic_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,qarar_governance as $$ declare v_org uuid:=qarar_iam.current_organization_id();t qarar_topics.topics%rowtype;
begin select * into t from qarar_topics.topics where id=p_topic_id and organization_id=v_org;if t.id is null then raise exception using errcode='P0002',message='الموضوع غير موجود';end if;if t.submitted_by_user_id<>auth.uid() and not qarar_iam.has_permission('topics.read',t.current_unit_id) and not qarar_iam.has_permission('topics.review',t.current_unit_id) then raise exception using errcode='42501',message='غير مصرح بقراءة حوكمة الموضوع';end if;return jsonb_build_object('topic_id',t.id,'governance_source',t.governance_source,'routing_status',t.routing_status,'policy_id',t.policy_id,'policy_version_id',t.policy_version_id,'policy_item_id',t.policy_item_id,'workflow_template_version_id',(select workflow_template_version_id from qarar_governance.workflow_instances where topic_id=t.id and organization_id=v_org order by started_at desc limit 1),'exception',(select to_jsonb(e) from qarar_governance.governance_exceptions e where e.topic_id=t.id and e.organization_id=v_org order by e.requested_at desc limit 1));end $$;

-- Implementation ownership and default deny.
alter function qarar_core.admin_list_governance_unit_types(text,boolean) owner to qarar_core_executor;
alter function qarar_core.admin_list_governance_units(text,text,uuid,uuid,uuid,integer,integer) owner to qarar_core_executor;
alter function qarar_core.admin_create_governance_unit(text,text,text,uuid,uuid,uuid,integer) owner to qarar_core_executor;
alter function qarar_core.admin_update_governance_unit(uuid,text,text,uuid,uuid,uuid,integer,text,timestamptz) owner to qarar_core_executor;
alter function qarar_topics.admin_list_topic_categories(text,boolean,integer,integer) owner to qarar_topics_executor;
alter function qarar_topics.admin_create_topic_category(text,text,text,text) owner to qarar_topics_executor;
alter function qarar_topics.admin_update_topic_category(uuid,text,text,text,boolean,timestamptz) owner to qarar_topics_executor;
alter function qarar_governance.admin_list_governance_exceptions(text,integer,integer) owner to qarar_governance_executor;
alter function qarar_governance.admin_list_workflow_templates() owner to qarar_governance_executor;
alter function qarar_governance.create_topic_exception_request(text,text,uuid,uuid,uuid,text,timestamptz,text,text,text,uuid) owner to qarar_governance_executor;
alter function qarar_governance.get_topic_governance_summary(uuid) owner to qarar_governance_executor;

do $$ declare r record;begin for r in select n.nspname,p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where (n.nspname,p.proname) in (('qarar_core','admin_list_governance_unit_types'),('qarar_core','admin_list_governance_units'),('qarar_core','admin_create_governance_unit'),('qarar_core','admin_update_governance_unit'),('qarar_topics','admin_list_topic_categories'),('qarar_topics','admin_create_topic_category'),('qarar_topics','admin_update_topic_category'),('qarar_governance','admin_list_governance_exceptions'),('qarar_governance','admin_list_workflow_templates'),('qarar_governance','create_topic_exception_request'),('qarar_governance','get_topic_governance_summary')) loop execute format('revoke all on function %s from public,anon,authenticated,service_role',r.sig);execute format('grant execute on function %s to qarar_api_executor',r.sig);end loop;end $$;

insert into qarar_architecture.module_function_execute_allowlist(source_module,target_schema,function_name,identity_arguments,rationale)
values('governance','qarar_topics','create_topic_with_workflow','p_title_ar text, p_description text, p_category_id uuid, p_current_unit_id uuid, p_priority text, p_source_type text, p_title_en text, p_client_request_id uuid','Atomic governed exception creation must create the topic through the topics module before requesting its custom route.')
on conflict do nothing;
grant execute on function qarar_topics.create_topic_with_workflow(text,text,uuid,uuid,text,text,text,uuid) to qarar_governance_executor;
grant usage on schema qarar_topics to qarar_governance_executor;

insert into qarar_architecture.function_registry(function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate)
select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),case n.nspname when 'qarar_core' then 'core' when 'qarar_topics' then 'topics' else 'governance' end,n.nspname,false from pg_proc p join pg_namespace n on n.oid=p.pronamespace where (n.nspname,p.proname) in (('qarar_core','admin_list_governance_unit_types'),('qarar_core','admin_list_governance_units'),('qarar_core','admin_create_governance_unit'),('qarar_core','admin_update_governance_unit'),('qarar_topics','admin_list_topic_categories'),('qarar_topics','admin_create_topic_category'),('qarar_topics','admin_update_topic_category'),('qarar_governance','admin_list_governance_exceptions'),('qarar_governance','admin_list_workflow_templates'),('qarar_governance','create_topic_exception_request'),('qarar_governance','get_topic_governance_summary'))
on conflict(function_oid) do update set function_name=excluded.function_name,identity_arguments=excluded.identity_arguments,module_code=excluded.module_code,owning_schema=excluded.owning_schema,is_rls_predicate=false;

-- Facades keep the exact signatures consumed by PostgREST and the dashboard.
create or replace function api_v1.admin_list_governance_unit_types(p_query text default null,p_active_only boolean default true)returns jsonb language sql stable security definer set search_path=pg_catalog as $$select qarar_core.admin_list_governance_unit_types($1,$2)$$;
create or replace function api_v1.admin_list_governance_units(p_query text default null,p_status text default null,p_unit_type_id uuid default null,p_governance_class_id uuid default null,p_parent_unit_id uuid default null,p_limit integer default 50,p_offset integer default 0)returns jsonb language sql stable security definer set search_path=pg_catalog as $$select qarar_core.admin_list_governance_units($1,$2,$3,$4,$5,$6,$7)$$;
create or replace function api_v1.admin_create_governance_unit(p_code text,p_name_ar text,p_name_en text,p_unit_type_id uuid,p_parent_unit_id uuid,p_governance_class_id uuid,p_level_no integer)returns jsonb language sql volatile security definer set search_path=pg_catalog as $$select qarar_core.admin_create_governance_unit($1,$2,$3,$4,$5,$6,$7)$$;
create or replace function api_v1.admin_update_governance_unit(p_governance_unit_id uuid,p_name_ar text,p_name_en text,p_unit_type_id uuid,p_parent_unit_id uuid,p_governance_class_id uuid,p_level_no integer,p_status text,p_expected_updated_at timestamptz)returns jsonb language sql volatile security definer set search_path=pg_catalog as $$select qarar_core.admin_update_governance_unit($1,$2,$3,$4,$5,$6,$7,$8,$9)$$;
create or replace function api_v1.admin_list_topic_categories(p_query text default null,p_is_active boolean default null,p_limit integer default 50,p_offset integer default 0)returns jsonb language sql stable security definer set search_path=pg_catalog as $$select qarar_topics.admin_list_topic_categories($1,$2,$3,$4)$$;
create or replace function api_v1.admin_create_topic_category(p_code text,p_name_ar text,p_name_en text,p_description text)returns jsonb language sql volatile security definer set search_path=pg_catalog as $$select qarar_topics.admin_create_topic_category($1,$2,$3,$4)$$;
create or replace function api_v1.admin_update_topic_category(p_category_id uuid,p_name_ar text,p_name_en text,p_description text,p_is_active boolean,p_expected_updated_at timestamptz)returns jsonb language sql volatile security definer set search_path=pg_catalog as $$select qarar_topics.admin_update_topic_category($1,$2,$3,$4,$5,$6)$$;
create or replace function api_v1.admin_list_governance_exceptions(p_status text default null,p_limit integer default 50,p_offset integer default 0)returns jsonb language sql stable security definer set search_path=pg_catalog as $$select qarar_governance.admin_list_governance_exceptions($1,$2,$3)$$;
create or replace function api_v1.admin_list_workflow_templates()returns jsonb language sql stable security definer set search_path=pg_catalog as $$select qarar_governance.admin_list_workflow_templates()$$;
create or replace function api_v1.create_topic_exception_request(p_title_ar text,p_description text,p_category_id uuid,p_current_unit_id uuid,p_workflow_template_version_id uuid,p_reason text,p_valid_until timestamptz,p_priority text default 'medium',p_source_type text default 'new',p_title_en text default null,p_client_request_id uuid default null)returns jsonb language sql volatile security definer set search_path=pg_catalog as $$select qarar_governance.create_topic_exception_request($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)$$;
create or replace function api_v1.get_topic_governance_summary(p_topic_id uuid)returns jsonb language sql stable security definer set search_path=pg_catalog as $$select qarar_governance.get_topic_governance_summary($1)$$;

do $$ declare r record;begin for r in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='api_v1' and p.proname=any(array['admin_create_governance_unit','admin_list_governance_unit_types','admin_list_governance_units','admin_update_governance_unit','admin_list_governance_exceptions','admin_list_workflow_templates','create_topic_exception_request','get_topic_governance_summary','admin_create_topic_category','admin_list_topic_categories','admin_update_topic_category']) loop execute format('alter function %s owner to qarar_api_executor',r.sig);execute format('revoke all on function %s from public,anon,authenticated,service_role',r.sig);execute format('grant execute on function %s to authenticated,service_role',r.sig);end loop;end $$;

insert into qarar_architecture.api_contract_registry(api_version,contract_name,implementation_schema,implementation_name,identity_arguments,module_code,audience)
select 'v1',p.proname,case when p.proname like '%topic_categor%' then 'qarar_topics' when p.proname in('admin_create_governance_unit','admin_list_governance_unit_types','admin_list_governance_units','admin_update_governance_unit') then 'qarar_core' else 'qarar_governance' end,p.proname,pg_get_function_identity_arguments(p.oid),case when p.proname like '%topic_categor%' then 'topics' when p.proname in('admin_create_governance_unit','admin_list_governance_unit_types','admin_list_governance_units','admin_update_governance_unit') then 'core' else 'governance' end,'authenticated'
from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='api_v1' and p.proname=any(array['admin_create_governance_unit','admin_list_governance_unit_types','admin_list_governance_units','admin_update_governance_unit','admin_list_governance_exceptions','admin_list_workflow_templates','create_topic_exception_request','get_topic_governance_summary','admin_create_topic_category','admin_list_topic_categories','admin_update_topic_category'])
on conflict(api_version,contract_name,identity_arguments) do update set implementation_schema=excluded.implementation_schema,implementation_name=excluded.implementation_name,module_code=excluded.module_code,audience=excluded.audience,deprecated_at=null,replacement_contract=null;

update qarar_architecture.api_release_registry set contract_count=(select count(*) from qarar_architecture.api_contract_registry where api_version='v1'),contract_hash=(select md5(string_agg(p.proname||'|'||pg_get_function_identity_arguments(p.oid)||'|'||pg_get_function_result(p.oid)||'|'||r.audience,E'\n' order by p.proname,pg_get_function_identity_arguments(p.oid))) from pg_proc p join pg_namespace n on n.oid=p.pronamespace and n.nspname='api_v1' join qarar_architecture.api_contract_registry r on r.api_version='v1' and r.contract_name=p.proname and r.identity_arguments=pg_get_function_identity_arguments(p.oid)),released_at='2026-08-16 10:00:00+00',notes='Restored eleven tenant-safe governance administration contracts required for deterministic fresh deployment.' where api_version='v1';

do $$begin if (select count(*) from qarar_architecture.api_contract_registry where api_version='v1' and contract_name=any(array['admin_create_governance_unit','admin_list_governance_unit_types','admin_list_governance_units','admin_update_governance_unit','admin_list_governance_exceptions','admin_list_workflow_templates','create_topic_exception_request','get_topic_governance_summary','admin_create_topic_category','admin_list_topic_categories','admin_update_topic_category']))<>11 then raise exception 'missing governance contract restoration failed';end if;if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='api_v1' and p.proname=any(array['admin_create_governance_unit','admin_list_governance_unit_types','admin_list_governance_units','admin_update_governance_unit','admin_list_governance_exceptions','admin_list_workflow_templates','create_topic_exception_request','get_topic_governance_summary','admin_create_topic_category','admin_list_topic_categories','admin_update_topic_category']) and (pg_get_userbyid(p.proowner)<>'qarar_api_executor' or has_function_privilege('anon',p.oid,'execute') or not has_function_privilege('authenticated',p.oid,'execute'))) then raise exception 'governance facade ownership or ACL invariant failed';end if;end $$;

notify pgrst,'reload schema';
