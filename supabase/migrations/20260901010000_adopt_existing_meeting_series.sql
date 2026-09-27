begin;

create or replace function qarar_meetings.create_meeting_series_from_existing(
  p_meeting_id uuid,
  p_frequency text,
  p_interval_count integer,
  p_occurrence_count integer
) returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_org uuid := qarar_iam.current_organization_id();
  v_meeting qarar_meetings.meetings%rowtype;
  v_series_id uuid;
  v_index integer;
  v_date date;
  v_created jsonb;
  v_items jsonb := '[]'::jsonb;
begin
  select * into v_meeting from qarar_meetings.meetings
  where id=p_meeting_id and organization_id=v_org for update;
  if v_meeting.id is null then raise exception 'الاجتماع غير موجود'; end if;
  perform qarar_iam.assert_permission('meetings.manage',v_meeting.governance_unit_id);
  if v_meeting.status not in ('draft','scheduled') then
    raise exception 'لا يمكن تحويل اجتماع بدأ أو اكتمل إلى سلسلة دورية';
  end if;
  if exists(select 1 from qarar_meetings.meeting_series_occurrences where meeting_id=p_meeting_id) then
    raise exception 'الاجتماع مرتبط بسلسلة دورية بالفعل';
  end if;
  if p_frequency not in ('weekly','monthly','quarterly','semiannual','annual','custom') then
    raise exception 'نوع تكرار الاجتماع غير صالح' using errcode='22023';
  end if;
  if p_interval_count not between 1 and 365 then
    raise exception 'فاصل التكرار غير صالح' using errcode='22023';
  end if;
  if p_occurrence_count not between 2 and 36 then
    raise exception 'عدد الاجتماعات الدورية يجب أن يكون بين 2 و36' using errcode='22023';
  end if;

  insert into qarar_meetings.meeting_series(
    organization_id,governance_unit_id,meeting_type_id,title_ar,frequency,
    interval_count,occurrence_count,starts_on,created_by_user_id
  ) values (
    v_org,v_meeting.governance_unit_id,v_meeting.meeting_type_id,v_meeting.title_ar,p_frequency,
    case when p_frequency='custom' then p_interval_count else 1 end,
    p_occurrence_count,v_meeting.scheduled_date,auth.uid()
  ) returning id into v_series_id;

  insert into qarar_meetings.meeting_series_occurrences(
    organization_id,series_id,meeting_id,occurrence_number,scheduled_date
  ) values(v_org,v_series_id,v_meeting.id,1,v_meeting.scheduled_date);
  v_items := jsonb_build_array(jsonb_build_object(
    'id',v_meeting.id,'meeting_no',v_meeting.meeting_no,
    'occurrence_number',1,'scheduled_date',v_meeting.scheduled_date
  ));

  for v_index in 2..p_occurrence_count loop
    v_date := case p_frequency
      when 'weekly' then v_meeting.scheduled_date + ((v_index - 1) * 7)
      when 'monthly' then (v_meeting.scheduled_date + ((v_index - 1) || ' months')::interval)::date
      when 'quarterly' then (v_meeting.scheduled_date + ((v_index - 1) * 3 || ' months')::interval)::date
      when 'semiannual' then (v_meeting.scheduled_date + ((v_index - 1) * 6 || ' months')::interval)::date
      when 'annual' then (v_meeting.scheduled_date + ((v_index - 1) * 12 || ' months')::interval)::date
      else v_meeting.scheduled_date + ((v_index - 1) * p_interval_count)
    end;
    v_created := qarar_meetings.create_meeting(
      v_meeting.governance_unit_id,v_meeting.meeting_type_id,
      format('%s — الاجتماع %s',v_meeting.title_ar,v_index),v_date,
      v_meeting.start_time,v_meeting.end_time,v_meeting.location_type,
      v_meeting.location_details,v_meeting.title_en,gen_random_uuid()
    );
    insert into qarar_meetings.meeting_series_occurrences(
      organization_id,series_id,meeting_id,occurrence_number,scheduled_date
    ) values(v_org,v_series_id,(v_created->>'id')::uuid,v_index,v_date);
    v_items := v_items || jsonb_build_array(v_created || jsonb_build_object(
      'occurrence_number',v_index,'scheduled_date',v_date
    ));
  end loop;
  return jsonb_build_object('id',v_series_id,'frequency',p_frequency,'occurrences',v_items);
end;
$function$;

alter function qarar_meetings.create_meeting_series_from_existing(uuid,text,integer,integer) owner to qarar_meetings_executor;
revoke all on function qarar_meetings.create_meeting_series_from_existing(uuid,text,integer,integer) from public,anon,authenticated,service_role;
grant execute on function qarar_meetings.create_meeting_series_from_existing(uuid,text,integer,integer) to qarar_api_executor,qarar_meetings_executor;

create or replace function api_v1.create_meeting_series_from_existing(
  p_meeting_id uuid,p_frequency text,p_interval_count integer,p_occurrence_count integer
) returns jsonb language sql volatile security definer set search_path='pg_catalog'
as $function$ select qarar_meetings.create_meeting_series_from_existing($1,$2,$3,$4) $function$;
alter function api_v1.create_meeting_series_from_existing(uuid,text,integer,integer) owner to qarar_api_executor;
revoke all on function api_v1.create_meeting_series_from_existing(uuid,text,integer,integer) from public,anon,authenticated,service_role;
grant execute on function api_v1.create_meeting_series_from_existing(uuid,text,integer,integer) to authenticated,service_role;

insert into qarar_architecture.function_registry(function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate)
select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),'meetings','qarar_meetings',false
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='qarar_meetings' and p.proname='create_meeting_series_from_existing'
on conflict (function_name,identity_arguments) do update set function_oid=excluded.function_oid,module_code=excluded.module_code,owning_schema=excluded.owning_schema;

insert into qarar_architecture.api_contract_registry(api_version,contract_name,implementation_schema,implementation_name,identity_arguments,module_code,audience)
values ('v1','create_meeting_series_from_existing','qarar_meetings','create_meeting_series_from_existing','p_meeting_id uuid, p_frequency text, p_interval_count integer, p_occurrence_count integer','meetings','authenticated')
on conflict (api_version,contract_name,identity_arguments) do update set implementation_schema=excluded.implementation_schema,implementation_name=excluded.implementation_name,module_code=excluded.module_code,audience=excluded.audience,deprecated_at=null,replacement_contract=null;

update qarar_architecture.api_release_registry release
set contract_count=(select count(*) from qarar_architecture.api_contract_registry where api_version=release.api_version),
    contract_hash=(select md5(string_agg(p.proname||'|'||pg_get_function_identity_arguments(p.oid)||'|'||pg_get_function_result(p.oid)||'|'||r.audience,E'\n' order by p.proname,pg_get_function_identity_arguments(p.oid))) from pg_proc p join pg_namespace n on n.oid=p.pronamespace and n.nspname='api_v1' join qarar_architecture.api_contract_registry r on r.api_version=release.api_version and r.contract_name=p.proname and r.identity_arguments=pg_get_function_identity_arguments(p.oid)),
    released_at=clock_timestamp(),notes='Legacy recurring meetings can be adopted as governed meeting series without duplicating the anchor meeting.'
where release.api_version='v1';

notify pgrst,'reload schema';
commit;
