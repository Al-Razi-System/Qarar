-- Official reads show the newest corrected document while retaining an explicit link to the original.
begin;
create function qarar_topics.get_topic_detail_with_corrections(p_topic_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_base jsonb;v_version qarar_governance.corrected_document_versions%rowtype;v_no text;
begin
  v_base:=qarar_topics.get_topic_detail(p_topic_id);
  select d,r.correction_no into v_version,v_no from qarar_governance.corrected_document_versions d
  join qarar_governance.topic_correction_requests r on r.id=d.correction_request_id and r.organization_id=d.organization_id
  where d.organization_id=qarar_iam.current_organization_id() and d.document_type='topic' and d.original_document_id=p_topic_id and r.status='completed'
  order by d.version_no desc limit 1;
  if v_version.id is not null then
    v_base:=v_base||v_version.corrected_content||jsonb_build_object('is_corrected',true,'correction_no',v_no,'original_content',jsonb_build_object('title_ar',v_base->>'title_ar','title_en',v_base->>'title_en','description',v_base->>'description'));
  else v_base:=v_base||jsonb_build_object('is_corrected',false);end if;
  return v_base;
end;
$$;

create function qarar_topics.get_topic_meeting_history_with_corrections(p_topic_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_base jsonb;
begin
  v_base:=qarar_topics.get_topic_meeting_history(p_topic_id);
  return coalesce((select jsonb_agg(
    record_value||jsonb_build_object(
      'minutes',case when record_value->'minutes' is null or record_value->'minutes'='null'::jsonb then null else
        record_value->'minutes'||coalesce((select jsonb_build_object(
          'content',d.corrected_content->>'content_final','is_corrected',true,'correction_no',r.correction_no,
          'corrected_version_id',d.id,'original_content',record_value->'minutes'->>'content','correction_log',d.correction_log,
          'signature_count',(select count(*) from qarar_governance.corrected_document_signatures s where s.corrected_document_version_id=d.id)
        ) from qarar_governance.corrected_document_versions d join qarar_governance.topic_correction_requests r on r.id=d.correction_request_id and r.organization_id=d.organization_id
          where d.organization_id=qarar_iam.current_organization_id() and d.document_type='minutes' and d.original_document_id=(record_value->'minutes'->>'id')::uuid and r.status<>'withdrawn' order by d.version_no desc limit 1),'{}'::jsonb) end,
      'decisions',coalesce((select jsonb_agg(decision_value||coalesce((select jsonb_build_object(
        'decision_text',d.corrected_content->>'decision_text','is_corrected',true,'correction_no',r.correction_no,
        'corrected_version_id',d.id,'original_decision_text',decision_value->>'decision_text','correction_log',d.correction_log
      ) from qarar_governance.corrected_document_versions d join qarar_governance.topic_correction_requests r on r.id=d.correction_request_id and r.organization_id=d.organization_id
        where d.organization_id=qarar_iam.current_organization_id() and d.document_type='decision' and d.original_document_id=(decision_value->>'id')::uuid and r.status<>'withdrawn' order by d.version_no desc limit 1),'{}'::jsonb) order by decision_ord)
        from jsonb_array_elements(record_value->'decisions') with ordinality decisions(decision_value,decision_ord)),'[]'::jsonb)
    ) order by record_ord) from jsonb_array_elements(v_base) with ordinality records(record_value,record_ord)),'[]'::jsonb);
end;
$$;

create or replace function api_v1.get_topic_detail(p_topic_id uuid) returns jsonb language sql stable security definer set search_path=pg_catalog as $$select qarar_topics.get_topic_detail_with_corrections($1)$$;
create or replace function api_v1.get_topic_meeting_history(p_topic_id uuid) returns jsonb language sql stable security definer set search_path=pg_catalog as $$select qarar_topics.get_topic_meeting_history_with_corrections($1)$$;
alter function qarar_topics.get_topic_detail_with_corrections(uuid) owner to qarar_topics_executor;
alter function qarar_topics.get_topic_meeting_history_with_corrections(uuid) owner to qarar_topics_executor;
alter function api_v1.get_topic_detail(uuid) owner to qarar_api_executor;
alter function api_v1.get_topic_meeting_history(uuid) owner to qarar_api_executor;
grant select on qarar_governance.corrected_document_versions,qarar_governance.corrected_document_signatures,qarar_governance.topic_correction_requests to qarar_topics_executor;

insert into qarar_architecture.function_registry(function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate)
select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),'topics',n.nspname,false from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.oid in('qarar_topics.get_topic_detail_with_corrections(uuid)'::regprocedure,'qarar_topics.get_topic_meeting_history_with_corrections(uuid)'::regprocedure)
on conflict(function_oid) do update set function_name=excluded.function_name,identity_arguments=excluded.identity_arguments,module_code=excluded.module_code,owning_schema=excluded.owning_schema,is_rls_predicate=false;
update qarar_architecture.api_contract_registry set implementation_name='get_topic_detail_with_corrections' where api_version='v1' and contract_name='get_topic_detail';
update qarar_architecture.api_contract_registry set implementation_name='get_topic_meeting_history_with_corrections' where api_version='v1' and contract_name='get_topic_meeting_history';
insert into qarar_architecture.module_table_read_allowlist(source_module,target_schema,table_name,rationale) values
('topics','qarar_governance','corrected_document_versions','Show the latest approved corrected document while preserving its original'),
('topics','qarar_governance','corrected_document_signatures','Show corrected-minute signature completion'),
('topics','qarar_governance','topic_correction_requests','Exclude withdrawn versions and expose the correction reference')
on conflict do nothing;
notify pgrst,'reload schema';
commit;
