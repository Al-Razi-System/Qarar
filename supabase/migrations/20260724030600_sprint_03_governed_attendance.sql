-- Governed attendance: self check-in, independent verification, roster locking, and overrides.

alter table public.meetings
  add column attendance_locked_at timestamptz,
  add column attendance_locked_by_user_id uuid,
  add foreign key (attendance_locked_by_user_id, organization_id)
    references public.users(id, organization_id);

alter table public.attendance_records
  add column verification_status text not null default 'unclaimed'
    check (verification_status in ('unclaimed','pending_verification','verified','rejected')),
  add column check_in_method text
    check (check_in_method in ('self_qr','manual','override','legacy')),
  add column self_checked_in_at timestamptz,
  add column verified_by_user_id uuid,
  add column verified_at timestamptz,
  add column verification_note text,
  add column check_in_context jsonb not null default '{}'::jsonb,
  add foreign key (verified_by_user_id, organization_id)
    references public.users(id, organization_id);

update public.attendance_records
set verification_status=case when attendance_status='pending' then 'unclaimed' else 'verified' end,
 check_in_method=case when attendance_status='pending' then null else 'legacy' end,
 verified_at=case when attendance_status='pending' then null else coalesce(check_in_at,created_at) end;

create table public.meeting_checkin_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  meeting_id uuid not null references public.meetings(id) on delete restrict,
  token_hash text not null,
  status text not null default 'active' check (status in ('active','revoked','expired','closed')),
  starts_at timestamptz not null,
  expires_at timestamptz not null,
  created_by_user_id uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  revoked_by_user_id uuid references public.users(id) on delete set null,
  revoked_at timestamptz,
  revoke_reason text,
  unique (id, organization_id),
  foreign key (meeting_id, organization_id) references public.meetings(id, organization_id),
  foreign key (created_by_user_id, organization_id) references public.users(id, organization_id),
  foreign key (revoked_by_user_id, organization_id) references public.users(id, organization_id),
  check (expires_at>starts_at)
);
alter table public.meeting_checkin_sessions enable row level security;
create unique index meeting_checkin_sessions_one_active_uidx
on public.meeting_checkin_sessions(meeting_id) where status='active';

create table public.attendance_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  meeting_id uuid not null references public.meetings(id) on delete restrict,
  attendance_record_id uuid not null references public.attendance_records(id) on delete restrict,
  subject_user_id uuid not null references public.users(id) on delete restrict,
  actor_user_id uuid references public.users(id) on delete set null,
  event_type text not null check (event_type in(
    'roster_initialized','self_check_in','attendance_verified','attendance_rejected',
    'attendance_overridden','roster_locked','checkin_session_created','checkin_session_revoked'
  )),
  previous_state jsonb,
  new_state jsonb,
  reason text,
  context jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default clock_timestamp(),
  foreign key (meeting_id, organization_id) references public.meetings(id, organization_id),
  foreign key (attendance_record_id, organization_id)
    references public.attendance_records(id, organization_id),
  foreign key (subject_user_id, organization_id) references public.users(id, organization_id),
  foreign key (actor_user_id, organization_id) references public.users(id, organization_id)
);
alter table public.attendance_events enable row level security;
create index attendance_events_meeting_time_idx
on public.attendance_events(organization_id,meeting_id,occurred_at,id);

insert into public.permissions(organization_id,code,module,action,context_scope,name_ar,name_en,is_system_permission)
select o.id,p.code,'attendance',p.action,'governance_unit',p.name_ar,p.name_en,true
from public.organizations o cross join (values
 ('attendance.check_in','check_in','تسجيل الوصول الذاتي','Self check-in'),
 ('attendance.verify','verify','اعتماد الحضور','Verify attendance'),
 ('attendance.override','override','استثناء الحضور المقفل','Override locked attendance'),
 ('attendance.lock','lock','قفل كشف الحضور','Lock attendance roster')
) p(code,action,name_ar,name_en)
on conflict(organization_id,code) do update set
 module=excluded.module,action=excluded.action,context_scope=excluded.context_scope,
 name_ar=excluded.name_ar,name_en=excluded.name_en,is_system_permission=true,is_active=true,updated_at=now();

