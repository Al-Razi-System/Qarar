-- Sprint 01 production closure: controlled topic creation, review queue, and workflow.

create table public.topic_number_counters (
  organization_id uuid not null references public.organizations(id) on delete restrict,
  calendar_year integer not null check (calendar_year between 2000 and 9999),
  last_value bigint not null check (last_value > 0),
  updated_at timestamptz not null default now(),
  primary key (organization_id, calendar_year)
);

alter table public.topic_number_counters enable row level security;
revoke all on public.topic_number_counters from public, anon, authenticated;

alter table public.topics drop constraint if exists topics_status_check;
alter table public.topics add constraint topics_status_check
check (status in (
  'new', 'under_review', 'returned', 'approved', 'rejected', 'deferred',
  'listed', 'in_process', 'postponed', 'closed'
));

insert into public.permissions (
  organization_id, code, module, action, context_scope, name_ar, name_en, is_system_permission
)
select o.id, p.code, 'topics', p.action, p.context_scope, p.name_ar, p.name_en, true
from public.organizations o
cross join (values
  ('topics.create', 'create', 'governance_unit', 'إنشاء موضوع', 'Create topics'),
  ('topics.read', 'read', 'governance_unit', 'قراءة الموضوعات', 'Read topics'),
  ('topics.review', 'review', 'governance_unit', 'مراجعة الموضوعات', 'Review topics')
) as p(code, action, context_scope, name_ar, name_en)
on conflict (organization_id, code) do update
set module = excluded.module,
    action = excluded.action,
    context_scope = excluded.context_scope,
    name_ar = excluded.name_ar,
    name_en = excluded.name_en,
    is_system_permission = true,
    is_active = true,
    updated_at = now();

insert into public.role_permissions (organization_id, role_id, permission_id)
select r.organization_id, r.id, p.id
from public.roles r
join public.permissions p on p.organization_id = r.organization_id
where (r.code in ('governance_admin', 'council_chair', 'council_rapporteur')
       and p.code in ('topics.create', 'topics.read', 'topics.review'))
   or (r.code = 'council_member' and p.code in ('topics.create', 'topics.read'))
   or (r.code = 'internal_auditor' and p.code = 'topics.read')
on conflict (organization_id, role_id, permission_id) do update
set is_active = true, updated_at = now();

