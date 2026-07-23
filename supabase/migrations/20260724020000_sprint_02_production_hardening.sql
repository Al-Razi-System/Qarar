-- Sprint 02 production contracts: referrals, meetings, lifecycle, and agenda.

create table public.meeting_number_counters (
  organization_id uuid not null references public.organizations(id) on delete restrict,
  calendar_year integer not null check (calendar_year between 2000 and 9999),
  last_value bigint not null check (last_value > 0),
  updated_at timestamptz not null default now(),
  primary key (organization_id, calendar_year)
);
alter table public.meeting_number_counters enable row level security;
revoke all on public.meeting_number_counters from public, anon, authenticated;

create table public.meeting_status_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  meeting_id uuid not null references public.meetings(id) on delete restrict,
  from_status text,
  to_status text not null,
  changed_by_user_id uuid references public.users(id) on delete set null,
  change_reason text,
  changed_at timestamptz not null default now(),
  foreign key (meeting_id, organization_id) references public.meetings(id, organization_id),
  foreign key (changed_by_user_id, organization_id) references public.users(id, organization_id)
);
alter table public.meeting_status_history enable row level security;
create index meeting_status_history_meeting_time_idx
on public.meeting_status_history(organization_id,meeting_id,changed_at,id);

alter table public.meetings add column client_request_id uuid;
alter table public.topic_referrals
  add column response_reason text,
  add column responded_by_user_id uuid,
  add column responded_at timestamptz,
  add foreign key (responded_by_user_id) references public.users(id) on delete set null,
  add foreign key (responded_by_user_id, organization_id)
    references public.users(id, organization_id);
create unique index meetings_idempotency_key_idx
on public.meetings(organization_id,created_by_user_id,client_request_id)
where client_request_id is not null;
create index meetings_search_idx
on public.meetings(organization_id,governance_unit_id,status,scheduled_date,created_at desc);
create unique index agenda_items_meeting_order_uidx on public.agenda_items(meeting_id,agenda_order);
create unique index topic_referrals_one_pending_uidx on public.topic_referrals(topic_id) where status='pending';
create index topic_referrals_topic_time_idx on public.topic_referrals(organization_id,topic_id,referred_at,id);

insert into public.permissions(organization_id,code,module,action,context_scope,name_ar,name_en,is_system_permission)
select o.id,p.code,p.module,p.action,'governance_unit',p.name_ar,p.name_en,true
from public.organizations o cross join (values
 ('topics.refer','topics','refer','إحالة الموضوعات','Refer topics'),
 ('topics.referrals.read','topics','referrals.read','قراءة مسار الإحالات','Read topic referrals'),
 ('meetings.create','meetings','create','إنشاء الاجتماعات','Create meetings'),
 ('meetings.read','meetings','read','قراءة الاجتماعات','Read meetings'),
 ('meetings.manage','meetings','manage','إدارة الاجتماعات','Manage meetings'),
 ('agenda.manage','agenda','manage','إدارة جدول الأعمال','Manage agenda'),
 ('agenda.exception','agenda','exception','اعتماد استثناء جدول الأعمال','Grant agenda exceptions')
) p(code,module,action,name_ar,name_en)
on conflict(organization_id,code) do update set
 module=excluded.module,action=excluded.action,context_scope=excluded.context_scope,
 name_ar=excluded.name_ar,name_en=excluded.name_en,is_system_permission=true,is_active=true,updated_at=now();

insert into public.role_permissions(organization_id,role_id,permission_id)
select r.organization_id,r.id,p.id from public.roles r
join public.permissions p on p.organization_id=r.organization_id
where (r.code='governance_admin' and p.code in(
 'topics.refer','topics.referrals.read','meetings.create','meetings.read','meetings.manage','agenda.manage','agenda.exception'))
or (r.code in('council_chair','council_rapporteur') and p.code in(
 'topics.refer','topics.referrals.read','meetings.create','meetings.read','meetings.manage','agenda.manage'))
or (r.code='council_member' and p.code in('topics.referrals.read','meetings.read'))
on conflict(organization_id,role_id,permission_id) do update set is_active=true,updated_at=now();

create or replace function public.check_agenda_item_eligibility()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_topic public.topics%rowtype;
  v_meeting public.meetings%rowtype;
