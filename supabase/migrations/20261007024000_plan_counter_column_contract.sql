begin;
create or replace function qarar_meetings.create_council_plan_first_draft()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare v_id uuid;v_number bigint;v_reference text;v_name text;v_year integer;
begin
 perform qarar_iam.assert_permission('governance.units.manage',null);
 if new.organization_id is distinct from qarar_iam.current_organization_id()
    or new.created_by_user_id is distinct from auth.uid() then
  raise exception using errcode='42501',message='لا يمكن إنشاء اجتماع لخطة خارج سياقك';
 end if;
 select name_ar into v_name from qarar_core.governance_units
  where id=new.governance_unit_id and organization_id=new.organization_id;
 v_year:=extract(year from new.first_meeting_date)::integer;
 insert into qarar_meetings.meeting_number_counters(organization_id,calendar_year,last_value)
 values(new.organization_id,v_year,1)
 on conflict(organization_id,calendar_year) do update
  set last_value=qarar_meetings.meeting_number_counters.last_value+1,updated_at=clock_timestamp()
 returning last_value into v_number;
 v_reference:='MTG-'||v_year::text||'-'||lpad(v_number::text,6,'0');
 insert into qarar_meetings.meetings(organization_id,meeting_no,governance_unit_id,meeting_type_id,
  title_ar,scheduled_date,start_time,end_time,status,created_by_user_id,source_plan_id)
 values(new.organization_id,v_reference,new.governance_unit_id,new.meeting_type_id,
  'اجتماع '||v_name,new.first_meeting_date,null,null,'draft',new.created_by_user_id,new.id)
 returning id into v_id;
 insert into qarar_meetings.meeting_status_history(organization_id,meeting_id,from_status,to_status,
  changed_by_user_id,change_reason)
 values(new.organization_id,v_id,null,'draft',new.created_by_user_id,'created from council meeting plan');
 perform qarar_audit.append_audit_log(new.organization_id,'meeting.plan.first_draft.created','meetings',v_id,
  jsonb_build_object('meeting_no',v_reference,'source_plan_id',new.id,'governance_unit_id',new.governance_unit_id));
 return new;
end $$;
alter function qarar_meetings.create_council_plan_first_draft() owner to qarar_meetings_executor;
revoke all on function qarar_meetings.create_council_plan_first_draft() from public,anon,authenticated,service_role;
commit;
