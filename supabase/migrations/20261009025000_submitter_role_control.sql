begin;
-- Existing scopes stay enabled. This flag never grants council membership.
alter table qarar_iam.user_submission_profiles_v2
 add column submission_enabled boolean not null default true,
 add column last_role_request_id uuid,
 add column last_role_input jsonb;

create or replace function qarar_iam.actor_can_submit_scoped_v2(p_actor uuid,p_council uuid)
returns boolean language sql stable security definer set search_path=pg_catalog as $$
 with recursive target as (
  select c.id,c.organization_id,c.scope_unit_id from qarar_core.governance_units c
  join qarar_core.governance_unit_types t on t.id=c.unit_type_id and t.organization_id=c.organization_id and t.is_council_type
  join qarar_iam.users u on u.id=p_actor and u.organization_id=c.organization_id and u.status='active'
  where c.id=p_council and c.status='active' and c.organization_id=qarar_iam.current_organization_id()
 ), ancestors as (
  select u.id,u.parent_unit_id,u.organization_id,0 depth,array[u.id] path from qarar_core.governance_units u join target t on t.scope_unit_id=u.id and t.organization_id=u.organization_id
  union all select u.id,u.parent_unit_id,u.organization_id,a.depth+1,a.path||u.id from qarar_core.governance_units u join ancestors a on u.id=a.parent_unit_id and u.organization_id=a.organization_id where not u.id=any(a.path)
 ) select exists(
  select 1 from target t join qarar_iam.user_submission_grants_v2 g on g.user_id=p_actor and g.organization_id=t.organization_id and g.is_active
  join qarar_iam.user_submission_profiles_v2 profile on profile.user_id=g.user_id and profile.organization_id=g.organization_id and profile.submission_enabled
  join qarar_core.governance_units root on root.organization_id=t.organization_id
  join qarar_core.governance_unit_types rt on rt.id=root.unit_type_id and rt.organization_id=root.organization_id and rt.is_council_type
  where (root.id=g.council_id or (root.governance_class_id=g.class_id and exists(select 1 from qarar_governance.governance_unit_classes cl where cl.id=g.class_id and cl.organization_id=g.organization_id and cl.is_active)))
  and (root.id=t.id or (g.include_descendants and root.scope_unit_id is not null and exists(select 1 from ancestors a where a.id=root.scope_unit_id and a.depth>0)))
 )
$$;

CREATE OR REPLACE FUNCTION qarar_iam.get_user_submission_scope_v2(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare o uuid:=qarar_iam.current_organization_id(); result jsonb;
begin
 if not coalesce(qarar_iam.is_system_admin(),false) then raise exception using errcode='42501',message='إدارة نطاق التقديم متاحة لمدير النظام فقط'; end if;
 if not exists(select 1 from qarar_iam.users where id=p_user_id and organization_id=o) then raise exception using errcode='P0002',message='المستخدم غير موجود في مؤسستك'; end if;
 select jsonb_build_object('user_name_ar',(select full_name_ar from qarar_iam.users where id=p_user_id and organization_id=o),'submission_enabled',coalesce(p.submission_enabled,false),'submission_role_code','topic_submitter','revision',coalesce(p.revision,0),'home_unit_id',p.home_unit_id,
 'rules',coalesce((select jsonb_agg(jsonb_build_object('kind',case when g.council_id is null then 'class' else 'council' end,'target_id',coalesce(g.council_id,g.class_id),'include_descendants',g.include_descendants) order by g.created_at,g.id) from qarar_iam.user_submission_grants_v2 g where g.user_id=p_user_id and g.organization_id=o and g.is_active),'[]'::jsonb)) into result
 from (select 1) x left join qarar_iam.user_submission_profiles_v2 p on p.user_id=p_user_id and p.organization_id=o;
 return result||jsonb_build_object(
 'units',coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'name_ar',u.name_ar,'parent_unit_id',u.parent_unit_id,'status',u.status) order by u.name_ar) from qarar_core.governance_units u join qarar_core.governance_unit_types t on t.id=u.unit_type_id and t.organization_id=u.organization_id where u.organization_id=o and not t.is_council_type),'[]'::jsonb),
 'councils',coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'name_ar',u.name_ar,'scope_unit_id',u.scope_unit_id,'class_id',u.governance_class_id,'status',u.status) order by u.name_ar) from qarar_core.governance_units u join qarar_core.governance_unit_types t on t.id=u.unit_type_id and t.organization_id=u.organization_id where u.organization_id=o and t.is_council_type),'[]'::jsonb),
 'classes',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name_ar',name_ar) order by name_ar) from qarar_governance.governance_unit_classes where organization_id=o and is_active),'[]'::jsonb));