begin
  select * into v_meeting
  from public.meetings
  where id=new.meeting_id and organization_id=new.organization_id;
  if v_meeting.id is null then
    raise exception 'meeting not found in agenda organization';
  end if;

  select * into v_topic
  from public.topics
  where id=new.topic_id and organization_id=new.organization_id;
  if v_topic.id is null then
    raise exception 'topic not found in agenda organization';
  end if;

  if v_topic.status<>'approved' and not new.is_exception then
    raise exception 'topic is not eligible for agenda without an exception';
  end if;
  if new.is_exception and (
    new.exception_reason is null
    or char_length(btrim(new.exception_reason)) not between 5 and 2000
  ) then
    raise exception 'exception reason must contain between 5 and 2000 characters';
  end if;
  if new.is_exception
    and not public.is_system_admin()
    and not public.has_permission('agenda.exception',v_meeting.governance_unit_id)
  then
    raise exception 'permission denied: agenda.exception' using errcode='42501';
  end if;
  return new;
end $$;

drop policy if exists "topic referrals are visible inside organization" on public.topic_referrals;
drop policy if exists "users can refer topics" on public.topic_referrals;
drop policy if exists "unit members can manage referrals" on public.topic_referrals;
create policy "referrals follow scoped permissions" on public.topic_referrals for select to authenticated using(
 organization_id=public.current_organization_id() and (
  public.is_system_admin() or referred_by_user_id=auth.uid()
  or public.has_permission('topics.referrals.read',from_unit_id)
  or public.has_permission('topics.referrals.read',to_unit_id)
  or public.has_permission('topics.refer',from_unit_id)
  or public.has_permission('topics.refer',to_unit_id)
 ));

drop policy if exists "meetings are visible to organization members" on public.meetings;
drop policy if exists "unit members and admins can manage meetings" on public.meetings;
create policy "meetings follow scoped read permission" on public.meetings for select to authenticated using(
 organization_id=public.current_organization_id() and (
  public.is_system_admin() or created_by_user_id=auth.uid()
  or public.has_permission('meetings.read',governance_unit_id)
  or public.has_permission('meetings.manage',governance_unit_id)
 ));
create policy "meeting history follows meeting visibility" on public.meeting_status_history for select to authenticated using(
 organization_id=public.current_organization_id() and exists(
  select 1 from public.meetings m where m.id=meeting_id and m.organization_id=organization_id
 ));

drop policy if exists "agenda items follow meeting visibility" on public.agenda_items;
drop policy if exists "unit members can manage agenda" on public.agenda_items;
create policy "agenda follows meeting visibility" on public.agenda_items for select to authenticated using(
 organization_id=public.current_organization_id() and exists(
  select 1 from public.meetings m where m.id=meeting_id and m.organization_id=organization_id
 ));

create or replace function public.get_sprint02_form_options()
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_org uuid:=public.current_organization_id();
begin
 if v_org is null then raise exception 'active authenticated account is required' using errcode='42501'; end if;
 return jsonb_build_object(
  'meeting_types',coalesce((select jsonb_agg(jsonb_build_object('id',id,'code',code,'name_ar',name_ar,'name_en',name_en) order by name_ar)
    from public.meeting_types where organization_id=v_org and is_active),'[]'::jsonb),
  'meeting_units',coalesce((select jsonb_agg(jsonb_build_object('id',id,'code',code,'name_ar',name_ar,'name_en',name_en) order by name_ar)
    from public.governance_units u where organization_id=v_org and status='active'
    and (public.is_system_admin() or public.has_permission('meetings.create',u.id))),'[]'::jsonb),
  'referral_units',coalesce((select jsonb_agg(jsonb_build_object('id',id,'code',code,'name_ar',name_ar,'name_en',name_en) order by name_ar)
    from public.governance_units where organization_id=v_org and status='active'),'[]'::jsonb),
  'location_types','["onsite","online","hybrid"]'::jsonb);
end $$;

