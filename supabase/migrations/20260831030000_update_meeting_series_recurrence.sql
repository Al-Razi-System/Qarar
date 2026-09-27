begin;

create or replace function qarar_meetings.update_meeting_series_recurrence(
  p_series_id uuid,
  p_anchor_meeting_id uuid,
  p_frequency text,
  p_interval_count integer,
  p_anchor_date date
) returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_org uuid := qarar_iam.current_organization_id();
  v_series qarar_meetings.meeting_series%rowtype;
  v_anchor_number integer;
  v_occurrence record;
  v_date date;
  v_changed integer := 0;
begin
  select * into v_series
  from qarar_meetings.meeting_series
  where id = p_series_id and organization_id = v_org
  for update;
  if v_series.id is null then raise exception 'سلسلة الاجتماعات غير موجودة'; end if;
  perform qarar_iam.assert_permission('meetings.manage', v_series.governance_unit_id);

  if p_frequency not in ('weekly','monthly','quarterly','semiannual','annual','custom') then
    raise exception 'نوع تكرار الاجتماع غير صالح' using errcode='22023';
  end if;
  if p_interval_count not between 1 and 365 then
    raise exception 'فاصل التكرار غير صالح' using errcode='22023';
  end if;

  select o.occurrence_number into v_anchor_number
  from qarar_meetings.meeting_series_occurrences o
  join qarar_meetings.meetings m on m.id = o.meeting_id
  where o.series_id = p_series_id and o.meeting_id = p_anchor_meeting_id
    and o.organization_id = v_org and m.status in ('draft','scheduled');
  if v_anchor_number is null then
    raise exception 'لا يمكن تعديل دورة اجتماع بدأ أو اكتمل';
  end if;

  update qarar_meetings.meeting_series
  set frequency = p_frequency,
      interval_count = case when p_frequency = 'custom' then p_interval_count else 1 end,
      starts_on = case when v_anchor_number = 1 then p_anchor_date else starts_on end
  where id = p_series_id;

  for v_occurrence in
    select o.meeting_id, o.occurrence_number
    from qarar_meetings.meeting_series_occurrences o
    join qarar_meetings.meetings m on m.id = o.meeting_id
    where o.series_id = p_series_id
      and o.occurrence_number >= v_anchor_number
      and m.status in ('draft','scheduled')
    order by o.occurrence_number
  loop
    v_date := case p_frequency
      when 'weekly' then p_anchor_date + ((v_occurrence.occurrence_number - v_anchor_number) * 7)
      when 'monthly' then (p_anchor_date + ((v_occurrence.occurrence_number - v_anchor_number) || ' months')::interval)::date
      when 'quarterly' then (p_anchor_date + ((v_occurrence.occurrence_number - v_anchor_number) * 3 || ' months')::interval)::date
      when 'semiannual' then (p_anchor_date + ((v_occurrence.occurrence_number - v_anchor_number) * 6 || ' months')::interval)::date
      when 'annual' then (p_anchor_date + ((v_occurrence.occurrence_number - v_anchor_number) * 12 || ' months')::interval)::date
      else p_anchor_date + ((v_occurrence.occurrence_number - v_anchor_number) * p_interval_count)
    end;
    update qarar_meetings.meeting_series_occurrences set scheduled_date = v_date
      where series_id = p_series_id and meeting_id = v_occurrence.meeting_id;
    update qarar_meetings.meetings set scheduled_date = v_date
      where id = v_occurrence.meeting_id;
    v_changed := v_changed + 1;
  end loop;

  return jsonb_build_object('id', p_series_id, 'frequency', p_frequency, 'updated_occurrences', v_changed);
end;
$function$;

alter function qarar_meetings.update_meeting_series_recurrence(uuid,uuid,text,integer,date) owner to qarar_meetings_executor;
revoke all on function qarar_meetings.update_meeting_series_recurrence(uuid,uuid,text,integer,date) from public,anon,authenticated,service_role;
grant execute on function qarar_meetings.update_meeting_series_recurrence(uuid,uuid,text,integer,date) to qarar_api_executor,qarar_meetings_executor;

create or replace function api_v1.update_meeting_series_recurrence(
  p_series_id uuid,p_anchor_meeting_id uuid,p_frequency text,p_interval_count integer,p_anchor_date date
) returns jsonb language sql volatile security definer set search_path='pg_catalog'
as $function$ select qarar_meetings.update_meeting_series_recurrence($1,$2,$3,$4,$5) $function$;
alter function api_v1.update_meeting_series_recurrence(uuid,uuid,text,integer,date) owner to qarar_api_executor;
revoke all on function api_v1.update_meeting_series_recurrence(uuid,uuid,text,integer,date) from public,anon,authenticated,service_role;
grant execute on function api_v1.update_meeting_series_recurrence(uuid,uuid,text,integer,date) to authenticated,service_role;

insert into qarar_architecture.function_registry(function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate)
select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),'meetings','qarar_meetings',false
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='qarar_meetings' and p.proname='update_meeting_series_recurrence'
on conflict (function_name,identity_arguments) do update set function_oid=excluded.function_oid,module_code=excluded.module_code,owning_schema=excluded.owning_schema;

insert into qarar_architecture.api_contract_registry(api_version,contract_name,implementation_schema,implementation_name,identity_arguments,module_code,audience)
values ('v1','update_meeting_series_recurrence','qarar_meetings','update_meeting_series_recurrence','p_series_id uuid, p_anchor_meeting_id uuid, p_frequency text, p_interval_count integer, p_anchor_date date','meetings','authenticated')
on conflict (api_version,contract_name,identity_arguments) do update set implementation_schema=excluded.implementation_schema,implementation_name=excluded.implementation_name,module_code=excluded.module_code,audience=excluded.audience,deprecated_at=null,replacement_contract=null;

update qarar_architecture.api_release_registry release
set contract_count=(select count(*) from qarar_architecture.api_contract_registry where api_version=release.api_version),
    contract_hash=(select md5(string_agg(p.proname||'|'||pg_get_function_identity_arguments(p.oid)||'|'||pg_get_function_result(p.oid)||'|'||r.audience,E'\n' order by p.proname,pg_get_function_identity_arguments(p.oid))) from pg_proc p join pg_namespace n on n.oid=p.pronamespace and n.nspname='api_v1' join qarar_architecture.api_contract_registry r on r.api_version=release.api_version and r.contract_name=p.proname and r.identity_arguments=pg_get_function_identity_arguments(p.oid)),
    released_at=clock_timestamp(), notes='Recurring meeting series can be rescheduled from any editable occurrence.'
where release.api_version='v1';

notify pgrst,'reload schema';
commit;
