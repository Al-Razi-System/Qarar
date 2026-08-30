begin;

create table qarar_meetings.meeting_series (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  governance_unit_id uuid not null,
  meeting_type_id uuid not null,
  title_ar text not null,
  frequency text not null check (frequency in ('weekly','monthly')),
  interval_count integer not null default 1 check (interval_count between 1 and 12),
  occurrence_count integer not null check (occurrence_count between 2 and 24),
  starts_on date not null,
  created_by_user_id uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  constraint meeting_series_org_id_unique unique (organization_id, id)
);

create table qarar_meetings.meeting_series_occurrences (
  organization_id uuid not null,
  series_id uuid not null,
  meeting_id uuid not null,
  occurrence_number integer not null check (occurrence_number > 0),
  scheduled_date date not null,
  primary key (series_id, occurrence_number),
  unique (meeting_id),
  foreign key (organization_id, series_id) references qarar_meetings.meeting_series(organization_id, id),
  foreign key (meeting_id) references qarar_meetings.meetings(id)
);

alter table qarar_meetings.meeting_series enable row level security;
alter table qarar_meetings.meeting_series_occurrences enable row level security;
revoke all on qarar_meetings.meeting_series, qarar_meetings.meeting_series_occurrences from public, anon, authenticated, service_role;
grant select, insert, update on qarar_meetings.meeting_series, qarar_meetings.meeting_series_occurrences to qarar_meetings_executor;

create or replace function qarar_meetings.create_meeting_series(
  p_governance_unit_id uuid, p_meeting_type_id uuid, p_title_ar text,
  p_first_date date, p_start_time time, p_end_time time,
  p_location_type text, p_location_details text,
  p_frequency text, p_interval_count integer, p_occurrence_count integer
) returns jsonb language plpgsql security definer set search_path to 'pg_catalog'
as $function$
declare
  v_org uuid := qarar_iam.current_organization_id();
  v_series_id uuid;
  v_index integer;
  v_date date;
  v_created jsonb;
  v_items jsonb := '[]'::jsonb;
begin
  perform qarar_iam.assert_permission('meetings.create', p_governance_unit_id);
  if p_frequency not in ('weekly','monthly') then raise exception 'invalid_series_frequency' using errcode='22023'; end if;
  if p_interval_count not between 1 and 12 then raise exception 'invalid_series_interval' using errcode='22023'; end if;
  if p_occurrence_count not between 2 and 12 then raise exception 'invalid_occurrence_count' using errcode='22023'; end if;

  insert into qarar_meetings.meeting_series(
    organization_id, governance_unit_id, meeting_type_id, title_ar, frequency,
    interval_count, occurrence_count, starts_on, created_by_user_id
  ) values (v_org, p_governance_unit_id, p_meeting_type_id, btrim(p_title_ar), p_frequency,
    p_interval_count, p_occurrence_count, p_first_date, auth.uid()) returning id into v_series_id;

  for v_index in 1..p_occurrence_count loop
    v_date := case when p_frequency = 'weekly'
      then p_first_date + ((v_index - 1) * p_interval_count * 7)
      else (p_first_date + ((v_index - 1) * p_interval_count || ' months')::interval)::date end;
    v_created := qarar_meetings.create_meeting(
      p_governance_unit_id, p_meeting_type_id,
      format('%s — الاجتماع %s', btrim(p_title_ar), v_index), v_date,
      p_start_time, p_end_time, p_location_type, p_location_details, null,
      gen_random_uuid()
    );
    insert into qarar_meetings.meeting_series_occurrences(
      organization_id, series_id, meeting_id, occurrence_number, scheduled_date
    ) values (v_org, v_series_id, (v_created->>'id')::uuid, v_index, v_date);
    v_items := v_items || jsonb_build_array(v_created || jsonb_build_object('occurrence_number',v_index,'scheduled_date',v_date));
  end loop;
  return jsonb_build_object('id',v_series_id,'occurrences',v_items);
end;
$function$;

