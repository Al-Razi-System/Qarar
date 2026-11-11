begin;

alter table qarar_topics.typed_submission_preparations_v2
  add column updated_at timestamptz not null default now();

create function qarar_topics.save_typed_submission_draft_v2(p_request_id uuid,p_input jsonb)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog as $$
declare
  o uuid:=qarar_iam.current_organization_id();
  a uuid:=auth.uid();
  preparation qarar_topics.typed_submission_preparations_v2%rowtype;
  file_count integer;
begin
  if o is null or a is null or p_request_id is null or jsonb_typeof(p_input)<>'object'
    or char_length(btrim(coalesce(p_input->>'title',''))) not between 5 and 300
    or char_length(btrim(coalesce(p_input->>'description',''))) not between 10 and 10000
    or jsonb_typeof(coalesce(p_input->'evidence','[]'::jsonb))<>'array' then
    raise exception using errcode='22023',message='أكمل بيانات المسودة';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
  select * into preparation from qarar_topics.typed_submission_preparations_v2 where id=p_request_id for update;
  if preparation.id is null then
    perform qarar_governance.prepare_typed_topic_v2((p_input->>'versionId')::uuid,(p_input->>'unitId')::uuid);
    if jsonb_array_length(coalesce(p_input->'evidence','[]'::jsonb))>0 then
      perform qarar_iam.assert_permission('governance.prior_route.request',(p_input->>'unitId')::uuid);
    end if;
    perform qarar_iam.consume_iam_rate_limit('topics.prepare',20,600);
    insert into qarar_topics.typed_submission_preparations_v2(id,organization_id,actor_user_id,input)
      values(p_request_id,o,a,p_input);
    perform qarar_audit.append_audit_log(o,'topics.draft.created','typed_submission_preparations_v2',p_request_id,'{}');
  else
    if preparation.organization_id<>o or preparation.actor_user_id<>a then
      raise exception using errcode='42501',message='المسودة غير متاحة';
    end if;
    if preparation.result is not null then raise exception using errcode='55000',message='تم تقديم هذا الموضوع بالفعل'; end if;
    select count(*) into file_count from qarar_topics.typed_submission_files_v2
      where preparation_id=p_request_id and organization_id=o;
    if file_count>0 and (preparation.input->>'versionId' is distinct from p_input->>'versionId'
      or preparation.input->>'unitId' is distinct from p_input->>'unitId') then
      raise exception using errcode='23514',message='احذف مرفقات المسودة قبل تغيير المجلس أو التصنيف';
    end if;
    if exists(select 1 from qarar_topics.typed_submission_files_v2 f
      where f.preparation_id=p_request_id and f.organization_id=o and f.evidence_index is not null
      and f.evidence_index>=jsonb_array_length(coalesce(p_input->'evidence','[]'::jsonb))) then
      raise exception using errcode='23514',message='احذف مرفقات المراحل التي أزلتها قبل حفظ المسودة';
    end if;
    perform qarar_governance.prepare_typed_topic_v2((p_input->>'versionId')::uuid,(p_input->>'unitId')::uuid);
    update qarar_topics.typed_submission_preparations_v2 set input=p_input,updated_at=now() where id=p_request_id;
    perform qarar_audit.append_audit_log(o,'topics.draft.updated','typed_submission_preparations_v2',p_request_id,'{}');
  end if;
  select * into preparation from qarar_topics.typed_submission_preparations_v2 where id=p_request_id;
  return jsonb_build_object(
    'request_id',preparation.id,'status','draft','input',preparation.input,'updated_at',preparation.updated_at,
    'files',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'file_name',f.file_name,'display_name',f.display_name,
      'mime_type',f.mime_type,'file_size_bytes',f.file_size_bytes,'evidence_index',f.evidence_index) order by f.created_at)
      from qarar_topics.typed_submission_files_v2 f where f.preparation_id=preparation.id and f.organization_id=preparation.organization_id),'[]'::jsonb));
end $$;

create function qarar_topics.get_my_typed_submission_draft_v2(p_request_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare preparation qarar_topics.typed_submission_preparations_v2%rowtype;
begin
  select * into preparation from qarar_topics.typed_submission_preparations_v2
   where id=p_request_id and organization_id=qarar_iam.current_organization_id() and actor_user_id=auth.uid();
  if preparation.id is null then raise exception using errcode='P0002',message='المسودة غير موجودة'; end if;
  return jsonb_build_object(
    'request_id',preparation.id,'status',case when preparation.result is null then 'draft' else 'submitted' end,
    'input',preparation.input,'result',preparation.result,'updated_at',preparation.updated_at,
    'files',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'file_name',f.file_name,'display_name',f.display_name,
      'mime_type',f.mime_type,'file_size_bytes',f.file_size_bytes,'evidence_index',f.evidence_index) order by f.created_at)
      from qarar_topics.typed_submission_files_v2 f where f.preparation_id=preparation.id and f.organization_id=preparation.organization_id),'[]'::jsonb));
end $$;

