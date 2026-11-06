-- Live-room completion fixes: contextual summary authority and tenant-wide
-- assignment-user search. Impact map:
-- docs/engineering/impact/LIVE_MEETING_COMPLETION_FIXES_20261020_AR.md
begin;

grant execute on function qarar_iam.has_unit_role_code(uuid,text[]) to qarar_meetings_executor;

create or replace function qarar_meetings.update_agenda_discussion(
  p_agenda_item_id uuid,
  p_status text,
  p_discussion_notes text,
  p_expected_updated_at timestamptz
) returns jsonb
language plpgsql security definer set search_path = pg_catalog
as $$
declare
  v_item qarar_meetings.agenda_items%rowtype;
  v_meeting qarar_meetings.meetings%rowtype;
begin
  if p_status not in ('under_discussion', 'discussed', 'postponed') then
    raise exception 'حالة مناقشة البند غير صحيحة.' using errcode = '22023';
  end if;
  if p_status = 'postponed' and char_length(btrim(coalesce(p_discussion_notes, ''))) < 5 then
    raise exception 'أدخل سبب التأجيل بما لا يقل عن 5 أحرف.' using errcode = '22023';
  end if;

  select * into v_item from qarar_meetings.agenda_items
  where id = p_agenda_item_id and organization_id = qarar_iam.current_organization_id()
  for update;
  if v_item.id is null then
    raise exception 'بند جدول الأعمال غير موجود.' using errcode = 'P0002';
  end if;

  select * into v_meeting from qarar_meetings.meetings
  where id = v_item.meeting_id and organization_id = v_item.organization_id for update;
  if v_meeting.status <> 'in_progress' then
    raise exception 'يمكن تسجيل المناقشة أثناء انعقاد الاجتماع فقط.' using errcode = '23514';
  end if;
  if not qarar_iam.has_unit_role_code(v_meeting.governance_unit_id, array['council_chair', 'council_rapporteur'])
     and not qarar_iam.has_permission('agenda.manage', v_meeting.governance_unit_id) then
    raise exception 'حفظ مناقشة البند متاح لرئيس هذا المجلس ومقرره فقط.' using errcode = '42501';
  end if;
  if v_meeting.attendance_locked_at is null then
    raise exception 'ثبّت سجل الحضور قبل بدء مناقشة البنود.' using errcode = '23514';
  end if;
  if v_meeting.quorum_status <> 'met' and v_meeting.quorum_continuation is null then
    raise exception 'النصاب غير مكتمل؛ يختار رئيس المجلس التأجيل أو المتابعة أولًا.' using errcode = '23514';
  end if;
  if p_expected_updated_at is null or p_expected_updated_at <> v_item.updated_at then
    raise exception 'تم تعديل البند؛ حدّث الجلسة ثم أعد المحاولة.' using errcode = '40001';
  end if;

  update qarar_meetings.agenda_items
  set agenda_status = p_status,
      discussion_notes = nullif(btrim(coalesce(p_discussion_notes, '')), '')
  where id = v_item.id;

  perform qarar_audit.append_audit_log(v_item.organization_id, 'agenda.discussion.update', 'agenda_items', v_item.id,
    jsonb_build_object('previous_status', v_item.agenda_status, 'status', p_status, 'notes', p_discussion_notes));
  return jsonb_build_object('id', v_item.id, 'status', p_status);
end;
$$;

create function qarar_meetings.search_meeting_assignment_options(
  p_meeting_id uuid,
  p_query text,
  p_limit integer default 20
) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog
as $$
declare
  v_context jsonb := qarar_meetings.assignment_context(p_meeting_id);
  v_organization_id uuid := qarar_iam.current_organization_id();
  v_query text := lower(btrim(coalesce(p_query, '')));
begin
  if v_organization_id is null or not exists (
    select 1 from qarar_meetings.meetings m where m.id = p_meeting_id and m.organization_id = v_organization_id
  ) then
    raise exception 'الاجتماع غير موجود.' using errcode = 'P0002';
  end if;
  if not coalesce((v_context->>'chair')::boolean, false)
     and not coalesce((v_context->>'rapporteur')::boolean, false) then
    raise exception 'البحث عن المكلّفين متاح لرئيس هذا المجلس ومقرره فقط.' using errcode = '42501';
  end if;
  if not coalesce((v_context->>'live')::boolean, false) then
    raise exception 'تُضاف تكليفات الاجتماع أثناء انعقاده فقط.' using errcode = '23514';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 20 then
    raise exception 'حد نتائج البحث يجب أن يكون بين 1 و20.' using errcode = '22023';
  end if;
  if char_length(v_query) < 2 then
    return jsonb_build_object('users', '[]'::jsonb);
  end if;

  return jsonb_build_object('users', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', found.id,
      'name_ar', found.full_name_ar,
      'email', found.email,
      'job_title', found.job_title
    ) order by found.rank, found.full_name_ar, found.id)
    from (
      select u.id, u.full_name_ar, u.email, u.job_title,
        case when lower(u.full_name_ar) like v_query || '%' then 0 else 1 end as rank
      from qarar_iam.users u
      where u.organization_id = v_organization_id
        and u.status = 'active'
        and strpos(lower(concat_ws(' ', u.full_name_ar, u.email, u.employee_no, u.job_title)), v_query) > 0
      order by rank, u.full_name_ar, u.id
      limit p_limit
    ) found
  ), '[]'::jsonb));
end;
$$;

alter function qarar_meetings.search_meeting_assignment_options(uuid,text,integer) owner to qarar_meetings_executor;
revoke all on function qarar_meetings.search_meeting_assignment_options(uuid,text,integer) from public, anon, authenticated, service_role;
grant execute on function qarar_meetings.search_meeting_assignment_options(uuid,text,integer) to qarar_api_executor;

create function api_v2.search_meeting_assignment_options_v2(p_meeting_id uuid, p_query text, p_limit integer default 20)
returns jsonb language sql stable security definer set search_path = pg_catalog
as $$ select qarar_meetings.search_meeting_assignment_options($1, $2, $3) $$;
alter function api_v2.search_meeting_assignment_options_v2(uuid,text,integer) owner to qarar_api_executor;
revoke all on function api_v2.search_meeting_assignment_options_v2(uuid,text,integer) from public, anon, service_role;
grant execute on function api_v2.search_meeting_assignment_options_v2(uuid,text,integer) to authenticated;

insert into qarar_architecture.function_registry(function_oid, function_name, identity_arguments, module_code, owning_schema, is_rls_predicate)
select p.oid, p.proname, pg_get_function_identity_arguments(p.oid), 'meetings', n.nspname, false
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'qarar_meetings' and p.proname = 'search_meeting_assignment_options'
on conflict (function_name, identity_arguments) do update
set function_oid=excluded.function_oid,module_code=excluded.module_code,owning_schema=excluded.owning_schema;

insert into qarar_architecture.api_contract_registry(api_version,contract_name,implementation_schema,implementation_name,identity_arguments,module_code,audience)
select 'v2',p.proname,'qarar_meetings','search_meeting_assignment_options',pg_get_function_identity_arguments(p.oid),'meetings','authenticated'
from pg_proc p where p.pronamespace='api_v2'::regnamespace and p.proname='search_meeting_assignment_options_v2';

insert into qarar_architecture.module_table_read_allowlist(source_module,target_schema,table_name,rationale)
values ('meetings','qarar_iam','users','Search active users in the caller tenant when assigning a live-meeting decision')
on conflict do nothing;

notify pgrst, 'reload schema';
commit;