create or replace function qarar_meetings.list_meeting_series()
returns jsonb language sql stable security definer set search_path to 'pg_catalog'
as $function$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', s.id, 'title_ar', s.title_ar, 'frequency', s.frequency,
    'interval_count', s.interval_count, 'occurrence_count', s.occurrence_count,
    'starts_on', s.starts_on, 'governance_unit_id', s.governance_unit_id,
    'occurrences', coalesce((select jsonb_agg(jsonb_build_object(
      'meeting_id', o.meeting_id, 'occurrence_number', o.occurrence_number,
      'scheduled_date', o.scheduled_date, 'meeting_no', m.meeting_no, 'status', m.status,
      'title_ar', m.title_ar
    ) order by o.occurrence_number) from qarar_meetings.meeting_series_occurrences o
      join qarar_meetings.meetings m on m.id=o.meeting_id where o.series_id=s.id), '[]'::jsonb)
  ) order by s.created_at desc), '[]'::jsonb)
  from qarar_meetings.meeting_series s
  where s.organization_id = qarar_iam.current_organization_id()
    and (s.created_by_user_id = auth.uid() or qarar_iam.is_system_admin()
      or qarar_iam.has_permission('meetings.read',s.governance_unit_id)
      or qarar_iam.has_permission('meetings.manage',s.governance_unit_id));
$function$;

alter function qarar_meetings.create_meeting_series(uuid,uuid,text,date,time,time,text,text,text,integer,integer) owner to qarar_meetings_executor;
alter function qarar_meetings.list_meeting_series() owner to qarar_meetings_executor;
revoke all on function qarar_meetings.create_meeting_series(uuid,uuid,text,date,time,time,text,text,text,integer,integer), qarar_meetings.list_meeting_series() from public,anon,authenticated,service_role;
grant execute on function qarar_meetings.create_meeting_series(uuid,uuid,text,date,time,time,text,text,text,integer,integer), qarar_meetings.list_meeting_series() to qarar_api_executor, qarar_meetings_executor;

insert into qarar_architecture.function_registry(function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate)
select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),'meetings','qarar_meetings',false from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='qarar_meetings' and p.proname in ('create_meeting_series','list_meeting_series') on conflict (function_name,identity_arguments) do update set function_oid=excluded.function_oid,module_code=excluded.module_code,owning_schema=excluded.owning_schema;

insert into qarar_architecture.api_contract_registry(api_version,contract_name,implementation_schema,implementation_name,identity_arguments,module_code,audience) values
('v1','create_meeting_series','qarar_meetings','create_meeting_series','p_governance_unit_id uuid, p_meeting_type_id uuid, p_title_ar text, p_first_date date, p_start_time time without time zone, p_end_time time without time zone, p_location_type text, p_location_details text, p_frequency text, p_interval_count integer, p_occurrence_count integer','meetings','authenticated'),
('v1','list_meeting_series','qarar_meetings','list_meeting_series','','meetings','authenticated')
on conflict (api_version,contract_name,identity_arguments) do update set implementation_schema=excluded.implementation_schema,implementation_name=excluded.implementation_name,module_code=excluded.module_code,audience=excluded.audience,deprecated_at=null,replacement_contract=null;

create or replace function api_v1.create_meeting_series(p_governance_unit_id uuid,p_meeting_type_id uuid,p_title_ar text,p_first_date date,p_start_time time,p_end_time time,p_location_type text,p_location_details text,p_frequency text,p_interval_count integer,p_occurrence_count integer) returns jsonb language sql volatile security definer set search_path='pg_catalog' as $function$ select qarar_meetings.create_meeting_series($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) $function$;
create or replace function api_v1.list_meeting_series() returns jsonb language sql stable security definer set search_path='pg_catalog' as $function$ select qarar_meetings.list_meeting_series() $function$;
alter function api_v1.create_meeting_series(uuid,uuid,text,date,time,time,text,text,text,integer,integer) owner to qarar_api_executor;
alter function api_v1.list_meeting_series() owner to qarar_api_executor;
revoke all on function api_v1.create_meeting_series(uuid,uuid,text,date,time,time,text,text,text,integer,integer),api_v1.list_meeting_series() from public,anon,authenticated,service_role;
grant execute on function api_v1.create_meeting_series(uuid,uuid,text,date,time,time,text,text,text,integer,integer),api_v1.list_meeting_series() to authenticated,service_role;

update qarar_architecture.api_release_registry release set contract_count=(select count(*) from qarar_architecture.api_contract_registry where api_version=release.api_version), contract_hash=(select md5(string_agg(p.proname||'|'||pg_get_function_identity_arguments(p.oid)||'|'||pg_get_function_result(p.oid)||'|'||r.audience,E'\n' order by p.proname,pg_get_function_identity_arguments(p.oid))) from pg_proc p join pg_namespace n on n.oid=p.pronamespace and n.nspname='api_v1' join qarar_architecture.api_contract_registry r on r.api_version=release.api_version and r.contract_name=p.proname and r.identity_arguments=pg_get_function_identity_arguments(p.oid)),released_at=clock_timestamp(),notes='Meeting series support weekly and monthly governed occurrence generation.' where release.api_version='v1';
notify pgrst,'reload schema';
commit;
