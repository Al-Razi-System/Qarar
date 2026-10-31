-- Complete the formal-correction controls without rewriting the immutable foundation migrations.
begin;

insert into qarar_iam.permissions(
  organization_id,code,module,action,context_scope,name_ar,name_en,description,is_system_permission,is_active
)
select o.id,'corrections.read','governance','read','organization','عرض التصحيحات الرسمية','Read formal corrections',
  'Read formal topic-correction requests without gaining authority to decide their stations',true,true
from qarar_core.organizations o
on conflict(organization_id,code) do update set
  module=excluded.module,action=excluded.action,context_scope=excluded.context_scope,
  name_ar=excluded.name_ar,name_en=excluded.name_en,description=excluded.description,is_active=true;

insert into qarar_iam.role_permissions(organization_id,role_id,permission_id,is_active)
select r.organization_id,r.id,p.id,true
from qarar_iam.roles r
join qarar_iam.permissions p on p.organization_id=r.organization_id and p.code='corrections.read'
where r.code='governance_admin'
on conflict(organization_id,role_id,permission_id) do update set is_active=true;

create function qarar_governance.revise_topic_correction(
  p_correction_id uuid,
  p_opening_reason text,
  p_locations jsonb,
  p_expected_revision integer,
  p_client_request_id uuid
) returns jsonb
language plpgsql security definer set search_path=pg_catalog
as $$
declare
  v_org uuid:=qarar_iam.current_organization_id();
  v_request qarar_governance.topic_correction_requests%rowtype;
  v_row jsonb;v_location qarar_governance.topic_correction_locations%rowtype;
  v_first uuid;v_seen integer:=0;
begin
  if p_expected_revision is null or p_client_request_id is null
     or char_length(btrim(coalesce(p_opening_reason,'')))<10
     or jsonb_typeof(p_locations)<>'array' or jsonb_array_length(p_locations)=0 then
    raise exception using errcode='22023',message='أكمل سبب التصحيح والقيم المصححة قبل إعادة الإرسال.';
  end if;
  select * into v_request from qarar_governance.topic_correction_requests
  where id=p_correction_id and organization_id=v_org for update;
  if v_request.id is null then raise exception using errcode='P0002',message='طلب التصحيح غير موجود.';end if;
  if v_request.opened_by_user_id<>auth.uid() then
    raise exception using errcode='42501',message='تعديل الطلب المعاد متاح لرئيس المجلس الذي فتحه فقط.';
  end if;
  if v_request.status<>'returned_to_opener' then
    raise exception using errcode='23514',message='لا يمكن تعديل الطلب إلا بعد إعادته من إحدى المحطات.';
  end if;
  if v_request.revision<>p_expected_revision then
    raise exception using errcode='40001',message='تغير طلب التصحيح؛ حدّث الصفحة ثم أعد المحاولة.';
  end if;

  for v_row in select value from jsonb_array_elements(p_locations) loop
    select * into v_location from qarar_governance.topic_correction_locations
    where id=(v_row->>'id')::uuid and correction_request_id=v_request.id and organization_id=v_org for update;
    if v_location.id is null then raise exception using errcode='22023',message='أحد مواضع التصحيح لا يخص هذا الطلب.';end if;
    if char_length(coalesce(v_row->>'corrected_value',''))=0 or char_length(btrim(coalesce(v_row->>'reason','')))<10 then
      raise exception using errcode='22023',message='أكمل القيمة الصحيحة وسبب كل موضع.';
    end if;
    update qarar_governance.topic_correction_locations set
      corrected_value=v_row->>'corrected_value',reason=btrim(v_row->>'reason') where id=v_location.id;
    v_seen:=v_seen+1;
  end loop;
  if v_seen<>(select count(*) from qarar_governance.topic_correction_locations where correction_request_id=v_request.id) then
    raise exception using errcode='22023',message='يجب إعادة إرسال جميع مواضع التصحيح.';
  end if;

  update qarar_governance.topic_correction_stations set
    status='pending',decision_reason=null,decided_by_user_id=null,decided_at=null,revision=revision+1
  where correction_request_id=v_request.id;
  select id into v_first from qarar_governance.topic_correction_stations
  where correction_request_id=v_request.id order by sequence_no limit 1 for update;
  update qarar_governance.topic_correction_stations set status='active' where id=v_first;
  update qarar_governance.topic_correction_requests set
    opening_reason=btrim(p_opening_reason),status='traversing',current_station_id=v_first,
    revision=revision+1,updated_at=clock_timestamp()
  where id=v_request.id;
  perform qarar_audit.append_audit_log(v_org,'topic.correction.resubmit','topic_correction_requests',v_request.id,
    jsonb_build_object('topic_id',v_request.topic_id,'client_request_id',p_client_request_id));
  return qarar_governance.get_topic_correction(v_request.id);
end;
$$;

