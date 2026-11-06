-- A correction pauses the governed journey and corrected minutes cannot be signed before completion.
begin;

create function qarar_governance.block_workflow_transition_during_correction()
returns trigger language plpgsql security definer set search_path=pg_catalog
as $$
begin
  if (new.status,new.outcome_code,new.action_version) is distinct from (old.status,old.outcome_code,old.action_version)
     and exists(
       select 1 from qarar_governance.topic_correction_requests r
       where r.organization_id=new.organization_id and r.workflow_instance_id=new.workflow_instance_id
         and r.status in('traversing','returned_to_opener')
     ) then
    raise exception using errcode='55000',message='الموضوع قيد تصحيح رسمي؛ أكمل التصحيح أو اسحبه قبل متابعة المسار.';
  end if;
  return new;
end;
$$;

create trigger block_workflow_transition_while_topic_correction
before update of status,outcome_code,action_version on qarar_governance.workflow_instance_steps
for each row execute function qarar_governance.block_workflow_transition_during_correction();

create or replace function qarar_governance.sign_corrected_minutes(p_version_id uuid,p_signature_strokes jsonb,p_expected_signature_count integer)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare v_org uuid:=qarar_iam.current_organization_id();v_actor uuid:=auth.uid();v_version qarar_governance.corrected_document_versions%rowtype;v_station qarar_governance.topic_correction_stations%rowtype;v_request qarar_governance.topic_correction_requests%rowtype;v_role text;v_count integer;v_hash text;
begin
  select * into v_version from qarar_governance.corrected_document_versions where id=p_version_id and organization_id=v_org;
  if v_version.id is null or v_version.document_type<>'minutes' then raise exception using errcode='P0002',message='نسخة المحضر المصححة غير موجودة.';end if;
  select * into v_request from qarar_governance.topic_correction_requests where id=v_version.correction_request_id and organization_id=v_org;
  if v_request.status<>'completed' then raise exception using errcode='23514',message='لا يوقع المحضر المصحح قبل اكتمال مرور طلب التصحيح.';end if;
  select * into v_station from qarar_governance.topic_correction_stations where id=v_version.station_id and organization_id=v_org;
  if qarar_iam.has_unit_role_code(v_station.governance_unit_id,array['council_chair']) then v_role:='council_chair';
  elsif qarar_iam.has_unit_role_code(v_station.governance_unit_id,array['council_rapporteur']) then v_role:='council_rapporteur';
  else raise exception using errcode='42501',message='توقيع المحضر المصحح متاح لرئيس المجلس ومقرره.';end if;
  select count(*) into v_count from qarar_governance.corrected_document_signatures where corrected_document_version_id=v_version.id;
  if p_expected_signature_count is null or p_expected_signature_count<>v_count then raise exception using errcode='40001',message='تغيرت توقيعات المحضر؛ حدّث الصفحة ثم أعد المحاولة.';end if;
  if exists(select 1 from qarar_governance.corrected_document_signatures where corrected_document_version_id=v_version.id and signer_role=v_role) then raise exception using errcode='23505',message='تم تسجيل توقيع هذا الدور من قبل.';end if;
  if p_signature_strokes is not null and jsonb_typeof(p_signature_strokes)<>'array' then raise exception using errcode='22023',message='بيانات التوقيع غير صالحة.';end if;
  v_hash:=encode(digest(v_version.corrected_content_hash||coalesce(p_signature_strokes::text,'acknowledged')||v_actor::text,'sha256'),'hex');
  insert into qarar_governance.corrected_document_signatures(organization_id,corrected_document_version_id,user_id,signer_role,content_hash,signature_strokes,signature_hash)
  values(v_org,v_version.id,v_actor,v_role,v_version.corrected_content_hash,p_signature_strokes,v_hash);
  perform qarar_audit.append_audit_log(v_org,'topic.correction.minutes_sign','corrected_document_versions',v_version.id,jsonb_build_object('correction_request_id',v_version.correction_request_id,'signer_role',v_role,'content_hash',v_version.corrected_content_hash));
  return jsonb_build_object('version_id',v_version.id,'signature_count',v_count+1,'signed_role',v_role,'complete',v_count+1=2);
end;
$$;

create or replace function qarar_topics.get_topic_detail_with_corrections(p_topic_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_base jsonb;v_version qarar_governance.corrected_document_versions%rowtype;v_no text;v_active record;
begin
  v_base:=qarar_topics.get_topic_detail(p_topic_id);
  select r.id,r.correction_no,r.status into v_active from qarar_governance.topic_correction_requests r
  where r.organization_id=qarar_iam.current_organization_id() and r.topic_id=p_topic_id and r.status in('traversing','returned_to_opener') limit 1;
  select d,r.correction_no into v_version,v_no from qarar_governance.corrected_document_versions d
  join qarar_governance.topic_correction_requests r on r.id=d.correction_request_id and r.organization_id=d.organization_id
  where d.organization_id=qarar_iam.current_organization_id() and d.document_type='topic' and d.original_document_id=p_topic_id and r.status='completed'
  order by d.version_no desc limit 1;
  if v_version.id is not null then
    v_base:=v_base||v_version.corrected_content||jsonb_build_object('is_corrected',true,'correction_no',v_no,'original_content',jsonb_build_object('title_ar',v_base->>'title_ar','title_en',v_base->>'title_en','description',v_base->>'description'));
  else v_base:=v_base||jsonb_build_object('is_corrected',false);end if;
  return v_base||jsonb_build_object('active_correction_id',v_active.id,'active_correction_no',v_active.correction_no,'correction_status',v_active.status);
end;
$$;

alter function qarar_governance.block_workflow_transition_during_correction() owner to qarar_governance_executor;
revoke all on function qarar_governance.block_workflow_transition_during_correction() from public,anon,authenticated,service_role;

insert into qarar_architecture.function_registry(function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate)
select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),'governance',n.nspname,false
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where p.oid='qarar_governance.block_workflow_transition_during_correction()'::regprocedure
on conflict(function_oid) do update set function_name=excluded.function_name,identity_arguments=excluded.identity_arguments,module_code=excluded.module_code,owning_schema=excluded.owning_schema,is_rls_predicate=false;
notify pgrst,'reload schema';
commit;
