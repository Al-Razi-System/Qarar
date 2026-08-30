begin;

alter table qarar_core.governance_units
  add column if not exists created_by_user_id uuid,
  add column if not exists client_request_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'governance_units_creator_tenant_fk'
  ) then
    alter table qarar_core.governance_units
      add constraint governance_units_creator_tenant_fk
        foreign key (created_by_user_id, organization_id)
        references qarar_iam.users(id, organization_id) on delete restrict;
  end if;
end $$;

create unique index if not exists governance_units_creation_idempotency_uidx
  on qarar_core.governance_units(
    organization_id, created_by_user_id, client_request_id
  )
  where client_request_id is not null;

create or replace function qarar_core.get_council_form_options()
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,qarar_core
as $$
declare o uuid:=qarar_iam.current_organization_id();
begin
 perform qarar_iam.assert_permission('governance.units.read',null);
 return jsonb_build_object(
  'council_types',coalesce((select jsonb_agg(jsonb_build_object(
    'id',id,'code',code,'name_ar',name_ar,'name_en',name_en) order by code)
   from qarar_core.governance_unit_types
   where organization_id=o and is_council_type and is_active),'[]'::jsonb),
  'parent_units',coalesce((select jsonb_agg(jsonb_build_object(
    'id',u.id,'code',u.code,'name_ar',u.name_ar,'name_en',u.name_en) order by u.code)
   from qarar_core.governance_units u
   where u.organization_id=o and u.status<>'archived'),'[]'::jsonb),
  'governance_classes',coalesce((select jsonb_agg(jsonb_build_object(
    'id',id,'code',code,'name_ar',name_ar,'name_en',name_en) order by code)
   from qarar_governance.governance_unit_classes
   where organization_id=o and is_active),'[]'::jsonb),
  'leadership_roles',jsonb_build_array('council_chair','council_rapporteur')
 );
end $$;

create or replace function qarar_core.admin_search_councils(
 p_query text default null,p_status text default null,p_unit_type_id uuid default null,
 p_governance_class_id uuid default null,p_parent_unit_id uuid default null,
 p_limit integer default 50,p_offset integer default 0
)returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,qarar_core as $$
declare o uuid:=qarar_iam.current_organization_id();
 l integer:=least(greatest(coalesce(p_limit,50),1),100);
 f integer:=greatest(coalesce(p_offset,0),0);
begin
 perform qarar_iam.assert_permission('governance.units.read',null);
 return jsonb_build_object(
 'items',coalesce((select jsonb_agg(to_jsonb(x) order by x.name_ar,x.id) from(
  select u.id,u.code,u.name_ar,u.name_en,u.description,u.status,u.level_no,
   u.parent_unit_id,u.unit_type_id,u.governance_class_id,
   u.minimum_active_members,u.allow_dual_leadership,u.created_at,u.updated_at,
   t.code unit_type_code,t.name_ar unit_type_name_ar,
   c.code governance_class_code,c.name_ar governance_class_name_ar
  from qarar_core.governance_units u
  join qarar_core.governance_unit_types t
   on t.id=u.unit_type_id and t.organization_id=u.organization_id and t.is_council_type
  left join qarar_governance.governance_unit_classes c
   on c.id=u.governance_class_id and c.organization_id=u.organization_id
  where u.organization_id=o and(p_status is null or u.status=p_status)
   and(p_unit_type_id is null or u.unit_type_id=p_unit_type_id)
   and(p_governance_class_id is null or u.governance_class_id=p_governance_class_id)
   and(p_parent_unit_id is null or u.parent_unit_id=p_parent_unit_id)
   and(nullif(btrim(p_query),'') is null or u.code ilike '%'||btrim(p_query)||'%'
    or u.name_ar ilike '%'||btrim(p_query)||'%' or coalesce(u.name_en,'') ilike '%'||btrim(p_query)||'%')
  order by u.name_ar,u.id limit l offset f)x),'[]'::jsonb),
 'total',(select count(*)::integer from qarar_core.governance_units u
  join qarar_core.governance_unit_types t on t.id=u.unit_type_id and t.organization_id=u.organization_id and t.is_council_type
  where u.organization_id=o and(p_status is null or u.status=p_status)
   and(p_unit_type_id is null or u.unit_type_id=p_unit_type_id)
   and(p_governance_class_id is null or u.governance_class_id=p_governance_class_id)
   and(p_parent_unit_id is null or u.parent_unit_id=p_parent_unit_id)
   and(nullif(btrim(p_query),'') is null or u.code ilike '%'||btrim(p_query)||'%'
    or u.name_ar ilike '%'||btrim(p_query)||'%' or coalesce(u.name_en,'') ilike '%'||btrim(p_query)||'%')),
 'limit',l,'offset',f);
