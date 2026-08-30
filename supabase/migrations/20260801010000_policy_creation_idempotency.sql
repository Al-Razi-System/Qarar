begin;

alter table qarar_governance.policies
  add column if not exists client_request_id uuid;

create unique index if not exists policies_creation_idempotency_uidx
on qarar_governance.policies(organization_id, created_by_user_id, client_request_id)
where client_request_id is not null;

create or replace function qarar_governance.admin_create_policy_idempotent(
  p_code text, p_name_ar text, p_name_en text default null,
  p_policy_type text default 'regulation', p_description text default null,
  p_owner_user_id uuid default null, p_client_request_id uuid default null
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,qarar_governance
as $$
declare
  v_org uuid:=qarar_iam.current_organization_id();
  v_user uuid:=auth.uid();
  v_id uuid;
  v_existing qarar_governance.policies%rowtype;
begin
  perform qarar_iam.assert_permission('governance.policies.manage',null);
  if p_client_request_id is null then
    raise exception using errcode='22023', message='client_request_id is required';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_org::text||':'||v_user::text||':'||p_client_request_id::text,0));
  select * into v_existing
  from qarar_governance.policies
  where organization_id=v_org and created_by_user_id=v_user
    and client_request_id=p_client_request_id;
  if v_existing.id is not null then
    return jsonb_build_object('id',v_existing.id,'status',v_existing.status,'idempotent_replay',true);
  end if;
  insert into qarar_governance.policies(
    organization_id,code,name_ar,name_en,policy_type,description,owner_user_id,
    created_by_user_id,client_request_id
  ) values(
    v_org,lower(btrim(p_code)),btrim(p_name_ar),nullif(btrim(coalesce(p_name_en,'')),''),
    p_policy_type,nullif(btrim(coalesce(p_description,'')),''),p_owner_user_id,v_user,
    p_client_request_id
  ) returning id into v_id;
  perform qarar_audit.append_audit_log(v_org,'governance.policy.create','policies',v_id,
    jsonb_build_object('code',p_code,'policy_type',p_policy_type,'client_request_id',p_client_request_id));
  return jsonb_build_object('id',v_id,'status','active','idempotent_replay',false);
end;
$$;

insert into qarar_architecture.api_contract_registry(
  api_version,contract_name,implementation_schema,implementation_name,
  identity_arguments,module_code,audience
)
select 'v1','admin_create_policy_idempotent','qarar_governance','admin_create_policy_idempotent',
  pg_get_function_identity_arguments(p.oid),'governance','authenticated'
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='qarar_governance' and p.proname='admin_create_policy_idempotent'
on conflict do nothing;

create or replace function api_v1.admin_create_policy_idempotent(
  p_code text,p_name_ar text,p_name_en text default null,
  p_policy_type text default 'regulation',p_description text default null,
  p_owner_user_id uuid default null,p_client_request_id uuid default null
) returns jsonb language sql volatile security definer
set search_path=pg_catalog
as $$ select qarar_governance.admin_create_policy_idempotent($1,$2,$3,$4,$5,$6,$7) $$;

alter function api_v1.admin_create_policy_idempotent(text,text,text,text,text,uuid,uuid) owner to qarar_api_executor;
revoke all on function api_v1.admin_create_policy_idempotent(text,text,text,text,text,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function api_v1.admin_create_policy_idempotent(text,text,text,text,text,uuid,uuid) to authenticated,service_role;
grant usage on schema qarar_governance to qarar_api_executor;
grant execute on function qarar_governance.admin_create_policy_idempotent(text,text,text,text,text,uuid,uuid) to qarar_api_executor;
revoke all on function qarar_governance.admin_create_policy_idempotent(text,text,text,text,text,uuid,uuid) from public,anon,authenticated,service_role;

commit;
