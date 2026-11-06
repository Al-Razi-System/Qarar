begin;
alter table qarar_meetings.meetings
 add column planned_window_start date,
 add column planned_window_end date,
 add column schedule_date_confirmed boolean not null default true;
alter table qarar_meetings.meetings add constraint meeting_planned_window_pair
 check ((planned_window_start is null and planned_window_end is null and schedule_date_confirmed)
 or (planned_window_start is not null and planned_window_end is not null and planned_window_end>=planned_window_start));
create unique index meeting_plan_month_window_unique on qarar_meetings.meetings(source_plan_id,planned_window_start)
 where source_plan_id is not null and planned_window_start is not null;

create function qarar_meetings.council_month_week_window_v2(p_month date,p_week integer)
returns jsonb language plpgsql immutable security definer set search_path=pg_catalog as $$
declare first_day date; last_day date; starts date;
begin
 if p_month is null or p_week is null or p_week not between 1 and 5 then
  raise exception using errcode='22023',message='اختر أسبوعاً شهرياً صحيحاً';
 end if;
 first_day:=date_trunc('month',p_month)::date;
 last_day:=(first_day+interval '1 month'-interval '1 day')::date;
 starts:=first_day+(p_week-1)*7;
 if starts>last_day then raise exception using errcode='22023',message='لا يوجد هذا الأسبوع في الشهر المختار';end if;
 return jsonb_build_object('starts_on',starts,'ends_on',least(starts+6,last_day));
end $$;

create function qarar_meetings.create_council_plan_occurrence_v2(p_plan_id uuid,p_month date)
returns uuid language plpgsql security definer set search_path=pg_catalog as $$
declare p qarar_meetings.council_meeting_plans_v2; window_value jsonb; starts date; ends date;
 meeting_id uuid; meeting_number bigint; reference_value text; council_name text; yr integer;
begin
 select * into p from qarar_meetings.council_meeting_plans_v2 where id=p_plan_id for update;
 if not found then raise exception using errcode='P0002',message='خطة الاجتماع غير موجودة';end if;
 if auth.uid() is not null then
  if p.organization_id is distinct from qarar_iam.current_organization_id() then
   raise exception using errcode='42501',message='خطة الاجتماع خارج مؤسستك';end if;
  perform qarar_iam.assert_permission('governance.units.manage',null);
 end if;
 if p.monthly_week is null then starts:=p.first_meeting_date;
 else
  window_value:=qarar_meetings.council_month_week_window_v2(p_month,p.monthly_week);
  starts:=(window_value->>'starts_on')::date;ends:=(window_value->>'ends_on')::date;
  if p.ends_on is not null then ends:=least(ends,p.ends_on);end if;
 end if;
 if starts<p.first_meeting_date or (p.ends_on is not null and starts>p.ends_on) then return null;end if;
 select id into meeting_id from qarar_meetings.meetings where source_plan_id=p.id and
  ((p.monthly_week is null and scheduled_date=starts) or (p.monthly_week is not null and planned_window_start=starts));
 if meeting_id is not null then return meeting_id;end if;
 select name_ar into council_name from qarar_core.governance_units
 where id=p.governance_unit_id and organization_id=p.organization_id and status<>'archived';
 if council_name is null then return null;end if;
 yr:=extract(year from starts)::integer;
 insert into qarar_meetings.meeting_number_counters(organization_id,calendar_year,last_value) values(p.organization_id,yr,1)
 on conflict(organization_id,calendar_year) do update set last_value=qarar_meetings.meeting_number_counters.last_value+1,updated_at=clock_timestamp()
 returning last_value into meeting_number;
 reference_value:='MTG-'||yr||'-'||lpad(meeting_number::text,6,'0');
 insert into qarar_meetings.meetings(organization_id,meeting_no,governance_unit_id,meeting_type_id,title_ar,scheduled_date,
  start_time,end_time,status,created_by_user_id,source_plan_id,planned_window_start,planned_window_end,schedule_date_confirmed)
 values(p.organization_id,reference_value,p.governance_unit_id,p.meeting_type_id,'اجتماع '||council_name,starts,
  null,null,'draft',p.created_by_user_id,p.id,case when p.monthly_week is not null then starts end,ends,p.monthly_week is null)
 returning id into meeting_id;
 insert into qarar_meetings.meeting_status_history(organization_id,meeting_id,from_status,to_status,changed_by_user_id,change_reason)
 values(p.organization_id,meeting_id,null,'draft',auth.uid(),'created from council meeting plan');
 perform qarar_audit.append_audit_log(p.organization_id,case when starts=p.first_meeting_date then 'meeting.plan.first_draft.created' else 'meeting.plan.draft.created' end,'meetings',meeting_id,
  jsonb_build_object('source_plan_id',p.id,'window_start',starts,'window_end',ends,'source_actor',p.created_by_user_id,'automatic',auth.uid() is null));
 return meeting_id;
end $$;

