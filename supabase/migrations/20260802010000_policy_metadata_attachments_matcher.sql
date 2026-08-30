begin;

drop function if exists api_v1.admin_update_policy(uuid,text,text,text,uuid,text);
drop function if exists qarar_governance.admin_update_policy(uuid,text,text,text,uuid,text);
drop function if exists api_v1.admin_get_policy_detail(uuid);

alter table qarar_governance.policies
  add column if not exists owner_governance_unit_id uuid,
  add column if not exists legal_reference text,
  add column if not exists decision_number text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname='policies_owner_unit_tenant_fk') then
    alter table qarar_governance.policies add constraint policies_owner_unit_tenant_fk
      foreign key(owner_governance_unit_id,organization_id)
      references qarar_core.governance_units(id,organization_id) on delete restrict;
  end if;
end $$;

create table if not exists qarar_governance.policy_attachments(
  id uuid primary key default gen_random_uuid(), organization_id uuid not null,
  policy_id uuid, policy_version_id uuid, policy_item_id uuid,
  file_name text not null, file_url text not null, mime_type text,
  file_size_bytes bigint, description text, created_by_user_id uuid not null,
  created_at timestamptz not null default now(), unique(id,organization_id),
  foreign key(policy_id,organization_id) references qarar_governance.policies(id,organization_id) on delete restrict,
  foreign key(policy_version_id,organization_id) references qarar_governance.policy_versions(id,organization_id) on delete restrict,
  foreign key(policy_item_id,organization_id) references qarar_governance.policy_items(id,organization_id) on delete restrict,
  foreign key(created_by_user_id,organization_id) references qarar_iam.users(id,organization_id) on delete restrict,
  check(num_nonnulls(policy_id,policy_version_id,policy_item_id)=1),
  check(char_length(btrim(file_name)) between 1 and 255), check(file_url ~ '^https?://'),
  check(file_size_bytes is null or file_size_bytes>=0)
);
alter table qarar_governance.policy_attachments owner to qarar_governance_executor;
alter table qarar_governance.policy_attachments enable row level security;
revoke all on qarar_governance.policy_attachments from public,anon,authenticated,service_role;
drop policy if exists policy_attachments_tenant_read on qarar_governance.policy_attachments;
create policy policy_attachments_tenant_read on qarar_governance.policy_attachments for select to qarar_governance_executor using(organization_id=qarar_iam.current_organization_id());
drop policy if exists policy_attachments_tenant_write on qarar_governance.policy_attachments;
create policy policy_attachments_tenant_write on qarar_governance.policy_attachments for all to qarar_governance_executor using(organization_id=qarar_iam.current_organization_id()) with check(organization_id=qarar_iam.current_organization_id());

create or replace function qarar_governance.admin_update_policy(
  p_policy_id uuid,p_name_ar text,p_name_en text default null,p_description text default null,
  p_owner_user_id uuid default null,p_status text default 'active',p_owner_governance_unit_id uuid default null,
  p_legal_reference text default null,p_decision_number text default null
) returns jsonb language plpgsql security definer set search_path=pg_catalog,qarar_governance as $$
declare v_org uuid:=qarar_iam.current_organization_id(); begin
  perform qarar_iam.assert_permission('governance.policies.manage',null);
  update qarar_governance.policies set name_ar=btrim(p_name_ar),name_en=nullif(btrim(coalesce(p_name_en,'')),''),description=nullif(btrim(coalesce(p_description,'')),''),owner_user_id=p_owner_user_id,status=p_status,owner_governance_unit_id=p_owner_governance_unit_id,legal_reference=nullif(btrim(coalesce(p_legal_reference,'')),''),decision_number=nullif(btrim(coalesce(p_decision_number,'')),''),updated_at=now() where id=p_policy_id and organization_id=v_org;
  if not found then raise exception using errcode='P0002',message='Policy was not found'; end if;
  return jsonb_build_object('id',p_policy_id,'status',p_status);
end $$;

