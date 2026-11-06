-- Discovery, withdrawal, and two-role signing for corrected minutes.
begin;
create function qarar_governance.list_topic_corrections(p_topic_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_org uuid:=qarar_iam.current_organization_id();v_topic qarar_topics.topics%rowtype;v_step qarar_governance.workflow_instance_steps%rowtype;v_can_read boolean;
begin
  select * into v_topic from qarar_topics.topics where id=p_topic_id and organization_id=v_org;
  if v_topic.id is null then raise exception using errcode='P0002',message='الموضوع غير موجود.';end if;
  select * into v_step from qarar_governance.workflow_instance_steps where id=v_topic.current_workflow_step_id and organization_id=v_org;
  v_can_read:=auth.uid()=v_topic.submitted_by_user_id or qarar_iam.is_system_admin()
    or qarar_iam.has_permission('topics.read',v_topic.current_unit_id)
    or qarar_iam.has_permission('topics.review',v_topic.current_unit_id)
    or qarar_iam.has_permission('corrections.read',null);
  if not v_can_read then raise exception using errcode='42501',message='لا تملك صلاحية عرض تصحيحات هذا الموضوع.';end if;
  return jsonb_build_object(
    'active_correction_id',(select id from qarar_governance.topic_correction_requests where organization_id=v_org and topic_id=p_topic_id and status in('traversing','returned_to_opener')),
    'can_open',v_step.id is not null and v_step.status='active' and qarar_iam.has_unit_role_code(v_step.assigned_unit_id,array['council_chair'])
      and not exists(select 1 from qarar_governance.topic_correction_requests where organization_id=v_org and topic_id=p_topic_id and status in('traversing','returned_to_opener')),
    'expected_version',v_step.action_version,
    'items',coalesce((select jsonb_agg(jsonb_build_object(
      'id',r.id,'correction_no',r.correction_no,'status',r.status,'opening_reason',r.opening_reason,
      'revision',r.revision,'opened_at',r.opened_at,'completed_at',r.completed_at,
      'current_station_id',r.current_station_id,'location_count',(select count(*) from qarar_governance.topic_correction_locations l where l.correction_request_id=r.id),
      'version_count',(select count(*) from qarar_governance.corrected_document_versions d where d.correction_request_id=r.id)
    ) order by r.opened_at desc) from qarar_governance.topic_correction_requests r where r.organization_id=v_org and r.topic_id=p_topic_id),'[]'::jsonb)
  );
end;
$$;

create function qarar_governance.withdraw_topic_correction(p_correction_id uuid,p_expected_revision integer,p_client_request_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare v_org uuid:=qarar_iam.current_organization_id();v_request qarar_governance.topic_correction_requests%rowtype;
begin
  if p_expected_revision is null or p_client_request_id is null then raise exception using errcode='22023',message='طلب سحب التصحيح غير صالح.';end if;
  select * into v_request from qarar_governance.topic_correction_requests where id=p_correction_id and organization_id=v_org for update;
  if v_request.id is null then raise exception using errcode='P0002',message='طلب التصحيح غير موجود.';end if;
  if v_request.opened_by_user_id<>auth.uid() then raise exception using errcode='42501',message='سحب طلب التصحيح متاح لمن فتحه فقط.';end if;
  if v_request.status not in('traversing','returned_to_opener') then raise exception using errcode='23514',message='لا يمكن سحب طلب تصحيح منتهٍ.';end if;
  if v_request.revision<>p_expected_revision then raise exception using errcode='40001',message='تغير طلب التصحيح؛ حدّث الصفحة ثم أعد المحاولة.';end if;
  update qarar_governance.topic_correction_stations set status='withdrawn',decided_by_user_id=auth.uid(),decided_at=clock_timestamp(),revision=revision+1
  where correction_request_id=v_request.id and status in('pending','active');
  update qarar_governance.topic_correction_requests set status='withdrawn',current_station_id=null,withdrawn_at=clock_timestamp(),revision=revision+1,updated_at=clock_timestamp() where id=v_request.id;
  perform qarar_audit.append_audit_log(v_org,'topic.correction.withdraw','topic_correction_requests',v_request.id,jsonb_build_object('topic_id',v_request.topic_id,'client_request_id',p_client_request_id));
  return qarar_governance.get_topic_correction(v_request.id);
end;
$$;

create function qarar_governance.sign_corrected_minutes(p_version_id uuid,p_signature_strokes jsonb,p_expected_signature_count integer)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare v_org uuid:=qarar_iam.current_organization_id();v_actor uuid:=auth.uid();v_version qarar_governance.corrected_document_versions%rowtype;v_station qarar_governance.topic_correction_stations%rowtype;v_role text;v_count integer;v_hash text;
begin
  select * into v_version from qarar_governance.corrected_document_versions where id=p_version_id and organization_id=v_org;
  if v_version.id is null or v_version.document_type<>'minutes' then raise exception using errcode='P0002',message='نسخة المحضر المصححة غير موجودة.';end if;
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

create function api_v2.list_topic_corrections_v2(p_topic_id uuid) returns jsonb language sql stable security definer set search_path=pg_catalog as $$select qarar_governance.list_topic_corrections($1)$$;
create function api_v2.withdraw_topic_correction_v2(p_correction_id uuid,p_expected_revision integer,p_client_request_id uuid) returns jsonb language sql security definer set search_path=pg_catalog as $$select qarar_governance.withdraw_topic_correction($1,$2,$3)$$;
create function api_v2.sign_corrected_minutes_v2(p_version_id uuid,p_signature_strokes jsonb,p_expected_signature_count integer) returns jsonb language sql security definer set search_path=pg_catalog as $$select qarar_governance.sign_corrected_minutes($1,$2,$3)$$;

alter function qarar_governance.list_topic_corrections(uuid) owner to qarar_governance_executor;
alter function qarar_governance.withdraw_topic_correction(uuid,integer,uuid) owner to qarar_governance_executor;
alter function qarar_governance.sign_corrected_minutes(uuid,jsonb,integer) owner to qarar_governance_executor;
alter function api_v2.list_topic_corrections_v2(uuid) owner to qarar_api_executor;
alter function api_v2.withdraw_topic_correction_v2(uuid,integer,uuid) owner to qarar_api_executor;
alter function api_v2.sign_corrected_minutes_v2(uuid,jsonb,integer) owner to qarar_api_executor;
revoke all on function api_v2.list_topic_corrections_v2(uuid),api_v2.withdraw_topic_correction_v2(uuid,integer,uuid),api_v2.sign_corrected_minutes_v2(uuid,jsonb,integer) from public,anon,service_role;
grant execute on function api_v2.list_topic_corrections_v2(uuid),api_v2.withdraw_topic_correction_v2(uuid,integer,uuid),api_v2.sign_corrected_minutes_v2(uuid,jsonb,integer) to authenticated;
grant execute on function qarar_governance.list_topic_corrections(uuid),qarar_governance.withdraw_topic_correction(uuid,integer,uuid),qarar_governance.sign_corrected_minutes(uuid,jsonb,integer) to qarar_api_executor;

insert into qarar_architecture.function_registry(function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate)
select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),'governance',n.nspname,false from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.oid in('qarar_governance.list_topic_corrections(uuid)'::regprocedure,'qarar_governance.withdraw_topic_correction(uuid,integer,uuid)'::regprocedure,'qarar_governance.sign_corrected_minutes(uuid,jsonb,integer)'::regprocedure)
on conflict(function_oid) do update set function_name=excluded.function_name,identity_arguments=excluded.identity_arguments,module_code=excluded.module_code,owning_schema=excluded.owning_schema,is_rls_predicate=false;
insert into qarar_architecture.api_contract_registry(api_version,contract_name,implementation_schema,implementation_name,identity_arguments,module_code,audience) values
('v2','list_topic_corrections_v2','qarar_governance','list_topic_corrections','p_topic_id uuid','governance','authenticated'),
('v2','withdraw_topic_correction_v2','qarar_governance','withdraw_topic_correction','p_correction_id uuid, p_expected_revision integer, p_client_request_id uuid','governance','authenticated'),
('v2','sign_corrected_minutes_v2','qarar_governance','sign_corrected_minutes','p_version_id uuid, p_signature_strokes jsonb, p_expected_signature_count integer','governance','authenticated')
on conflict(api_version,contract_name,identity_arguments) do update set implementation_schema=excluded.implementation_schema,implementation_name=excluded.implementation_name,module_code=excluded.module_code,audience=excluded.audience;
notify pgrst,'reload schema';
commit;
