-- The member card in the live meeting room (product owner, 2026-10-15).
-- Every participant sees a roster member's photo, title, employer, email,
-- council role, attendance and membership date. Only the council's active
-- chair and rapporteur receive mobile numbers: a global permission, including
-- system administration, never does.
-- Impact map: docs/engineering/impact/MEETING_MEMBER_CARD_AR.md
begin;

-- Reads the meeting for the caller's tenant and checks the same read
-- authority as the live session itself (get_meeting_session_detail).
create function qarar_attendance.meeting_for_member_profiles(p_meeting_id uuid)
returns qarar_meetings.meetings
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_m qarar_meetings.meetings%rowtype;
begin
  select * into v_m
  from qarar_meetings.meetings
  where id = p_meeting_id
    and organization_id = qarar_iam.current_organization_id();
  if v_m.id is null then
    raise exception using errcode = 'P0002', message = 'الاجتماع غير موجود.';
  end if;
  if not qarar_iam.is_system_admin()
     and not qarar_iam.has_permission('attendance.read', v_m.governance_unit_id)
     and not qarar_iam.has_permission('attendance.manage', v_m.governance_unit_id) then
    raise exception using errcode = '42501', message = 'عرض بطاقات الأعضاء متاح لمن يطّلع على حضور هذا المجلس.';
  end if;
  return v_m;
end;
$$;

create function qarar_attendance.list_meeting_member_profiles(p_meeting_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_m qarar_meetings.meetings%rowtype := qarar_attendance.meeting_for_member_profiles(p_meeting_id);
  v_mobile_visible boolean := qarar_iam.has_unit_role_code(v_m.governance_unit_id, array['council_chair', 'council_rapporteur']);
begin
  return jsonb_build_object(
    'mobile_visible', v_mobile_visible,
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', u.id,
        'attendance_record_id', a.id,
        'full_name_ar', u.full_name_ar,
        'job_title', u.job_title,
        'email', u.email,
        'mobile', case when v_mobile_visible then u.mobile end,
        'home_unit_name_ar', home.name_ar,
        'council_role_code', role.code,
        'council_role_name_ar', role.name_ar,
        'membership_title', role.membership_title,
        'membership_start_date', role.start_date,
        'attendance_status', a.attendance_status,
        'verification_status', a.verification_status,
        'has_avatar', coalesce(av.content is not null, false),
        'avatar_revision', coalesce(av.revision, 0)
      ) order by u.full_name_ar, u.id)
      from qarar_attendance.attendance_records a
      join qarar_iam.users u on u.id = a.user_id and u.organization_id = a.organization_id
      left join qarar_iam.user_submission_profiles_v2 sp
        on sp.user_id = u.id and sp.organization_id = u.organization_id
      left join qarar_core.governance_units home
        on home.id = sp.home_unit_id and home.organization_id = sp.organization_id
      left join qarar_iam.user_avatars_v2 av
        on av.user_id = u.id and av.organization_id = u.organization_id
      -- The member's active role in this council; the chair and the
      -- rapporteur come first when one person holds several roles.
      left join lateral (
        select r.code, r.name_ar, ms.membership_title, ms.start_date
        from qarar_iam.memberships ms
        join qarar_iam.roles r on r.id = ms.role_id and r.organization_id = ms.organization_id
        where ms.user_id = u.id
          and ms.organization_id = v_m.organization_id
          and ms.governance_unit_id = v_m.governance_unit_id
          and ms.membership_status = 'active'
          and r.is_active
          and (ms.end_date is null or ms.end_date >= current_date)
        order by case r.code when 'council_chair' then 0 when 'council_rapporteur' then 1 else 2 end,
          ms.start_date, ms.id
        limit 1
      ) role on true
      where a.meeting_id = v_m.id
        and a.organization_id = v_m.organization_id
    ), '[]'::jsonb)
  );
end;
$$;