create or replace function qarar_governance.admin_add_policy_attachment(
  p_policy_id uuid default null,p_policy_version_id uuid default null,p_policy_item_id uuid default null,
  p_file_name text default null,p_file_url text default null,p_mime_type text default null,
  p_file_size_bytes bigint default null,p_description text default null
) returns jsonb language plpgsql security definer set search_path=pg_catalog,qarar_governance as $$
declare v_org uuid:=qarar_iam.current_organization_id();v_user uuid:=auth.uid();v_id uuid;v_version uuid; begin
  perform qarar_iam.assert_permission('governance.policies.manage',null);
  if num_nonnulls(p_policy_id,p_policy_version_id,p_policy_item_id)<>1 then raise exception using errcode='22023',message='Exactly one attachment target is required'; end if;
  if p_policy_item_id is not null then select policy_version_id into v_version from qarar_governance.policy_items where id=p_policy_item_id and organization_id=v_org; elsif p_policy_version_id is not null then v_version:=p_policy_version_id; end if;
  if v_version is not null then perform qarar_governance.assert_policy_version_editable(v_version); end if;
  insert into qarar_governance.policy_attachments(organization_id,policy_id,policy_version_id,policy_item_id,file_name,file_url,mime_type,file_size_bytes,description,created_by_user_id) values(v_org,p_policy_id,p_policy_version_id,p_policy_item_id,btrim(p_file_name),btrim(p_file_url),nullif(btrim(coalesce(p_mime_type,'')),''),p_file_size_bytes,nullif(btrim(coalesce(p_description,'')),''),v_user) returning id into v_id;
  perform qarar_audit.append_audit_log(v_org,'governance.policy_attachment.create','policy_attachments',v_id,jsonb_build_object('file_name',p_file_name)); return jsonb_build_object('id',v_id);
end $$;

create or replace function qarar_governance.admin_remove_policy_attachment(p_attachment_id uuid) returns jsonb language plpgsql security definer set search_path=pg_catalog,qarar_governance as $$
declare v_org uuid:=qarar_iam.current_organization_id();v_version uuid; begin
  perform qarar_iam.assert_permission('governance.policies.manage',null);
  select coalesce(a.policy_version_id,i.policy_version_id) into v_version from qarar_governance.policy_attachments a left join qarar_governance.policy_items i on i.id=a.policy_item_id where a.id=p_attachment_id and a.organization_id=v_org;
  if v_version is not null then perform qarar_governance.assert_policy_version_editable(v_version); end if;
  delete from qarar_governance.policy_attachments where id=p_attachment_id and organization_id=v_org;
  if not found then raise exception using errcode='P0002',message='Attachment was not found'; end if; return jsonb_build_object('id',p_attachment_id,'deleted',true);
end $$;

create or replace function qarar_governance.preview_policy_conditions(p_conditions jsonb,p_context jsonb) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,qarar_governance as $$
begin perform qarar_iam.assert_permission('governance.policies.read',null);
  if jsonb_typeof(coalesce(p_conditions,'{}'))<>'object' or jsonb_typeof(coalesce(p_context,'{}'))<>'object' then raise exception using errcode='22023',message='Conditions and context must be JSON objects'; end if;
  return jsonb_build_object('matched',qarar_governance.conditions_match(coalesce(p_conditions,'{}'),coalesce(p_context,'{}')),'engine','qarar_governance.conditions_match','context',coalesce(p_context,'{}'));
end $$;

create or replace function qarar_governance.get_policy_form_options() returns jsonb language plpgsql stable security definer set search_path=pg_catalog,qarar_governance as $$
declare v_org uuid:=qarar_iam.current_organization_id(); begin perform qarar_iam.assert_permission('governance.policies.read',null);
  return jsonb_build_object('governance_levels',jsonb_build_array(jsonb_build_object('value','department','label','قسم'),jsonb_build_object('value','faculty','label','كلية'),jsonb_build_object('value','university','label','جامعة'),jsonb_build_object('value','committee','label','لجنة'),jsonb_build_object('value','executive','label','تنفيذي'),jsonb_build_object('value','other','label','أخرى')),
    'users',coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'name_ar',u.full_name_ar,'code',u.email) order by u.full_name_ar) from qarar_iam.users u where u.organization_id=v_org and u.status='active'),'[]'));
end $$;

create or replace function qarar_governance.admin_get_policy_detail(p_policy_id uuid) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,qarar_governance as $$
declare v_org uuid:=qarar_iam.current_organization_id();v_result jsonb; begin perform qarar_iam.assert_permission('governance.policies.read',null);
  select to_jsonb(p)||jsonb_build_object('attachments',coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at desc) from qarar_governance.policy_attachments a where a.policy_id=p.id),'[]'),
    'versions',coalesce((select jsonb_agg(to_jsonb(v)||jsonb_build_object('attachments',coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at desc) from qarar_governance.policy_attachments a where a.policy_version_id=v.id),'[]'),'items',coalesce((select jsonb_agg(to_jsonb(i)||jsonb_build_object('attachments',coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at desc) from qarar_governance.policy_attachments a where a.policy_item_id=i.id),'[]')) order by i.sort_order) from qarar_governance.policy_items i where i.policy_version_id=v.id),'[]'),'scopes',coalesce((select jsonb_agg(to_jsonb(s) order by s.priority desc,s.created_at) from qarar_governance.policy_scope_assignments s where s.policy_version_id=v.id),'[]')) order by v.version_no desc) from qarar_governance.policy_versions v where v.policy_id=p.id),'[]')) into v_result from qarar_governance.policies p where p.id=p_policy_id and p.organization_id=v_org;
  if v_result is null then raise exception using errcode='P0002',message='Policy was not found'; end if; return v_result;