create or replace function public.refer_topic(
 p_topic_id uuid,p_to_unit_id uuid,p_reason text,p_expected_updated_at timestamptz
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_org uuid:=public.current_organization_id();v_topic public.topics%rowtype;v_id uuid;
begin
 select * into v_topic from public.topics where id=p_topic_id and organization_id=v_org for update;
 if v_topic.id is null then raise exception 'topic not found in current organization'; end if;
 perform public.assert_permission('topics.refer',v_topic.current_unit_id);
 if v_topic.current_unit_id is null then raise exception 'topic has no current governance unit'; end if;
 if p_to_unit_id=v_topic.current_unit_id then raise exception 'destination unit must differ from current unit'; end if;
 if not exists(select 1 from public.governance_units where id=p_to_unit_id and organization_id=v_org and status='active')
 then raise exception 'active destination unit not found in current organization'; end if;
 if p_reason is null or char_length(btrim(p_reason)) not between 5 and 2000 then
  raise exception 'referral reason must contain between 5 and 2000 characters'; end if;
 if p_expected_updated_at is null or p_expected_updated_at<>v_topic.updated_at then
  raise exception 'topic was modified; refresh before referral' using errcode='40001'; end if;
 if exists(select 1 from public.topic_referrals where topic_id=v_topic.id and status='pending')
 then raise exception 'topic already has a pending referral'; end if;
 insert into public.topic_referrals(organization_id,topic_id,from_unit_id,to_unit_id,referred_by_user_id,referral_reason,status)
 values(v_org,v_topic.id,v_topic.current_unit_id,p_to_unit_id,auth.uid(),btrim(p_reason),'pending') returning id into v_id;
 perform public.append_audit_log(v_org,'topics.referral.request','topic_referrals',v_id,
  jsonb_build_object('topic_id',v_topic.id,'from_unit_id',v_topic.current_unit_id,'to_unit_id',p_to_unit_id,'reason',btrim(p_reason)));
 return jsonb_build_object('referral_id',v_id,'topic_id',v_topic.id,'status','pending','from_unit_id',v_topic.current_unit_id,'to_unit_id',p_to_unit_id);
end $$;

create or replace function public.respond_topic_referral(
 p_referral_id uuid,p_decision text,p_reason text default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_org uuid:=public.current_organization_id();v_ref public.topic_referrals%rowtype;
begin
 if p_decision not in('accept','reject') then raise exception 'decision must be accept or reject'; end if;
 if p_decision='reject' and (p_reason is null or char_length(btrim(p_reason))<5) then
  raise exception 'rejection reason must contain at least 5 characters'; end if;
 select * into v_ref from public.topic_referrals where id=p_referral_id and organization_id=v_org for update;
 if v_ref.id is null or v_ref.status<>'pending' then raise exception 'pending referral not found'; end if;
 perform public.assert_permission('topics.refer',v_ref.to_unit_id);
 update public.topic_referrals
 set status=case p_decision when 'accept' then 'accepted' else 'rejected' end,
  response_reason=nullif(btrim(coalesce(p_reason,'')),''),
  responded_by_user_id=auth.uid(),
  responded_at=now()
 where id=v_ref.id;
 if p_decision='accept' then
  update public.topics set current_unit_id=v_ref.to_unit_id where id=v_ref.topic_id and current_unit_id=v_ref.from_unit_id;
  if not found then raise exception 'topic route changed; refresh referral'; end if;
 end if;
 perform public.append_audit_log(v_org,'topics.referral.'||p_decision,'topic_referrals',v_ref.id,
  jsonb_build_object('topic_id',v_ref.topic_id,'from_unit_id',v_ref.from_unit_id,'to_unit_id',v_ref.to_unit_id,'reason',p_reason));
 return jsonb_build_object('referral_id',v_ref.id,'topic_id',v_ref.topic_id,
  'status',case p_decision when 'accept' then 'accepted' else 'rejected' end,
  'current_unit_id',case p_decision when 'accept' then v_ref.to_unit_id else v_ref.from_unit_id end);
end $$;

create or replace function public.get_topic_route_history(p_topic_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_topic public.topics%rowtype;
begin
 select * into v_topic from public.topics where id=p_topic_id and organization_id=public.current_organization_id();
 if v_topic.id is null then raise exception 'topic not found' using errcode='P0002'; end if;
 if v_topic.submitted_by_user_id<>auth.uid() and not public.is_system_admin()
 and not public.has_permission('topics.referrals.read',v_topic.current_unit_id)
 and not public.has_permission('topics.read',v_topic.current_unit_id)
 then raise exception 'permission denied: topics.referrals.read' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object(
  'id',r.id,'from_unit_id',r.from_unit_id,'from_unit_name_ar',fu.name_ar,
  'to_unit_id',r.to_unit_id,'to_unit_name_ar',tu.name_ar,'status',r.status,
  'referral_reason',r.referral_reason,'referred_by_user_id',r.referred_by_user_id,
  'referred_by_name_ar',u.full_name_ar,'referred_at',r.referred_at,
  'response_reason',r.response_reason,'responded_by_user_id',r.responded_by_user_id,
  'responded_by_name_ar',ru.full_name_ar,'responded_at',r.responded_at,'updated_at',r.updated_at
 ) order by r.referred_at,r.id) from public.topic_referrals r
 left join public.governance_units fu on fu.id=r.from_unit_id
 join public.governance_units tu on tu.id=r.to_unit_id
 join public.users u on u.id=r.referred_by_user_id
 left join public.users ru on ru.id=r.responded_by_user_id
 where r.topic_id=v_topic.id and r.organization_id=v_topic.organization_id),'[]'::jsonb);
