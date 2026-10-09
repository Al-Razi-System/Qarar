-- DEVELOPMENT ONLY. Run in qarar-dev-supabase-db, never as demo seeding.
begin;
select set_config('request.jwt.claim.sub','cbc2ce76-c112-4048-9ede-7d7f219758eb',true);
select set_config('request.jwt.claims','{"sub":"cbc2ce76-c112-4048-9ede-7d7f219758eb","role":"authenticated"}',true);
do $$
declare u record;p qarar_meetings.council_meeting_plans_v2%rowtype;v_id uuid;v_no bigint;v_ref text;v_name text;
begin
 if not exists(select 1 from qarar_iam.users where id=auth.uid() and is_system_admin and status='active'
  and organization_id='00000000-0000-0000-0000-000000000001') then
  raise exception 'Development repair actor unavailable';end if;
 for u in select id,updated_at from qarar_core.governance_units
  where organization_id='00000000-0000-0000-0000-000000000001' and status='active'
  and id in('10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000011','10000000-0000-0000-0000-000000000012')
 loop
  if not (api_v1.admin_validate_council_administrative_readiness(u.id)->>'administratively_ready')::boolean then
   perform api_v1.admin_deactivate_council(u.id,'تصحيح حالة مجلس تجريبي لم يجتز بوابة الجاهزية',u.updated_at);
  end if;
 end loop;
 update qarar_core.governance_units set governance_class_id=null
  where id='426ce517-2718-48c0-8e8f-72013b950fa9'
  and organization_id='00000000-0000-0000-0000-000000000001' and governance_class_id is null;
 if found then
  perform qarar_audit.append_audit_log('00000000-0000-0000-0000-000000000001','dev.council.missing_class.repaired','governance_unit',
   '426ce517-2718-48c0-8e8f-72013b950fa9',jsonb_build_object('previous_class_id',null,'source','20261007_dev_council_readiness'));
 end if;
 select * into p from qarar_meetings.council_meeting_plans_v2
  where id='d3460a14-91f0-4905-8581-a5c4c33fe00e'
   and organization_id='00000000-0000-0000-0000-000000000001'
   and governance_unit_id='426ce517-2718-48c0-8e8f-72013b950fa9' and status='draft' for update;
 if not found or exists(select 1 from qarar_meetings.meetings where organization_id=p.organization_id
  and governance_unit_id=p.governance_unit_id and (source_plan_id=p.id or scheduled_date=p.first_meeting_date)) then return;end if;
 select name_ar into v_name from qarar_core.governance_units where id=p.governance_unit_id;
 insert into qarar_meetings.meeting_number_counters(organization_id,calendar_year,last_value)
  values(p.organization_id,extract(year from p.first_meeting_date)::integer,1)
  on conflict(organization_id,calendar_year) do update
   set last_value=qarar_meetings.meeting_number_counters.last_value+1,updated_at=clock_timestamp()
  returning last_value into v_no;
 v_ref:='MTG-'||extract(year from p.first_meeting_date)::integer::text||'-'||lpad(v_no::text,6,'0');
 insert into qarar_meetings.meetings(organization_id,meeting_no,governance_unit_id,meeting_type_id,title_ar,
  scheduled_date,start_time,end_time,status,created_by_user_id,source_plan_id)
 values(p.organization_id,v_ref,p.governance_unit_id,p.meeting_type_id,'اجتماع '||v_name,
  p.first_meeting_date,null,null,'draft',p.created_by_user_id,p.id) returning id into v_id;
 insert into qarar_meetings.meeting_status_history(organization_id,meeting_id,from_status,to_status,changed_by_user_id,change_reason)
 values(p.organization_id,v_id,null,'draft',auth.uid(),'scoped development plan repair');
 perform qarar_audit.append_audit_log(p.organization_id,'dev.meeting.plan_first_draft.repaired','meetings',v_id,
  jsonb_build_object('source_plan_id',p.id,'meeting_no',v_ref,'source','20261007_dev_council_readiness'));
end $$;
commit;