end $$;

alter function qarar_governance.admin_update_policy(uuid,text,text,text,uuid,text,uuid,text,text) owner to qarar_governance_executor;
alter function qarar_governance.admin_add_policy_attachment(uuid,uuid,uuid,text,text,text,bigint,text) owner to qarar_governance_executor;
alter function qarar_governance.admin_remove_policy_attachment(uuid) owner to qarar_governance_executor;
alter function qarar_governance.preview_policy_conditions(jsonb,jsonb) owner to qarar_governance_executor;
alter function qarar_governance.get_policy_form_options() owner to qarar_governance_executor;
alter function qarar_governance.admin_get_policy_detail(uuid) owner to qarar_governance_executor;

create or replace function api_v1.admin_update_policy(p_policy_id uuid,p_name_ar text,p_name_en text,p_description text,p_owner_user_id uuid,p_status text,p_owner_governance_unit_id uuid,p_legal_reference text,p_decision_number text) returns jsonb language sql security definer set search_path=pg_catalog,api_v1 as $$select qarar_governance.admin_update_policy($1,$2,$3,$4,$5,$6,$7,$8,$9)$$;
create or replace function api_v1.admin_add_policy_attachment(p_policy_id uuid,p_policy_version_id uuid,p_policy_item_id uuid,p_file_name text,p_file_url text,p_mime_type text,p_file_size_bytes bigint,p_description text) returns jsonb language sql security definer set search_path=pg_catalog,api_v1 as $$select qarar_governance.admin_add_policy_attachment($1,$2,$3,$4,$5,$6,$7,$8)$$;
create or replace function api_v1.admin_remove_policy_attachment(p_attachment_id uuid) returns jsonb language sql security definer set search_path=pg_catalog,api_v1 as $$select qarar_governance.admin_remove_policy_attachment($1)$$;
create or replace function api_v1.preview_policy_conditions(p_conditions jsonb,p_context jsonb) returns jsonb language sql security definer set search_path=pg_catalog,api_v1 as $$select qarar_governance.preview_policy_conditions($1,$2)$$;
create or replace function api_v1.get_policy_form_options() returns jsonb language sql security definer set search_path=pg_catalog,api_v1 as $$select qarar_governance.get_policy_form_options()$$;
create or replace function api_v1.admin_get_policy_detail(p_policy_id uuid) returns jsonb language sql security definer set search_path=pg_catalog,api_v1 as $$select qarar_governance.admin_get_policy_detail($1)$$;

do $$ declare f regprocedure; begin foreach f in array array['api_v1.admin_update_policy(uuid,text,text,text,uuid,text,uuid,text,text)'::regprocedure,'api_v1.admin_add_policy_attachment(uuid,uuid,uuid,text,text,text,bigint,text)'::regprocedure,'api_v1.admin_remove_policy_attachment(uuid)'::regprocedure,'api_v1.preview_policy_conditions(jsonb,jsonb)'::regprocedure,'api_v1.get_policy_form_options()'::regprocedure,'api_v1.admin_get_policy_detail(uuid)'::regprocedure] loop execute format('alter function %s owner to qarar_api_executor',f);execute format('revoke all on function %s from public,anon',f);execute format('grant execute on function %s to authenticated,service_role',f);end loop;end $$;
grant execute on function qarar_governance.admin_update_policy(uuid,text,text,text,uuid,text,uuid,text,text),qarar_governance.admin_add_policy_attachment(uuid,uuid,uuid,text,text,text,bigint,text),qarar_governance.admin_remove_policy_attachment(uuid),qarar_governance.preview_policy_conditions(jsonb,jsonb),qarar_governance.get_policy_form_options(),qarar_governance.admin_get_policy_detail(uuid) to qarar_api_executor;

insert into qarar_architecture.api_contract_registry(api_version,contract_name,module_code,implementation_schema,implementation_name,identity_arguments,audience)
select 'v1',p.proname,'governance','qarar_governance',p.proname,pg_get_function_identity_arguments(p.oid),'authenticated' from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='qarar_governance' and p.proname in('admin_update_policy','admin_add_policy_attachment','admin_remove_policy_attachment','preview_policy_conditions','get_policy_form_options','admin_get_policy_detail') on conflict(api_version,contract_name,identity_arguments) do update set audience=excluded.audience,deprecated_at=null;
commit;