create function qarar_topics.delete_my_typed_submission_file_v2(p_request_id uuid,p_file_id uuid)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog as $$
declare preparation qarar_topics.typed_submission_preparations_v2%rowtype; file qarar_topics.typed_submission_files_v2%rowtype;
begin
  select * into preparation from qarar_topics.typed_submission_preparations_v2
   where id=p_request_id and organization_id=qarar_iam.current_organization_id() and actor_user_id=auth.uid() for update;
  if preparation.id is null or preparation.result is not null then raise exception using errcode='42501',message='لا يمكن تعديل مرفقات هذه المسودة'; end if;
  select * into file from qarar_topics.typed_submission_files_v2 where id=p_file_id and preparation_id=p_request_id and organization_id=preparation.organization_id for update;
  if file.id is null then raise exception using errcode='P0002',message='المرفق غير موجود'; end if;
  delete from qarar_topics.typed_submission_files_v2 where id=file.id;
  perform qarar_audit.append_audit_log(preparation.organization_id,'topics.draft.file.deleted','typed_submission_files_v2',file.id,jsonb_build_object('preparation_id',p_request_id));
  return jsonb_build_object('id',file.id,'path',file.storage_path);
end $$;

create or replace function qarar_topics.prepare_typed_submission_v2(p_request_id uuid,p_input jsonb)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog as $$
declare draft jsonb;
begin
  draft:=qarar_topics.save_typed_submission_draft_v2(p_request_id,p_input);
  return jsonb_build_object('request_id',p_request_id,'result',draft->'result','files',draft->'files');
end $$;

-- The wrapper functions preserve safe Arabic envelopes and the actor context.
create function api_v2.save_typed_submission_draft_v2(p_request_id uuid,p_input jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare trace uuid:=gen_random_uuid(); result jsonb; state text; message text; begin
 result:=qarar_topics.save_typed_submission_draft_v2($1,$2); return jsonb_build_object('ok',true,'data',result,'trace_id',trace);
exception when others then get stacked diagnostics state=returned_sqlstate,message=message_text; return api_v2.governance_error_envelope(state,message,trace); end $$;
create function api_v2.get_my_typed_submission_draft_v2(p_request_id uuid) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare trace uuid:=gen_random_uuid(); result jsonb; state text; message text; begin
 result:=qarar_topics.get_my_typed_submission_draft_v2($1); return jsonb_build_object('ok',true,'data',result,'trace_id',trace);
exception when others then get stacked diagnostics state=returned_sqlstate,message=message_text; return api_v2.governance_error_envelope(state,message,trace); end $$;
create function api_v2.delete_my_typed_submission_file_v2(p_request_id uuid,p_file_id uuid) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare trace uuid:=gen_random_uuid(); result jsonb; state text; message text; begin
 result:=qarar_topics.delete_my_typed_submission_file_v2($1,$2); return jsonb_build_object('ok',true,'data',result,'trace_id',trace);
exception when others then get stacked diagnostics state=returned_sqlstate,message=message_text; return api_v2.governance_error_envelope(state,message,trace); end $$;

do $$ declare f record; begin
 for f in select p.oid,n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) args from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where (n.nspname='qarar_topics' and p.proname in ('save_typed_submission_draft_v2','get_my_typed_submission_draft_v2','delete_my_typed_submission_file_v2','prepare_typed_submission_v2'))
     or (n.nspname='api_v2' and p.proname in ('save_typed_submission_draft_v2','get_my_typed_submission_draft_v2','delete_my_typed_submission_file_v2')) loop
  if f.nspname='qarar_topics' then
   execute format('alter function qarar_topics.%I(%s) owner to qarar_topics_executor',f.proname,f.args);
   execute format('revoke all on function qarar_topics.%I(%s) from public,anon,authenticated,service_role',f.proname,f.args);
   execute format('grant execute on function qarar_topics.%I(%s) to qarar_api_executor',f.proname,f.args);
  else
   execute format('alter function api_v2.%I(%s) owner to qarar_api_executor',f.proname,f.args);
   execute format('revoke all on function api_v2.%I(%s) from public,anon,service_role',f.proname,f.args);
   execute format('grant execute on function api_v2.%I(%s) to authenticated',f.proname,f.args);
  end if;
 end loop;
end $$;

insert into qarar_architecture.function_registry(function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate)
select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),'topics',n.nspname,false from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='qarar_topics' and p.proname in ('save_typed_submission_draft_v2','get_my_typed_submission_draft_v2','delete_my_typed_submission_file_v2');
insert into qarar_architecture.api_contract_registry(api_version,contract_name,implementation_schema,implementation_name,identity_arguments,module_code,audience) values
('v2','save_typed_submission_draft_v2','qarar_topics','save_typed_submission_draft_v2','p_request_id uuid, p_input jsonb','topics','authenticated'),
('v2','get_my_typed_submission_draft_v2','qarar_topics','get_my_typed_submission_draft_v2','p_request_id uuid','topics','authenticated'),
('v2','delete_my_typed_submission_file_v2','qarar_topics','delete_my_typed_submission_file_v2','p_request_id uuid, p_file_id uuid','topics','authenticated');

notify pgrst,'reload schema';
commit;
