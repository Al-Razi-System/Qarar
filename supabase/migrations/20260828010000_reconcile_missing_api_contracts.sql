-- Reconcile contract-registry rows that were restored without callable
-- implementations. Keep only contracts that have an implemented product use.

delete from qarar_architecture.api_contract_registry
where api_version = 'v1'
  and contract_name = 'admin_import_policy_bundle_v4';

create or replace function public.get_topic_categories_for_unit(
  p_governance_unit_id uuid,
  p_effective_on date default current_date
) returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_org uuid := qarar_iam.current_organization_id();
  v_effective_on date := coalesce(p_effective_on, current_date);
begin
  if not exists (
    select 1 from qarar_core.governance_units gu
    where gu.id = p_governance_unit_id
      and gu.organization_id = v_org
  ) then
    raise exception 'الجهة أو المجلس غير موجود.' using errcode = 'P0002';
  end if;

  if not qarar_iam.is_system_admin()
     and not qarar_iam.has_permission('topics.read', p_governance_unit_id)
     and not qarar_iam.has_permission('topics.create', p_governance_unit_id) then
    raise exception 'لا تملك صلاحية عرض فئات الموضوعات لهذه الجهة.' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'governance_unit_id', p_governance_unit_id,
    'effective_on', v_effective_on,
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id,
        'code', c.code,
        'name_ar', c.name_ar,
        'name_en', c.name_en,
        'executable_item_count', (
          select count(*)
          from qarar_governance.policy_items pi
          join qarar_governance.policy_versions pv on pv.id = pi.policy_version_id
          join qarar_governance.policies p on p.id = pv.policy_id
          where pi.organization_id = v_org
            and pi.topic_category_id = c.id
            and pi.is_active = true
            and p.status = 'active'
            and pv.automation_status = 'active'
            and (pv.effective_from is null or pv.effective_from <= v_effective_on)
            and (pv.effective_to is null or pv.effective_to >= v_effective_on)
            and (
              not exists (
                select 1 from qarar_governance.policy_scope_assignments any_scope
                where any_scope.policy_version_id = pv.id and any_scope.is_active = true
              )
              or exists (
                select 1 from qarar_governance.policy_scope_assignments psa
                where psa.policy_version_id = pv.id
                  and psa.is_active = true
                  and (psa.valid_from is null or psa.valid_from <= v_effective_on)
                  and (psa.valid_to is null or psa.valid_to >= v_effective_on)
                  and (psa.scope_type = 'organization' or psa.governance_unit_id = p_governance_unit_id)
              )
            )
        )
      ) order by c.name_ar)
      from qarar_topics.topic_categories c
      where c.organization_id = v_org and c.is_active = true
    ), '[]'::jsonb)
  );
end;
$$;

alter function public.get_topic_categories_for_unit(uuid, date)
  owner to qarar_governance_executor;
revoke all on function public.get_topic_categories_for_unit(uuid, date)
  from public, anon, authenticated, service_role;
grant execute on function public.get_topic_categories_for_unit(uuid, date)
  to qarar_api_executor;

