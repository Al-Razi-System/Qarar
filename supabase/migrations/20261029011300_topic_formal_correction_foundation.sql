-- Formal, ordered, immutable correction journey for advanced governed topics.
-- Impact map: docs/engineering/impact/TOPIC_FORMAL_CORRECTION_20261029_AR.md
begin;

create table qarar_governance.topic_correction_requests(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references qarar_core.organizations(id) on delete restrict,
  correction_no text not null default qarar_governance.next_v2_reference('COR'),
  topic_id uuid not null,
  workflow_instance_id uuid not null,
  opened_from_step_id uuid not null,
  opened_from_unit_id uuid not null,
  current_station_id uuid,
  status text not null default 'traversing' check(status in('traversing','returned_to_opener','completed','withdrawn')),
  opening_reason text not null check(char_length(btrim(opening_reason)) between 10 and 2000),
  restore_snapshot jsonb not null check(jsonb_typeof(restore_snapshot)='object'),
  revision integer not null default 0 check(revision>=0),
  opened_by_user_id uuid not null,
  client_request_id uuid not null,
  opened_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  withdrawn_at timestamptz,
  updated_at timestamptz not null default clock_timestamp(),
  unique(id,organization_id),unique(organization_id,correction_no),
  unique(organization_id,opened_by_user_id,client_request_id),
  foreign key(topic_id,organization_id) references qarar_topics.topics(id,organization_id) on delete restrict,
  foreign key(workflow_instance_id,organization_id) references qarar_governance.workflow_instances(id,organization_id) on delete restrict,
  foreign key(opened_from_step_id,organization_id) references qarar_governance.workflow_instance_steps(id,organization_id) on delete restrict,
  foreign key(opened_from_unit_id,organization_id) references qarar_core.governance_units(id,organization_id) on delete restrict,
  foreign key(opened_by_user_id,organization_id) references qarar_iam.users(id,organization_id) on delete restrict
);
create unique index topic_correction_one_open_uidx on qarar_governance.topic_correction_requests(organization_id,topic_id)
where status in('traversing','returned_to_opener');
create index topic_correction_topic_idx on qarar_governance.topic_correction_requests(organization_id,topic_id,opened_at desc);

create table qarar_governance.topic_correction_locations(
  id uuid primary key default gen_random_uuid(),organization_id uuid not null,
  correction_request_id uuid not null,target_type text not null check(target_type in('topic','decision','minutes')),
  target_id uuid not null,field_name text not null,original_value text,corrected_value text not null,
  reason text not null check(char_length(btrim(reason)) between 10 and 1000),
  source_unit_id uuid,created_at timestamptz not null default clock_timestamp(),
  unique(id,organization_id),unique(correction_request_id,target_type,target_id,field_name),
  foreign key(correction_request_id,organization_id) references qarar_governance.topic_correction_requests(id,organization_id) on delete restrict,
  foreign key(source_unit_id,organization_id) references qarar_core.governance_units(id,organization_id) on delete restrict
);

create table qarar_governance.topic_correction_stations(
  id uuid primary key default gen_random_uuid(),organization_id uuid not null,
  correction_request_id uuid not null,sequence_no integer not null check(sequence_no>0),
  station_kind text not null check(station_kind in('council','submitter')),
  governance_unit_id uuid,workflow_instance_step_id uuid,
  status text not null check(status in('pending','active','approved','rejected','withdrawn')),
  decision_reason text,decided_by_user_id uuid,decided_at timestamptz,
  revision integer not null default 0 check(revision>=0),created_at timestamptz not null default clock_timestamp(),
  unique(id,organization_id),unique(correction_request_id,sequence_no),
  foreign key(correction_request_id,organization_id) references qarar_governance.topic_correction_requests(id,organization_id) on delete restrict,
  foreign key(governance_unit_id,organization_id) references qarar_core.governance_units(id,organization_id) on delete restrict,
  foreign key(workflow_instance_step_id,organization_id) references qarar_governance.workflow_instance_steps(id,organization_id) on delete restrict,
  foreign key(decided_by_user_id,organization_id) references qarar_iam.users(id,organization_id) on delete restrict,
  check((station_kind='council' and governance_unit_id is not null and workflow_instance_step_id is not null)
     or (station_kind='submitter' and governance_unit_id is null and workflow_instance_step_id is null))
);
alter table qarar_governance.topic_correction_requests add constraint topic_correction_current_station_fk
foreign key(current_station_id,organization_id) references qarar_governance.topic_correction_stations(id,organization_id) on delete restrict;