end $$;

create or replace function qarar_core.admin_get_council_detail(p_council_id uuid)
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,qarar_core as $$
declare o uuid:=qarar_iam.current_organization_id();r jsonb;
begin
 perform qarar_iam.assert_permission('governance.units.read',p_council_id);
 select to_jsonb(u)||jsonb_build_object(
  'unit_type',jsonb_build_object('id',t.id,'code',t.code,'name_ar',t.name_ar,'name_en',t.name_en),
  'parent_unit',case when p.id is null then null else jsonb_build_object('id',p.id,'code',p.code,'name_ar',p.name_ar)end,
  'governance_class',case when c.id is null then null else jsonb_build_object('id',c.id,'code',c.code,'name_ar',c.name_ar)end)
 into r from qarar_core.governance_units u
 join qarar_core.governance_unit_types t on t.id=u.unit_type_id and t.organization_id=u.organization_id and t.is_council_type
 left join qarar_core.governance_units p on p.id=u.parent_unit_id and p.organization_id=u.organization_id
 left join qarar_governance.governance_unit_classes c on c.id=u.governance_class_id and c.organization_id=u.organization_id
 where u.id=p_council_id and u.organization_id=o;
 if r is null then raise exception using errcode='P0002',message='المجلس غير موجود';end if;
 return r;
end $$;

create or replace function qarar_core.admin_create_council(
 p_code text,p_name_ar text,p_name_en text,p_description text,p_unit_type_id uuid,
 p_parent_unit_id uuid,p_governance_class_id uuid,p_minimum_active_members integer,
 p_allow_dual_leadership boolean,p_client_request_id uuid
)returns jsonb language plpgsql security definer
set search_path=pg_catalog,qarar_core as $$
declare o uuid:=qarar_iam.current_organization_id();
 a uuid:=nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
 v_id uuid;changed timestamptz;lvl integer:=1;existing qarar_core.governance_units;