create or replace function qarar_minutes.generate_meeting_minutes_draft(
  p_meeting_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_m qarar_meetings.meetings%rowtype;
  v_content text;
  v_result jsonb;
begin
  select * into v_m
  from qarar_meetings.meetings
  where id = p_meeting_id
    and organization_id = qarar_iam.current_organization_id();
  if v_m.id is null then
    raise exception 'الاجتماع غير موجود.' using errcode = 'P0002';
  end if;

  perform qarar_iam.assert_permission('meetings.manage', v_m.governance_unit_id);
  if v_m.status <> 'waiting_for_minutes' then
    raise exception 'لا يمكن توليد مسودة المحضر قبل انتهاء الجلسة.' using errcode = '23514';
  end if;

  v_content := concat_ws(E'\n',
    'محضر ' || v_m.title_ar,
    'رقم الاجتماع: ' || v_m.meeting_no,
    'التاريخ: ' || v_m.scheduled_date::text,
    'الوقت: ' || v_m.start_time::text || ' - ' || v_m.end_time::text,
    'المكان: ' || coalesce(v_m.location_details, v_m.location_type),
    '',
    'الحضور:',
    coalesce((
      select string_agg('- ' || u.full_name_ar || ' (' || ar.attendance_status || ')', E'\n' order by u.full_name_ar)
      from qarar_attendance.attendance_records ar
      join qarar_iam.users u on u.id = ar.user_id
      where ar.meeting_id = v_m.id
        and ar.attendance_status in ('present', 'late', 'remote')
    ), '- لا يوجد حضور موثق.'),
    '',
    'جدول الأعمال والنتائج:',
    coalesce((
      select string_agg(
        ai.agenda_order::text || '. ' || t.title_ar || E'\n' ||
        coalesce(nullif(ai.discussion_notes, ''), 'لم يسجل ملخص للمناقشة.') ||
        coalesce(E'\nالقرار: ' || d.decision_text, ''),
        E'\n\n' order by ai.agenda_order
      )
      from qarar_meetings.agenda_items ai
      join qarar_topics.topics t on t.id = ai.topic_id
      left join qarar_decisions.decisions d on d.agenda_item_id = ai.id
      where ai.meeting_id = v_m.id
    ), '- لا توجد بنود موثقة.')
  );

  v_result := qarar_minutes.save_meeting_minutes_draft(v_m.id, v_content, null);
  update qarar_minutes.meeting_minutes
     set status = 'generated', generated_by_ai = false, generated_at = clock_timestamp()
   where id = (v_result ->> 'id')::uuid;

  return v_result || jsonb_build_object('status', 'generated', 'content_draft', v_content);
end;
$$;

grant select on qarar_meetings.meetings, qarar_meetings.agenda_items,
  qarar_topics.topics, qarar_attendance.attendance_records,
  qarar_iam.users, qarar_decisions.decisions
to qarar_minutes_executor;
grant update on qarar_minutes.meeting_minutes to qarar_minutes_executor;
grant execute on function qarar_minutes.save_meeting_minutes_draft(uuid, text, timestamp with time zone)
  to qarar_minutes_executor;

alter function qarar_minutes.generate_meeting_minutes_draft(uuid)
  owner to qarar_minutes_executor;
revoke all on function qarar_minutes.generate_meeting_minutes_draft(uuid)
  from public, anon, authenticated, service_role;
grant execute on function qarar_minutes.generate_meeting_minutes_draft(uuid)
  to qarar_api_executor;

create or replace function api_v1.get_topic_categories_for_unit(
  p_governance_unit_id uuid,
  p_effective_on date default current_date
) returns jsonb
language sql stable security definer set search_path = pg_catalog
as $$ select public.get_topic_categories_for_unit($1, $2) $$;

create or replace function api_v1.generate_meeting_minutes_draft(p_meeting_id uuid)
returns jsonb
language sql volatile security definer set search_path = pg_catalog
as $$ select qarar_minutes.generate_meeting_minutes_draft($1) $$;

create or replace function api_v1.sign_meeting_minutes_approval(
  p_approval_id uuid,
  p_signature_strokes jsonb,
  p_expected_updated_at timestamp with time zone
) returns jsonb
language sql volatile security definer set search_path = pg_catalog
as $$ select qarar_minutes.sign_meeting_minutes_approval($1, $2, $3) $$;

alter function api_v1.get_topic_categories_for_unit(uuid, date) owner to qarar_api_executor;
alter function api_v1.generate_meeting_minutes_draft(uuid) owner to qarar_api_executor;
alter function api_v1.sign_meeting_minutes_approval(uuid, jsonb, timestamp with time zone) owner to qarar_api_executor;

revoke all on function api_v1.get_topic_categories_for_unit(uuid, date),
  api_v1.generate_meeting_minutes_draft(uuid),
  api_v1.sign_meeting_minutes_approval(uuid, jsonb, timestamp with time zone)
from public, anon, authenticated, service_role;

grant execute on function api_v1.get_topic_categories_for_unit(uuid, date),
  api_v1.generate_meeting_minutes_draft(uuid),
  api_v1.sign_meeting_minutes_approval(uuid, jsonb, timestamp with time zone)
to authenticated, service_role;

notify pgrst, 'reload schema';
