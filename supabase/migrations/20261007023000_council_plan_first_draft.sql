begin;
alter table qarar_meetings.meetings add column source_plan_id uuid;
alter table qarar_meetings.meetings add constraint meeting_source_plan_tenant
 foreign key(source_plan_id,organization_id) references qarar_meetings.council_meeting_plans_v2(id,organization_id) on delete restrict;
create unique index meeting_plan_occurrence_unique on qarar_meetings.meetings(source_plan_id,scheduled_date)
 where source_plan_id is not null;

create function qarar_meetings.create_council_plan_first_draft()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare v_id uuid;v_number integer;v_reference text;v_name text;v_year integer;
begin
 perform qarar_iam.assert_permission('governance.units.manage',null);
 if new.organization_id is distinct from qarar_iam.current_organization_id()
    or new.created_by_user_id is distinct from auth.uid() then
  raise exception using errcode='42501',message='لا يمكن إنشاء اجتماع لخطة خارج سياقك';
 end if;
 select name_ar into v_name from qarar_core.governance_units
  where id=new.governance_unit_id and organization_id=new.organization_id;
 v_year:=extract(year from new.first_meeting_date)::integer;
 insert into qarar_meetings.meeting_number_counters(organization_id,year_no,last_value)
 values(new.organization_id,v_year,1)
 on conflict(organization_id,year_no) do update
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
create trigger council_plan_first_draft after insert on qarar_meetings.council_meeting_plans_v2
 for each row execute function qarar_meetings.create_council_plan_first_draft();
insert into qarar_architecture.function_registry(function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate)
select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),'meetings','qarar_meetings',false
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='qarar_meetings' and p.proname='create_council_plan_first_draft';
commit;
