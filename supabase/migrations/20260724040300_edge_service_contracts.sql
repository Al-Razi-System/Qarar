-- Edge-only operations use service-role contracts with an explicit, revalidated actor.

create or replace function qarar_iam.service_consume_iam_rate_limit(
 p_actor_user_id uuid,p_operation text,p_limit integer default 10,p_window_seconds integer default 600
) returns integer language plpgsql security definer set search_path=pg_catalog,auth,qarar_iam as $$
declare v_previous_claims text;v_count integer;
begin
 if auth.role()<>'service_role' then
  raise exception 'service role required' using errcode='42501';
 end if;
 if not exists(select 1 from qarar_iam.users where id=p_actor_user_id and status='active') then
  raise exception 'active actor not found' using errcode='42501';
 end if;
 v_previous_claims:=current_setting('request.jwt.claims',true);
 perform set_config('request.jwt.claims',
  jsonb_build_object('sub',p_actor_user_id,'role','authenticated')::text,true);
 begin
  v_count:=qarar_iam.consume_iam_rate_limit(p_operation,p_limit,p_window_seconds);
 exception when others then
  perform set_config('request.jwt.claims',coalesce(v_previous_claims,''),true);
  raise;
 end;
 perform set_config('request.jwt.claims',coalesce(v_previous_claims,''),true);
 return v_count;
end $$;

create or replace function qarar_iam.service_finalize_invited_user(
 p_actor_user_id uuid,p_auth_user_id uuid,p_email text,p_full_name_ar text,
 p_employee_no text default null,p_mobile text default null,p_job_title text default null,
 p_role_id uuid default null,p_governance_unit_id uuid default null,
 p_membership_title text default null
) returns jsonb language plpgsql security definer set search_path=pg_catalog,auth,qarar_iam as $$
declare v_previous_claims text;v_result jsonb;
begin
 if auth.role()<>'service_role' then
  raise exception 'service role required' using errcode='42501';
 end if;
 if not qarar_iam.actor_has_permission(p_actor_user_id,'iam.users.manage',null) then
  raise exception 'permission denied: iam.users.manage' using errcode='42501';
 end if;
 v_previous_claims:=current_setting('request.jwt.claims',true);
 perform set_config('request.jwt.claims',
  jsonb_build_object('sub',p_actor_user_id,'role','authenticated')::text,true);
 begin
  v_result:=qarar_iam.admin_finalize_invited_user(
   p_auth_user_id,p_email,p_full_name_ar,p_employee_no,p_mobile,p_job_title,
   p_role_id,p_governance_unit_id,p_membership_title
  );
 exception when others then
  perform set_config('request.jwt.claims',coalesce(v_previous_claims,''),true);
  raise;
 end;
 perform set_config('request.jwt.claims',coalesce(v_previous_claims,''),true);
 return v_result;
end $$;

alter function qarar_iam.service_consume_iam_rate_limit(uuid,text,integer,integer)
 owner to qarar_iam_executor;
alter function qarar_iam.service_finalize_invited_user(uuid,uuid,text,text,text,text,text,uuid,uuid,text)
 owner to qarar_iam_executor;
revoke all on function qarar_iam.service_consume_iam_rate_limit(uuid,text,integer,integer)
 from public,anon,authenticated,service_role;
revoke all on function qarar_iam.service_finalize_invited_user(uuid,uuid,text,text,text,text,text,uuid,uuid,text)
 from public,anon,authenticated,service_role;
grant execute on function qarar_iam.service_consume_iam_rate_limit(uuid,text,integer,integer)
 to qarar_api_executor;
grant execute on function qarar_iam.service_finalize_invited_user(uuid,uuid,text,text,text,text,text,uuid,uuid,text)
 to qarar_api_executor;

insert into qarar_architecture.function_registry(
 function_oid,function_name,identity_arguments,module_code,owning_schema
)
select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),'iam','qarar_iam'
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='qarar_iam'
 and p.proname in('service_consume_iam_rate_limit','service_finalize_invited_user');

drop function api_v1.consume_iam_rate_limit(text,integer,integer);
drop function api_v1.admin_finalize_invited_user(uuid,text,text,text,text,text,uuid,uuid,text);
delete from qarar_architecture.api_contract_registry
where contract_name in('consume_iam_rate_limit','admin_finalize_invited_user');
update qarar_architecture.api_contract_registry
set audience='authenticated'
where contract_name='has_permission';

create function api_v1.service_consume_iam_rate_limit(
 p_actor_user_id uuid,p_operation text,p_limit integer default 10,p_window_seconds integer default 600
) returns integer language sql volatile security definer
set search_path=pg_catalog as
 'select qarar_iam.service_consume_iam_rate_limit($1,$2,$3,$4)';

create function api_v1.service_finalize_invited_user(
 p_actor_user_id uuid,p_auth_user_id uuid,p_email text,p_full_name_ar text,
 p_employee_no text default null,p_mobile text default null,p_job_title text default null,
 p_role_id uuid default null,p_governance_unit_id uuid default null,
 p_membership_title text default null
) returns jsonb language sql volatile security definer
set search_path=pg_catalog as
 'select qarar_iam.service_finalize_invited_user($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)';

alter function api_v1.service_consume_iam_rate_limit(uuid,text,integer,integer)
 owner to qarar_api_executor;
alter function api_v1.service_finalize_invited_user(uuid,uuid,text,text,text,text,text,uuid,uuid,text)
 owner to qarar_api_executor;
revoke all on function api_v1.service_consume_iam_rate_limit(uuid,text,integer,integer)
 from public,anon,authenticated,service_role;
revoke all on function api_v1.service_finalize_invited_user(uuid,uuid,text,text,text,text,text,uuid,uuid,text)
 from public,anon,authenticated,service_role;
grant execute on function api_v1.service_consume_iam_rate_limit(uuid,text,integer,integer)
 to service_role;
grant execute on function api_v1.service_finalize_invited_user(uuid,uuid,text,text,text,text,text,uuid,uuid,text)
 to service_role;

insert into qarar_architecture.api_contract_registry(
 api_version,contract_name,implementation_schema,implementation_name,
 identity_arguments,module_code,audience
) values
 ('v1','service_consume_iam_rate_limit','qarar_iam','service_consume_iam_rate_limit',
  'p_actor_user_id uuid, p_operation text, p_limit integer, p_window_seconds integer',
  'iam','service_role'),
 ('v1','service_finalize_invited_user','qarar_iam','service_finalize_invited_user',
  'p_actor_user_id uuid, p_auth_user_id uuid, p_email text, p_full_name_ar text, p_employee_no text, p_mobile text, p_job_title text, p_role_id uuid, p_governance_unit_id uuid, p_membership_title text',
  'iam','service_role');