create table qarar_governance.corrected_document_versions(
  id uuid primary key default gen_random_uuid(),organization_id uuid not null,
  correction_request_id uuid not null,station_id uuid not null,
  document_type text not null check(document_type in('topic','decision','minutes')),
  original_document_id uuid not null,version_no integer not null check(version_no>0),
  corrected_content jsonb not null check(jsonb_typeof(corrected_content)='object'),
  original_content_hash text not null,corrected_content_hash text not null,
  correction_log jsonb not null check(jsonb_typeof(correction_log)='array'),
  created_by_user_id uuid not null,created_at timestamptz not null default clock_timestamp(),
  unique(id,organization_id),unique(document_type,original_document_id,version_no),
  unique(correction_request_id,document_type,original_document_id),
  foreign key(correction_request_id,organization_id) references qarar_governance.topic_correction_requests(id,organization_id) on delete restrict,
  foreign key(station_id,organization_id) references qarar_governance.topic_correction_stations(id,organization_id) on delete restrict,
  foreign key(created_by_user_id,organization_id) references qarar_iam.users(id,organization_id) on delete restrict
);

create table qarar_governance.corrected_document_signatures(
  id uuid primary key default gen_random_uuid(),organization_id uuid not null,
  corrected_document_version_id uuid not null,user_id uuid not null,
  signer_role text not null check(signer_role in('council_chair','council_rapporteur')),
  content_hash text not null,signature_strokes jsonb,signature_hash text,
  signed_at timestamptz not null default clock_timestamp(),
  unique(id,organization_id),unique(corrected_document_version_id,signer_role),
  foreign key(corrected_document_version_id,organization_id) references qarar_governance.corrected_document_versions(id,organization_id) on delete restrict,
  foreign key(user_id,organization_id) references qarar_iam.users(id,organization_id) on delete restrict
);

do $$declare t text;begin foreach t in array array['topic_correction_requests','topic_correction_locations','topic_correction_stations','corrected_document_versions','corrected_document_signatures'] loop
  execute format('alter table qarar_governance.%I owner to qarar_governance_executor',t);
  execute format('alter table qarar_governance.%I enable row level security',t);
  execute format('alter table qarar_governance.%I force row level security',t);
  execute format('revoke all on qarar_governance.%I from public,anon,authenticated,service_role',t);
  execute format('grant select,insert,update on qarar_governance.%I to qarar_governance_executor',t);
end loop;end$$;