end $$;

create or replace function public.create_meeting(
 p_governance_unit_id uuid,p_meeting_type_id uuid,p_title_ar text,p_scheduled_date date,
 p_start_time time default null,p_end_time time default null,p_location_type text default 'onsite',
 p_location_details text default null,p_title_en text default null,p_client_request_id uuid default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_org uuid:=public.current_organization_id();v_user uuid:=auth.uid();v_year int:=extract(year from p_scheduled_date)::int;
v_no bigint;v_meeting_no text;v_id uuid;v_existing public.meetings%rowtype;
begin
 perform public.assert_permission('meetings.create',p_governance_unit_id);
 perform public.consume_iam_rate_limit('meetings.create',20,600);
 if p_title_ar is null or char_length(btrim(p_title_ar)) not between 5 and 300 then raise exception 'title_ar must contain between 5 and 300 characters'; end if;
 if p_scheduled_date is null then raise exception 'scheduled_date is required'; end if;
 if p_end_time is not null and p_start_time is not null and p_end_time<=p_start_time then raise exception 'end_time must be after start_time'; end if;
 if p_location_type not in('onsite','online','hybrid') then raise exception 'invalid location type'; end if;
 if not exists(select 1 from public.governance_units where id=p_governance_unit_id and organization_id=v_org and status='active')
 then raise exception 'active governance unit not found'; end if;
 if p_meeting_type_id is null or not exists(select 1 from public.meeting_types where id=p_meeting_type_id and organization_id=v_org and is_active)
 then raise exception 'active meeting type not found'; end if;
 if p_client_request_id is not null then
  perform pg_advisory_xact_lock(hashtextextended(v_org::text||v_user::text||p_client_request_id::text,0));
  select * into v_existing from public.meetings where organization_id=v_org and created_by_user_id=v_user and client_request_id=p_client_request_id;
  if v_existing.id is not null then return jsonb_build_object('id',v_existing.id,'meeting_no',v_existing.meeting_no,'status',v_existing.status,'idempotent_replay',true); end if;
 end if;
 insert into public.meeting_number_counters values(v_org,v_year,1,now())
 on conflict(organization_id,calendar_year) do update set last_value=public.meeting_number_counters.last_value+1,updated_at=now()
 returning last_value into v_no;
 v_meeting_no:=format('MTG-%s-%s',v_year,lpad(v_no::text,6,'0'));
 insert into public.meetings(organization_id,meeting_no,governance_unit_id,meeting_type_id,title_ar,title_en,
  scheduled_date,start_time,end_time,location_type,location_details,status,created_by_user_id,client_request_id)
 values(v_org,v_meeting_no,p_governance_unit_id,p_meeting_type_id,btrim(p_title_ar),nullif(btrim(coalesce(p_title_en,'')),''),
  p_scheduled_date,p_start_time,p_end_time,p_location_type,nullif(btrim(coalesce(p_location_details,'')),''),
  'draft',v_user,p_client_request_id) returning id into v_id;
 insert into public.meeting_status_history(organization_id,meeting_id,from_status,to_status,changed_by_user_id,change_reason)
 values(v_org,v_id,null,'draft',v_user,'meeting created');
 perform public.append_audit_log(v_org,'meetings.create','meetings',v_id,jsonb_build_object('meeting_no',v_meeting_no,'unit_id',p_governance_unit_id));
 return jsonb_build_object('id',v_id,'meeting_no',v_meeting_no,'status','draft','idempotent_replay',false);
end $$;

create or replace function public.search_meetings(
 p_query text default null,p_status text default null,p_unit_id uuid default null,
 p_from_date date default null,p_to_date date default null,p_limit int default 25,p_offset int default 0
) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_org uuid:=public.current_organization_id();v_limit int:=least(greatest(coalesce(p_limit,25),1),100);v_offset int:=greatest(coalesce(p_offset,0),0);
begin
 if v_org is null then raise exception 'active authenticated account is required' using errcode='42501'; end if;
 return jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(x) order by x.scheduled_date desc,x.created_at desc) from(
  select m.id,m.meeting_no,m.title_ar,m.title_en,m.scheduled_date,m.start_time,m.end_time,m.location_type,m.status,m.updated_at,m.created_at,
   gu.id governance_unit_id,gu.name_ar governance_unit_name_ar,mt.id meeting_type_id,mt.name_ar meeting_type_name_ar,
   (select count(*) from public.agenda_items ai where ai.meeting_id=m.id) agenda_item_count
  from public.meetings m join public.governance_units gu on gu.id=m.governance_unit_id left join public.meeting_types mt on mt.id=m.meeting_type_id
  where m.organization_id=v_org and (public.is_system_admin() or m.created_by_user_id=auth.uid()
   or public.has_permission('meetings.read',m.governance_unit_id) or public.has_permission('meetings.manage',m.governance_unit_id))
   and (p_status is null or m.status=p_status) and (p_unit_id is null or m.governance_unit_id=p_unit_id)
   and (p_from_date is null or m.scheduled_date>=p_from_date) and (p_to_date is null or m.scheduled_date<=p_to_date)
   and (nullif(btrim(p_query),'') is null or m.meeting_no ilike '%'||btrim(p_query)||'%' or m.title_ar ilike '%'||btrim(p_query)||'%')
  order by m.scheduled_date desc,m.created_at desc limit v_limit offset v_offset)x),'[]'::jsonb),
  'total',(select count(*) from public.meetings m where m.organization_id=v_org
   and (public.is_system_admin() or m.created_by_user_id=auth.uid() or public.has_permission('meetings.read',m.governance_unit_id) or public.has_permission('meetings.manage',m.governance_unit_id))
   and (p_status is null or m.status=p_status) and (p_unit_id is null or m.governance_unit_id=p_unit_id)
   and (p_from_date is null or m.scheduled_date>=p_from_date) and (p_to_date is null or m.scheduled_date<=p_to_date)
   and (nullif(btrim(p_query),'') is null or m.meeting_no ilike '%'||btrim(p_query)||'%' or m.title_ar ilike '%'||btrim(p_query)||'%')),
  'limit',v_limit,'offset',v_offset);
