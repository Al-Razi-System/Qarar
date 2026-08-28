-- Restore routines that existed in the captured local database but were not
-- represented by the migration chain. Keep these definitions source-controlled
-- so a clean installation exposes the same api_v1 surface as the snapshot.

create or replace function qarar_minutes.generate_meeting_minutes_draft(
  p_meeting_id uuid
) returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_m qarar_meetings.meetings%rowtype;
  v_min qarar_minutes.meeting_minutes%rowtype;
  v_attendance text;
  v_agenda text;
  v_content text;
begin
  select * into v_m
  from qarar_meetings.meetings
  where id = p_meeting_id
    and organization_id = qarar_iam.current_organization_id()
  for update;

  if v_m.id is null then
    raise exception 'الاجتماع غير موجود.' using errcode = 'P0002';
  end if;
  if not qarar_attendance.can_operate_live_meeting(v_m.id) then
    raise exception 'إعداد المحضر متاح لرئيس المجلس أو مقرره فقط.' using errcode = '42501';
  end if;
  if v_m.status <> 'waiting_for_minutes' then
    raise exception 'الاجتماع ليس في مرحلة إعداد المحضر.' using errcode = '23514';
  end if;

  select string_agg(
    '- ' || u.full_name_ar || ' (' ||
    case a.attendance_status when 'late' then 'حاضر متأخر' else 'حاضر' end || ')',
    E'\n' order by u.full_name_ar
  )
  into v_attendance
  from qarar_attendance.attendance_records a
  join qarar_iam.users u on u.id = a.user_id
  where a.meeting_id = v_m.id
    and a.attendance_status in ('present', 'late')
    and a.verification_status = 'verified';

  select string_agg(
    ai.agenda_order || '. ' || t.title_ar || E'\nالنتيجة: ' ||
    coalesce(ai.discussion_notes, 'لم يدون ملخص النتائج.'),
    E'\n\n' order by ai.agenda_order
  )
  into v_agenda
  from qarar_meetings.agenda_items ai
  join qarar_topics.topics t on t.id = ai.topic_id
  where ai.meeting_id = v_m.id;

  v_content := 'محضر ' || v_m.title_ar || E'\n\n'
    || 'رقم الاجتماع: ' || coalesce(v_m.meeting_no, 'غير محدد') || E'\n'
    || 'التاريخ: ' || coalesce(v_m.scheduled_date::text, 'غير محدد') || E'\n'
    || 'المكان: ' || coalesce(v_m.location_details, v_m.location_type, 'غير محدد') || E'\n\n'
    || 'الحضور المعتمد:' || E'\n' || coalesce(v_attendance, 'لا يوجد حضور معتمد.') || E'\n\n'
    || 'جدول الأعمال ونتائج المناقشات:' || E'\n' || coalesce(v_agenda, 'لا توجد بنود.') || E'\n\n'
    || 'أُعدت هذه المسودة من بيانات الجلسة الموثقة، وتخضع لمراجعة المقرر قبل إرسالها للمصادقة.';

  select * into v_min
  from qarar_minutes.meeting_minutes
  where meeting_id = v_m.id
  for update;

  if v_min.id is null then
    insert into qarar_minutes.meeting_minutes(
      organization_id, meeting_id, content_draft, status,
      generated_by_ai, generated_at, created_by_user_id
    ) values (
      v_m.organization_id, v_m.id, v_content, 'generated',
      false, clock_timestamp(), auth.uid()
    ) returning * into v_min;
  elsif v_min.status in ('draft', 'generated') then
    update qarar_minutes.meeting_minutes
    set content_draft = v_content,
        status = 'generated',
        generated_by_ai = false,
        generated_at = clock_timestamp()
    where id = v_min.id
    returning * into v_min;
  else
    raise exception 'المحضر مرسل للمصادقة ولا يمكن إعادة توليده.' using errcode = '23514';
  end if;

  perform qarar_audit.append_audit_log(
    v_m.organization_id,
    'minutes.draft.generate',
    'meeting_minutes',
    v_min.id,
    jsonb_build_object('meeting_id', v_m.id, 'source', 'structured_session_data')
  );

  return jsonb_build_object(
    'id', v_min.id,
    'status', v_min.status,
    'content_draft', v_min.content_draft,
    'updated_at', v_min.updated_at
  );
