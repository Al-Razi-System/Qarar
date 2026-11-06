-- Close an unheld plan occurrence only when the following cycle starts, and
-- reactivate a cancelled occurrence in place. No replacement meeting is made.
-- Impact map: docs/engineering/impact/MEETING_CYCLE_EXPIRY_REACTIVATION_20261103_AR.md
begin;

alter table qarar_meetings.meetings drop constraint meetings_status_check;
alter table qarar_meetings.meetings add constraint meetings_status_check check(status in(
  'draft','scheduled','ready_to_start','in_progress','waiting_for_minutes',
  'waiting_for_approval','closed','archived','cancelled','postponed','not_held'
));

create or replace function qarar_meetings.guard_meeting_status_transitions()
returns trigger language plpgsql security definer set search_path=pg_catalog
as $$
begin
  if old.status=new.status then return new; end if;
  if old.status='draft' and new.status not in('scheduled','cancelled','not_held') then
    raise exception 'Invalid transition from % to %',old.status,new.status;
  elsif old.status='scheduled' and new.status not in('ready_to_start','cancelled','draft','not_held') then
    raise exception 'Invalid transition from % to %',old.status,new.status;
  elsif old.status='ready_to_start' and new.status not in('in_progress','scheduled','cancelled','not_held') then
    raise exception 'Invalid transition from % to %',old.status,new.status;
  elsif old.status='in_progress' and new.status not in('waiting_for_minutes','postponed','cancelled') then
    raise exception 'Invalid transition from % to %',old.status,new.status;
  elsif old.status='waiting_for_minutes' and new.status not in('waiting_for_approval') then
    raise exception 'Invalid transition from % to %',old.status,new.status;
  elsif old.status='waiting_for_approval' and new.status not in('closed','waiting_for_minutes') then
    raise exception 'Invalid transition from % to %',old.status,new.status;
  elsif old.status='closed' and new.status not in('archived') then
    raise exception 'Invalid transition from % to %',old.status,new.status;
  elsif old.status='cancelled' and new.status not in('draft','scheduled','archived') then
    raise exception 'Invalid transition from % to %',old.status,new.status;
  elsif old.status='postponed' and new.status not in('archived') then
    raise exception 'Invalid transition from % to %',old.status,new.status;
  elsif old.status='not_held' and new.status not in('archived') then
    raise exception 'Invalid transition from % to %',old.status,new.status;
  elsif old.status='archived' then
    raise exception 'Cannot transition from archived status.';
  end if;
  if new.status='waiting_for_minutes' and new.quorum_status<>'met' and new.quorum_continuation is null then
    raise exception 'Cannot proceed to minutes phase. Quorum is not met.';
  end if;
  return new;
end;
$$;

-- An unconfirmed plan occurrence may become historical without acquiring a
-- meeting date. This is a lifecycle result, not a scheduling action.
create or replace function qarar_meetings.guard_council_window_confirmation_v2()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
  if new.planned_window_start is not null then
    if old.planned_window_start is distinct from new.planned_window_start or old.planned_window_end is distinct from new.planned_window_end
      or old.source_plan_id is distinct from new.source_plan_id then
      raise exception using errcode='22023',message='نافذة الخطة محفوظة ولا تعدّل من الاجتماع';
    end if;
    if new.scheduled_date is distinct from old.scheduled_date or new.start_time is distinct from old.start_time
      or new.end_time is distinct from old.end_time then
      if new.start_time is not null and new.end_time is not null then
        if new.end_time<=new.start_time then
          raise exception using errcode='22023',message='يجب أن يكون وقت النهاية بعد وقت البداية.';
        end if;
        new.schedule_date_confirmed:=true;
      else
        new.schedule_date_confirmed:=false;
      end if;
    end if;
    if new.schedule_date_confirmed and new.scheduled_date not between new.planned_window_start and new.planned_window_end
      and nullif(btrim(coalesce(new.schedule_exception_reason,'')),'') is null then
      raise exception using errcode='22023',message='هذا اليوم خارج أسبوع الاجتماع المخطط؛ اكتب سبب انعقاده فيه.';
    end if;
    if new.status not in('draft','cancelled','archived','not_held') and not new.schedule_date_confirmed then
      raise exception using errcode='55000',message='حدد يوم الاجتماع ووقت انعقاده قبل الجدولة.';
    end if;
  end if;
  return new;
end;
$$;

-- The end of a window only raises an operational warning. The record is made
-- historical when the first later occurrence's own window begins.
create function qarar_meetings.finalize_unheld_plan_meetings_v2(
  p_as_of date default ((clock_timestamp() at time zone 'Asia/Aden')::date)
) returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare r record;v_count integer:=0;
begin
  if auth.uid() is not null then
    raise exception using errcode='42501',message='هذه عملية صيانة داخلية.';
  end if;
  if p_as_of is null then raise exception using errcode='22023',message='تاريخ المعالجة مطلوب.'; end if;
  for r in
    select m.id,m.organization_id,m.status,m.source_plan_id,m.planned_date,
      m.planned_window_start,m.planned_window_end,n.id next_meeting_id,
      coalesce(n.planned_window_start,n.planned_date) next_window_start
    from qarar_meetings.meetings m
    join lateral(
      select x.id,x.planned_window_start,x.planned_date
      from qarar_meetings.meetings x
      where x.source_plan_id=m.source_plan_id and x.planned_date>m.planned_date
      order by x.planned_date,x.id limit 1
    ) n on coalesce(n.planned_window_start,n.planned_date)<=p_as_of
    where m.source_plan_id is not null
      and m.status in('draft','scheduled','ready_to_start')
      and m.planned_window_end<p_as_of
    for update of m skip locked
  loop
    update qarar_meetings.meetings set status='not_held',updated_at=clock_timestamp() where id=r.id;
    insert into qarar_meetings.meeting_status_history(
      organization_id,meeting_id,from_status,to_status,changed_by_user_id,change_reason
    ) values(
      r.organization_id,r.id,r.status,'not_held',null,
      'لم ينعقد الاجتماع حتى بدأت دورة الاجتماع التالية في '||r.next_window_start::text
    );
    perform qarar_audit.append_audit_log(
      r.organization_id,'meeting.cycle.not_held','meetings',r.id,
      jsonb_build_object(
        'source_plan_id',r.source_plan_id,'planned_date',r.planned_date,
        'planned_window_start',r.planned_window_start,'planned_window_end',r.planned_window_end,
        'next_meeting_id',r.next_meeting_id,'next_window_start',r.next_window_start,'evaluated_on',p_as_of
      )
    );
    v_count:=v_count+1;
  end loop;
  return jsonb_build_object('not_held_count',v_count,'evaluated_on',p_as_of);