create or replace function public.create_topic(
  p_title_ar text,
  p_description text,
  p_category_id uuid,
  p_current_unit_id uuid,
  p_priority text default 'medium',
  p_source_type text default 'new',
  p_title_en text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.current_organization_id();
  v_user uuid := auth.uid();
  v_number bigint;
  v_topic_no text;
  v_topic_id uuid;
  v_year integer := extract(year from current_date)::integer;
begin
  if v_org is null or v_user is null then
    raise exception 'active authenticated account is required' using errcode = '42501';
  end if;
  perform public.assert_permission('topics.create', p_current_unit_id);

  if p_title_ar is null or char_length(btrim(p_title_ar)) not between 5 and 300 then
    raise exception 'title_ar must contain between 5 and 300 characters';
  end if;
  if p_description is null or char_length(btrim(p_description)) not between 10 and 10000 then
    raise exception 'description must contain between 10 and 10000 characters';
  end if;
  if p_category_id is null or not exists (
    select 1 from public.topic_categories
    where id = p_category_id and organization_id = v_org and is_active
  ) then
    raise exception 'active topic category not found in current organization';
  end if;
  if p_current_unit_id is null or not exists (
    select 1 from public.governance_units
    where id = p_current_unit_id and organization_id = v_org and status = 'active'
  ) then
    raise exception 'active governance unit not found in current organization';
  end if;
  if p_priority not in ('low', 'medium', 'high', 'urgent') then
    raise exception 'invalid topic priority';
  end if;
  if p_source_type not in ('new', 'from_lower_unit', 'from_upper_unit', 'from_peer_unit', 'from_admin_entity') then
    raise exception 'invalid topic source type';
  end if;
  if p_title_en is not null and char_length(btrim(p_title_en)) > 300 then
    raise exception 'title_en must not exceed 300 characters';
  end if;

  insert into public.topic_number_counters (organization_id, calendar_year, last_value)
  values (v_org, v_year, 1)
  on conflict (organization_id, calendar_year) do update
  set last_value = public.topic_number_counters.last_value + 1,
      updated_at = now()
  returning last_value into v_number;

  v_topic_no := format('TOP-%s-%s', v_year, lpad(v_number::text, 6, '0'));

  insert into public.topics (
    organization_id, topic_no, title_ar, title_en, description, category_id,
    current_unit_id, submitted_by_user_id, source_type, priority, status, submitted_at
  )
  values (
    v_org, v_topic_no, btrim(p_title_ar), nullif(btrim(coalesce(p_title_en, '')), ''),
    btrim(p_description), p_category_id, p_current_unit_id, v_user,
    p_source_type, p_priority, 'new', now()
  )
  returning id into v_topic_id;

  insert into public.topic_status_history (
    organization_id, topic_id, from_status, to_status, changed_by_user_id, change_reason
  )
  values (v_org, v_topic_id, null, 'new', v_user, 'topic created');

  perform public.append_audit_log(
    v_org, 'topics.create', 'topics', v_topic_id,
    jsonb_build_object('topic_no', v_topic_no, 'current_unit_id', p_current_unit_id)
  );

  return jsonb_build_object(
    'id', v_topic_id,
    'topic_no', v_topic_no,
    'status', 'new',
    'submitted_at', now()
  );
end;
$$;

create or replace function public.search_topic_review_queue(
  p_query text default null,
  p_status text default null,
  p_priority text default null,
  p_category_id uuid default null,
  p_governance_unit_id uuid default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org uuid := public.current_organization_id();
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  if v_org is null then
    raise exception 'active authenticated account is required' using errcode = '42501';
  end if;
  if p_status is not null and p_status not in ('new', 'under_review', 'returned', 'approved', 'rejected', 'deferred') then
    raise exception 'invalid review queue status';
  end if;
  if p_priority is not null and p_priority not in ('low', 'medium', 'high', 'urgent') then
    raise exception 'invalid topic priority';
  end if;
  if not public.is_system_admin() and not exists (
    select 1
    from public.memberships m
    join public.role_permissions rp
      on rp.organization_id = m.organization_id and rp.role_id = m.role_id and rp.is_active
    join public.permissions p
      on p.id = rp.permission_id and p.organization_id = rp.organization_id and p.is_active
    where m.organization_id = v_org
      and m.user_id = auth.uid()
      and m.membership_status = 'active'
      and (m.end_date is null or m.end_date >= current_date)
      and p.code in ('topics.read', 'topics.review')
  ) then
    raise exception 'permission denied: topics.read' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(to_jsonb(q) order by q.created_at desc)
      from (
        select t.id, t.topic_no, t.title_ar, t.title_en, t.description, t.priority,
               t.status, t.submitted_at, t.created_at, t.updated_at,
               tc.id as category_id, tc.name_ar as category_name_ar,
               gu.id as governance_unit_id, gu.name_ar as governance_unit_name_ar,
               u.id as submitted_by_user_id, u.full_name_ar as submitted_by_name_ar
        from public.topics t
        join public.topic_categories tc on tc.id = t.category_id
        join public.governance_units gu on gu.id = t.current_unit_id
        join public.users u on u.id = t.submitted_by_user_id
        where t.organization_id = v_org
          and t.status in ('new', 'under_review', 'returned', 'approved', 'rejected', 'deferred')
          and (p_status is null or t.status = p_status)
          and (p_priority is null or t.priority = p_priority)
          and (p_category_id is null or t.category_id = p_category_id)
          and (p_governance_unit_id is null or t.current_unit_id = p_governance_unit_id)
          and (public.is_system_admin()
               or public.has_permission('topics.read', t.current_unit_id)
               or public.has_permission('topics.review', t.current_unit_id))
          and (nullif(btrim(p_query), '') is null
               or t.topic_no ilike '%' || btrim(p_query) || '%'
               or t.title_ar ilike '%' || btrim(p_query) || '%'
               or coalesce(t.title_en, '') ilike '%' || btrim(p_query) || '%')
        order by t.created_at desc
        limit v_limit offset v_offset
      ) q
    ), '[]'::jsonb),
    'total', (
      select count(*)
      from public.topics t
      where t.organization_id = v_org
        and t.status in ('new', 'under_review', 'returned', 'approved', 'rejected', 'deferred')
        and (p_status is null or t.status = p_status)
        and (p_priority is null or t.priority = p_priority)
        and (p_category_id is null or t.category_id = p_category_id)
        and (p_governance_unit_id is null or t.current_unit_id = p_governance_unit_id)
        and (public.is_system_admin()
             or public.has_permission('topics.read', t.current_unit_id)
             or public.has_permission('topics.review', t.current_unit_id))
        and (nullif(btrim(p_query), '') is null
             or t.topic_no ilike '%' || btrim(p_query) || '%'
             or t.title_ar ilike '%' || btrim(p_query) || '%'
             or coalesce(t.title_en, '') ilike '%' || btrim(p_query) || '%')
    ),
    'limit', v_limit,
    'offset', v_offset
  );