create or replace function qarar_meetings.create_council_plan_first_draft()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
 perform qarar_iam.assert_permission('governance.units.manage',null);
 if new.organization_id is distinct from qarar_iam.current_organization_id() or new.created_by_user_id is distinct from auth.uid() then
  raise exception using errcode='42501',message='لا يمكن إنشاء اجتماع لخطة خارج سياقك';end if;
 perform qarar_meetings.create_council_plan_occurrence_v2(new.id,new.first_meeting_date);
 return new;
end $$;

create function qarar_meetings.guard_council_window_confirmation_v2()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
 if new.planned_window_start is not null then
  if old.planned_window_start is distinct from new.planned_window_start or old.planned_window_end is distinct from new.planned_window_end
   or old.source_plan_id is distinct from new.source_plan_id then
   raise exception using errcode='22023',message='نافذة الخطة محفوظة ولا تعدّل من الاجتماع';end if;
  if new.start_time is not null and new.end_time is not null then
   if new.scheduled_date not between new.planned_window_start and new.planned_window_end or new.end_time<=new.start_time then
    raise exception using errcode='22023',message='حدد يوماً داخل أسبوع الاجتماع ووقتي بداية ونهاية صحيحين';end if;
   new.schedule_date_confirmed:=true;
  else new.schedule_date_confirmed:=false;
  end if;
  if new.schedule_date_confirmed and new.scheduled_date not between new.planned_window_start and new.planned_window_end then
   raise exception using errcode='22023',message='حدد يوماً داخل أسبوع الاجتماع ووقتي بداية ونهاية صحيحين';end if;
  if new.status not in ('draft','cancelled','archived') and not new.schedule_date_confirmed then
   raise exception using errcode='55000',message='حدد يوم الاجتماع ووقت انعقاده داخل الأسبوع قبل الجدولة';end if;
 end if;
 return new;
end $$;
create trigger council_window_confirmation before update on qarar_meetings.meetings
 for each row execute function qarar_meetings.guard_council_window_confirmation_v2();

create function qarar_meetings.generate_council_monthly_drafts_v2()
returns integer language plpgsql security definer set search_path=pg_catalog as $$
declare p record; today date:=(clock_timestamp() at time zone 'Asia/Riyadh')::date; target_month date; w jsonb; generated integer:=0; already_exists boolean;
begin
 for p in select * from qarar_meetings.council_meeting_plans_v2 where monthly_week is not null and status='active' loop
  target_month:=greatest(date_trunc('month',today)::date,date_trunc('month',p.first_meeting_date)::date);
  -- Weeks 1–4 always exist. A fifth week may be absent in February.
  if p.monthly_week=5 and extract(day from (target_month+interval '1 month'-interval '1 day'))<29 then
   target_month:=(target_month+interval '1 month')::date;end if;
  w:=qarar_meetings.council_month_week_window_v2(target_month,p.monthly_week);
  if (w->>'ends_on')::date<today then target_month:=(target_month+interval '1 month')::date;end if;
  if p.monthly_week=5 and extract(day from (target_month+interval '1 month'-interval '1 day'))<29 then target_month:=(target_month+interval '1 month')::date;end if;
  w:=qarar_meetings.council_month_week_window_v2(target_month,p.monthly_week);
  select exists(select 1 from qarar_meetings.meetings where source_plan_id=p.id and planned_window_start=(w->>'starts_on')::date) into already_exists;
  if qarar_meetings.create_council_plan_occurrence_v2(p.id,target_month) is not null and not already_exists then generated:=generated+1;end if;
 end loop;
 return generated;
end $$;

alter function qarar_meetings.council_month_week_window_v2(date,integer) owner to qarar_meetings_executor;
alter function qarar_meetings.create_council_plan_occurrence_v2(uuid,date) owner to qarar_meetings_executor;
alter function qarar_meetings.guard_council_window_confirmation_v2() owner to qarar_meetings_executor;
alter function qarar_meetings.generate_council_monthly_drafts_v2() owner to qarar_meetings_executor;
revoke all on function qarar_meetings.council_month_week_window_v2(date,integer),qarar_meetings.create_council_plan_occurrence_v2(uuid,date),
 qarar_meetings.guard_council_window_confirmation_v2(),qarar_meetings.generate_council_monthly_drafts_v2() from public,anon,authenticated,service_role;
grant execute on function qarar_meetings.council_month_week_window_v2(date,integer) to qarar_core_executor;
insert into qarar_architecture.function_registry(function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate)
select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),'meetings','qarar_meetings',false from pg_proc p
where p.pronamespace='qarar_meetings'::regnamespace and p.proname in ('council_month_week_window_v2','create_council_plan_occurrence_v2','guard_council_window_confirmation_v2','generate_council_monthly_drafts_v2');
insert into qarar_architecture.module_function_execute_allowlist(source_module,target_schema,function_name,identity_arguments,rationale)
values('core','qarar_meetings','council_month_week_window_v2','p_month date, p_week integer','Validate the optional council monthly week') on conflict do nothing;
do $$begin
 if exists(select 1 from pg_extension where extname='pg_cron') then
  perform cron.schedule('qarar-council-monthly-drafts','10 0 * * *','select qarar_meetings.generate_council_monthly_drafts_v2()');
 end if;
end $$;
notify pgrst,'reload schema';
commit;