end $function$;

create function qarar_iam.set_user_submission_enabled_v2(
 p_user_id uuid,p_expected_revision integer,p_enabled boolean,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare o uuid:=qarar_iam.current_organization_id(); p qarar_iam.user_submission_profiles_v2%rowtype; input jsonb;
begin
 if not coalesce(qarar_iam.is_system_admin(),false) then
  raise exception using errcode='42501',message='إدارة دور المقدم متاحة لمدير النظام فقط';
 end if;
 if p_request_id is null or p_enabled is null or p_expected_revision is null or p_expected_revision<0 then
  raise exception using errcode='22023',message='طلب تغيير دور المقدم غير صالح';
 end if;
 perform 1 from qarar_iam.users where id=p_user_id and organization_id=o for update;
 if not found then raise exception using errcode='P0002',message='المستخدم غير موجود في مؤسستك'; end if;
 select * into p from qarar_iam.user_submission_profiles_v2 where user_id=p_user_id and organization_id=o for update;
 if not found then raise exception using errcode='23514',message='احفظ نطاق تقديم المستخدم أولًا'; end if;
 input:=jsonb_build_object('enabled',p_enabled,'expected_revision',p_expected_revision);
 if p.last_role_request_id=p_request_id then
  if p.last_role_input is distinct from input then
   raise exception using errcode='40001',message='استُخدم طلب تغيير الدور لبيانات مختلفة';
  end if;
  return jsonb_build_object('saved',true,'revision',p.revision,'submission_enabled',p.submission_enabled,'idempotent_replay',true);
 end if;
 if p.revision<>p_expected_revision then
  raise exception using errcode='40001',message='تغير نطاق المستخدم أو دوره؛ أعد تحميله قبل المتابعة';
 end if;
 if p_enabled and not exists(select 1 from qarar_iam.user_submission_grants_v2 g where g.user_id=p_user_id and g.organization_id=o and g.is_active) then
  raise exception using errcode='23514',message='حدّد نطاقًا محفوظًا قبل تفعيل دور المقدم';
 end if;
 update qarar_iam.user_submission_profiles_v2 set submission_enabled=p_enabled,revision=revision+1,
  last_role_request_id=p_request_id,last_role_input=input,updated_at=clock_timestamp(),updated_by=auth.uid()
 where user_id=p_user_id and organization_id=o returning * into p;
 perform qarar_audit.append_audit_log(o,'iam.submitter_role.change','users',p_user_id,
  jsonb_build_object('enabled',p_enabled,'revision',p.revision,'request_id',p_request_id));
 return jsonb_build_object('saved',true,'revision',p.revision,'submission_enabled',p.submission_enabled,'idempotent_replay',false);
end $$;
alter function qarar_iam.set_user_submission_enabled_v2(uuid,integer,boolean,uuid) owner to qarar_iam_executor;
revoke all on function qarar_iam.set_user_submission_enabled_v2(uuid,integer,boolean,uuid) from public,anon,authenticated,service_role;
grant execute on function qarar_iam.set_user_submission_enabled_v2(uuid,integer,boolean,uuid) to qarar_api_executor;
create function api_v2.set_user_submission_enabled_v2(p_user_id uuid,p_expected_revision integer,p_enabled boolean,p_request_id uuid)
returns jsonb language sql security definer set search_path=pg_catalog as $$select qarar_iam.set_user_submission_enabled_v2($1,$2,$3,$4)$$;
alter function api_v2.set_user_submission_enabled_v2(uuid,integer,boolean,uuid) owner to qarar_api_executor;
revoke all on function api_v2.set_user_submission_enabled_v2(uuid,integer,boolean,uuid) from public,anon,service_role;
grant execute on function api_v2.set_user_submission_enabled_v2(uuid,integer,boolean,uuid) to authenticated;
insert into qarar_architecture.function_registry(function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate)
select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),'iam','qarar_iam',false from pg_proc p
where p.pronamespace='qarar_iam'::regnamespace and p.proname='set_user_submission_enabled_v2';
insert into qarar_architecture.api_contract_registry(api_version,contract_name,implementation_schema,implementation_name,identity_arguments,module_code,audience)
select 'v2',p.proname,'qarar_iam',p.proname,pg_get_function_identity_arguments(p.oid),'iam','authenticated'
from pg_proc p where p.pronamespace='api_v2'::regnamespace and p.proname='set_user_submission_enabled_v2';
notify pgrst,'reload schema';
commit;