insert into public.role_permissions(organization_id,role_id,permission_id)
select r.organization_id,r.id,p.id from public.roles r
join public.permissions p on p.organization_id=r.organization_id
where (r.code='governance_admin' and p.code in(
 'attendance.check_in','attendance.verify','attendance.override','attendance.lock'))
or (r.code='council_chair' and p.code in(
 'attendance.check_in','attendance.verify','attendance.override','attendance.lock'))
or (r.code='council_rapporteur' and p.code in(
 'attendance.check_in','attendance.verify','attendance.lock'))
or (r.code='council_member' and p.code='attendance.check_in')
on conflict(organization_id,role_id,permission_id) do update set is_active=true,updated_at=now();

create policy "checkin sessions follow attendance managers" on public.meeting_checkin_sessions
for select to authenticated using(
 organization_id=public.current_organization_id() and exists(
  select 1 from public.meetings m where m.id=meeting_id and (
   public.is_system_admin() or public.has_permission('attendance.verify',m.governance_unit_id)
   or public.has_permission('attendance.lock',m.governance_unit_id)
  )
 ));
create policy "attendance events follow attendance visibility" on public.attendance_events
for select to authenticated using(
 organization_id=public.current_organization_id() and exists(
  select 1 from public.meetings m where m.id=meeting_id and (
   subject_user_id=auth.uid() or public.is_system_admin()
   or public.has_permission('attendance.read',m.governance_unit_id)
   or public.has_permission('attendance.verify',m.governance_unit_id)
  )
 ));

