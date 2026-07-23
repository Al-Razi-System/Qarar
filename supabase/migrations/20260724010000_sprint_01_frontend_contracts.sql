-- Sprint 01 frontend-complete read contracts, idempotency, and workflow continuation.

alter table public.topics add column client_request_id uuid;
create unique index topics_idempotency_key_idx
on public.topics (organization_id, submitted_by_user_id, client_request_id)
where client_request_id is not null;
create index topics_review_queue_idx
on public.topics (organization_id, current_unit_id, status, priority, created_at desc);
create index topic_status_history_topic_time_idx
on public.topic_status_history (organization_id, topic_id, changed_at, id);

drop policy if exists "topics are visible to submitters, unit members, and governance roles" on public.topics;
create policy "topics follow submitter and explicit scoped permissions"
on public.topics for select to authenticated
using (
  organization_id = public.current_organization_id()
  and (
    submitted_by_user_id = auth.uid()
    or public.is_system_admin()
    or public.has_permission('topics.read', current_unit_id)
    or public.has_permission('topics.review', current_unit_id)
  )
);

create or replace function public.get_topic_form_options()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org uuid := public.current_organization_id();
begin
  if v_org is null then
    raise exception 'active authenticated account is required' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'code', c.code, 'name_ar', c.name_ar, 'name_en', c.name_en
      ) order by c.name_ar)
      from public.topic_categories c
      where c.organization_id = v_org and c.is_active
    ), '[]'::jsonb),
    'governance_units', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', u.id, 'code', u.code, 'name_ar', u.name_ar, 'name_en', u.name_en
      ) order by u.name_ar)
      from public.governance_units u
      where u.organization_id = v_org
        and u.status = 'active'
        and (public.is_system_admin() or public.has_permission('topics.create', u.id))
    ), '[]'::jsonb),
    'priorities', '["low","medium","high","urgent"]'::jsonb,
    'source_types', '["new","from_lower_unit","from_upper_unit","from_peer_unit","from_admin_entity"]'::jsonb
  );
end;
$$;

create or replace function public.search_my_topics(
  p_query text default null,
  p_status text default null,
  p_priority text default null,
  p_limit integer default 25,
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
  v_user uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  if v_org is null or v_user is null then
    raise exception 'active authenticated account is required' using errcode = '42501';
  end if;
  if p_status is not null and p_status not in (
    'new','under_review','returned','approved','rejected','deferred',
    'listed','in_process','postponed','closed'
  ) then
    raise exception 'invalid topic status';
  end if;
  if p_priority is not null and p_priority not in ('low','medium','high','urgent') then
    raise exception 'invalid topic priority';
  end if;

  return jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at desc)
      from (
        select t.id, t.topic_no, t.title_ar, t.title_en, t.priority, t.status,
               t.submitted_at, t.created_at, t.updated_at,
               c.id category_id, c.name_ar category_name_ar,
               u.id governance_unit_id, u.name_ar governance_unit_name_ar
        from public.topics t
        join public.topic_categories c on c.id = t.category_id
        join public.governance_units u on u.id = t.current_unit_id
        where t.organization_id = v_org and t.submitted_by_user_id = v_user
          and (p_status is null or t.status = p_status)
          and (p_priority is null or t.priority = p_priority)
          and (nullif(btrim(p_query),'') is null
               or t.topic_no ilike '%'||btrim(p_query)||'%'
               or t.title_ar ilike '%'||btrim(p_query)||'%'
               or coalesce(t.title_en,'') ilike '%'||btrim(p_query)||'%')
        order by t.created_at desc limit v_limit offset v_offset
      ) x
    ), '[]'::jsonb),
    'total', (
      select count(*) from public.topics t
      where t.organization_id = v_org and t.submitted_by_user_id = v_user
        and (p_status is null or t.status = p_status)
        and (p_priority is null or t.priority = p_priority)
        and (nullif(btrim(p_query),'') is null
             or t.topic_no ilike '%'||btrim(p_query)||'%'
             or t.title_ar ilike '%'||btrim(p_query)||'%'
             or coalesce(t.title_en,'') ilike '%'||btrim(p_query)||'%')
    ),
    'limit', v_limit, 'offset', v_offset
  );
end;
$$;

