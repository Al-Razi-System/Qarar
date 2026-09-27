begin;

alter table qarar_meetings.meeting_series
  drop constraint if exists meeting_series_frequency_check;
alter table qarar_meetings.meeting_series
  add constraint meeting_series_frequency_check
  check (frequency in ('weekly','monthly','quarterly','semiannual','annual','custom'));

alter table qarar_meetings.meeting_series
  drop constraint if exists meeting_series_interval_count_check;
alter table qarar_meetings.meeting_series
  add constraint meeting_series_interval_count_check
  check (interval_count between 1 and 365);

alter table qarar_meetings.meeting_series
  drop constraint if exists meeting_series_occurrence_count_check;
alter table qarar_meetings.meeting_series
  add constraint meeting_series_occurrence_count_check
  check (occurrence_count between 2 and 36);

create or replace function qarar_meetings.create_meeting_series(
  p_governance_unit_id uuid, p_meeting_type_id uuid, p_title_ar text,
  p_first_date date, p_start_time time, p_end_time time,
  p_location_type text, p_location_details text,
  p_frequency text, p_interval_count integer, p_occurrence_count integer
) returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
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
    organization_id, governance_unit_id, meeting_type_id, title_ar, frequency,
    interval_count, occurrence_count, starts_on, created_by_user_id
  ) values (
    v_org, p_governance_unit_id, p_meeting_type_id, btrim(p_title_ar), p_frequency,
    case when p_frequency='custom' then p_interval_count else 1 end,
    p_occurrence_count, p_first_date, auth.uid()
  ) returning id into v_series_id;

  for v_index in 1..p_occurrence_count loop
    v_date := case p_frequency
      when 'weekly' then p_first_date + ((v_index - 1) * 7)
      when 'monthly' then (p_first_date + ((v_index - 1) || ' months')::interval)::date
      when 'quarterly' then (p_first_date + ((v_index - 1) * 3 || ' months')::interval)::date
      when 'semiannual' then (p_first_date + ((v_index - 1) * 6 || ' months')::interval)::date
      when 'annual' then (p_first_date + ((v_index - 1) * 12 || ' months')::interval)::date
      else p_first_date + ((v_index - 1) * p_interval_count)
    end;
    v_created := qarar_meetings.create_meeting(
      p_governance_unit_id, p_meeting_type_id,
      format('%s — الاجتماع %s', btrim(p_title_ar), v_index), v_date,
      p_start_time, p_end_time, p_location_type, p_location_details, null,
      gen_random_uuid()
    );
    insert into qarar_meetings.meeting_series_occurrences(
      organization_id, series_id, meeting_id, occurrence_number, scheduled_date
    ) values (v_org, v_series_id, (v_created->>'id')::uuid, v_index, v_date);
    v_items := v_items || jsonb_build_array(v_created || jsonb_build_object(
      'occurrence_number', v_index, 'scheduled_date', v_date
    ));
  end loop;
  return jsonb_build_object('id',v_series_id,'frequency',p_frequency,'occurrences',v_items);
end;
$function$;

alter function qarar_meetings.create_meeting_series(uuid,uuid,text,date,time,time,text,text,text,integer,integer)
  owner to qarar_meetings_executor;
revoke all on function qarar_meetings.create_meeting_series(uuid,uuid,text,date,time,time,text,text,text,integer,integer)
  from public,anon,authenticated,service_role;
grant execute on function qarar_meetings.create_meeting_series(uuid,uuid,text,date,time,time,text,text,text,integer,integer)
  to qarar_api_executor,qarar_meetings_executor;

notify pgrst,'reload schema';
commit;