create function qarar_governance.open_topic_correction(
  p_topic_id uuid,p_reason text,p_locations jsonb,p_client_request_id uuid,p_expected_version integer
) returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare v_org uuid:=qarar_iam.current_organization_id();v_actor uuid:=auth.uid();v_topic qarar_topics.topics%rowtype;
v_instance qarar_governance.workflow_instances%rowtype;v_step qarar_governance.workflow_instance_steps%rowtype;
v_existing qarar_governance.topic_correction_requests%rowtype;v_request_id uuid;v_station_id uuid;
v_location jsonb;v_kind text;v_target uuid;v_field text;v_original text;v_unit uuid;v_min_sequence integer:=2147483647;v_has_topic boolean:=false;v_count integer;
begin
  if p_client_request_id is null or p_expected_version is null then raise exception using errcode='22023',message='طلب التصحيح غير مكتمل.';end if;
  if char_length(btrim(coalesce(p_reason,'')))<10 then raise exception using errcode='22023',message='اكتب سبب فتح التصحيح في عشرة أحرف على الأقل.';end if;
  if jsonb_typeof(p_locations)<>'array' or jsonb_array_length(p_locations) not between 1 and 50 then raise exception using errcode='22023',message='حدد موضع تصحيح واحداً على الأقل، وبحد أقصى 50.';end if;
  select * into v_existing from qarar_governance.topic_correction_requests where organization_id=v_org and opened_by_user_id=v_actor and client_request_id=p_client_request_id;
  if v_existing.id is not null then return qarar_governance.get_topic_correction(v_existing.id);end if;
  select * into v_topic from qarar_topics.topics where id=p_topic_id and organization_id=v_org for update;
  if v_topic.id is null then raise exception using errcode='P0002',message='الموضوع غير موجود.';end if;
  select * into v_instance from qarar_governance.workflow_instances where id=v_topic.workflow_instance_id and organization_id=v_org and status='active' for update;
  select * into v_step from qarar_governance.workflow_instance_steps where id=v_instance.current_step_id and organization_id=v_org for update;
  if v_step.id is null or v_step.status<>'active' then raise exception using errcode='55000',message='الموضوع ليس في مرحلة مجلس نشطة.';end if;
  if not qarar_iam.has_unit_role_code(v_step.assigned_unit_id,array['council_chair']) then raise exception using errcode='42501',message='فتح التصحيح متاح لرئيس المجلس الحالي فقط.';end if;
  if v_step.action_version<>p_expected_version then raise exception using errcode='40001',message='تغيرت مرحلة الموضوع؛ حدّث الصفحة ثم أعد المحاولة.';end if;
  if exists(select 1 from qarar_meetings.agenda_items ai join qarar_meetings.meetings m on m.id=ai.meeting_id and m.organization_id=ai.organization_id where ai.topic_id=v_topic.id and ai.organization_id=v_org and m.status not in('closed','cancelled')) then
    raise exception using errcode='55000',message='لا يفتح التصحيح والموضوع مدرج في اجتماع غير منتهٍ.';
  end if;

  for v_location in select value from jsonb_array_elements(p_locations) loop
    v_kind:=v_location->>'target_type';v_target:=(v_location->>'target_id')::uuid;v_field:=v_location->>'field_name';
    if char_length(btrim(coalesce(v_location->>'reason','')))<10 or char_length(coalesce(v_location->>'corrected_value',''))=0 then raise exception using errcode='22023',message='أكمل القيمة الصحيحة وسبب كل موضع.';end if;
    if v_kind='topic' then
      if v_target<>v_topic.id or v_field not in('title_ar','title_en','description') then raise exception using errcode='22023',message='حقل الموضوع المطلوب تصحيحه غير صالح.';end if;
      v_original:=case v_field when 'title_ar' then v_topic.title_ar when 'title_en' then v_topic.title_en else v_topic.description end;v_unit:=null;v_min_sequence:=0;v_has_topic:=true;
    elsif v_kind='decision' then
      if v_field<>'decision_text' then raise exception using errcode='22023',message='يمكن تصحيح نص القرار فقط.';end if;
      select d.decision_text,m.governance_unit_id into v_original,v_unit from qarar_decisions.decisions d join qarar_meetings.agenda_items ai on ai.id=d.agenda_item_id and ai.organization_id=d.organization_id join qarar_meetings.meetings m on m.id=d.meeting_id and m.organization_id=d.organization_id where d.id=v_target and d.organization_id=v_org and ai.topic_id=v_topic.id;
      if not found then raise exception using errcode='22023',message='القرار المحدد لا يخص هذا الموضوع.';end if;
    elsif v_kind='minutes' then
      if v_field<>'content_final' then raise exception using errcode='22023',message='يمكن تصحيح النص النهائي للمحضر فقط.';end if;
      select mm.content_final,m.governance_unit_id into v_original,v_unit from qarar_minutes.meeting_minutes mm join qarar_meetings.meetings m on m.id=mm.meeting_id and m.organization_id=mm.organization_id join qarar_meetings.agenda_items ai on ai.meeting_id=m.id and ai.organization_id=m.organization_id where mm.id=v_target and mm.organization_id=v_org and mm.status='approved' and ai.topic_id=v_topic.id limit 1;
      if not found then raise exception using errcode='22023',message='المحضر المحدد غير معتمد أو لا يخص هذا الموضوع.';end if;
    else raise exception using errcode='22023',message='نوع موضع التصحيح غير صالح.';end if;
    if v_original is distinct from v_location->>'original_value' then raise exception using errcode='40001',message='تغيرت القيمة المطلوب تصحيحها؛ حدّث الصفحة.';end if;
    if v_unit is not null then select least(v_min_sequence,coalesce(min(sequence_no),2147483647)) into v_min_sequence from qarar_governance.workflow_instance_steps where workflow_instance_id=v_instance.id and assigned_unit_id=v_unit and sequence_no<v_step.sequence_no;end if;
  end loop;
  if v_min_sequence=2147483647 then raise exception using errcode='22023',message='لا ترتبط المواضع المحددة بسجل مجلس سابق.';end if;

  insert into qarar_governance.topic_correction_requests(organization_id,topic_id,workflow_instance_id,opened_from_step_id,opened_from_unit_id,opening_reason,restore_snapshot,opened_by_user_id,client_request_id)
  values(v_org,v_topic.id,v_instance.id,v_step.id,v_step.assigned_unit_id,btrim(p_reason),jsonb_build_object('topic_status',v_topic.status,'routing_status',v_topic.routing_status,'current_unit_id',v_topic.current_unit_id,'current_workflow_step_id',v_topic.current_workflow_step_id,'workflow_current_step_id',v_instance.current_step_id,'step_action_version',v_step.action_version),v_actor,p_client_request_id)
  returning id into v_request_id;
  insert into qarar_governance.topic_correction_locations(organization_id,correction_request_id,target_type,target_id,field_name,original_value,corrected_value,reason,source_unit_id)
  select v_org,v_request_id,x.target_type,x.target_id,x.field_name,x.original_value,x.corrected_value,btrim(x.reason),
    case when x.target_type='decision' then (select m.governance_unit_id from qarar_decisions.decisions d join qarar_meetings.meetings m on m.id=d.meeting_id and m.organization_id=d.organization_id where d.id=x.target_id)
         when x.target_type='minutes' then (select m.governance_unit_id from qarar_minutes.meeting_minutes mm join qarar_meetings.meetings m on m.id=mm.meeting_id and m.organization_id=mm.organization_id where mm.id=x.target_id) end
  from jsonb_to_recordset(p_locations) x(target_type text,target_id uuid,field_name text,original_value text,corrected_value text,reason text);
  insert into qarar_governance.topic_correction_stations(organization_id,correction_request_id,sequence_no,station_kind,governance_unit_id,workflow_instance_step_id,status)
  select v_org,v_request_id,row_number() over(order by s.sequence_no desc),'council',s.assigned_unit_id,s.id,
    case when row_number() over(order by s.sequence_no desc)=1 then 'active' else 'pending' end
  from qarar_governance.workflow_instance_steps s where s.workflow_instance_id=v_instance.id and s.sequence_no<v_step.sequence_no and s.sequence_no>=greatest(v_min_sequence,1) order by s.sequence_no desc;
  if v_has_topic then
    select coalesce(max(sequence_no),0)+1 into v_count from qarar_governance.topic_correction_stations where correction_request_id=v_request_id;
    insert into qarar_governance.topic_correction_stations(organization_id,correction_request_id,sequence_no,station_kind,status)
    values(v_org,v_request_id,v_count,'submitter',case when v_count=1 then 'active' else 'pending' end);
  end if;
  select id into v_station_id from qarar_governance.topic_correction_stations where correction_request_id=v_request_id and status='active';
  if v_station_id is null then raise exception using errcode='55000',message='لا توجد محطة سابقة يمر بها طلب التصحيح.';end if;
  update qarar_governance.topic_correction_requests set current_station_id=v_station_id where id=v_request_id;
  perform qarar_audit.append_audit_log(v_org,'topic.correction.open','topic_correction_requests',v_request_id,jsonb_build_object('topic_id',v_topic.id,'correction_no',(select correction_no from qarar_governance.topic_correction_requests where id=v_request_id),'location_count',jsonb_array_length(p_locations),'opened_from_unit_id',v_step.assigned_unit_id));
  return qarar_governance.get_topic_correction(v_request_id);
