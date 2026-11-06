-- Every verified attendee certifies the minutes, including councils created
-- after the original all-present repair.
-- Impact: docs/engineering/impact/ALL_PRESENT_MINUTES_APPROVAL_20261020_AR.md
begin;

alter table qarar_core.governance_units
  alter column minute_approval_rule set default 'all_present_members';

do $$
declare
  v_unit record;
begin
  for v_unit in
    update qarar_core.governance_units
    set minute_approval_rule='all_present_members', updated_at=clock_timestamp()
    where minute_approval_rule <> 'all_present_members'
    returning id,organization_id
  loop
    perform qarar_audit.append_audit_log(v_unit.organization_id,'minutes.approval_rule.repair','governance_units',v_unit.id,
      jsonb_build_object('from','chair_and_rapporteur','to','all_present_members','reason','all verified attendees certify minutes'));
  end loop;
end;
$$;

-- Preserve the latest lifecycle implementation and narrow its attendee source
-- to verified attendance while including remote attendance.
do $$
declare
  v_definition text;
  v_before text := 'where a.meeting_id=v_m.id and a.attendance_status in(''present'',''late'')';
  v_after text := 'where a.meeting_id=v_m.id and a.attendance_status in(''present'',''late'',''remote'') and a.verification_status=''verified''';
begin
  select pg_get_functiondef('qarar_minutes.submit_meeting_minutes(uuid,text,timestamp with time zone)'::regprocedure)
  into v_definition;
  if strpos(v_definition,v_before)=0 then
    raise exception 'submit_meeting_minutes attendee selector changed; review the all-present patch.';
  end if;
  execute replace(v_definition,v_before,v_after);
end;
$$;

-- Repair only missing requests for minutes already sent. Existing approvals,
-- signatures and timestamps are left untouched.
do $$
declare
  v_minute record;
  v_added integer;
begin
  for v_minute in
    select mm.id,mm.organization_id
    from qarar_minutes.meeting_minutes mm
    join qarar_meetings.meetings m on m.id=mm.meeting_id and m.organization_id=mm.organization_id
    where mm.status='ready_for_approval' and m.status='waiting_for_approval'
  loop
    insert into qarar_minutes.minute_approvals(organization_id,minute_id,user_id,membership_id)
    select v_minute.organization_id,v_minute.id,a.user_id,a.membership_id
    from qarar_minutes.meeting_minutes mm
    join qarar_attendance.attendance_records a on a.meeting_id=mm.meeting_id and a.organization_id=mm.organization_id
    where mm.id=v_minute.id
      and a.attendance_status in ('present','late','remote')
      and a.verification_status='verified'
    on conflict(minute_id,user_id) do nothing;
    get diagnostics v_added=row_count;
    if v_added>0 then
      perform qarar_audit.append_audit_log(v_minute.organization_id,'minutes.approvals.repair','meeting_minutes',v_minute.id,
        jsonb_build_object('added_requests',v_added,'reason','missing verified attendees'));
    end if;
  end loop;
end;
$$;

notify pgrst, 'reload schema';
commit;
