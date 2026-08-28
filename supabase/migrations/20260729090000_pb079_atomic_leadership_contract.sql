begin;

drop function if exists api_v1.admin_assign_council_leadership(uuid,text,uuid,date,text,timestamptz);
delete from qarar_architecture.api_contract_registry
where api_version='v1' and contract_name='admin_assign_council_leadership';

create or replace function qarar_core.touch_council_leadership_version(
 p_council_id uuid,p_expected_updated_at timestamptz
)returns timestamptz language plpgsql security definer set search_path=pg_catalog as $$
declare changed timestamptz;
begin
 update qarar_core.governance_units set updated_at=clock_timestamp()
 where id=p_council_id and organization_id=qarar_iam.current_organization_id()
  and updated_at=p_expected_updated_at returning updated_at into changed;
 if changed is null then
  raise exception using errcode='40001',message='تم تغيير قيادة المجلس؛ حدّث البيانات';
 end if;
 return changed;
end $$;
alter function qarar_core.touch_council_leadership_version(uuid,timestamptz)
 owner to qarar_core_executor;
revoke all on function qarar_core.touch_council_leadership_version(uuid,timestamptz)
 from public,anon,authenticated,service_role;
insert into qarar_architecture.module_function_execute_allowlist(
 source_module,target_schema,function_name,identity_arguments,rationale
)values(
 'iam','qarar_core','touch_council_leadership_version',
 'p_council_id uuid, p_expected_updated_at timestamp with time zone',
 'Advance the council concurrency token after an atomic leadership change'
)on conflict(source_module,target_schema,function_name,identity_arguments)do update
 set rationale=excluded.rationale;
grant execute on function qarar_core.touch_council_leadership_version(uuid,timestamptz)
 to qarar_iam_executor;

create or replace function qarar_iam.admin_assign_council_leadership_pair(
 p_council_id uuid,p_chair_user_id uuid,p_rapporteur_user_id uuid,
 p_effective_date date,p_reason text,p_expected_updated_at timestamptz
)returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare chair_result jsonb;rapporteur_result jsonb;changed timestamptz;
begin
 perform qarar_iam.assert_permission('governance.leadership.assign',p_council_id);
 if p_chair_user_id is null or p_rapporteur_user_id is null then
  raise exception using errcode='22023',message='الرئيس والمقرر مطلوبان';
 end if;
 chair_result:=qarar_iam.admin_assign_council_leadership(
  p_council_id,'council_chair',p_chair_user_id,p_effective_date,p_reason,p_expected_updated_at);
 rapporteur_result:=qarar_iam.admin_assign_council_leadership(
  p_council_id,'council_rapporteur',p_rapporteur_user_id,p_effective_date,p_reason,p_expected_updated_at);
 changed:=qarar_core.touch_council_leadership_version(p_council_id,p_expected_updated_at);
 return jsonb_build_object('governance_unit_id',p_council_id,'chair',chair_result,
  'rapporteur',rapporteur_result,'effective_date',p_effective_date,'updated_at',changed,'atomic',true);
end $$;
alter function qarar_iam.admin_assign_council_leadership_pair(uuid,uuid,uuid,date,text,timestamptz)
 owner to qarar_iam_executor;
revoke all on function qarar_iam.admin_assign_council_leadership_pair(uuid,uuid,uuid,date,text,timestamptz)
 from public,anon,authenticated,service_role;

create or replace function api_v1.admin_assign_council_leadership(
 p_council_id uuid,p_chair_user_id uuid,p_rapporteur_user_id uuid,
 p_effective_date date,p_reason text,p_expected_updated_at timestamptz
)returns jsonb language sql volatile security definer set search_path=pg_catalog as $$
 select qarar_iam.admin_assign_council_leadership_pair($1,$2,$3,$4,$5,$6)
$$;
alter function api_v1.admin_assign_council_leadership(uuid,uuid,uuid,date,text,timestamptz)
 owner to qarar_api_executor;
revoke all on function api_v1.admin_assign_council_leadership(uuid,uuid,uuid,date,text,timestamptz)
 from public,anon,service_role;
grant execute on function api_v1.admin_assign_council_leadership(uuid,uuid,uuid,date,text,timestamptz)
 to authenticated;
grant execute on function qarar_iam.admin_assign_council_leadership_pair(uuid,uuid,uuid,date,text,timestamptz)
 to qarar_api_executor;

insert into qarar_architecture.function_registry(
 function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate)
select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),'core','qarar_core',false
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='qarar_core' and p.proname='touch_council_leadership_version'
on conflict(function_name,identity_arguments)do update set
 function_oid=excluded.function_oid,module_code=excluded.module_code,owning_schema=excluded.owning_schema;

insert into qarar_architecture.function_registry(
 function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate)
select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),'iam','qarar_iam',false
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='qarar_iam' and p.proname='admin_assign_council_leadership_pair'
on conflict(function_name,identity_arguments)do update set function_oid=excluded.function_oid;

insert into qarar_architecture.api_contract_registry(
 api_version,contract_name,implementation_schema,implementation_name,identity_arguments,module_code,audience)
values('v1','admin_assign_council_leadership','qarar_iam','admin_assign_council_leadership_pair',
 'p_council_id uuid, p_chair_user_id uuid, p_rapporteur_user_id uuid, p_effective_date date, p_reason text, p_expected_updated_at timestamp with time zone',
 'iam','authenticated');

update qarar_architecture.api_release_registry r set
 contract_count=(select count(*) from qarar_architecture.api_contract_registry where api_version='v1'),
 contract_hash=(select md5(string_agg(
  p.proname||'|'||pg_get_function_identity_arguments(p.oid)||'|'||
  pg_get_function_result(p.oid)||'|'||c.audience,E'\n'
  order by p.proname,pg_get_function_identity_arguments(p.oid)))
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace and n.nspname='api_v1'
  join qarar_architecture.api_contract_registry c on c.contract_name=p.proname
   and c.identity_arguments=pg_get_function_identity_arguments(p.oid))
where r.api_version='v1';

commit;