end;
$$;

create function qarar_governance.get_topic_correction(p_correction_id uuid)
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
     and not (v_station.station_kind='council' and qarar_iam.has_unit_role_code(v_station.governance_unit_id,array['council_chair','council_rapporteur'])) then
    raise exception using errcode='42501',message='لا تملك صلاحية عرض طلب التصحيح.';
  end if;
  return jsonb_build_object('id',v_request.id,'correction_no',v_request.correction_no,'topic_id',v_request.topic_id,'status',v_request.status,'opening_reason',v_request.opening_reason,'revision',v_request.revision,'opened_at',v_request.opened_at,'opened_by_user_id',v_request.opened_by_user_id,'current_station_id',v_request.current_station_id,
    'locations',coalesce((select jsonb_agg(to_jsonb(l) order by l.created_at) from qarar_governance.topic_correction_locations l where l.correction_request_id=v_request.id),'[]'::jsonb),
    'stations',coalesce((select jsonb_agg(to_jsonb(s)||jsonb_build_object('unit_name_ar',u.name_ar) order by s.sequence_no) from qarar_governance.topic_correction_stations s left join qarar_core.governance_units u on u.id=s.governance_unit_id and u.organization_id=s.organization_id where s.correction_request_id=v_request.id),'[]'::jsonb),
    'versions',coalesce((select jsonb_agg(to_jsonb(d) order by d.created_at) from qarar_governance.corrected_document_versions d where d.correction_request_id=v_request.id),'[]'::jsonb),
    'viewer',jsonb_build_object('can_decide',v_request.status='traversing' and ((v_station.station_kind='council' and qarar_iam.has_unit_role_code(v_station.governance_unit_id,array['council_chair'])) or (v_station.station_kind='submitter' and auth.uid()=v_topic.submitted_by_user_id)),'can_withdraw',v_request.status in('traversing','returned_to_opener') and auth.uid()=v_request.opened_by_user_id));