create or replace function public.get_topic_detail(p_topic_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org uuid := public.current_organization_id();
  v_topic public.topics%rowtype;
  v_result jsonb;
begin
  if v_org is null or auth.uid() is null then
    raise exception 'active authenticated account is required' using errcode = '42501';
  end if;
  select * into v_topic from public.topics
  where id = p_topic_id and organization_id = v_org;
  if v_topic.id is null then
    raise exception 'topic not found' using errcode = 'P0002';
  end if;
  if v_topic.submitted_by_user_id <> auth.uid()
     and not public.is_system_admin()
     and not public.has_permission('topics.read', v_topic.current_unit_id)
     and not public.has_permission('topics.review', v_topic.current_unit_id) then
    raise exception 'permission denied: topics.read' using errcode = '42501';
  end if;

  select to_jsonb(t)
    || jsonb_build_object(
      'category', jsonb_build_object('id', c.id, 'code', c.code, 'name_ar', c.name_ar, 'name_en', c.name_en),
      'governance_unit', jsonb_build_object('id', gu.id, 'code', gu.code, 'name_ar', gu.name_ar, 'name_en', gu.name_en),
      'submitted_by', jsonb_build_object('id', u.id, 'full_name_ar', u.full_name_ar, 'full_name_en', u.full_name_en),
      'history', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', h.id, 'from_status', h.from_status, 'to_status', h.to_status,
            'change_reason', h.change_reason, 'changed_at', h.changed_at,
            'changed_by_user_id', h.changed_by_user_id,
            'changed_by_name_ar', hu.full_name_ar
          ) order by h.changed_at, h.id
        )
        from public.topic_status_history h
        left join public.users hu on hu.id = h.changed_by_user_id
        where h.topic_id = t.id and h.organization_id = t.organization_id
      ), '[]'::jsonb),
      'allowed_review_actions', case
        when t.submitted_by_user_id = auth.uid()
          or (not public.is_system_admin() and not public.has_permission('topics.review', t.current_unit_id))
          then '[]'::jsonb
        when t.status = 'new' then '["start_review","approve","return","reject","defer"]'::jsonb
        when t.status = 'under_review' then '["approve","return","reject","defer"]'::jsonb
        when t.status = 'deferred' then '["resume"]'::jsonb
        else '[]'::jsonb
      end
    )
  into v_result
  from public.topics t
  join public.topic_categories c on c.id = t.category_id
  join public.governance_units gu on gu.id = t.current_unit_id
  join public.users u on u.id = t.submitted_by_user_id
  where t.id = v_topic.id;
  return v_result;
end;
$$;