begin
 perform qarar_iam.assert_permission('governance.units.manage',null);
 if p_code is null or btrim(p_code) !~ '^[a-z][a-z0-9_]*$'
  or nullif(btrim(p_name_ar),'') is null or p_client_request_id is null
 then raise exception using errcode='22023',message='الرمز والاسم العربي ومفتاح التكرار مطلوبة';end if;
 if coalesce(p_minimum_active_members,0)<1 then raise exception using errcode='22023',message='الحد الأدنى للأعضاء يجب أن يكون واحدًا فأكثر';end if;
 perform pg_advisory_xact_lock(hashtextextended(o::text||':'||a::text||':'||p_client_request_id::text,0));
 select * into existing from qarar_core.governance_units
 where organization_id=o and created_by_user_id=a and client_request_id=p_client_request_id;
 if found then return jsonb_build_object('id',existing.id,'code',existing.code,'status',existing.status,
   'updated_at',existing.updated_at,'idempotent_replay',true);end if;
 if not exists(select 1 from qarar_core.governance_unit_types where id=p_unit_type_id and organization_id=o and is_council_type and is_active)
 then raise exception using errcode='23503',message='نوع المجلس غير موجود أو غير نشط';end if;
 if p_governance_class_id is not null and not exists(select 1 from qarar_governance.governance_unit_classes
   where id=p_governance_class_id and organization_id=o and is_active)
 then raise exception using errcode='23503',message='تصنيف المجلس غير موجود أو غير نشط';end if;
 if p_parent_unit_id is not null then
  select level_no+1 into lvl from qarar_core.governance_units
   where id=p_parent_unit_id and organization_id=o and status<>'archived';
  if lvl is null then raise exception using errcode='23503',message='المجلس الأب غير موجود أو مؤرشف';end if;
 end if;
 insert into qarar_core.governance_units(
  organization_id,parent_unit_id,unit_type_id,code,name_ar,name_en,description,
  level_no,status,governance_class_id,minimum_active_members,allow_dual_leadership,
  created_by_user_id,client_request_id,status_reason
 )values(o,p_parent_unit_id,p_unit_type_id,lower(btrim(p_code)),btrim(p_name_ar),
  nullif(btrim(p_name_en),''),nullif(btrim(p_description),''),lvl,'inactive',
  p_governance_class_id,p_minimum_active_members,coalesce(p_allow_dual_leadership,false),
  a,p_client_request_id,'created')
 returning governance_units.id,updated_at into v_id,changed;
 perform qarar_audit.append_audit_log(o,'council.created','governance_unit',v_id,
  jsonb_build_object('code',lower(btrim(p_code)),'client_request_id',p_client_request_id));
 return jsonb_build_object('id',v_id,'code',lower(btrim(p_code)),'status','inactive',
  'updated_at',changed,'idempotent_replay',false);
exception when unique_violation then raise exception using errcode='23505',message='رمز المجلس مستخدم داخل المؤسسة';
end $$;

create or replace function qarar_core.admin_update_council(
 p_council_id uuid,p_name_ar text,p_name_en text,p_description text,p_unit_type_id uuid,
 p_governance_class_id uuid,p_minimum_active_members integer,p_allow_dual_leadership boolean,
 p_expected_updated_at timestamptz
)returns jsonb language plpgsql security definer
set search_path=pg_catalog,qarar_core as $$
declare o uuid:=qarar_iam.current_organization_id();changed timestamptz;old_class uuid;
begin
 perform qarar_iam.assert_permission('governance.units.manage',p_council_id);
 if nullif(btrim(p_name_ar),'') is null or coalesce(p_minimum_active_members,0)<1
 then raise exception using errcode='22023',message='بيانات المجلس غير صالحة';end if;
 if not exists(select 1 from qarar_core.governance_unit_types where id=p_unit_type_id and organization_id=o and is_council_type and is_active)
 then raise exception using errcode='23503',message='نوع المجلس غير موجود أو غير نشط';end if;
 if p_governance_class_id is not null and not exists(select 1 from qarar_governance.governance_unit_classes
   where id=p_governance_class_id and organization_id=o and is_active)
 then raise exception using errcode='23503',message='تصنيف المجلس غير موجود أو غير نشط';end if;
 select governance_class_id into old_class from qarar_core.governance_units where id=p_council_id and organization_id=o;
 update qarar_core.governance_units set name_ar=btrim(p_name_ar),name_en=nullif(btrim(p_name_en),''),
  description=nullif(btrim(p_description),''),unit_type_id=p_unit_type_id,
  governance_class_id=p_governance_class_id,minimum_active_members=p_minimum_active_members,
  allow_dual_leadership=coalesce(p_allow_dual_leadership,false)
 where id=p_council_id and organization_id=o and status<>'archived' and updated_at=p_expected_updated_at
 returning updated_at into changed;
 if changed is null then
  if exists(select 1 from qarar_core.governance_units where id=p_council_id and organization_id=o and status='archived')
  then raise exception using errcode='55000',message='لا يمكن تعديل مجلس مؤرشف';end if;
  if exists(select 1 from qarar_core.governance_units where id=p_council_id and organization_id=o)
  then raise exception using errcode='40001',message='تم تعديل المجلس؛ حدّث البيانات';end if;
  raise exception using errcode='P0002',message='المجلس غير موجود';
 end if;
 perform qarar_audit.append_audit_log(o,'council.updated','governance_unit',p_council_id,
  jsonb_build_object('updated_at',changed));
 if old_class is distinct from p_governance_class_id then
  perform qarar_audit.append_audit_log(o,'council.class_changed','governance_unit',p_council_id,
   jsonb_build_object('from',old_class,'to',p_governance_class_id));
 end if;
 return jsonb_build_object('id',p_council_id,'updated_at',changed);