end;
$$;

create or replace function public.review_topic(
  p_topic_id uuid,
  p_action text,
  p_reason text default null,
  p_expected_updated_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.current_organization_id();
  v_topic public.topics%rowtype;
  v_to_status text;
begin
  if v_org is null or auth.uid() is null then
    raise exception 'active authenticated account is required' using errcode = '42501';
  end if;
  if p_action not in ('approve', 'return', 'reject', 'defer') then
    raise exception 'invalid review action';
  end if;
  if p_action in ('return', 'reject', 'defer')
     and (p_reason is null or char_length(btrim(p_reason)) < 5) then
    raise exception 'a reason of at least 5 characters is required for this action';
  end if;
  if p_reason is not null and char_length(btrim(p_reason)) > 2000 then
    raise exception 'review reason must not exceed 2000 characters';
  end if;

  select * into v_topic
  from public.topics
  where id = p_topic_id and organization_id = v_org
  for update;

  if v_topic.id is null then
    raise exception 'topic not found in current organization';
  end if;
  perform public.assert_permission('topics.review', v_topic.current_unit_id);
  if v_topic.submitted_by_user_id = auth.uid() then
    raise exception 'topic submitter cannot review their own topic' using errcode = '42501';
  end if;
  if v_topic.status not in ('new', 'under_review') then
    raise exception 'topic is not awaiting review';
  end if;
  if p_expected_updated_at is null or v_topic.updated_at <> p_expected_updated_at then
    raise exception 'topic was modified; refresh before reviewing' using errcode = '40001';
  end if;

  v_to_status := case p_action
    when 'approve' then 'approved'
    when 'return' then 'returned'
    when 'reject' then 'rejected'
    when 'defer' then 'deferred'
  end;

  update public.topics
  set status = v_to_status
  where id = v_topic.id;

  insert into public.topic_status_history (
    organization_id, topic_id, from_status, to_status, changed_by_user_id, change_reason
  )
  values (
    v_org, v_topic.id, v_topic.status, v_to_status, auth.uid(),
    nullif(btrim(coalesce(p_reason, '')), '')
  );

  perform public.append_audit_log(
    v_org, 'topics.review.' || p_action, 'topics', v_topic.id,
    jsonb_build_object(
      'from_status', v_topic.status,
      'to_status', v_to_status,
      'reason', nullif(btrim(coalesce(p_reason, '')), '')
    )
  );

  return jsonb_build_object(
    'id', v_topic.id,
    'topic_no', v_topic.topic_no,
    'previous_status', v_topic.status,
    'status', v_to_status,
    'action', p_action
  );
end;
$$;

revoke insert, update, delete on public.topics from authenticated;
revoke insert, update, delete on public.topic_status_history from authenticated;
revoke all on function public.create_topic(text,text,uuid,uuid,text,text,text) from public, anon;
revoke all on function public.search_topic_review_queue(text,text,text,uuid,uuid,integer,integer) from public, anon;
revoke all on function public.review_topic(uuid,text,text,timestamptz) from public, anon;
grant execute on function public.create_topic(text,text,uuid,uuid,text,text,text) to authenticated;
grant execute on function public.search_topic_review_queue(text,text,text,uuid,uuid,integer,integer) to authenticated;
grant execute on function public.review_topic(uuid,text,text,timestamptz) to authenticated;