end;
$$;

create function qarar_governance.decide_topic_correction_station(p_correction_id uuid,p_decision text,p_reason text,p_expected_revision integer,p_client_request_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare v_org uuid:=qarar_iam.current_organization_id();v_actor uuid:=auth.uid();v_request qarar_governance.topic_correction_requests%rowtype;v_station qarar_governance.topic_correction_stations%rowtype;v_topic qarar_topics.topics%rowtype;v_next uuid;v_doc record;v_base jsonb;v_patch jsonb;v_log jsonb;v_version integer;
begin
  if p_decision not in('approve','reject') or p_client_request_id is null or p_expected_revision is null then raise exception using errcode='22023',message='قرار محطة التصحيح غير صالح.';end if;
  if p_decision='reject' and char_length(btrim(coalesce(p_reason,'')))<10 then raise exception using errcode='22023',message='اكتب سبب الرفض في عشرة أحرف على الأقل.';end if;
  select * into v_request from qarar_governance.topic_correction_requests where id=p_correction_id and organization_id=v_org for update;
  if v_request.id is null then raise exception using errcode='P0002',message='طلب التصحيح غير موجود.';end if;
  if v_request.revision<>p_expected_revision then raise exception using errcode='40001',message='تغير طلب التصحيح؛ حدّث الصفحة ثم أعد المحاولة.';end if;
  if v_request.status<>'traversing' then raise exception using errcode='23514',message='طلب التصحيح ليس في محطة قابلة للقرار.';end if;
  select * into v_station from qarar_governance.topic_correction_stations where id=v_request.current_station_id and organization_id=v_org for update;
  select * into v_topic from qarar_topics.topics where id=v_request.topic_id and organization_id=v_org;
  if not((v_station.station_kind='council' and qarar_iam.has_unit_role_code(v_station.governance_unit_id,array['council_chair'])) or (v_station.station_kind='submitter' and v_topic.submitted_by_user_id=v_actor)) then raise exception using errcode='42501',message='قرار هذه المحطة متاح لمسؤولها الحالي فقط.';end if;
  if p_decision='reject' then
    update qarar_governance.topic_correction_stations set status='rejected',decision_reason=btrim(p_reason),decided_by_user_id=v_actor,decided_at=clock_timestamp(),revision=revision+1 where id=v_station.id;
    update qarar_governance.topic_correction_requests set status='returned_to_opener',revision=revision+1,updated_at=clock_timestamp() where id=v_request.id;
  else
    for v_doc in select distinct l.target_type,l.target_id from qarar_governance.topic_correction_locations l where l.correction_request_id=v_request.id and ((v_station.station_kind='submitter' and l.target_type='topic') or (v_station.station_kind='council' and l.source_unit_id=v_station.governance_unit_id)) loop
      if v_doc.target_type='decision' then select jsonb_build_object('decision_text',decision_text) into v_base from qarar_decisions.decisions where id=v_doc.target_id and organization_id=v_org;
      elsif v_doc.target_type='minutes' then select jsonb_build_object('content_final',content_final) into v_base from qarar_minutes.meeting_minutes where id=v_doc.target_id and organization_id=v_org;
      else select jsonb_build_object('title_ar',title_ar,'title_en',title_en,'description',description) into v_base from qarar_topics.topics where id=v_doc.target_id and organization_id=v_org;end if;
      select coalesce(jsonb_object_agg(field_name,corrected_value),'{}'::jsonb),jsonb_agg(jsonb_build_object('field',field_name,'before',original_value,'after',corrected_value,'reason',reason)) into v_patch,v_log from qarar_governance.topic_correction_locations where correction_request_id=v_request.id and target_type=v_doc.target_type and target_id=v_doc.target_id;
      select coalesce(max(version_no),0)+1 into v_version from qarar_governance.corrected_document_versions where document_type=v_doc.target_type and original_document_id=v_doc.target_id;
      insert into qarar_governance.corrected_document_versions(organization_id,correction_request_id,station_id,document_type,original_document_id,version_no,corrected_content,original_content_hash,corrected_content_hash,correction_log,created_by_user_id)
      values(v_org,v_request.id,v_station.id,v_doc.target_type,v_doc.target_id,v_version,v_base||v_patch,encode(digest(v_base::text,'sha256'),'hex'),encode(digest((v_base||v_patch)::text,'sha256'),'hex'),v_log,v_actor);
    end loop;
    update qarar_governance.topic_correction_stations set status='approved',decision_reason=nullif(btrim(coalesce(p_reason,'')),''),decided_by_user_id=v_actor,decided_at=clock_timestamp(),revision=revision+1 where id=v_station.id;
    select id into v_next from qarar_governance.topic_correction_stations where correction_request_id=v_request.id and sequence_no>v_station.sequence_no and status='pending' order by sequence_no limit 1 for update;
    if v_next is null then update qarar_governance.topic_correction_requests set status='completed',current_station_id=null,completed_at=clock_timestamp(),revision=revision+1,updated_at=clock_timestamp() where id=v_request.id;
    else update qarar_governance.topic_correction_stations set status='active' where id=v_next;update qarar_governance.topic_correction_requests set current_station_id=v_next,revision=revision+1,updated_at=clock_timestamp() where id=v_request.id;end if;
  end if;
  perform qarar_audit.append_audit_log(v_org,'topic.correction.station_decide','topic_correction_requests',v_request.id,jsonb_build_object('station_id',v_station.id,'decision',p_decision,'reason',nullif(btrim(coalesce(p_reason,'')),''),'client_request_id',p_client_request_id));
  return qarar_governance.get_topic_correction(v_request.id);
end;
$$;

create function api_v2.open_topic_correction_v2(p_topic_id uuid,p_reason text,p_locations jsonb,p_client_request_id uuid,p_expected_version integer) returns jsonb language sql security definer set search_path=pg_catalog as $$select qarar_governance.open_topic_correction($1,$2,$3,$4,$5)$$;
create function api_v2.get_topic_correction_v2(p_correction_id uuid) returns jsonb language sql stable security definer set search_path=pg_catalog as $$select qarar_governance.get_topic_correction($1)$$;
create function api_v2.decide_topic_correction_station_v2(p_correction_id uuid,p_decision text,p_reason text,p_expected_revision integer,p_client_request_id uuid) returns jsonb language sql security definer set search_path=pg_catalog as $$select qarar_governance.decide_topic_correction_station($1,$2,$3,$4,$5)$$;

alter function qarar_governance.open_topic_correction(uuid,text,jsonb,uuid,integer) owner to qarar_governance_executor;
alter function qarar_governance.get_topic_correction(uuid) owner to qarar_governance_executor;
alter function qarar_governance.decide_topic_correction_station(uuid,text,text,integer,uuid) owner to qarar_governance_executor;
alter function api_v2.open_topic_correction_v2(uuid,text,jsonb,uuid,integer) owner to qarar_api_executor;
alter function api_v2.get_topic_correction_v2(uuid) owner to qarar_api_executor;
alter function api_v2.decide_topic_correction_station_v2(uuid,text,text,integer,uuid) owner to qarar_api_executor;
revoke all on function api_v2.open_topic_correction_v2(uuid,text,jsonb,uuid,integer),api_v2.get_topic_correction_v2(uuid),api_v2.decide_topic_correction_station_v2(uuid,text,text,integer,uuid) from public,anon,service_role;
grant execute on function api_v2.open_topic_correction_v2(uuid,text,jsonb,uuid,integer),api_v2.get_topic_correction_v2(uuid),api_v2.decide_topic_correction_station_v2(uuid,text,text,integer,uuid) to authenticated;
grant execute on function qarar_governance.open_topic_correction(uuid,text,jsonb,uuid,integer),qarar_governance.get_topic_correction(uuid),qarar_governance.decide_topic_correction_station(uuid,text,text,integer,uuid) to qarar_api_executor;
grant select on qarar_minutes.meeting_minutes to qarar_governance_executor;

insert into qarar_architecture.entity_registry(entity_name,module_code,legacy_public_view) values
('topic_correction_requests','governance',false),('topic_correction_locations','governance',false),('topic_correction_stations','governance',false),('corrected_document_versions','governance',false),('corrected_document_signatures','governance',false)
on conflict(entity_name) do update set module_code=excluded.module_code,legacy_public_view=false;
insert into qarar_architecture.function_registry(function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate)
select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),'governance',n.nspname,false from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.oid in('qarar_governance.open_topic_correction(uuid,text,jsonb,uuid,integer)'::regprocedure,'qarar_governance.get_topic_correction(uuid)'::regprocedure,'qarar_governance.decide_topic_correction_station(uuid,text,text,integer,uuid)'::regprocedure)
on conflict(function_oid) do update set function_name=excluded.function_name,identity_arguments=excluded.identity_arguments,module_code=excluded.module_code,owning_schema=excluded.owning_schema,is_rls_predicate=false;
insert into qarar_architecture.api_contract_registry(api_version,contract_name,implementation_schema,implementation_name,identity_arguments,module_code,audience) values
('v2','open_topic_correction_v2','qarar_governance','open_topic_correction','p_topic_id uuid, p_reason text, p_locations jsonb, p_client_request_id uuid, p_expected_version integer','governance','authenticated'),
('v2','get_topic_correction_v2','qarar_governance','get_topic_correction','p_correction_id uuid','governance','authenticated'),
('v2','decide_topic_correction_station_v2','qarar_governance','decide_topic_correction_station','p_correction_id uuid, p_decision text, p_reason text, p_expected_revision integer, p_client_request_id uuid','governance','authenticated')
on conflict(api_version,contract_name,identity_arguments) do update set implementation_schema=excluded.implementation_schema,implementation_name=excluded.implementation_name,module_code=excluded.module_code,audience=excluded.audience;

insert into qarar_architecture.module_table_read_allowlist(source_module,target_schema,table_name,rationale) values
('governance','qarar_minutes','meeting_minutes','Validate and version an approved minute in an ordered formal correction request')
on conflict do nothing;

notify pgrst,'reload schema';
commit;