end $$;

create or replace function qarar_core.get_available_councils(
 p_query text default null,p_unit_type_id uuid default null,p_governance_class_id uuid default null,
 p_parent_unit_id uuid default null,p_limit integer default 50,p_offset integer default 0
)returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,qarar_core as $$
declare o uuid:=qarar_iam.current_organization_id();l integer:=least(greatest(coalesce(p_limit,50),1),100);f integer:=greatest(coalesce(p_offset,0),0);
begin
 if o is null then raise exception using errcode='42501',message='يلزم حساب نشط';end if;
 return jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(x) order by x.name_ar,x.id)from(
  select u.id,u.code,u.name_ar,u.name_en,u.parent_unit_id,u.unit_type_id,u.governance_class_id
  from qarar_core.governance_units u join qarar_core.governance_unit_types t
   on t.id=u.unit_type_id and t.organization_id=u.organization_id and t.is_council_type
  where u.organization_id=o and u.status='active'
   and(p_unit_type_id is null or u.unit_type_id=p_unit_type_id)
   and(p_governance_class_id is null or u.governance_class_id=p_governance_class_id)
   and(p_parent_unit_id is null or u.parent_unit_id=p_parent_unit_id)
   and(nullif(btrim(p_query),'') is null or u.code ilike '%'||btrim(p_query)||'%' or u.name_ar ilike '%'||btrim(p_query)||'%')
  order by u.name_ar,u.id limit l offset f)x),'[]'::jsonb),
  'total',(select count(*)::integer
   from qarar_core.governance_units u join qarar_core.governance_unit_types t
    on t.id=u.unit_type_id and t.organization_id=u.organization_id and t.is_council_type
   where u.organization_id=o and u.status='active'
    and(p_unit_type_id is null or u.unit_type_id=p_unit_type_id)
    and(p_governance_class_id is null or u.governance_class_id=p_governance_class_id)
    and(p_parent_unit_id is null or u.parent_unit_id=p_parent_unit_id)
    and(nullif(btrim(p_query),'') is null or u.code ilike '%'||btrim(p_query)||'%' or u.name_ar ilike '%'||btrim(p_query)||'%')),
  'limit',l,'offset',f);
end $$;

alter function qarar_core.get_council_form_options() owner to qarar_core_executor;
alter function qarar_core.admin_search_councils(text,text,uuid,uuid,uuid,integer,integer) owner to qarar_core_executor;
alter function qarar_core.admin_get_council_detail(uuid) owner to qarar_core_executor;
alter function qarar_core.admin_create_council(text,text,text,text,uuid,uuid,uuid,integer,boolean,uuid) owner to qarar_core_executor;
alter function qarar_core.admin_update_council(uuid,text,text,text,uuid,uuid,integer,boolean,timestamptz) owner to qarar_core_executor;
alter function qarar_core.get_available_councils(text,uuid,uuid,uuid,integer,integer) owner to qarar_core_executor;

revoke all on function qarar_core.get_council_form_options() from public,anon,authenticated,service_role;
revoke all on function qarar_core.admin_search_councils(text,text,uuid,uuid,uuid,integer,integer) from public,anon,authenticated,service_role;
revoke all on function qarar_core.admin_get_council_detail(uuid) from public,anon,authenticated,service_role;
revoke all on function qarar_core.admin_create_council(text,text,text,text,uuid,uuid,uuid,integer,boolean,uuid) from public,anon,authenticated,service_role;
revoke all on function qarar_core.admin_update_council(uuid,text,text,text,uuid,uuid,integer,boolean,timestamptz) from public,anon,authenticated,service_role;
revoke all on function qarar_core.get_available_councils(text,uuid,uuid,uuid,integer,integer) from public,anon,authenticated,service_role;

