-- A meeting postponed because its quorum failed can be resumed, with a written
-- reason, from the step before the postponement (the session in progress, its
-- attendance and quorum decision pending again). Before this a postponement was
-- final: the only way out of `postponed` was the archive.
-- Impact map: docs/engineering/impact/RESUME_POSTPONED_MEETING_20261107_AR.md
begin;

-- 1. The transition guard lets `postponed` return to `in_progress` only inside the
--    resume contract, which sets a transaction-local marker. Every other gate of the
--    guard (active council, cycle window, next cycle) still applies to that move.
do $$
declare v_def text;v_old text:='elsif old.status=''postponed'' and new.status not in(''archived'') then';
begin
  v_def:=pg_get_functiondef('qarar_meetings.guard_meeting_status_transitions()'::regprocedure);
  if (length(v_def)-length(replace(v_def,v_old,'')))/length(v_old)<>1 then
    raise exception 'guard_meeting_status_transitions postponed rule not found exactly once';
  end if;
  execute replace(v_def,v_old,'elsif old.status=''postponed'' and (new.status not in(''archived'',''in_progress'') or (new.status=''in_progress'' and coalesce(current_setting(''qarar.resuming_postponed_meeting'',true),'''')<>''on'')) then');
end;
$$;

-- 2. Who may resume: the council chair, or whoever manages the council's meetings.
create function qarar_meetings.can_resume_postponed_meeting_v2(p_unit_id uuid)
returns boolean language sql stable security definer set search_path=pg_catalog
as $$
  select coalesce(qarar_iam.is_system_admin(),false)
    or qarar_iam.has_permission('meetings.manage',p_unit_id)
    or qarar_iam.has_unit_role_code(p_unit_id,array['council_chair'])
$$;

-- 3. Why a postponed meeting cannot be resumed (null when it can). One source for
--    the contract and for the action the screen offers, so they never disagree.
create function qarar_meetings.postponed_meeting_resume_block_v2(p_meeting_id uuid)
returns text language plpgsql stable security definer set search_path=pg_catalog
as $$
declare m qarar_meetings.meetings%rowtype;v_status text;v_today date;v_next date;
begin
  select * into m from qarar_meetings.meetings
  where id=p_meeting_id and organization_id=qarar_iam.current_organization_id();
  if m.id is null then return 'الاجتماع غير موجود.'; end if;
  if m.status<>'postponed' then return 'الاجتماع ليس مؤجلًا.'; end if;
  if not exists(select 1 from qarar_meetings.meeting_status_history h
    where h.meeting_id=m.id and h.from_status='in_progress' and h.to_status='postponed') then
    return 'لم تبدأ جلسة هذا الاجتماع قبل تأجيله، فلا شيء يُستكمل.';
  end if;
  select status into v_status from qarar_core.governance_units
  where id=m.governance_unit_id and organization_id=m.organization_id;
  if v_status is distinct from 'active' then
    return 'المجلس غير مفعّل؛ فعّله أولًا ثم أعد استكمال الاجتماع.';
  end if;
  if m.source_plan_id is not null then
    v_today:=qarar_meetings.organization_today_v2(m.organization_id);
    v_next:=qarar_meetings.next_cycle_start_v2(m.id);
    if v_next is not null and v_today>=v_next then
      return 'بدأت دورة الاجتماع التالية في '||qarar_meetings.arabic_date_v2(v_next)||'؛ لم يعد هذا الاجتماع قابلًا للاستكمال.';
    end if;
    if m.planned_window_end is not null and v_today>m.planned_window_end
       and nullif(btrim(coalesce(m.schedule_exception_reason,'')),'') is null then
      return 'انتهت فترة دورة هذا الاجتماع في '||qarar_meetings.arabic_date_v2(m.planned_window_end)||'؛ حدد موعده الجديد واكتب سبب انعقاده خارج الدورة أولًا.';
    end if;
  end if;
  return null;
end;
$$;

-- 4. The contract: resume the same meeting, in progress, with a reason.
create function qarar_meetings.resume_postponed_meeting_v2(
  p_meeting_id uuid,p_reason text,p_expected_updated_at timestamptz
) returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare m qarar_meetings.meetings%rowtype;v_reason text:=btrim(coalesce(p_reason,''));v_block text;v_actor uuid:=auth.uid();
begin
  if qarar_iam.current_organization_id() is null or v_actor is null then
    raise exception using errcode='42501',message='يلزم تسجيل الدخول.';
  end if;
  select * into m from qarar_meetings.meetings
  where id=p_meeting_id and organization_id=qarar_iam.current_organization_id() for update;
  if m.id is null then raise exception using errcode='P0002',message='الاجتماع غير موجود.'; end if;
  if not qarar_meetings.can_resume_postponed_meeting_v2(m.governance_unit_id) then
    raise exception using errcode='42501',message='إعادة استكمال الاجتماع المؤجل من اختصاص رئيس المجلس أو من يدير اجتماعات المجلس.';
  end if;
  v_block:=qarar_meetings.postponed_meeting_resume_block_v2(m.id);
  if v_block is not null then raise exception using errcode='55000',message=v_block; end if;
  if p_expected_updated_at is null or m.updated_at is distinct from p_expected_updated_at then
    raise exception using errcode='40001',message='عدّل شخص آخر هذا الاجتماع للتو. حدّث الصفحة ثم أعد المحاولة.';
  end if;
  if char_length(v_reason) not between 5 and 1000 then
    raise exception using errcode='22023',message='اكتب سبب إعادة استكمال الاجتماع (5 أحرف على الأقل).';
  end if;
  perform set_config('qarar.resuming_postponed_meeting','on',true);
  update qarar_meetings.meetings set status='in_progress' where id=m.id;
  perform set_config('qarar.resuming_postponed_meeting','',true);
  insert into qarar_meetings.meeting_status_history(
    organization_id,meeting_id,from_status,to_status,changed_by_user_id,change_reason
  ) values(m.organization_id,m.id,'postponed','in_progress',v_actor,v_reason);
  perform qarar_audit.append_audit_log(
    m.organization_id,'meeting.postponed.resumed','meetings',m.id,
    jsonb_build_object('from_status','postponed','to_status','in_progress','reason',v_reason)
  );
  return qarar_meetings.get_meeting_detail(m.id);
end;
$$;

create function api_v2.resume_postponed_meeting_v2(
  p_meeting_id uuid,p_reason text,p_expected_updated_at timestamptz
) returns jsonb language sql volatile security definer set search_path=pg_catalog
as $$select qarar_meetings.resume_postponed_meeting_v2($1,$2,$3)$$;

-- 5. The meeting detail says whether the viewer may resume it, or why not.
do $$
declare v_def text;v_old text:='return result||jsonb_build_object(''governance_unit_status'',unit_status);';
begin
  v_def:=pg_get_functiondef('qarar_meetings.get_meeting_detail(uuid)'::regprocedure);
  if (length(v_def)-length(replace(v_def,v_old,'')))/length(v_old)<>1 then
    raise exception 'get_meeting_detail unit status return not found exactly once';
  end if;
  execute replace(v_def,v_old,
'declare v_block text;
  begin
    result:=result||jsonb_build_object(''governance_unit_status'',unit_status);
    if coalesce(result->>''status'','''')=''postponed''
       and qarar_meetings.can_resume_postponed_meeting_v2((result->>''governance_unit_id'')::uuid) then
      v_block:=qarar_meetings.postponed_meeting_resume_block_v2(p_meeting_id);
      result:=jsonb_set(result,''{capabilities,can_resume_postponed}'',to_jsonb(v_block is null),true);
      result:=jsonb_set(result,''{capabilities,resume_postponed_block}'',coalesce(to_jsonb(v_block),''null''::jsonb),true);
    end if;
    return result;
  end;');
end;
$$;

-- 6. Ownership, grants and registries.
alter function qarar_meetings.can_resume_postponed_meeting_v2(uuid) owner to qarar_meetings_executor;
alter function qarar_meetings.postponed_meeting_resume_block_v2(uuid) owner to qarar_meetings_executor;
alter function qarar_meetings.resume_postponed_meeting_v2(uuid,text,timestamptz) owner to qarar_meetings_executor;
alter function api_v2.resume_postponed_meeting_v2(uuid,text,timestamptz) owner to qarar_api_executor;

revoke all on function qarar_meetings.can_resume_postponed_meeting_v2(uuid),
  qarar_meetings.postponed_meeting_resume_block_v2(uuid),
  qarar_meetings.resume_postponed_meeting_v2(uuid,text,timestamptz)
from public,anon,authenticated,service_role;
revoke all on function api_v2.resume_postponed_meeting_v2(uuid,text,timestamptz) from public,anon,service_role;
grant execute on function qarar_meetings.resume_postponed_meeting_v2(uuid,text,timestamptz) to qarar_api_executor;
grant execute on function api_v2.resume_postponed_meeting_v2(uuid,text,timestamptz) to authenticated;

insert into qarar_architecture.function_registry(function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate)
select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),'meetings',n.nspname,false
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where p.oid in(
  'qarar_meetings.can_resume_postponed_meeting_v2(uuid)'::regprocedure,
  'qarar_meetings.postponed_meeting_resume_block_v2(uuid)'::regprocedure,
  'qarar_meetings.resume_postponed_meeting_v2(uuid,text,timestamptz)'::regprocedure)
on conflict(function_oid) do update set function_name=excluded.function_name,identity_arguments=excluded.identity_arguments,
  module_code=excluded.module_code,owning_schema=excluded.owning_schema,is_rls_predicate=false;

insert into qarar_architecture.api_contract_registry(api_version,contract_name,implementation_schema,implementation_name,identity_arguments,module_code,audience)
values('v2','resume_postponed_meeting_v2','qarar_meetings','resume_postponed_meeting_v2',
  'p_meeting_id uuid, p_reason text, p_expected_updated_at timestamp with time zone','meetings','authenticated')
on conflict(api_version,contract_name,identity_arguments) do update set implementation_schema=excluded.implementation_schema,
  implementation_name=excluded.implementation_name,module_code=excluded.module_code,audience=excluded.audience;

notify pgrst,'reload schema';
commit;