drop function public.create_topic(text,text,uuid,uuid,text,text,text);
create function public.create_topic(
  p_title_ar text,
  p_description text,
  p_category_id uuid,
  p_current_unit_id uuid,
  p_priority text default 'medium',
  p_source_type text default 'new',
  p_title_en text default null,
  p_client_request_id uuid default null
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
  v_existing public.topics%rowtype;
  v_year integer := extract(year from current_date)::integer;
begin
  if v_org is null or v_user is null then
    raise exception 'active authenticated account is required' using errcode = '42501';
  end if;
  perform public.assert_permission('topics.create', p_current_unit_id);
  perform public.consume_iam_rate_limit('topics.create', 20, 600);

  if p_title_ar is null or char_length(btrim(p_title_ar)) not between 5 and 300 then
    raise exception 'title_ar must contain between 5 and 300 characters';
  end if;
  if p_description is null or char_length(btrim(p_description)) not between 10 and 10000 then
    raise exception 'description must contain between 10 and 10000 characters';
  end if;
  if p_category_id is null or not exists (
    select 1 from public.topic_categories
    where id = p_category_id and organization_id = v_org and is_active
  ) then raise exception 'active topic category not found in current organization'; end if;
  if p_current_unit_id is null or not exists (
    select 1 from public.governance_units
    where id = p_current_unit_id and organization_id = v_org and status = 'active'
  ) then raise exception 'active governance unit not found in current organization'; end if;
  if p_priority not in ('low','medium','high','urgent') then raise exception 'invalid topic priority'; end if;
  if p_source_type not in ('new','from_lower_unit','from_upper_unit','from_peer_unit','from_admin_entity') then
    raise exception 'invalid topic source type';
  end if;
  if p_title_en is not null and char_length(btrim(p_title_en)) > 300 then
    raise exception 'title_en must not exceed 300 characters';
  end if;

  if p_client_request_id is not null then
    perform pg_advisory_xact_lock(hashtextextended(v_org::text || ':' || v_user::text || ':' || p_client_request_id::text, 0));
    select * into v_existing from public.topics
    where organization_id = v_org and submitted_by_user_id = v_user
      and client_request_id = p_client_request_id;
    if v_existing.id is not null then
      return jsonb_build_object(
        'id', v_existing.id, 'topic_no', v_existing.topic_no, 'status', v_existing.status,
        'submitted_at', v_existing.submitted_at, 'idempotent_replay', true
      );
    end if;
  end if;

  insert into public.topic_number_counters(organization_id,calendar_year,last_value)
  values(v_org,v_year,1)
  on conflict(organization_id,calendar_year) do update
  set last_value=public.topic_number_counters.last_value+1,updated_at=now()
  returning last_value into v_number;
  v_topic_no := format('TOP-%s-%s',v_year,lpad(v_number::text,6,'0'));

  insert into public.topics(
    organization_id,topic_no,title_ar,title_en,description,category_id,current_unit_id,
    submitted_by_user_id,source_type,priority,status,submitted_at,client_request_id
  ) values(
    v_org,v_topic_no,btrim(p_title_ar),nullif(btrim(coalesce(p_title_en,'')),''),
    btrim(p_description),p_category_id,p_current_unit_id,v_user,p_source_type,p_priority,
    'new',now(),p_client_request_id
  ) returning id into v_topic_id;
  insert into public.topic_status_history(
    organization_id,topic_id,from_status,to_status,changed_by_user_id,change_reason
  ) values(v_org,v_topic_id,null,'new',v_user,'topic created');
  perform public.append_audit_log(v_org,'topics.create','topics',v_topic_id,
    jsonb_build_object('topic_no',v_topic_no,'current_unit_id',p_current_unit_id,'client_request_id',p_client_request_id));
  return jsonb_build_object(
    'id',v_topic_id,'topic_no',v_topic_no,'status','new','submitted_at',now(),'idempotent_replay',false
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
    raise exception 'active authenticated account is required' using errcode='42501';
  end if;
  if p_action not in ('start_review','approve','return','reject','defer','resume') then
    raise exception 'invalid review action';
  end if;
  if p_action in ('return','reject','defer') and (p_reason is null or char_length(btrim(p_reason))<5) then
    raise exception 'a reason of at least 5 characters is required for this action';
  end if;
  if p_reason is not null and char_length(btrim(p_reason))>2000 then
    raise exception 'review reason must not exceed 2000 characters';
  end if;
  select * into v_topic from public.topics
  where id=p_topic_id and organization_id=v_org for update;
  if v_topic.id is null then raise exception 'topic not found in current organization'; end if;
  perform public.assert_permission('topics.review',v_topic.current_unit_id);
  perform public.consume_iam_rate_limit('topics.review',120,600);
  if v_topic.submitted_by_user_id=auth.uid() then
    raise exception 'topic submitter cannot review their own topic' using errcode='42501';
  end if;
  if p_expected_updated_at is null or v_topic.updated_at<>p_expected_updated_at then
    raise exception 'topic was modified; refresh before reviewing' using errcode='40001';
  end if;

  if p_action='start_review' and v_topic.status='new' then v_to_status:='under_review';
  elsif p_action='resume' and v_topic.status='deferred' then v_to_status:='under_review';
  elsif p_action in ('approve','return','reject','defer') and v_topic.status in ('new','under_review') then
    v_to_status:=case p_action
      when 'approve' then 'approved' when 'return' then 'returned'
      when 'reject' then 'rejected' when 'defer' then 'deferred' end;
  else
    raise exception 'action % is not allowed from status %',p_action,v_topic.status;
  end if;

  update public.topics set status=v_to_status where id=v_topic.id;
  insert into public.topic_status_history(
    organization_id,topic_id,from_status,to_status,changed_by_user_id,change_reason
  ) values(v_org,v_topic.id,v_topic.status,v_to_status,auth.uid(),nullif(btrim(coalesce(p_reason,'')),''));
  perform public.append_audit_log(v_org,'topics.review.'||p_action,'topics',v_topic.id,
    jsonb_build_object('from_status',v_topic.status,'to_status',v_to_status,'reason',nullif(btrim(coalesce(p_reason,'')),'') ));
  return jsonb_build_object(
    'id',v_topic.id,'topic_no',v_topic.topic_no,'previous_status',v_topic.status,
    'status',v_to_status,'action',p_action
  );
end;
$$;

revoke all on function public.get_topic_form_options() from public, anon;
revoke all on function public.search_my_topics(text,text,text,integer,integer) from public, anon;
revoke all on function public.get_topic_detail(uuid) from public, anon;
revoke all on function public.create_topic(text,text,uuid,uuid,text,text,text,uuid) from public, anon;
grant execute on function public.get_topic_form_options() to authenticated;
grant execute on function public.search_my_topics(text,text,text,integer,integer) to authenticated;
grant execute on function public.get_topic_detail(uuid) to authenticated;
grant execute on function public.create_topic(text,text,uuid,uuid,text,text,text,uuid) to authenticated;