insert into qarar_architecture.function_registry(function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate)
select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),'core','qarar_core',false
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='qarar_core' and p.proname in(
 'get_council_form_options','admin_search_councils','admin_get_council_detail',
 'admin_create_council','admin_update_council','get_available_councils')
on conflict(function_name,identity_arguments) do update set function_oid=excluded.function_oid,module_code='core',owning_schema='qarar_core';

insert into qarar_architecture.api_contract_registry(
 api_version,contract_name,implementation_schema,implementation_name,identity_arguments,module_code,audience
)values
('v1','get_council_form_options','qarar_core','get_council_form_options','','core','authenticated'),
('v1','admin_search_councils','qarar_core','admin_search_councils',
 'p_query text, p_status text, p_unit_type_id uuid, p_governance_class_id uuid, p_parent_unit_id uuid, p_limit integer, p_offset integer','core','authenticated'),
('v1','admin_get_council_detail','qarar_core','admin_get_council_detail','p_council_id uuid','core','authenticated'),
('v1','admin_create_council','qarar_core','admin_create_council',
 'p_code text, p_name_ar text, p_name_en text, p_description text, p_unit_type_id uuid, p_parent_unit_id uuid, p_governance_class_id uuid, p_minimum_active_members integer, p_allow_dual_leadership boolean, p_client_request_id uuid','core','authenticated'),
('v1','admin_update_council','qarar_core','admin_update_council',
 'p_council_id uuid, p_name_ar text, p_name_en text, p_description text, p_unit_type_id uuid, p_governance_class_id uuid, p_minimum_active_members integer, p_allow_dual_leadership boolean, p_expected_updated_at timestamp with time zone','core','authenticated'),
('v1','get_available_councils','qarar_core','get_available_councils',
 'p_query text, p_unit_type_id uuid, p_governance_class_id uuid, p_parent_unit_id uuid, p_limit integer, p_offset integer','core','authenticated')
on conflict do nothing;

do $$
declare c record;p record;call_args text;sql text;
begin
 for c in select * from qarar_architecture.api_contract_registry where api_version='v1' and contract_name in(
  'get_council_form_options','admin_search_councils','admin_get_council_detail',
  'admin_create_council','admin_update_council','get_available_councils')
 loop
  select x.oid,pg_get_function_arguments(x.oid) args,pg_get_function_result(x.oid) result into p
  from pg_proc x join pg_namespace n on n.oid=x.pronamespace
  where n.nspname=c.implementation_schema and x.proname=c.implementation_name
   and pg_get_function_identity_arguments(x.oid)=c.identity_arguments;
  select string_agg(split_part(btrim(a),' ',1),',' order by ord) into call_args
   from unnest(string_to_array(c.identity_arguments,','))with ordinality z(a,ord);
  sql:=format('create or replace function api_v1.%I(%s) returns %s language sql volatile security definer set search_path=pg_catalog as $f$ select %I.%I(%s) $f$',
   c.contract_name,p.args,p.result,c.implementation_schema,c.implementation_name,coalesce(call_args,''));
  execute sql;
  execute format('alter function api_v1.%I(%s) owner to qarar_api_executor',c.contract_name,c.identity_arguments);
  execute format('revoke all on function api_v1.%I(%s) from public,anon,service_role',c.contract_name,c.identity_arguments);
  execute format('grant execute on function api_v1.%I(%s) to authenticated',c.contract_name,c.identity_arguments);
  execute format('grant execute on function qarar_core.%I(%s) to qarar_api_executor',c.implementation_name,c.identity_arguments);
 end loop;
end $$;

update qarar_architecture.api_release_registry
set contract_count=128,
    contract_hash='0bdef79084faa983b17633cbdb664c72',
    released_at='2026-07-29 00:00:00+00',
    notes='Sprint 03.6 PB-074 adds council CRUD, form options, and reusable council references.'
where api_version='v1';

commit;
