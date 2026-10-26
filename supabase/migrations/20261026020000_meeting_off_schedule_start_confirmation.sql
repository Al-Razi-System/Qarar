-- Server-authoritative confirmation for opening a meeting outside its planned window.
-- Impact map: docs/engineering/impact/MEETING_OFF_SCHEDULE_START_20261026_AR.md
begin;

create table qarar_attendance.meeting_session_openings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  meeting_id uuid not null unique,
  opened_by_user_id uuid not null,
  opened_at timestamptz not null,
  organization_timezone text not null,
  scheduled_start_at timestamptz,
  scheduled_end_at timestamptz,
  timing_status text not null check (timing_status in ('within_window','early','late','schedule_unavailable')),
  difference_minutes integer not null default 0 check (difference_minutes >= 0),
  confirmed_off_schedule boolean not null default false,
  created_at timestamptz not null default clock_timestamp(),
  unique (id, organization_id),
  foreign key (meeting_id, organization_id) references qarar_meetings.meetings(id, organization_id) on delete restrict,
  foreign key (opened_by_user_id, organization_id) references qarar_iam.users(id, organization_id) on delete restrict,
  check ((timing_status in ('early','late')) = confirmed_off_schedule)
);
comment on table qarar_attendance.meeting_session_openings is
  'Immutable server-time snapshot of the single meeting-session opening and any chair-confirmed schedule deviation.';
alter table qarar_attendance.meeting_session_openings enable row level security;
alter table qarar_attendance.meeting_session_openings force row level security;
revoke all on qarar_attendance.meeting_session_openings from public,anon,authenticated,service_role;
grant select,insert on qarar_attendance.meeting_session_openings to qarar_attendance_executor;
grant select on qarar_attendance.meeting_session_openings to qarar_minutes_executor;
grant select(id,timezone) on qarar_core.organizations to qarar_attendance_executor;

insert into qarar_architecture.entity_registry(entity_name,module_code,legacy_public_view)
values ('meeting_session_openings','attendance',false)
on conflict do nothing;
insert into qarar_architecture.module_table_read_allowlist(source_module,target_schema,table_name,rationale) values
('attendance','qarar_core','organizations','Calculate meeting schedule boundaries in the organization timezone'),
('minutes','qarar_attendance','meeting_session_openings','Include a documented early or late session opening in the official minutes')
on conflict do nothing;

create function qarar_attendance.calculate_meeting_start_timing(
  p_scheduled_date date,
  p_start_time time,
  p_end_time time,
  p_timezone text,
  p_now timestamptz
) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog as $$
declare
  v_timezone text:=coalesce(nullif(btrim(p_timezone),''),'Asia/Riyadh');
  v_now timestamptz:=coalesce(p_now,clock_timestamp());
  v_local_now timestamp;
  v_start_local timestamp;
  v_end_local timestamp;
  v_start timestamptz;
  v_end timestamptz;
  v_status text;
  v_difference integer:=0;
begin
  if not exists(select 1 from pg_timezone_names where name=v_timezone) then
    raise exception using errcode='22023',message='المنطقة الزمنية للمؤسسة غير صالحة؛ راجع إعدادات المؤسسة قبل بدء الاجتماع.';
  end if;
  if p_scheduled_date is null or p_start_time is null or p_end_time is null then
    return jsonb_build_object(
      'timing_status','schedule_unavailable','requires_confirmation',false,'difference_minutes',0,
      'timezone',v_timezone,'server_now',v_now,'scheduled_start_at',null,'scheduled_end_at',null
    );
  end if;
  if p_end_time<=p_start_time then
    raise exception using errcode='23514',message='وقت نهاية الاجتماع يجب أن يكون بعد وقت بدايته.';
  end if;
  v_local_now:=v_now at time zone v_timezone;
  v_start_local:=p_scheduled_date+p_start_time;
  v_end_local:=p_scheduled_date+p_end_time;
  v_start:=v_start_local at time zone v_timezone;
  v_end:=v_end_local at time zone v_timezone;

  if v_local_now::date<p_scheduled_date
     or (v_local_now::date=p_scheduled_date and v_local_now<v_start_local-interval '2 hours') then
    v_status:='early';
    v_difference:=greatest(1,ceil(extract(epoch from (v_start-v_now))/60.0)::integer);
  elsif v_local_now::date>p_scheduled_date or v_local_now>v_end_local then
    v_status:='late';
    v_difference:=greatest(1,ceil(extract(epoch from (v_now-v_end))/60.0)::integer);
  else
    v_status:='within_window';
  end if;
  return jsonb_build_object(
    'timing_status',v_status,
    'requires_confirmation',v_status in ('early','late'),
    'difference_minutes',v_difference,
    'timezone',v_timezone,
    'server_now',v_now,
    'scheduled_start_at',v_start,
    'scheduled_end_at',v_end
  );
