begin;
create function qarar_governance.list_governance_topic_types_v2(p_search text default '',p_status text default '',p_page integer default 1)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare o uuid:=qarar_iam.current_organization_id(); result jsonb;
begin
 perform qarar_iam.assert_permission('governance.model.read',null);
 if p_page is null or p_page<1 or p_page>100000 or length(p_search)>300
 or p_status not in ('','draft','under_review','changes_requested','approved','effective','retired') then
  raise exception using errcode='22023',message='معايير البحث غير صالحة';
 end if;
 with latest as (
  select distinct on (t.id) t.id,t.name_ar,t.reference_number,c.name_ar classification_name,b.id bundle_id,b.status,b.updated_at,v.version_no
  from qarar_governance.topic_types_v2 t
  join qarar_governance.topic_type_versions_v2 v on v.topic_type_id=t.id and v.organization_id=t.organization_id
  join qarar_governance.governance_bundles_v2 b on b.topic_type_version_id=v.id and b.organization_id=v.organization_id
  join qarar_governance.topic_classifications_v2 c on c.id=v.classification_id and c.organization_id=v.organization_id
  where t.organization_id=o order by t.id,v.version_no desc
 ), filtered as (
  select * from latest where (p_status='' or status=p_status)
  and (p_search='' or strpos(lower(name_ar),lower(p_search))>0 or strpos(lower(reference_number),lower(p_search))>0)
 ), page as (select * from filtered order by updated_at desc,id limit 20 offset ((p_page-1)*20))
 select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(page) order by updated_at desc,id) from page),'[]'::jsonb),'total',(select count(*) from filtered),'page',p_page,'page_size',20) into result;
 return result;
end $$;
alter function qarar_governance.list_governance_topic_types_v2(text,text,integer) owner to qarar_governance_executor;
revoke all on function qarar_governance.list_governance_topic_types_v2(text,text,integer) from public,anon,authenticated,service_role;
grant execute on function qarar_governance.list_governance_topic_types_v2(text,text,integer) to qarar_api_executor,qarar_governance_executor;
create function api_v2.list_governance_topic_types_v2(p_search text default '',p_status text default '',p_page integer default 1)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare trace uuid:=gen_random_uuid(); data jsonb; state text; message text;
begin
 data:=qarar_governance.list_governance_topic_types_v2(p_search,p_status,p_page);
 return jsonb_build_object('ok',true,'data',data,'trace_id',trace);
exception when others then
 get stacked diagnostics state=returned_sqlstate,message=message_text;
 return api_v2.governance_error_envelope(state,message,trace);
end $$;
alter function api_v2.list_governance_topic_types_v2(text,text,integer) owner to qarar_api_executor;
revoke all on function api_v2.list_governance_topic_types_v2(text,text,integer) from public,anon,authenticated,service_role;
grant execute on function api_v2.list_governance_topic_types_v2(text,text,integer) to authenticated,qarar_api_executor;
insert into qarar_architecture.function_registry(function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate)
values('qarar_governance.list_governance_topic_types_v2(text,text,integer)'::regprocedure,'list_governance_topic_types_v2','p_search text, p_status text, p_page integer','governance','qarar_governance',false);
insert into qarar_architecture.api_contract_registry(api_version,contract_name,implementation_schema,implementation_name,identity_arguments,module_code,audience)
values('v2','list_governance_topic_types_v2','qarar_governance','list_governance_topic_types_v2','p_search text, p_status text, p_page integer','governance','authenticated');
notify pgrst,'reload schema';
commit;