end $$;

create or replace function public.get_meeting_detail(p_meeting_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_m public.meetings%rowtype;
begin
 select * into v_m from public.meetings where id=p_meeting_id and organization_id=public.current_organization_id();
 if v_m.id is null then raise exception 'meeting not found' using errcode='P0002'; end if;
 if v_m.created_by_user_id<>auth.uid() and not public.is_system_admin()
 and not public.has_permission('meetings.read',v_m.governance_unit_id) and not public.has_permission('meetings.manage',v_m.governance_unit_id)
 then raise exception 'permission denied: meetings.read' using errcode='42501'; end if;
 return (select to_jsonb(m)||jsonb_build_object(
  'governance_unit',jsonb_build_object('id',gu.id,'name_ar',gu.name_ar),
  'meeting_type',jsonb_build_object('id',mt.id,'name_ar',mt.name_ar),
  'agenda_items',coalesce((select jsonb_agg(jsonb_build_object('id',ai.id,'agenda_order',ai.agenda_order,'agenda_status',ai.agenda_status,
   'is_exception',ai.is_exception,'exception_reason',ai.exception_reason,'updated_at',ai.updated_at,
   'topic',jsonb_build_object('id',t.id,'topic_no',t.topic_no,'title_ar',t.title_ar,'status',t.status))
   order by ai.agenda_order) from public.agenda_items ai join public.topics t on t.id=ai.topic_id where ai.meeting_id=m.id),'[]'::jsonb),
  'status_history',coalesce((select jsonb_agg(to_jsonb(h) order by h.changed_at,h.id) from public.meeting_status_history h where h.meeting_id=m.id),'[]'::jsonb)
 ) from public.meetings m join public.governance_units gu on gu.id=m.governance_unit_id left join public.meeting_types mt on mt.id=m.meeting_type_id where m.id=v_m.id);
end $$;

create or replace function public.update_meeting(
 p_meeting_id uuid,p_title_ar text,p_scheduled_date date,p_start_time time,p_end_time time,
 p_location_type text,p_location_details text,p_title_en text,p_meeting_type_id uuid,p_expected_updated_at timestamptz
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_m public.meetings%rowtype;
begin
 select * into v_m from public.meetings where id=p_meeting_id and organization_id=public.current_organization_id() for update;
 if v_m.id is null then raise exception 'meeting not found'; end if;
 perform public.assert_permission('meetings.manage',v_m.governance_unit_id);
 if v_m.status not in('draft','scheduled') then raise exception 'meeting details are locked in status %',v_m.status; end if;
 if p_expected_updated_at is null or p_expected_updated_at<>v_m.updated_at then raise exception 'meeting was modified; refresh before update' using errcode='40001'; end if;
 if p_title_ar is null or char_length(btrim(p_title_ar)) not between 5 and 300 then raise exception 'title_ar must contain between 5 and 300 characters'; end if;
 if p_end_time is not null and p_start_time is not null and p_end_time<=p_start_time then raise exception 'end_time must be after start_time'; end if;
 if p_location_type not in('onsite','online','hybrid') then raise exception 'invalid location type'; end if;
 if not exists(select 1 from public.meeting_types where id=p_meeting_type_id and organization_id=v_m.organization_id and is_active) then raise exception 'active meeting type not found'; end if;
 update public.meetings set title_ar=btrim(p_title_ar),title_en=nullif(btrim(coalesce(p_title_en,'')),''),
  scheduled_date=p_scheduled_date,start_time=p_start_time,end_time=p_end_time,location_type=p_location_type,
  location_details=nullif(btrim(coalesce(p_location_details,'')),''),meeting_type_id=p_meeting_type_id where id=v_m.id;
 perform public.append_audit_log(v_m.organization_id,'meetings.update','meetings',v_m.id,'{}'::jsonb);
 return public.get_meeting_detail(v_m.id);
end $$;

create or replace function public.transition_meeting(
 p_meeting_id uuid,p_to_status text,p_reason text,p_expected_updated_at timestamptz
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_m public.meetings%rowtype;
begin
 select * into v_m from public.meetings where id=p_meeting_id and organization_id=public.current_organization_id() for update;
 if v_m.id is null then raise exception 'meeting not found'; end if;
 perform public.assert_permission('meetings.manage',v_m.governance_unit_id);
 if p_expected_updated_at is null or p_expected_updated_at<>v_m.updated_at then raise exception 'meeting was modified; refresh before transition' using errcode='40001'; end if;
 if p_to_status='cancelled' and (p_reason is null or char_length(btrim(p_reason))<5) then raise exception 'cancellation reason must contain at least 5 characters'; end if;
 update public.meetings set status=p_to_status where id=v_m.id;
 insert into public.meeting_status_history(organization_id,meeting_id,from_status,to_status,changed_by_user_id,change_reason)
 values(v_m.organization_id,v_m.id,v_m.status,p_to_status,auth.uid(),nullif(btrim(coalesce(p_reason,'')),''));
 perform public.append_audit_log(v_m.organization_id,'meetings.transition','meetings',v_m.id,jsonb_build_object('from_status',v_m.status,'to_status',p_to_status,'reason',p_reason));
 return jsonb_build_object('id',v_m.id,'meeting_no',v_m.meeting_no,'previous_status',v_m.status,'status',p_to_status);
end $$;

create or replace function public.search_eligible_agenda_topics(
 p_meeting_id uuid,p_query text default null,p_limit int default 25,p_offset int default 0
) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_m public.meetings%rowtype;v_limit int:=least(greatest(coalesce(p_limit,25),1),100);v_offset int:=greatest(coalesce(p_offset,0),0);
begin
 select * into v_m from public.meetings where id=p_meeting_id and organization_id=public.current_organization_id();
 if v_m.id is null then raise exception 'meeting not found'; end if;
 perform public.assert_permission('agenda.manage',v_m.governance_unit_id);
 return jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object(
  'id',t.id,'topic_no',t.topic_no,'title_ar',t.title_ar,'priority',t.priority,'status',t.status,'updated_at',t.updated_at
 ) order by t.created_at desc) from public.topics t where t.organization_id=v_m.organization_id
  and t.current_unit_id=v_m.governance_unit_id and t.status='approved'
  and not exists(select 1 from public.agenda_items ai where ai.meeting_id=v_m.id and ai.topic_id=t.id)
  and (nullif(btrim(p_query),'') is null or t.topic_no ilike '%'||btrim(p_query)||'%' or t.title_ar ilike '%'||btrim(p_query)||'%')
  limit v_limit offset v_offset),'[]'::jsonb),
 'total',(select count(*) from public.topics t where t.organization_id=v_m.organization_id and t.current_unit_id=v_m.governance_unit_id and t.status='approved'
  and not exists(select 1 from public.agenda_items ai where ai.meeting_id=v_m.id and ai.topic_id=t.id)
  and (nullif(btrim(p_query),'') is null or t.topic_no ilike '%'||btrim(p_query)||'%' or t.title_ar ilike '%'||btrim(p_query)||'%')),
 'limit',v_limit,'offset',v_offset);