end;
$$;

create function qarar_meetings.reactivate_cancelled_meeting_v2(
  p_meeting_id uuid,p_expected_updated_at timestamptz
) returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare m qarar_meetings.meetings%rowtype;v_target text;v_actor uuid:=auth.uid();
begin
  select * into m from qarar_meetings.meetings
  where id=p_meeting_id and organization_id=qarar_iam.current_organization_id() for update;
  if m.id is null then raise exception using errcode='P0002',message='الاجتماع غير موجود.'; end if;
  perform qarar_iam.assert_permission('meetings.manage',m.governance_unit_id);
  if m.status<>'cancelled' then
    raise exception using errcode='23514',message='لا يمكن إعادة تفعيل اجتماع غير ملغى.';
  end if;
  if p_expected_updated_at is null or m.updated_at is distinct from p_expected_updated_at then
    raise exception using errcode='40001',message='عدّل شخص آخر هذا الاجتماع للتو. حدّث الصفحة ثم أعد المحاولة.';
  end if;
  v_target:=case when m.schedule_date_confirmed and m.scheduled_date is not null
    and m.start_time is not null and m.end_time is not null then 'scheduled' else 'draft' end;
  update qarar_meetings.meetings set status=v_target,updated_at=clock_timestamp() where id=m.id;
  insert into qarar_meetings.meeting_status_history(
    organization_id,meeting_id,from_status,to_status,changed_by_user_id,change_reason
  ) values(m.organization_id,m.id,'cancelled',v_target,v_actor,'إعادة تفعيل الاجتماع الملغى نفسه');
  perform qarar_audit.append_audit_log(
    m.organization_id,'meeting.cancelled.reactivated','meetings',m.id,
    jsonb_build_object('from_status','cancelled','to_status',v_target,'source_plan_id',m.source_plan_id,'planned_date',m.planned_date)
  );
  return qarar_meetings.get_meeting_detail(m.id);
end;
$$;

create function api_v2.reactivate_cancelled_meeting_v2(
  p_meeting_id uuid,p_expected_updated_at timestamptz
) returns jsonb language sql security definer set search_path=pg_catalog
as $$select qarar_meetings.reactivate_cancelled_meeting_v2($1,$2)$$;

alter function qarar_meetings.finalize_unheld_plan_meetings_v2(date) owner to qarar_meetings_executor;
alter function qarar_meetings.reactivate_cancelled_meeting_v2(uuid,timestamptz) owner to qarar_meetings_executor;
alter function api_v2.reactivate_cancelled_meeting_v2(uuid,timestamptz) owner to qarar_api_executor;
revoke all on function qarar_meetings.finalize_unheld_plan_meetings_v2(date) from public,anon,authenticated,service_role;
revoke all on function qarar_meetings.reactivate_cancelled_meeting_v2(uuid,timestamptz) from public,anon,authenticated,service_role;
revoke all on function api_v2.reactivate_cancelled_meeting_v2(uuid,timestamptz) from public,anon,service_role;
grant execute on function qarar_meetings.reactivate_cancelled_meeting_v2(uuid,timestamptz) to qarar_api_executor;
grant execute on function api_v2.reactivate_cancelled_meeting_v2(uuid,timestamptz) to authenticated;

insert into qarar_architecture.function_registry(
  function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate
)
select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),'meetings',n.nspname,false
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where p.oid in(
  'qarar_meetings.finalize_unheld_plan_meetings_v2(date)'::regprocedure,
  'qarar_meetings.reactivate_cancelled_meeting_v2(uuid,timestamptz)'::regprocedure
)
on conflict(function_oid) do update set function_name=excluded.function_name,identity_arguments=excluded.identity_arguments,
  module_code=excluded.module_code,owning_schema=excluded.owning_schema,is_rls_predicate=false;

insert into qarar_architecture.api_contract_registry(
  api_version,contract_name,implementation_schema,implementation_name,identity_arguments,module_code,audience
) values(
  'v2','reactivate_cancelled_meeting_v2','qarar_meetings','reactivate_cancelled_meeting_v2',
  'p_meeting_id uuid, p_expected_updated_at timestamp with time zone','meetings','authenticated'
)
on conflict(api_version,contract_name,identity_arguments) do update set
  implementation_schema=excluded.implementation_schema,implementation_name=excluded.implementation_name,
  module_code=excluded.module_code,audience=excluded.audience;

do $$
begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname='qarar-finalize-unheld-meetings';
    perform cron.schedule(
      'qarar-finalize-unheld-meetings','35 0 * * *',
      'select qarar_meetings.finalize_unheld_plan_meetings_v2()'
    );
  end if;
end;
$$;

notify pgrst,'reload schema';
commit;