create or replace function public.open_meeting_session(
 p_meeting_id uuid,p_expected_updated_at timestamptz
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_m public.meetings%rowtype;v_count int;
begin
 select * into v_m from public.meetings
 where id=p_meeting_id and organization_id=public.current_organization_id() for update;
 if v_m.id is null then raise exception 'meeting not found' using errcode='P0002'; end if;
 perform public.assert_permission('attendance.manage',v_m.governance_unit_id);
 if v_m.status<>'ready_to_start' then raise exception 'meeting must be ready_to_start'; end if;
 if p_expected_updated_at is null or p_expected_updated_at<>v_m.updated_at then
  raise exception 'meeting was modified; refresh before opening' using errcode='40001'; end if;
 insert into public.attendance_records(organization_id,meeting_id,user_id,membership_id,
  attendance_status,verification_status,recorded_by_user_id)
 select v_m.organization_id,v_m.id,ms.user_id,ms.id,'pending','unclaimed',auth.uid()
 from public.memberships ms join public.users u on u.id=ms.user_id
 where ms.organization_id=v_m.organization_id and ms.governance_unit_id=v_m.governance_unit_id
 and ms.membership_status='active' and u.status='active'
 on conflict(meeting_id,user_id) do nothing;
 get diagnostics v_count=row_count;
 insert into public.attendance_history(organization_id,attendance_record_id,meeting_id,user_id,
  from_status,to_status,changed_by_user_id,remarks)
 select organization_id,id,meeting_id,user_id,null,'pending',auth.uid(),'session roster initialized'
 from public.attendance_records a where meeting_id=v_m.id
 and not exists(select 1 from public.attendance_history h where h.attendance_record_id=a.id);
 insert into public.attendance_events(organization_id,meeting_id,attendance_record_id,subject_user_id,
  actor_user_id,event_type,new_state,reason)
 select a.organization_id,a.meeting_id,a.id,a.user_id,auth.uid(),'roster_initialized',
  jsonb_build_object('attendance_status','pending','verification_status','unclaimed'),
  'session roster initialized'
 from public.attendance_records a where a.meeting_id=v_m.id
 and not exists(select 1 from public.attendance_events e
  where e.attendance_record_id=a.id and e.event_type='roster_initialized');
 update public.meetings set status='in_progress',attendance_locked_at=null,
  attendance_locked_by_user_id=null where id=v_m.id;
 insert into public.meeting_status_history(organization_id,meeting_id,from_status,to_status,
  changed_by_user_id,change_reason)
 values(v_m.organization_id,v_m.id,v_m.status,'in_progress',auth.uid(),'meeting session opened');
 perform public.recalculate_meeting_quorum(v_m.id,true);
 perform public.append_audit_log(v_m.organization_id,'meetings.session.open','meetings',v_m.id,
  jsonb_build_object('roster_count',v_count));
 return public.get_meeting_session_detail(v_m.id);
end $$;

create or replace function public.create_checkin_session(
 p_meeting_id uuid,p_valid_for_minutes int default 15
) returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare v_m public.meetings%rowtype;v_token text;v_id uuid;v_expires timestamptz;
begin
 select * into v_m from public.meetings where id=p_meeting_id
 and organization_id=public.current_organization_id() for update;
 if v_m.id is null then raise exception 'meeting not found' using errcode='P0002'; end if;
 perform public.assert_permission('attendance.verify',v_m.governance_unit_id);
 if v_m.status<>'in_progress' or v_m.attendance_locked_at is not null then
  raise exception 'check-in requires an unlocked in-progress meeting'; end if;
 if p_valid_for_minutes not between 5 and 120 then raise exception 'validity must be between 5 and 120 minutes'; end if;
 update public.meeting_checkin_sessions set status='revoked',revoked_by_user_id=auth.uid(),
  revoked_at=clock_timestamp(),revoke_reason='rotated by new session'
 where meeting_id=v_m.id and status='active';
 v_token:=encode(gen_random_bytes(24),'base64');
 v_expires:=clock_timestamp()+make_interval(mins=>p_valid_for_minutes);
 insert into public.meeting_checkin_sessions(organization_id,meeting_id,token_hash,starts_at,
  expires_at,created_by_user_id)
 values(v_m.organization_id,v_m.id,encode(digest(v_token,'sha256'),'hex'),clock_timestamp(),
  v_expires,auth.uid()) returning id into v_id;
 perform public.append_audit_log(v_m.organization_id,'attendance.checkin_session.create',
  'meeting_checkin_sessions',v_id,jsonb_build_object('meeting_id',v_m.id,'expires_at',v_expires));
 return jsonb_build_object('checkin_session_id',v_id,'meeting_id',v_m.id,
  'token',v_token,'expires_at',v_expires);
end $$;

create or replace function public.revoke_checkin_session(
 p_checkin_session_id uuid,p_reason text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_s public.meeting_checkin_sessions%rowtype;v_unit uuid;
begin
 if p_reason is null or char_length(btrim(p_reason)) not between 5 and 1000 then
  raise exception 'reason must contain between 5 and 1000 characters'; end if;
 select * into v_s from public.meeting_checkin_sessions where id=p_checkin_session_id
 and organization_id=public.current_organization_id() for update;
 if v_s.id is null then raise exception 'check-in session not found' using errcode='P0002'; end if;
 select governance_unit_id into v_unit from public.meetings where id=v_s.meeting_id;
 perform public.assert_permission('attendance.verify',v_unit);
 if v_s.status<>'active' then raise exception 'check-in session is not active'; end if;
 update public.meeting_checkin_sessions set status='revoked',revoked_by_user_id=auth.uid(),
  revoked_at=clock_timestamp(),revoke_reason=btrim(p_reason) where id=v_s.id;
 perform public.append_audit_log(v_s.organization_id,'attendance.checkin_session.revoke',
  'meeting_checkin_sessions',v_s.id,jsonb_build_object('meeting_id',v_s.meeting_id,'reason',btrim(p_reason)));
 return jsonb_build_object('checkin_session_id',v_s.id,'status','revoked');
end $$;

create or replace function public.self_check_in(
 p_meeting_id uuid,p_token text,p_device_label text default null
) returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare v_m public.meetings%rowtype;v_a public.attendance_records%rowtype;v_s uuid;
v_headers jsonb:='{}'::jsonb;v_context jsonb;
begin
 select * into v_m from public.meetings where id=p_meeting_id
 and organization_id=public.current_organization_id() for update;
 if v_m.id is null then raise exception 'meeting not found' using errcode='P0002'; end if;
 perform public.assert_permission('attendance.check_in',v_m.governance_unit_id);
 if v_m.status<>'in_progress' or v_m.attendance_locked_at is not null then
  raise exception 'self check-in is closed'; end if;
 if p_token is null or char_length(p_token)<20 then raise exception 'invalid check-in token'; end if;
 select id into v_s from public.meeting_checkin_sessions
 where meeting_id=v_m.id and status='active' and starts_at<=clock_timestamp()
 and expires_at>clock_timestamp() and token_hash=encode(digest(p_token,'sha256'),'hex');
 if v_s is null then raise exception 'invalid or expired check-in token' using errcode='28000'; end if;
 select * into v_a from public.attendance_records where meeting_id=v_m.id and user_id=auth.uid() for update;
 if v_a.id is null then raise exception 'current user is not on the meeting roster' using errcode='42501'; end if;
 if v_a.verification_status in('pending_verification','verified') then
  raise exception 'check-in already submitted'; end if;
 begin
  v_headers:=coalesce(nullif(current_setting('request.headers',true),'')::jsonb,'{}'::jsonb);
 exception when others then v_headers:='{}'::jsonb;
 end;
 v_context:=jsonb_strip_nulls(jsonb_build_object(
  'device_label',nullif(btrim(coalesce(p_device_label,'')),''),
  'user_agent',v_headers->>'user-agent',
  'forwarded_for',v_headers->>'x-forwarded-for',
  'checkin_session_id',v_s));
 update public.attendance_records set verification_status='pending_verification',
  check_in_method='self_qr',self_checked_in_at=clock_timestamp(),check_in_context=v_context,
  recorded_by_user_id=auth.uid(),verification_note=null where id=v_a.id;
 insert into public.attendance_events(organization_id,meeting_id,attendance_record_id,subject_user_id,
  actor_user_id,event_type,previous_state,new_state,context)
 values(v_a.organization_id,v_a.meeting_id,v_a.id,v_a.user_id,auth.uid(),'self_check_in',
  jsonb_build_object('verification_status',v_a.verification_status),
  jsonb_build_object('verification_status','pending_verification'),v_context);
 perform public.append_audit_log(v_a.organization_id,'attendance.self_check_in',
  'attendance_records',v_a.id,jsonb_build_object('meeting_id',v_a.meeting_id,'context',v_context));
 return jsonb_build_object('attendance_record_id',v_a.id,'verification_status','pending_verification',
  'self_checked_in_at',clock_timestamp());
end $$;

create or replace function public.verify_attendance(
 p_attendance_record_id uuid,p_status text,p_note text,p_expected_updated_at timestamptz
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_a public.attendance_records%rowtype;v_m public.meetings%rowtype;v_method text;v_event text;v_verification text;
begin
 if p_status not in('present','late','absent','excused') then raise exception 'invalid verified attendance status'; end if;
 select * into v_a from public.attendance_records where id=p_attendance_record_id
 and organization_id=public.current_organization_id() for update;
 if v_a.id is null then raise exception 'attendance record not found' using errcode='P0002'; end if;
 select * into v_m from public.meetings where id=v_a.meeting_id;
 perform public.assert_permission('attendance.verify',v_m.governance_unit_id);
 if v_m.status<>'in_progress' or v_m.attendance_locked_at is not null then
  raise exception 'attendance verification is closed'; end if;
 if v_a.user_id=auth.uid() and not public.has_permission('attendance.override',v_m.governance_unit_id) then
  raise exception 'users cannot verify their own attendance' using errcode='42501'; end if;
 if p_expected_updated_at is null or p_expected_updated_at<>v_a.updated_at then
  raise exception 'attendance was modified; refresh before verification' using errcode='40001'; end if;
 if p_status in('present','late') and v_a.verification_status<>'pending_verification'
 and (p_note is null or char_length(btrim(p_note))<5) then
  raise exception 'manual presence requires a reason of at least 5 characters'; end if;
 v_method:=case when v_a.verification_status='pending_verification' then coalesce(v_a.check_in_method,'self_qr') else 'manual' end;
 v_event:=case when p_status in('absent','excused') and v_a.verification_status='pending_verification'
  then 'attendance_rejected' else 'attendance_verified' end;
 v_verification:=case when v_event='attendance_rejected' then 'rejected' else 'verified' end;
 update public.attendance_records set attendance_status=p_status,verification_status=v_verification,
  check_in_method=v_method,check_in_at=case when p_status in('present','late')
   then coalesce(self_checked_in_at,check_in_at,clock_timestamp()) else null end,
  check_out_at=null,verified_by_user_id=auth.uid(),verified_at=clock_timestamp(),
  verification_note=nullif(btrim(coalesce(p_note,'')),''),recorded_by_user_id=auth.uid()
 where id=v_a.id;
 insert into public.attendance_history(organization_id,attendance_record_id,meeting_id,user_id,
  from_status,to_status,changed_by_user_id,remarks)
 values(v_a.organization_id,v_a.id,v_a.meeting_id,v_a.user_id,v_a.attendance_status,p_status,
  auth.uid(),nullif(btrim(coalesce(p_note,'')),''));
 insert into public.attendance_events(organization_id,meeting_id,attendance_record_id,subject_user_id,
  actor_user_id,event_type,previous_state,new_state,reason)
 values(v_a.organization_id,v_a.meeting_id,v_a.id,v_a.user_id,auth.uid(),v_event,
  jsonb_build_object('attendance_status',v_a.attendance_status,'verification_status',v_a.verification_status),
  jsonb_build_object('attendance_status',p_status,'verification_status',v_verification,'method',v_method),
  nullif(btrim(coalesce(p_note,'')),''));
 perform public.append_audit_log(v_a.organization_id,'attendance.verify','attendance_records',v_a.id,
  jsonb_build_object('meeting_id',v_a.meeting_id,'user_id',v_a.user_id,'status',p_status,'method',v_method));
 return (select to_jsonb(a) from public.attendance_records a where a.id=v_a.id);
end $$;

create or replace function public.lock_attendance_roster(
 p_meeting_id uuid,p_expected_updated_at timestamptz
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_m public.meetings%rowtype;v_q jsonb;v_unresolved int;
begin
 select * into v_m from public.meetings where id=p_meeting_id
 and organization_id=public.current_organization_id() for update;
 if v_m.id is null then raise exception 'meeting not found' using errcode='P0002'; end if;
 perform public.assert_permission('attendance.lock',v_m.governance_unit_id);
 if v_m.status<>'in_progress' or v_m.attendance_locked_at is not null then
  raise exception 'attendance roster cannot be locked in current state'; end if;
 if p_expected_updated_at is null or p_expected_updated_at<>v_m.updated_at then
  raise exception 'meeting was modified; refresh before locking attendance' using errcode='40001'; end if;
 select count(*) into v_unresolved from public.attendance_records
 where meeting_id=v_m.id and (attendance_status='pending' or verification_status not in('verified','rejected'));
 if v_unresolved>0 then raise exception 'all roster entries must be resolved before locking'; end if;
 update public.meetings set attendance_locked_at=clock_timestamp(),
  attendance_locked_by_user_id=auth.uid() where id=v_m.id;
 update public.meeting_checkin_sessions set status='closed',revoked_by_user_id=auth.uid(),
  revoked_at=clock_timestamp(),revoke_reason='attendance roster locked'
 where meeting_id=v_m.id and status='active';
 v_q:=public.recalculate_meeting_quorum(v_m.id,true);
 perform public.append_audit_log(v_m.organization_id,'attendance.roster.lock','meetings',v_m.id,
  jsonb_build_object('quorum',v_q));
 return jsonb_build_object('meeting_id',v_m.id,'attendance_locked',true,
  'attendance_locked_at',(select attendance_locked_at from public.meetings where id=v_m.id),'quorum',v_q);
end $$;

create or replace function public.override_attendance(
 p_attendance_record_id uuid,p_status text,p_reason text,p_expected_updated_at timestamptz
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_a public.attendance_records%rowtype;v_m public.meetings%rowtype;v_q jsonb;
begin
 if p_status not in('present','late','absent','excused') then raise exception 'invalid attendance status'; end if;
 if p_reason is null or char_length(btrim(p_reason)) not between 10 and 2000 then
  raise exception 'override reason must contain between 10 and 2000 characters'; end if;
 select * into v_a from public.attendance_records where id=p_attendance_record_id
 and organization_id=public.current_organization_id() for update;
 if v_a.id is null then raise exception 'attendance record not found' using errcode='P0002'; end if;
 select * into v_m from public.meetings where id=v_a.meeting_id;
 perform public.assert_permission('attendance.override',v_m.governance_unit_id);
 if v_m.status not in('in_progress','waiting_for_minutes') then
  raise exception 'attendance override is not allowed in current meeting state'; end if;
 if p_expected_updated_at is null or p_expected_updated_at<>v_a.updated_at then
  raise exception 'attendance was modified; refresh before override' using errcode='40001'; end if;
 update public.attendance_records set attendance_status=p_status,verification_status='verified',
  check_in_method='override',check_in_at=case when p_status in('present','late')
   then coalesce(check_in_at,clock_timestamp()) else null end,
  verified_by_user_id=auth.uid(),verified_at=clock_timestamp(),verification_note=btrim(p_reason),
  recorded_by_user_id=auth.uid() where id=v_a.id;
 insert into public.attendance_history(organization_id,attendance_record_id,meeting_id,user_id,
  from_status,to_status,changed_by_user_id,remarks)
 values(v_a.organization_id,v_a.id,v_a.meeting_id,v_a.user_id,v_a.attendance_status,p_status,
  auth.uid(),btrim(p_reason));
 insert into public.attendance_events(organization_id,meeting_id,attendance_record_id,subject_user_id,
  actor_user_id,event_type,previous_state,new_state,reason)
 values(v_a.organization_id,v_a.meeting_id,v_a.id,v_a.user_id,auth.uid(),'attendance_overridden',
  jsonb_build_object('attendance_status',v_a.attendance_status,'verification_status',v_a.verification_status),
  jsonb_build_object('attendance_status',p_status,'verification_status','verified','method','override'),
  btrim(p_reason));
 v_q:=public.recalculate_meeting_quorum(v_m.id,true);
 perform public.append_audit_log(v_a.organization_id,'attendance.override','attendance_records',v_a.id,
  jsonb_build_object('meeting_id',v_a.meeting_id,'user_id',v_a.user_id,
   'from_status',v_a.attendance_status,'to_status',p_status,'reason',btrim(p_reason),'quorum',v_q));
 return jsonb_build_object('attendance_record_id',v_a.id,'status',p_status,'quorum',v_q);
end $$;

create or replace function public.record_attendance(
 p_attendance_record_id uuid,p_status text,p_remarks text,p_expected_updated_at timestamptz
) returns jsonb language plpgsql security definer set search_path=public as $$
begin
 raise exception 'use verify_attendance or override_attendance';
end $$;

create or replace function public.open_voting_round(
 p_agenda_item_id uuid,p_expected_meeting_updated_at timestamptz
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_ai public.agenda_items%rowtype;v_m public.meetings%rowtype;v_round uuid;v_no int;v_count int;
begin
 select * into v_ai from public.agenda_items where id=p_agenda_item_id
 and organization_id=public.current_organization_id() for update;
 if v_ai.id is null then raise exception 'agenda item not found' using errcode='P0002'; end if;
 select * into v_m from public.meetings where id=v_ai.meeting_id for update;
 perform public.assert_permission('voting.manage',v_m.governance_unit_id);
 if v_m.status<>'in_progress' then raise exception 'meeting must be in_progress'; end if;
 if v_m.attendance_locked_at is null then raise exception 'attendance roster must be locked before voting'; end if;
 if v_m.quorum_status<>'met' then raise exception 'quorum must be met before voting'; end if;
 if p_expected_meeting_updated_at is null or p_expected_meeting_updated_at<>v_m.updated_at then
  raise exception 'meeting was modified; refresh before opening vote' using errcode='40001'; end if;
 if exists(select 1 from public.voting_rounds where meeting_id=v_m.id and status='open')
 then raise exception 'a voting round is already open for this meeting'; end if;
 select coalesce(max(round_number),0)+1 into v_no from public.voting_rounds where agenda_item_id=v_ai.id;
 select count(*) into v_count from public.attendance_records a
 join public.memberships ms on ms.id=a.membership_id and ms.membership_status='active'
 where a.meeting_id=v_m.id and a.attendance_status in('present','late')
 and a.verification_status='verified';
 if v_count=0 then raise exception 'no eligible verified members for voting'; end if;
 insert into public.voting_rounds(organization_id,meeting_id,agenda_item_id,round_number,
  eligible_voter_count,opened_by_user_id)
 values(v_m.organization_id,v_m.id,v_ai.id,v_no,v_count,auth.uid()) returning id into v_round;
 insert into public.voting_eligible_members(organization_id,voting_round_id,user_id,membership_id)
 select v_m.organization_id,v_round,a.user_id,a.membership_id from public.attendance_records a
 join public.memberships ms on ms.id=a.membership_id and ms.membership_status='active'
 where a.meeting_id=v_m.id and a.attendance_status in('present','late')
 and a.verification_status='verified';
 update public.agenda_items set voting_status='open',voting_result='pending' where id=v_ai.id;
 perform public.append_audit_log(v_m.organization_id,'voting.open','voting_rounds',v_round,
  jsonb_build_object('meeting_id',v_m.id,'agenda_item_id',v_ai.id,'eligible_voter_count',v_count));
 return jsonb_build_object('voting_round_id',v_round,'meeting_id',v_m.id,
  'agenda_item_id',v_ai.id,'round_number',v_no,'status','open','eligible_voter_count',v_count);
end $$;

create or replace function public.apply_quorum_failure(
 p_meeting_id uuid,p_action text,p_reason text,p_expected_updated_at timestamptz
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_m public.meetings%rowtype;v_q jsonb;v_to text;
begin
 if p_action not in('postpone','cancel') then raise exception 'action must be postpone or cancel'; end if;
 if p_reason is null or char_length(btrim(p_reason)) not between 5 and 2000 then
  raise exception 'reason must contain between 5 and 2000 characters'; end if;
 select * into v_m from public.meetings where id=p_meeting_id
 and organization_id=public.current_organization_id() for update;
 if v_m.id is null then raise exception 'meeting not found' using errcode='P0002'; end if;
 perform public.assert_permission('quorum.manage',v_m.governance_unit_id);
 if v_m.status<>'in_progress' then raise exception 'meeting must be in_progress'; end if;
 if v_m.attendance_locked_at is null then raise exception 'attendance roster must be locked first'; end if;
 if p_expected_updated_at is null or p_expected_updated_at<>v_m.updated_at then
  raise exception 'meeting was modified; refresh before applying quorum action' using errcode='40001'; end if;
 v_q:=public.recalculate_meeting_quorum(v_m.id,true);
 if v_q->>'quorum_status'<>'not_met' then raise exception 'quorum is met; failure action is not allowed'; end if;
 v_to:=case p_action when 'postpone' then 'postponed' else 'cancelled' end;
 update public.meetings set status=v_to where id=v_m.id;
 insert into public.meeting_status_history(organization_id,meeting_id,from_status,to_status,
  changed_by_user_id,change_reason)
 values(v_m.organization_id,v_m.id,v_m.status,v_to,auth.uid(),btrim(p_reason));
 perform public.append_audit_log(v_m.organization_id,'quorum.failure.'||p_action,'meetings',v_m.id,
  jsonb_build_object('reason',btrim(p_reason),'quorum',v_q));
 return jsonb_build_object('meeting_id',v_m.id,'status',v_to,'quorum',v_q);
end $$;

revoke execute on function public.record_attendance(uuid,text,text,timestamptz)
from public,anon,authenticated;
revoke insert,update,delete on public.meeting_checkin_sessions,public.attendance_events from authenticated;
grant select on public.meeting_checkin_sessions,public.attendance_events to authenticated;
revoke execute on function public.create_checkin_session(uuid,int),
 public.revoke_checkin_session(uuid,text),public.self_check_in(uuid,text,text),
 public.verify_attendance(uuid,text,text,timestamptz),
 public.lock_attendance_roster(uuid,timestamptz),
 public.override_attendance(uuid,text,text,timestamptz)
from public,anon;
grant execute on function public.create_checkin_session(uuid,int),
 public.revoke_checkin_session(uuid,text),public.self_check_in(uuid,text,text),
 public.verify_attendance(uuid,text,text,timestamptz),
 public.lock_attendance_roster(uuid,timestamptz),
 public.override_attendance(uuid,text,text,timestamptz)
to authenticated,service_role;