create or replace function qarar_governance.get_topic_correction(p_correction_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_org uuid:=qarar_iam.current_organization_id();v_request qarar_governance.topic_correction_requests%rowtype;v_station qarar_governance.topic_correction_stations%rowtype;v_topic qarar_topics.topics%rowtype;
begin
  select * into v_request from qarar_governance.topic_correction_requests where id=p_correction_id and organization_id=v_org;
  if v_request.id is null then raise exception using errcode='P0002',message='طلب التصحيح غير موجود.';end if;
  select * into v_topic from qarar_topics.topics where id=v_request.topic_id and organization_id=v_org;
  select * into v_station from qarar_governance.topic_correction_stations where id=v_request.current_station_id and organization_id=v_org;
  if auth.uid()<>v_request.opened_by_user_id and auth.uid()<>v_topic.submitted_by_user_id and not qarar_iam.is_system_admin()
     and not qarar_iam.has_permission('corrections.read',null)
     and not exists(select 1 from qarar_governance.topic_correction_stations s where s.correction_request_id=v_request.id and s.station_kind='council' and qarar_iam.has_unit_role_code(s.governance_unit_id,array['council_chair','council_rapporteur'])) then
    raise exception using errcode='42501',message='لا تملك صلاحية عرض طلب التصحيح.';
  end if;
  return jsonb_build_object('id',v_request.id,'correction_no',v_request.correction_no,'topic_id',v_request.topic_id,'status',v_request.status,'opening_reason',v_request.opening_reason,'revision',v_request.revision,'opened_at',v_request.opened_at,'opened_by_user_id',v_request.opened_by_user_id,'current_station_id',v_request.current_station_id,
    'locations',coalesce((select jsonb_agg(to_jsonb(l) order by l.created_at) from qarar_governance.topic_correction_locations l where l.correction_request_id=v_request.id),'[]'::jsonb),
    'stations',coalesce((select jsonb_agg(to_jsonb(s)||jsonb_build_object('unit_name_ar',u.name_ar) order by s.sequence_no) from qarar_governance.topic_correction_stations s left join qarar_core.governance_units u on u.id=s.governance_unit_id and u.organization_id=s.organization_id where s.correction_request_id=v_request.id),'[]'::jsonb),
    'versions',coalesce((select jsonb_agg(to_jsonb(d)||jsonb_build_object(
      'signature_count',(select count(*) from qarar_governance.corrected_document_signatures x where x.corrected_document_version_id=d.id),
      'can_sign',d.document_type='minutes' and r.status='completed' and qarar_iam.has_unit_role_code(s.governance_unit_id,array['council_chair','council_rapporteur'])
        and not exists(select 1 from qarar_governance.corrected_document_signatures x where x.corrected_document_version_id=d.id and x.user_id=auth.uid()),
      'signatures',coalesce((select jsonb_agg(jsonb_build_object('signer_role',x.signer_role,'signed_at',x.signed_at,'user_id',x.user_id) order by x.signed_at) from qarar_governance.corrected_document_signatures x where x.corrected_document_version_id=d.id),'[]'::jsonb)
    ) order by d.created_at) from qarar_governance.corrected_document_versions d join qarar_governance.topic_correction_stations s on s.id=d.station_id join qarar_governance.topic_correction_requests r on r.id=d.correction_request_id where d.correction_request_id=v_request.id),'[]'::jsonb),
    'viewer',jsonb_build_object(
      'can_decide',v_request.status='traversing' and ((v_station.station_kind='council' and qarar_iam.has_unit_role_code(v_station.governance_unit_id,array['council_chair'])) or (v_station.station_kind='submitter' and auth.uid()=v_topic.submitted_by_user_id)),
      'can_withdraw',v_request.status in('traversing','returned_to_opener') and auth.uid()=v_request.opened_by_user_id,
      'can_revise',v_request.status='returned_to_opener' and auth.uid()=v_request.opened_by_user_id));
end;
$$;

create function api_v2.revise_topic_correction_v2(p_correction_id uuid,p_opening_reason text,p_locations jsonb,p_expected_revision integer,p_client_request_id uuid)
returns jsonb language sql security definer set search_path=pg_catalog
as $$select qarar_governance.revise_topic_correction($1,$2,$3,$4,$5)$$;

alter function qarar_governance.revise_topic_correction(uuid,text,jsonb,integer,uuid) owner to qarar_governance_executor;
alter function api_v2.revise_topic_correction_v2(uuid,text,jsonb,integer,uuid) owner to qarar_api_executor;
revoke all on function api_v2.revise_topic_correction_v2(uuid,text,jsonb,integer,uuid) from public,anon,service_role;
grant execute on function api_v2.revise_topic_correction_v2(uuid,text,jsonb,integer,uuid) to authenticated;
grant execute on function qarar_governance.revise_topic_correction(uuid,text,jsonb,integer,uuid) to qarar_api_executor;

insert into qarar_architecture.function_registry(function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate)
select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),'governance',n.nspname,false
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where p.oid='qarar_governance.revise_topic_correction(uuid,text,jsonb,integer,uuid)'::regprocedure
on conflict(function_oid) do update set function_name=excluded.function_name,identity_arguments=excluded.identity_arguments,module_code=excluded.module_code,owning_schema=excluded.owning_schema,is_rls_predicate=false;
insert into qarar_architecture.api_contract_registry(api_version,contract_name,implementation_schema,implementation_name,identity_arguments,module_code,audience)
values('v2','revise_topic_correction_v2','qarar_governance','revise_topic_correction','p_correction_id uuid, p_opening_reason text, p_locations jsonb, p_expected_revision integer, p_client_request_id uuid','governance','authenticated')
on conflict(api_version,contract_name,identity_arguments) do update set implementation_schema=excluded.implementation_schema,implementation_name=excluded.implementation_name,module_code=excluded.module_code,audience=excluded.audience;
notify pgrst,'reload schema';
commit;