end
$function$;

alter function qarar_minutes.generate_meeting_minutes_draft(uuid)
  owner to qarar_minutes_executor;
revoke all on function qarar_minutes.generate_meeting_minutes_draft(uuid)
  from public, anon, authenticated, service_role;
grant execute on function qarar_minutes.generate_meeting_minutes_draft(uuid)
  to qarar_api_executor, qarar_minutes_executor;

create or replace function public.get_topic_categories_for_unit(
  p_governance_unit_id uuid,
  p_effective_on date default null::date
) returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_org uuid := qarar_iam.current_organization_id();
  v_unit qarar_core.governance_units%rowtype;
  v_governance_level text;
  v_effective_on date := coalesce(p_effective_on, timezone('Asia/Riyadh', now())::date);
begin
  if v_org is null or auth.uid() is null then
    raise exception using errcode = '42501', message = 'يلزم حساب نشط ومصادق عليه';
  end if;

  perform qarar_iam.assert_permission('topics.create', p_governance_unit_id);

  select * into v_unit
  from qarar_core.governance_units
  where id = p_governance_unit_id
    and organization_id = v_org
    and status = 'active';

  if v_unit.id is null then
    raise exception using errcode = 'P0002', message = 'المجلس غير موجود أو غير نشط';
  end if;

  select governance_level into v_governance_level
  from qarar_governance.governance_unit_classes
  where id = v_unit.governance_class_id
    and organization_id = v_org;

  return jsonb_build_object(
    'governance_unit_id', v_unit.id,
    'effective_on', v_effective_on,
    'categories', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', category.id,
          'code', category.code,
          'name_ar', category.name_ar,
          'name_en', category.name_en,
          'executable_item_count', category.executable_item_count
        ) order by category.name_ar
      )
      from (
        select
          c.id,
          c.code,
          c.name_ar,
          c.name_en,
          count(distinct pi.id)::integer as executable_item_count
        from qarar_governance.policies p
        join qarar_governance.policy_versions pv
          on pv.policy_id = p.id
         and pv.organization_id = p.organization_id
        join qarar_governance.policy_items pi
          on pi.policy_version_id = pv.id
         and pi.organization_id = p.organization_id
        join qarar_topics.topic_categories c
          on c.id = pi.topic_category_id
         and c.organization_id = p.organization_id
         and c.is_active
        join qarar_governance.policy_scope_assignments sa
          on sa.policy_version_id = pv.id
         and sa.organization_id = p.organization_id
        where p.organization_id = v_org
          and p.status = 'active'
          and pv.legal_status = 'effective'
          and pv.automation_status = 'ready'
          and v_effective_on >= pv.effective_from
          and (pv.effective_to is null or v_effective_on <= pv.effective_to)
          and pi.is_active
          and pi.requires_executable_rule
          and sa.is_active
          and (sa.valid_from is null or v_effective_on >= sa.valid_from)
          and (sa.valid_to is null or v_effective_on <= sa.valid_to)
          and (
            sa.scope_type = 'organization'
            or (sa.scope_type = 'governance_unit' and sa.governance_unit_id = v_unit.id)
            or (sa.scope_type = 'governance_class' and sa.governance_class_id = v_unit.governance_class_id)
            or (sa.scope_type = 'governance_level' and sa.governance_level = v_governance_level)
            or (sa.scope_type = 'governance_unit_type' and sa.governance_unit_type_id = v_unit.unit_type_id)
            or (sa.scope_type = 'unit_subtree' and exists (
              with recursive descendants as (
                select id
                from qarar_core.governance_units
                where id = sa.governance_unit_id
                  and organization_id = v_org
                union all
                select child.id
                from qarar_core.governance_units child
                join descendants parent on child.parent_unit_id = parent.id
                where child.organization_id = v_org
              )
              select 1 from descendants where id = v_unit.id
            ))
          )
          and not exists (
            select 1
            from qarar_governance.policy_item_scope_overrides scope_override
            where scope_override.policy_item_id = pi.id
              and scope_override.scope_assignment_id = sa.id
              and scope_override.governance_unit_id = v_unit.id
              and not scope_override.is_included
              and (scope_override.valid_from is null or v_effective_on >= scope_override.valid_from)
              and (scope_override.valid_to is null or v_effective_on <= scope_override.valid_to)
          )
        group by c.id, c.code, c.name_ar, c.name_en
      ) category
    ), '[]'::jsonb)
  );
