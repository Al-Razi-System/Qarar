begin;
grant select on qarar_core.governance_unit_types to qarar_topics_executor;
create function qarar_topics.get_typed_topic_form_options_v2()
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare o uuid:=qarar_iam.current_organization_id();
begin
 if o is null or auth.uid() is null then
  raise exception using errcode='42501',message='سجّل الدخول بحساب نشط لتقديم الموضوع';
 end if;
 return jsonb_build_object('governance_units',coalesce((
  select jsonb_agg(jsonb_build_object('id',u.id,'name_ar',u.name_ar) order by u.name_ar,u.id)
  from qarar_core.governance_units u
  join qarar_core.governance_unit_types t on t.id=u.unit_type_id and t.organization_id=u.organization_id
  where u.organization_id=o and u.status='active' and t.is_active and t.is_council_type
   and qarar_iam.has_permission('topics.create',u.id)
 ),'[]'::jsonb));
end $$;
alter function qarar_topics.get_typed_topic_form_options_v2() owner to qarar_topics_executor;
revoke all on function qarar_topics.get_typed_topic_form_options_v2() from public,anon,authenticated,service_role;
grant execute on function qarar_topics.get_typed_topic_form_options_v2() to qarar_api_executor;
create function api_v2.get_typed_topic_form_options_v2() returns jsonb language sql security definer set search_path=pg_catalog as $$select qarar_topics.get_typed_topic_form_options_v2()$$;
alter function api_v2.get_typed_topic_form_options_v2() owner to qarar_api_executor;
revoke all on function api_v2.get_typed_topic_form_options_v2() from public,anon,service_role;
grant execute on function api_v2.get_typed_topic_form_options_v2() to authenticated;
insert into qarar_architecture.function_registry(function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate)
select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),'topics','qarar_topics',false from pg_proc p where p.pronamespace='qarar_topics'::regnamespace and p.proname='get_typed_topic_form_options_v2';
insert into qarar_architecture.api_contract_registry(api_version,contract_name,implementation_schema,implementation_name,identity_arguments,module_code,audience)
values('v2','get_typed_topic_form_options_v2','qarar_topics','get_typed_topic_form_options_v2','','topics','authenticated');
notify pgrst,'reload schema';
commit;