end $$;
alter function qarar_attendance.calculate_meeting_start_timing(date,time,time,text,timestamptz) owner to qarar_attendance_executor;
revoke all on function qarar_attendance.calculate_meeting_start_timing(date,time,time,text,timestamptz) from public,anon,authenticated,service_role;

create function qarar_attendance.get_meeting_session_start_timing_v2(p_meeting_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare
  v_m qarar_meetings.meetings%rowtype;
  v_timezone text;
  v_timing jsonb;
begin
  select * into v_m from qarar_meetings.meetings
  where id=p_meeting_id and organization_id=qarar_iam.current_organization_id();
  if v_m.id is null then raise exception using errcode='P0002',message='الاجتماع غير موجود.';end if;
  perform qarar_iam.assert_permission('attendance.manage',v_m.governance_unit_id);
  if v_m.status<>'ready_to_start' then
    raise exception using errcode='23514',message='الجلسة ليست جاهزة للبدء. حدّث بيانات الاجتماع ثم أعد المحاولة.';
  end if;
  select timezone into v_timezone from qarar_core.organizations where id=v_m.organization_id;
  v_timing:=qarar_attendance.calculate_meeting_start_timing(
    v_m.scheduled_date,v_m.start_time,v_m.end_time,v_timezone,clock_timestamp());
  return v_timing||jsonb_build_object(
    'meeting_id',v_m.id,'meeting_no',v_m.meeting_no,'title_ar',v_m.title_ar,
    'scheduled_date',v_m.scheduled_date,'start_time',v_m.start_time,'end_time',v_m.end_time,
    'can_confirm_off_schedule',qarar_iam.has_unit_role_code(v_m.governance_unit_id,array['council_chair'])
  );
end $$;
alter function qarar_attendance.get_meeting_session_start_timing_v2(uuid) owner to qarar_attendance_executor;
revoke all on function qarar_attendance.get_meeting_session_start_timing_v2(uuid) from public,anon,authenticated,service_role;
grant execute on function qarar_attendance.get_meeting_session_start_timing_v2(uuid) to qarar_api_executor;

drop function api_v1.open_meeting_session(uuid,timestamptz);
drop function qarar_attendance.open_meeting_session(uuid,timestamptz);

create function qarar_attendance.open_meeting_session(
  p_meeting_id uuid,
  p_expected_updated_at timestamptz,
  p_confirmed_off_schedule boolean default false
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
  v_m qarar_meetings.meetings%rowtype;
  v_count integer;
  v_timezone text;
  v_timing jsonb;
  v_opened_at timestamptz:=clock_timestamp();
  v_status text;
  v_difference integer;
begin
  select * into v_m from qarar_meetings.meetings
  where id=p_meeting_id and organization_id=qarar_iam.current_organization_id() for update;
  if v_m.id is null then raise exception using errcode='P0002',message='الاجتماع غير موجود.';end if;
  perform qarar_iam.assert_permission('attendance.manage',v_m.governance_unit_id);
  if v_m.status<>'ready_to_start' then
    raise exception using errcode='23514',message='الجلسة ليست جاهزة للبدء. حدّث بيانات الاجتماع ثم أعد المحاولة.';
  end if;
  if p_expected_updated_at is null or p_expected_updated_at<>v_m.updated_at then
    raise exception using errcode='40001',message='تم تحديث الاجتماع؛ حدّث بياناته ثم أعد المحاولة.';
  end if;
  select timezone into v_timezone from qarar_core.organizations where id=v_m.organization_id;
  v_timing:=qarar_attendance.calculate_meeting_start_timing(
    v_m.scheduled_date,v_m.start_time,v_m.end_time,v_timezone,v_opened_at);
  v_status:=v_timing->>'timing_status';
  v_difference:=coalesce((v_timing->>'difference_minutes')::integer,0);
  if coalesce((v_timing->>'requires_confirmation')::boolean,false) then
    if not coalesce(p_confirmed_off_schedule,false) then
      raise exception using errcode='P0001',message='بدء الجلسة خارج الموعد المحدد يحتاج تأكيد رئيس المجلس. راجع الموعد ثم أكد بدء الجلسة الآن.';
    end if;
    if not qarar_iam.has_unit_role_code(v_m.governance_unit_id,array['council_chair']) then
      raise exception using errcode='42501',message='تأكيد بدء الجلسة خارج الموعد متاح لرئيس المجلس فقط.';
    end if;
  end if;

  insert into qarar_attendance.attendance_records(
    organization_id,meeting_id,user_id,membership_id,attendance_status,verification_status,recorded_by_user_id)
  select v_m.organization_id,v_m.id,ms.user_id,ms.id,'pending','unclaimed',auth.uid()
  from qarar_iam.memberships ms join qarar_iam.users u on u.id=ms.user_id
  where ms.organization_id=v_m.organization_id and ms.governance_unit_id=v_m.governance_unit_id
    and ms.membership_status='active' and u.status='active'
  on conflict(meeting_id,user_id) do nothing;
  get diagnostics v_count=row_count;
  insert into qarar_attendance.attendance_history(
    organization_id,attendance_record_id,meeting_id,user_id,from_status,to_status,changed_by_user_id,remarks)
  select organization_id,id,meeting_id,user_id,null,'pending',auth.uid(),'session roster initialized'
  from qarar_attendance.attendance_records a where meeting_id=v_m.id
    and not exists(select 1 from qarar_attendance.attendance_history h where h.attendance_record_id=a.id);
  insert into qarar_attendance.attendance_events(
    organization_id,meeting_id,attendance_record_id,subject_user_id,actor_user_id,event_type,new_state,reason)
  select a.organization_id,a.meeting_id,a.id,a.user_id,auth.uid(),'roster_initialized',
    jsonb_build_object('attendance_status','pending','verification_status','unclaimed'),'session roster initialized'
  from qarar_attendance.attendance_records a where a.meeting_id=v_m.id
    and not exists(select 1 from qarar_attendance.attendance_events e
      where e.attendance_record_id=a.id and e.event_type='roster_initialized');

  insert into qarar_attendance.meeting_session_openings(
    organization_id,meeting_id,opened_by_user_id,opened_at,organization_timezone,
    scheduled_start_at,scheduled_end_at,timing_status,difference_minutes,confirmed_off_schedule)
  values(
    v_m.organization_id,v_m.id,auth.uid(),v_opened_at,v_timezone,
    (v_timing->>'scheduled_start_at')::timestamptz,(v_timing->>'scheduled_end_at')::timestamptz,
    v_status,v_difference,v_status in ('early','late'));

  update qarar_meetings.meetings set status='in_progress',attendance_locked_at=null,
    attendance_locked_by_user_id=null where id=v_m.id;
  insert into qarar_meetings.meeting_status_history(
    organization_id,meeting_id,from_status,to_status,changed_by_user_id,change_reason)
  values(v_m.organization_id,v_m.id,v_m.status,'in_progress',auth.uid(),case v_status
    when 'early' then 'بدء الجلسة مبكرًا بتأكيد رئيس المجلس؛ متبقٍ على الموعد '||v_difference||' دقيقة.'
    when 'late' then 'بدء الجلسة متأخرًا بتأكيد رئيس المجلس؛ مضى على نهاية الموعد '||v_difference||' دقيقة.'
    when 'schedule_unavailable' then 'فتح الجلسة لسجل قديم لا يحتوي وقت بداية ونهاية.'
    else 'فتح الجلسة ضمن الموعد المحدد.' end);
  perform qarar_attendance.recalculate_meeting_quorum(v_m.id,true);
  perform qarar_audit.append_audit_log(v_m.organization_id,'meetings.session.open','meetings',v_m.id,
    jsonb_build_object(
      'roster_count',v_count,'timing_status',v_status,'difference_minutes',v_difference,
      'confirmed_off_schedule',v_status in ('early','late'),'opened_at',v_opened_at,
      'organization_timezone',v_timezone,'scheduled_start_at',v_timing->>'scheduled_start_at',
      'scheduled_end_at',v_timing->>'scheduled_end_at'));
  return qarar_attendance.get_meeting_session_detail(v_m.id);
end $$;
alter function qarar_attendance.open_meeting_session(uuid,timestamptz,boolean) owner to qarar_attendance_executor;
revoke all on function qarar_attendance.open_meeting_session(uuid,timestamptz,boolean) from public,anon,authenticated,service_role;
grant execute on function qarar_attendance.open_meeting_session(uuid,timestamptz,boolean) to qarar_api_executor;

create function api_v1.get_meeting_session_start_timing_v2(p_meeting_id uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog
as $$select qarar_attendance.get_meeting_session_start_timing_v2($1)$$;
create function api_v1.open_meeting_session(
  p_meeting_id uuid,p_expected_updated_at timestamptz,p_confirmed_off_schedule boolean default false
) returns jsonb language sql volatile security definer set search_path=pg_catalog
as $$select qarar_attendance.open_meeting_session($1,$2,$3)$$;
alter function api_v1.get_meeting_session_start_timing_v2(uuid) owner to qarar_api_executor;
alter function api_v1.open_meeting_session(uuid,timestamptz,boolean) owner to qarar_api_executor;
revoke all on function api_v1.get_meeting_session_start_timing_v2(uuid) from public,anon,authenticated,service_role;
revoke all on function api_v1.open_meeting_session(uuid,timestamptz,boolean) from public,anon,authenticated,service_role;
grant execute on function api_v1.get_meeting_session_start_timing_v2(uuid) to authenticated,service_role;
grant execute on function api_v1.open_meeting_session(uuid,timestamptz,boolean) to authenticated,service_role;

create or replace function qarar_minutes.generate_meeting_minutes_draft(p_meeting_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  v_m qarar_meetings.meetings%rowtype;
  v_content text;
  v_result jsonb;
  v_assignments jsonb;
  v_opening qarar_attendance.meeting_session_openings%rowtype;
begin
  select * into v_m from qarar_meetings.meetings
  where id=p_meeting_id and organization_id=qarar_iam.current_organization_id();
  if v_m.id is null then raise exception 'الاجتماع غير موجود.' using errcode='P0002';end if;
  perform qarar_iam.assert_permission('meetings.manage',v_m.governance_unit_id);
  if v_m.status<>'waiting_for_minutes' then
    raise exception 'لا يمكن توليد مسودة المحضر قبل انتهاء الجلسة.' using errcode='23514';
  end if;
  select * into v_opening from qarar_attendance.meeting_session_openings
  where organization_id=v_m.organization_id and meeting_id=v_m.id;
  v_assignments:=qarar_meetings.minutes_assignment_lines(v_m.id,v_m.organization_id);
  v_content:=concat_ws(E'\n',
    'محضر '||v_m.title_ar,
    case when v_m.quorum_continuation is not null then 'تنبيه: انعقد الاجتماع واتُخذت قراراته بنصاب غير مكتمل. السبب: '||(v_m.quorum_continuation->>'reason') end,
    case v_opening.timing_status
      when 'early' then 'تنبيه: بدأت الجلسة مبكرًا بتأكيد رئيس المجلس، قبل الموعد بـ '||v_opening.difference_minutes||' دقيقة.'
      when 'late' then 'تنبيه: بدأت الجلسة متأخرًا بتأكيد رئيس المجلس، بعد نهاية الموعد بـ '||v_opening.difference_minutes||' دقيقة.'
    end,
    'رقم الاجتماع: '||v_m.meeting_no,
    'التاريخ: '||v_m.scheduled_date::text,
    'الوقت: '||v_m.start_time::text||' - '||v_m.end_time::text,
    'المكان: '||coalesce(v_m.location_details,v_m.location_type),
    '',
    'الحضور:',
    coalesce((select string_agg('- '||u.full_name_ar||' ('||ar.attendance_status||')',E'\n' order by u.full_name_ar)
      from qarar_attendance.attendance_records ar join qarar_iam.users u on u.id=ar.user_id
      where ar.meeting_id=v_m.id and ar.attendance_status in ('present','late','remote')),'- لا يوجد حضور موثق.'),
    '',
    'جدول الأعمال والقرارات:',
    coalesce((select string_agg(
      ai.agenda_order::text||'. '||t.title_ar||E'\n'||coalesce(nullif(ai.discussion_notes,''),'لم يسجل ملخص للمناقشة.')||
      coalesce(E'\nالقرار '||d.decision_no||': '||d.decision_text,'')||
      coalesce((select string_agg(E'\n- تكليف: '||(line->>'title_ar')||'. المكلَّف: '||coalesce(line->>'assignee_ar','غير محدد')||
        '. المتابع: '||coalesce(line->>'follow_up_ar','غير محدد')||case when line->>'due_date' is null then '. بلا موعد إنجاز محدد'
        else '. المدة: '||(line->>'duration_days')||' يوماً، حتى '||(line->>'due_date') end||
        case when (line->>'requires_evidence')::boolean then '. يتطلب أدلة إنجاز' else '' end||
        coalesce(' ('||(line->>'action_no')||')','')||'.','' order by ord)
        from jsonb_array_elements(v_assignments) with ordinality as lines(line,ord)
        where line->>'agenda_item_id'=ai.id::text),''),E'\n\n' order by ai.agenda_order)
      from qarar_meetings.agenda_items ai join qarar_topics.topics t on t.id=ai.topic_id
      left join qarar_decisions.decisions d on d.agenda_item_id=ai.id where ai.meeting_id=v_m.id),'- لا توجد بنود موثقة.')
  );
  v_result:=qarar_minutes.save_meeting_minutes_draft(v_m.id,v_content,null);
  update qarar_minutes.meeting_minutes set status='generated',generated_by_ai=false,generated_at=clock_timestamp()
  where id=(v_result->>'id')::uuid;
  return v_result||jsonb_build_object('status','generated','content_draft',v_content);
end $$;
alter function qarar_minutes.generate_meeting_minutes_draft(uuid) owner to qarar_minutes_executor;

insert into qarar_architecture.function_registry(function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate)
select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),'attendance',n.nspname,false
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='qarar_attendance' and p.proname in('calculate_meeting_start_timing','get_meeting_session_start_timing_v2','open_meeting_session')
on conflict(function_name,identity_arguments) do update set
  function_oid=excluded.function_oid,module_code=excluded.module_code,owning_schema=excluded.owning_schema;

delete from qarar_architecture.api_contract_registry
where api_version='v1' and contract_name='open_meeting_session';
insert into qarar_architecture.api_contract_registry(
  api_version,contract_name,implementation_schema,implementation_name,identity_arguments,module_code,audience)
select 'v1',p.proname,'qarar_attendance',p.proname,pg_get_function_identity_arguments(p.oid),'attendance','authenticated'
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='api_v1' and p.proname in('get_meeting_session_start_timing_v2','open_meeting_session')
on conflict(api_version,contract_name,identity_arguments) do update set
  implementation_schema=excluded.implementation_schema,implementation_name=excluded.implementation_name,
  module_code=excluded.module_code,audience=excluded.audience;

update qarar_architecture.api_release_registry r set
  contract_count=(select count(*) from qarar_architecture.api_contract_registry where api_version='v1'),
  contract_hash=(select md5(string_agg(p.proname||'|'||pg_get_function_identity_arguments(p.oid)||'|'||pg_get_function_result(p.oid)||'|'||c.audience,E'\n'
    order by p.proname,pg_get_function_identity_arguments(p.oid)))
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace and n.nspname='api_v1'
    join qarar_architecture.api_contract_registry c on c.api_version='v1' and c.contract_name=p.proname
      and c.identity_arguments=pg_get_function_identity_arguments(p.oid)),
  released_at=clock_timestamp(),notes='Meeting starts outside the planned window require an explicit contextual chair confirmation.'
where r.api_version='v1';

notify pgrst,'reload schema';
commit;