create function qarar_attendance.get_meeting_member_avatar(p_meeting_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_m qarar_meetings.meetings%rowtype := qarar_attendance.meeting_for_member_profiles(p_meeting_id);
  v_result jsonb;
begin
  if not exists (
    select 1 from qarar_attendance.attendance_records a
    where a.meeting_id = v_m.id and a.organization_id = v_m.organization_id and a.user_id = p_user_id
  ) then
    raise exception using errcode = 'P0002', message = 'هذا الشخص ليس في سجل حضور الاجتماع.';
  end if;
  select jsonb_build_object(
    'revision', coalesce(av.revision, 0),
    'has_image', av.content is not null,
    'content_base64', encode(av.content, 'base64')
  ) into v_result
  from (select 1) x
  left join qarar_iam.user_avatars_v2 av
    on av.user_id = p_user_id and av.organization_id = v_m.organization_id;
  return v_result;
end;
$$;

grant select on qarar_iam.user_avatars_v2, qarar_iam.user_submission_profiles_v2 to qarar_attendance_executor;

alter function qarar_attendance.meeting_for_member_profiles(uuid) owner to qarar_attendance_executor;
alter function qarar_attendance.list_meeting_member_profiles(uuid) owner to qarar_attendance_executor;
alter function qarar_attendance.get_meeting_member_avatar(uuid, uuid) owner to qarar_attendance_executor;
revoke all on function qarar_attendance.meeting_for_member_profiles(uuid),
  qarar_attendance.list_meeting_member_profiles(uuid),
  qarar_attendance.get_meeting_member_avatar(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function qarar_attendance.list_meeting_member_profiles(uuid),
  qarar_attendance.get_meeting_member_avatar(uuid, uuid)
  to qarar_api_executor;

create function api_v2.list_meeting_member_profiles_v2(p_meeting_id uuid)
returns jsonb language sql stable security definer set search_path = pg_catalog
as $$ select qarar_attendance.list_meeting_member_profiles($1) $$;
create function api_v2.get_meeting_member_avatar_v2(p_meeting_id uuid, p_user_id uuid)
returns jsonb language sql stable security definer set search_path = pg_catalog
as $$ select qarar_attendance.get_meeting_member_avatar($1, $2) $$;
alter function api_v2.list_meeting_member_profiles_v2(uuid) owner to qarar_api_executor;
alter function api_v2.get_meeting_member_avatar_v2(uuid, uuid) owner to qarar_api_executor;
revoke all on function api_v2.list_meeting_member_profiles_v2(uuid),
  api_v2.get_meeting_member_avatar_v2(uuid, uuid)
  from public, anon, service_role;
grant execute on function api_v2.list_meeting_member_profiles_v2(uuid),
  api_v2.get_meeting_member_avatar_v2(uuid, uuid)
  to authenticated;

insert into qarar_architecture.module_table_read_allowlist(source_module, target_schema, table_name, rationale) values
  ('attendance', 'qarar_iam', 'user_avatars_v2', 'Show roster members'' photos at the live council table'),
  ('attendance', 'qarar_iam', 'user_submission_profiles_v2', 'Show a roster member''s employer on the live member card')
on conflict do nothing;

insert into qarar_architecture.function_registry(function_oid, function_name, identity_arguments, module_code, owning_schema, is_rls_predicate)
select p.oid, p.proname, pg_get_function_identity_arguments(p.oid), 'attendance', 'qarar_attendance', false
from pg_proc p
where p.pronamespace = 'qarar_attendance'::regnamespace
  and p.proname in ('meeting_for_member_profiles', 'list_meeting_member_profiles', 'get_meeting_member_avatar')
on conflict (function_name, identity_arguments) do update
set function_oid = excluded.function_oid, module_code = excluded.module_code, owning_schema = excluded.owning_schema;

insert into qarar_architecture.api_contract_registry(api_version, contract_name, implementation_schema, implementation_name, identity_arguments, module_code, audience)
select 'v2', p.proname, 'qarar_attendance', regexp_replace(p.proname::text, '_v2$', ''),
  pg_get_function_identity_arguments(p.oid), 'attendance', 'authenticated'
from pg_proc p
where p.pronamespace = 'api_v2'::regnamespace
  and p.proname in ('list_meeting_member_profiles_v2', 'get_meeting_member_avatar_v2');

notify pgrst, 'reload schema';
commit;
