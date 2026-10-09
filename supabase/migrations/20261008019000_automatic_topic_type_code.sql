begin;

-- Defaults have already allocated the TYP reference before this trigger runs.
-- The reserved sentinel is injected only by the trusted compatibility adapter.
create function qarar_governance.assign_automatic_topic_type_code()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
 if new.code='qarar_auto_topic_type' then
  new.code:=lower(replace(new.reference_number,'-','_'));
 end if;
 return new;
end $$;
create trigger topic_type_automatic_code before insert on qarar_governance.topic_types_v2
for each row execute function qarar_governance.assign_automatic_topic_type_code();

alter function qarar_governance.save_governance_bundle_draft_v2(uuid,integer,uuid,jsonb)
 rename to save_governance_bundle_layout_policy_v2;
create function qarar_governance.save_governance_bundle_draft_v2(
 p_bundle_id uuid,p_expected_lock_version integer,p_client_request_id uuid,p_bundle jsonb
) returns jsonb language plpgsql volatile security definer set search_path=pg_catalog as $$
declare
 o uuid:=qarar_iam.current_organization_id(); actor uuid:=auth.uid(); fp text; code text;
 receipt qarar_governance.governance_bundle_command_receipts_v2%rowtype; clean jsonb; result jsonb;
begin
 perform qarar_iam.assert_permission('governance.model.edit',null);
 -- Historical internal callers retain their existing contract and identifiers.
 if jsonb_typeof(p_bundle->'topic_type') is distinct from 'object' or p_bundle->'topic_type' ? 'code' then
  return qarar_governance.save_governance_bundle_layout_policy_v2(p_bundle_id,p_expected_lock_version,p_client_request_id,p_bundle);
 end if;
 if o is null or actor is null or p_client_request_id is null then
  raise exception using errcode='22023',message='تعذر تحديد سياق الحفظ أو مفتاح الطلب';
 end if;
 fp:=encode(pg_catalog.sha256(convert_to(coalesce(p_bundle_id::text,'new')||':'||coalesce(p_expected_lock_version::text,'new')||':'||p_bundle::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended(o::text||':'||actor::text||':'||p_client_request_id::text,0));
 select * into receipt from qarar_governance.governance_bundle_command_receipts_v2
 where organization_id=o and actor_user_id=actor and command_name='save_governance_bundle_draft_v2' and client_request_id=p_client_request_id;
 if receipt.id is not null then
  if receipt.request_fingerprint<>fp then raise exception using errcode='40001',message='استُخدم مفتاح التكرار نفسه لطلب مختلف'; end if;
  return receipt.response_payload||jsonb_build_object('idempotent_replay',true);
 end if;
 if p_bundle_id is null then
  code:='qarar_auto_topic_type';
 else
  select t.code into code from qarar_governance.governance_bundles_v2 b
   join qarar_governance.topic_type_versions_v2 v on v.id=b.topic_type_version_id and v.organization_id=b.organization_id
   join qarar_governance.topic_types_v2 t on t.id=v.topic_type_id and t.organization_id=v.organization_id
   where b.id=p_bundle_id and b.organization_id=o and b.created_by_user_id=actor;
  if code is null then raise exception using errcode='P0002',message='مسودة حزمة الحوكمة غير موجودة'; end if;
 end if;
 clean:=jsonb_set(p_bundle,'{topic_type,code}',to_jsonb(code));
 result:=qarar_governance.save_governance_bundle_layout_policy_v2(p_bundle_id,p_expected_lock_version,p_client_request_id,clean);
 update qarar_governance.governance_bundle_command_receipts_v2 set request_fingerprint=fp
 where organization_id=o and actor_user_id=actor and command_name='save_governance_bundle_draft_v2' and client_request_id=p_client_request_id;
 return result;
end $$;

alter function qarar_governance.assign_automatic_topic_type_code() owner to qarar_governance_executor;
alter function qarar_governance.save_governance_bundle_draft_v2(uuid,integer,uuid,jsonb) owner to qarar_governance_executor;
revoke all on function qarar_governance.assign_automatic_topic_type_code() from public,anon,authenticated,service_role,qarar_api_executor;
revoke all on function qarar_governance.save_governance_bundle_draft_v2(uuid,integer,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function qarar_governance.save_governance_bundle_draft_v2(uuid,integer,uuid,jsonb) to qarar_api_executor,qarar_governance_executor;
update qarar_architecture.function_registry set function_name='save_governance_bundle_layout_policy_v2'
where function_oid='qarar_governance.save_governance_bundle_layout_policy_v2(uuid,integer,uuid,jsonb)'::regprocedure;
insert into qarar_architecture.function_registry(function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate)
select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),'governance','qarar_governance',false from pg_proc p
where p.oid in ('qarar_governance.assign_automatic_topic_type_code()'::regprocedure,
 'qarar_governance.save_governance_bundle_draft_v2(uuid,integer,uuid,jsonb)'::regprocedure)
on conflict(function_oid) do update set function_name=excluded.function_name;

notify pgrst,'reload schema';
commit;