end;
$function$;

alter function public.get_topic_categories_for_unit(uuid, date)
  owner to supabase_admin;
revoke all on function public.get_topic_categories_for_unit(uuid, date)
  from public, anon, authenticated, service_role;
grant execute on function public.get_topic_categories_for_unit(uuid, date)
  to postgres;

insert into qarar_architecture.api_contract_registry(
  api_version,
  contract_name,
  implementation_schema,
  implementation_name,
  identity_arguments,
  module_code,
  audience
) values
  ('v1', 'generate_meeting_minutes_draft', 'qarar_minutes', 'generate_meeting_minutes_draft',
   'p_meeting_id uuid', 'minutes', 'authenticated'),
  ('v1', 'get_topic_categories_for_unit', 'public', 'get_topic_categories_for_unit',
   'p_governance_unit_id uuid, p_effective_on date', 'topics', 'authenticated'),
  ('v1', 'sign_meeting_minutes_approval', 'qarar_minutes', 'sign_meeting_minutes_approval',
   'p_approval_id uuid, p_signature_strokes jsonb, p_expected_updated_at timestamp with time zone',
   'minutes', 'authenticated')
on conflict (api_version, contract_name, identity_arguments) do update
set implementation_schema = excluded.implementation_schema,
    implementation_name = excluded.implementation_name,
    module_code = excluded.module_code,
    audience = excluded.audience,
    deprecated_at = null,
    replacement_contract = null;

create or replace function api_v1.generate_meeting_minutes_draft(p_meeting_id uuid)
returns jsonb
language sql
volatile
security definer
set search_path to 'pg_catalog'
as $function$
  select qarar_minutes.generate_meeting_minutes_draft($1)
$function$;

alter function api_v1.generate_meeting_minutes_draft(uuid)
  owner to qarar_api_executor;
revoke all on function api_v1.generate_meeting_minutes_draft(uuid)
  from public, anon, authenticated, service_role;
grant execute on function api_v1.generate_meeting_minutes_draft(uuid)
  to authenticated, service_role;

create or replace function api_v1.get_topic_categories_for_unit(
  p_governance_unit_id uuid,
  p_effective_on date default null::date
) returns jsonb
language sql
stable
security definer
set search_path to 'pg_catalog'
as $function$
  select public.get_topic_categories_for_unit($1, $2)
$function$;

alter function api_v1.get_topic_categories_for_unit(uuid, date)
  owner to supabase_admin;
revoke all on function api_v1.get_topic_categories_for_unit(uuid, date)
  from public, anon, authenticated, service_role;
grant execute on function api_v1.get_topic_categories_for_unit(uuid, date)
  to authenticated, service_role;

create or replace function api_v1.sign_meeting_minutes_approval(
  p_approval_id uuid,
  p_signature_strokes jsonb,
  p_expected_updated_at timestamp with time zone
) returns jsonb
language sql
volatile
security definer
set search_path to 'pg_catalog'
as $function$
  select qarar_minutes.sign_meeting_minutes_approval($1, $2, $3)
$function$;

alter function api_v1.sign_meeting_minutes_approval(uuid, jsonb, timestamp with time zone)
  owner to qarar_api_executor;
revoke all on function api_v1.sign_meeting_minutes_approval(uuid, jsonb, timestamp with time zone)
  from public, anon, authenticated, service_role;
grant execute on function api_v1.sign_meeting_minutes_approval(uuid, jsonb, timestamp with time zone)
  to authenticated, service_role;

notify pgrst, 'reload schema';