end $$;

create or replace function public.add_agenda_item(
 p_meeting_id uuid,p_topic_id uuid,p_is_exception boolean default false,p_exception_reason text default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_m public.meetings%rowtype;v_t public.topics%rowtype;v_order int;v_id uuid;
begin
 select * into v_m from public.meetings where id=p_meeting_id and organization_id=public.current_organization_id() for update;
 if v_m.id is null then raise exception 'meeting not found'; end if;
 perform public.assert_permission('agenda.manage',v_m.governance_unit_id);
 if v_m.status not in('draft','scheduled') then raise exception 'agenda is locked in meeting status %',v_m.status; end if;
 select * into v_t from public.topics where id=p_topic_id and organization_id=v_m.organization_id for update;
 if v_t.id is null then raise exception 'topic not found'; end if;
 if v_t.current_unit_id<>v_m.governance_unit_id then raise exception 'topic and meeting must belong to the same governance unit'; end if;
 if v_t.status<>'approved' then
  if not coalesce(p_is_exception,false) then raise exception 'topic is not eligible for agenda'; end if;
  perform public.assert_permission('agenda.exception',v_m.governance_unit_id);
  if p_exception_reason is null or char_length(btrim(p_exception_reason))<5 then raise exception 'exception reason must contain at least 5 characters'; end if;
 elsif coalesce(p_is_exception,false) then
  raise exception 'approved topic does not require an exception';
 end if;
 select coalesce(max(agenda_order),0)+1 into v_order from public.agenda_items where meeting_id=v_m.id;
 insert into public.agenda_items(organization_id,meeting_id,topic_id,agenda_order,is_exception,exception_reason)
 values(v_m.organization_id,v_m.id,v_t.id,v_order,coalesce(p_is_exception,false),nullif(btrim(coalesce(p_exception_reason,'')),''))
 returning id into v_id;
 perform public.append_audit_log(v_m.organization_id,'agenda.item.add','agenda_items',v_id,
  jsonb_build_object('meeting_id',v_m.id,'topic_id',v_t.id,'order',v_order,'is_exception',p_is_exception,'exception_reason',p_exception_reason));
 return jsonb_build_object('id',v_id,'meeting_id',v_m.id,'topic_id',v_t.id,'agenda_order',v_order,'is_exception',coalesce(p_is_exception,false));
end $$;

create or replace function public.reorder_agenda_items(
 p_meeting_id uuid,p_ordered_item_ids uuid[],p_expected_meeting_updated_at timestamptz
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_m public.meetings%rowtype;v_count int;
begin
 select * into v_m from public.meetings where id=p_meeting_id and organization_id=public.current_organization_id() for update;
 if v_m.id is null then raise exception 'meeting not found'; end if;
 perform public.assert_permission('agenda.manage',v_m.governance_unit_id);
 if v_m.status not in('draft','scheduled') then raise exception 'agenda is locked in meeting status %',v_m.status; end if;
 if p_expected_meeting_updated_at is null or p_expected_meeting_updated_at<>v_m.updated_at then raise exception 'meeting was modified; refresh agenda' using errcode='40001'; end if;
 select count(*) into v_count from public.agenda_items where meeting_id=v_m.id;
 if cardinality(coalesce(p_ordered_item_ids,array[]::uuid[]))<>v_count
 or (select count(distinct x) from unnest(coalesce(p_ordered_item_ids,array[]::uuid[]))x)<>v_count
 or exists(select 1 from unnest(coalesce(p_ordered_item_ids,array[]::uuid[]))x left join public.agenda_items ai on ai.id=x and ai.meeting_id=v_m.id where ai.id is null)
 then raise exception 'ordered item ids must contain every agenda item exactly once'; end if;
 update public.agenda_items set agenda_order=-agenda_order where meeting_id=v_m.id;
 update public.agenda_items ai set agenda_order=o.ord from unnest(p_ordered_item_ids) with ordinality o(id,ord) where ai.id=o.id and ai.meeting_id=v_m.id;
 update public.meetings set updated_at=now() where id=v_m.id;
 perform public.append_audit_log(v_m.organization_id,'agenda.reorder','meetings',v_m.id,jsonb_build_object('ordered_item_ids',p_ordered_item_ids));
 return public.get_meeting_detail(v_m.id)->'agenda_items';
end $$;

create or replace function public.remove_agenda_item(p_agenda_item_id uuid,p_reason text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_ai public.agenda_items%rowtype;v_m public.meetings%rowtype;
begin
 select * into v_ai from public.agenda_items where id=p_agenda_item_id and organization_id=public.current_organization_id() for update;
 if v_ai.id is null then raise exception 'agenda item not found'; end if;
 select * into v_m from public.meetings where id=v_ai.meeting_id for update;
 perform public.assert_permission('agenda.manage',v_m.governance_unit_id);
 if v_m.status not in('draft','scheduled') then raise exception 'agenda is locked in meeting status %',v_m.status; end if;
 delete from public.agenda_items where id=v_ai.id;
 with ordered as(select id,row_number() over(order by agenda_order,id)::int n from public.agenda_items where meeting_id=v_m.id)
 update public.agenda_items ai set agenda_order=-o.n from ordered o where ai.id=o.id;
 update public.agenda_items set agenda_order=-agenda_order where meeting_id=v_m.id;
 update public.meetings set updated_at=now() where id=v_m.id;
 perform public.append_audit_log(v_m.organization_id,'agenda.item.remove','agenda_items',v_ai.id,jsonb_build_object('meeting_id',v_m.id,'topic_id',v_ai.topic_id,'reason',p_reason));
 return jsonb_build_object('removed',true,'agenda_item_id',v_ai.id);
end $$;

revoke insert,update,delete on public.topic_referrals,public.meetings,public.agenda_items,public.meeting_status_history from authenticated;
grant select on public.meeting_status_history to authenticated;
grant execute on function public.get_sprint02_form_options(),public.refer_topic(uuid,uuid,text,timestamptz),
 public.respond_topic_referral(uuid,text,text),public.get_topic_route_history(uuid),
 public.create_meeting(uuid,uuid,text,date,time,time,text,text,text,uuid),
 public.search_meetings(text,text,uuid,date,date,int,int),public.get_meeting_detail(uuid),
 public.update_meeting(uuid,text,date,time,time,text,text,text,uuid,timestamptz),
 public.transition_meeting(uuid,text,text,timestamptz),public.search_eligible_agenda_topics(uuid,text,int,int),
 public.add_agenda_item(uuid,uuid,boolean,text),public.reorder_agenda_items(uuid,uuid[],timestamptz),
 public.remove_agenda_item(uuid,text) to authenticated;
