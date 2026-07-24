-- Sprint 03 production contracts: attendance, quorum, and voting.

alter table public.attendance_records
  add column updated_at timestamptz not null default now(),
  add column recorded_by_user_id uuid,
  add foreign key (recorded_by_user_id, organization_id)
    references public.users(id, organization_id);

create trigger set_attendance_records_updated_at
before update on public.attendance_records
for each row execute function public.set_updated_at();

create table public.attendance_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  attendance_record_id uuid not null references public.attendance_records(id) on delete restrict,
  meeting_id uuid not null references public.meetings(id) on delete restrict,
  user_id uuid not null references public.users(id) on delete restrict,
  from_status text,
  to_status text not null check (to_status in ('pending','present','absent','excused','late')),
  changed_by_user_id uuid references public.users(id) on delete set null,
  remarks text,
  changed_at timestamptz not null default now(),
  foreign key (attendance_record_id, organization_id)
    references public.attendance_records(id, organization_id),
  foreign key (meeting_id, organization_id) references public.meetings(id, organization_id),
  foreign key (user_id, organization_id) references public.users(id, organization_id),
  foreign key (changed_by_user_id, organization_id) references public.users(id, organization_id)
);
alter table public.attendance_history enable row level security;
create index attendance_history_meeting_time_idx
on public.attendance_history(organization_id,meeting_id,changed_at,id);

create table public.quorum_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  meeting_id uuid not null references public.meetings(id) on delete restrict,
  required_percentage integer not null check (required_percentage between 1 and 100),
  eligible_members integer not null check (eligible_members >= 0),
  present_members integer not null check (present_members >= 0),
  actual_percentage numeric(7,4) not null check (actual_percentage between 0 and 100),
  quorum_status text not null check (quorum_status in ('met','not_met')),
  calculated_by_user_id uuid references public.users(id) on delete set null,
  calculated_at timestamptz not null default now(),
  foreign key (meeting_id, organization_id) references public.meetings(id, organization_id),
  foreign key (calculated_by_user_id, organization_id) references public.users(id, organization_id)
);
alter table public.quorum_snapshots enable row level security;
create index quorum_snapshots_meeting_time_idx
on public.quorum_snapshots(organization_id,meeting_id,calculated_at desc,id desc);

create table public.voting_rounds (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  meeting_id uuid not null references public.meetings(id) on delete restrict,
  agenda_item_id uuid not null references public.agenda_items(id) on delete restrict,
  round_number integer not null check (round_number > 0),
  status text not null default 'open' check (status in ('open','closed','cancelled')),
  calculation_rule text not null default 'simple_majority'
    check (calculation_rule in ('simple_majority')),
  eligible_voter_count integer not null check (eligible_voter_count >= 0),
  approve_count integer,
  reject_count integer,
  abstain_count integer,
  result text check (result in ('approved','rejected','tied','no_votes','cancelled')),
  opened_by_user_id uuid not null references public.users(id) on delete restrict,
  opened_at timestamptz not null default now(),
  closed_by_user_id uuid references public.users(id) on delete set null,
  closed_at timestamptz,
  close_reason text,
  unique (id, organization_id),
  unique (agenda_item_id, round_number),
  foreign key (meeting_id, organization_id) references public.meetings(id, organization_id),
  foreign key (agenda_item_id, organization_id) references public.agenda_items(id, organization_id),
  foreign key (opened_by_user_id, organization_id) references public.users(id, organization_id),
  foreign key (closed_by_user_id, organization_id) references public.users(id, organization_id)
);
alter table public.voting_rounds enable row level security;
create unique index voting_rounds_one_open_per_agenda_uidx
on public.voting_rounds(agenda_item_id) where status='open';

create table public.voting_eligible_members (
  organization_id uuid not null references public.organizations(id) on delete restrict,
  voting_round_id uuid not null references public.voting_rounds(id) on delete restrict,
  user_id uuid not null references public.users(id) on delete restrict,
  membership_id uuid not null references public.memberships(id) on delete restrict,
  snapshotted_at timestamptz not null default now(),
  primary key(voting_round_id,user_id),
  foreign key (voting_round_id, organization_id) references public.voting_rounds(id, organization_id),
  foreign key (user_id, organization_id) references public.users(id, organization_id),
  foreign key (membership_id, organization_id) references public.memberships(id, organization_id)
);
alter table public.voting_eligible_members enable row level security;

alter table public.votes add column voting_round_id uuid;
alter table public.votes add foreign key (voting_round_id, organization_id)
  references public.voting_rounds(id, organization_id);
alter table public.votes drop constraint if exists votes_meeting_id_user_id_topic_id_key;
create unique index votes_round_user_uidx on public.votes(voting_round_id,user_id)
where voting_round_id is not null;

insert into public.permissions(organization_id,code,module,action,context_scope,name_ar,name_en,is_system_permission)
select o.id,p.code,p.module,p.action,'governance_unit',p.name_ar,p.name_en,true
from public.organizations o cross join (values
 ('attendance.read','attendance','read','قراءة الحضور','Read attendance'),
 ('attendance.manage','attendance','manage','إدارة الحضور','Manage attendance'),
 ('quorum.read','quorum','read','قراءة النصاب','Read quorum'),
 ('quorum.manage','quorum','manage','إدارة النصاب','Manage quorum'),
 ('voting.read','voting','read','قراءة التصويت','Read voting'),
 ('voting.manage','voting','manage','إدارة التصويت','Manage voting'),
 ('voting.cast','voting','cast','الإدلاء بالصوت','Cast vote')
) p(code,module,action,name_ar,name_en)
on conflict(organization_id,code) do update set
 module=excluded.module,action=excluded.action,context_scope=excluded.context_scope,
 name_ar=excluded.name_ar,name_en=excluded.name_en,is_system_permission=true,is_active=true,updated_at=now();

insert into public.role_permissions(organization_id,role_id,permission_id)
select r.organization_id,r.id,p.id from public.roles r
join public.permissions p on p.organization_id=r.organization_id
where (r.code='governance_admin' and p.code in(
 'attendance.read','attendance.manage','quorum.read','quorum.manage','voting.read','voting.manage','voting.cast'))
or (r.code in('council_chair','council_rapporteur') and p.code in(
 'attendance.read','attendance.manage','quorum.read','quorum.manage','voting.read','voting.manage','voting.cast'))
or (r.code='council_member' and p.code in('attendance.read','quorum.read','voting.read','voting.cast'))
on conflict(organization_id,role_id,permission_id) do update set is_active=true,updated_at=now();

drop policy if exists "attendance records follow meeting visibility" on public.attendance_records;
drop policy if exists "unit members can manage attendance" on public.attendance_records;
drop policy if exists "attendance records are visible inside organization" on public.attendance_records;
drop policy if exists "chair and rapporteur can manage attendance" on public.attendance_records;
create policy "attendance follows scoped read permission" on public.attendance_records
for select to authenticated using(
 organization_id=public.current_organization_id() and exists(
  select 1 from public.meetings m where m.id=meeting_id and (
   public.is_system_admin() or public.has_permission('attendance.read',m.governance_unit_id)
   or public.has_permission('attendance.manage',m.governance_unit_id)
  )
 ));
create policy "attendance history follows attendance visibility" on public.attendance_history
for select to authenticated using(exists(
 select 1 from public.attendance_records a where a.id=attendance_record_id
));
create policy "quorum follows meeting visibility" on public.quorum_snapshots
for select to authenticated using(
 organization_id=public.current_organization_id() and exists(
  select 1 from public.meetings m where m.id=meeting_id and (
   public.is_system_admin() or public.has_permission('quorum.read',m.governance_unit_id)
   or public.has_permission('quorum.manage',m.governance_unit_id)
  )
 ));

drop policy if exists "votes follow meeting visibility" on public.votes;
drop policy if exists "users can cast their own votes" on public.votes;
drop policy if exists "rapporteurs can manage votes" on public.votes;
drop policy if exists "votes are visible inside organization" on public.votes;
drop policy if exists "users can cast votes if they are members" on public.votes;
drop policy if exists "votes cannot be updated" on public.votes;
drop policy if exists "votes cannot be deleted" on public.votes;
create policy "users read own votes and managers read round votes" on public.votes
for select to authenticated using(
 organization_id=public.current_organization_id() and (
  user_id=auth.uid() or public.is_system_admin() or exists(
   select 1 from public.meetings m where m.id=meeting_id
   and public.has_permission('voting.manage',m.governance_unit_id)
  )
 ));
create policy "voting rounds follow scoped read permission" on public.voting_rounds
for select to authenticated using(
 organization_id=public.current_organization_id() and exists(
  select 1 from public.meetings m where m.id=meeting_id and (
   public.is_system_admin() or public.has_permission('voting.read',m.governance_unit_id)
   or public.has_permission('voting.manage',m.governance_unit_id)
  )
 ));
create policy "users read own voting eligibility" on public.voting_eligible_members
for select to authenticated using(
 organization_id=public.current_organization_id() and (
  user_id=auth.uid() or public.is_system_admin() or exists(
   select 1 from public.voting_rounds vr join public.meetings m on m.id=vr.meeting_id
   where vr.id=voting_round_id and public.has_permission('voting.manage',m.governance_unit_id)
  )
 ));

create or replace function public.recalculate_meeting_quorum(
 p_meeting_id uuid,p_record_snapshot boolean default true
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_m public.meetings%rowtype;v_required int;v_eligible int;v_present int;
v_actual numeric(7,4);v_status text;v_snapshot uuid;
begin
 select * into v_m from public.meetings
 where id=p_meeting_id and organization_id=public.current_organization_id() for update;
 if v_m.id is null then raise exception 'meeting not found' using errcode='P0002'; end if;
 if not public.is_system_admin() and not public.has_permission('quorum.read',v_m.governance_unit_id)
 and not public.has_permission('quorum.manage',v_m.governance_unit_id)
 and not public.has_permission('attendance.manage',v_m.governance_unit_id)
 then raise exception 'permission denied: quorum.read' using errcode='42501'; end if;
 select quorum_percentage into v_required from public.governance_units where id=v_m.governance_unit_id;
 select count(*) into v_eligible from public.attendance_records where meeting_id=v_m.id;
 select count(*) into v_present from public.attendance_records
 where meeting_id=v_m.id and attendance_status in('present','late');
 v_actual:=case when v_eligible=0 then 0 else round(v_present::numeric*100/v_eligible,4) end;
 v_status:=case when v_eligible>0 and v_actual>=v_required then 'met' else 'not_met' end;
 update public.meetings set quorum_status=v_status where id=v_m.id;
 if p_record_snapshot then
  insert into public.quorum_snapshots(organization_id,meeting_id,required_percentage,eligible_members,
   present_members,actual_percentage,quorum_status,calculated_by_user_id)
  values(v_m.organization_id,v_m.id,v_required,v_eligible,v_present,v_actual,v_status,auth.uid())
  returning id into v_snapshot;
 end if;
 return jsonb_build_object('meeting_id',v_m.id,'required_percentage',v_required,
  'eligible_members',v_eligible,'present_members',v_present,'actual_percentage',v_actual,
  'quorum_status',v_status,'snapshot_id',v_snapshot);
end $$;

create or replace function public.on_attendance_change() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 perform public.recalculate_meeting_quorum(coalesce(new.meeting_id,old.meeting_id),false);
 return null;
end $$;

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
  attendance_status,recorded_by_user_id)
 select v_m.organization_id,v_m.id,ms.user_id,ms.id,'pending',auth.uid()
 from public.memberships ms join public.users u on u.id=ms.user_id
 where ms.organization_id=v_m.organization_id and ms.governance_unit_id=v_m.governance_unit_id
 and ms.membership_status='active' and u.status='active'
 on conflict(meeting_id,user_id) do nothing;
 get diagnostics v_count=row_count;
 insert into public.attendance_history(organization_id,attendance_record_id,meeting_id,user_id,
  from_status,to_status,changed_by_user_id,remarks)
 select organization_id,id,meeting_id,user_id,null,'pending',auth.uid(),'session roster initialized'
 from public.attendance_records where meeting_id=v_m.id
 and not exists(select 1 from public.attendance_history h where h.attendance_record_id=attendance_records.id);
 update public.meetings set status='in_progress' where id=v_m.id;
 insert into public.meeting_status_history(organization_id,meeting_id,from_status,to_status,
  changed_by_user_id,change_reason)
 values(v_m.organization_id,v_m.id,v_m.status,'in_progress',auth.uid(),'meeting session opened');
 perform public.recalculate_meeting_quorum(v_m.id,true);
 perform public.append_audit_log(v_m.organization_id,'meetings.session.open','meetings',v_m.id,
  jsonb_build_object('roster_count',v_count));
 return public.get_meeting_session_detail(v_m.id);
end $$;

create or replace function public.record_attendance(
 p_attendance_record_id uuid,p_status text,p_remarks text,p_expected_updated_at timestamptz
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_a public.attendance_records%rowtype;v_unit uuid;
begin
 if p_status not in('pending','present','absent','excused','late') then raise exception 'invalid attendance status'; end if;
 select a.* into v_a from public.attendance_records a
 where a.id=p_attendance_record_id and a.organization_id=public.current_organization_id() for update;
 if v_a.id is null then raise exception 'attendance record not found' using errcode='P0002'; end if;
 select governance_unit_id into v_unit from public.meetings where id=v_a.meeting_id and status='in_progress';
 if v_unit is null then raise exception 'attendance can only change during an in-progress meeting'; end if;
 perform public.assert_permission('attendance.manage',v_unit);
 if p_expected_updated_at is null or p_expected_updated_at<>v_a.updated_at then
  raise exception 'attendance was modified; refresh before update' using errcode='40001'; end if;
 update public.attendance_records set attendance_status=p_status,
  check_in_at=case when p_status in('present','late') then coalesce(check_in_at,now()) else null end,
  check_out_at=case when p_status in('absent','excused') and v_a.attendance_status in('present','late') then now() else check_out_at end,
  remarks=nullif(btrim(coalesce(p_remarks,'')),''),recorded_by_user_id=auth.uid()
 where id=v_a.id;
 insert into public.attendance_history(organization_id,attendance_record_id,meeting_id,user_id,
  from_status,to_status,changed_by_user_id,remarks)
 values(v_a.organization_id,v_a.id,v_a.meeting_id,v_a.user_id,v_a.attendance_status,p_status,auth.uid(),
  nullif(btrim(coalesce(p_remarks,'')),''));
 perform public.append_audit_log(v_a.organization_id,'attendance.record','attendance_records',v_a.id,
  jsonb_build_object('meeting_id',v_a.meeting_id,'user_id',v_a.user_id,
   'from_status',v_a.attendance_status,'to_status',p_status));
 return (select to_jsonb(a) from public.attendance_records a where a.id=v_a.id);
end $$;

create or replace function public.get_meeting_session_detail(p_meeting_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_m public.meetings%rowtype;
begin
 select * into v_m from public.meetings
 where id=p_meeting_id and organization_id=public.current_organization_id();
 if v_m.id is null then raise exception 'meeting not found' using errcode='P0002'; end if;
 if not public.is_system_admin() and not public.has_permission('attendance.read',v_m.governance_unit_id)
 and not public.has_permission('attendance.manage',v_m.governance_unit_id)
 then raise exception 'permission denied: attendance.read' using errcode='42501'; end if;
 return jsonb_build_object(
  'meeting',jsonb_build_object('id',v_m.id,'meeting_no',v_m.meeting_no,'title_ar',v_m.title_ar,
   'status',v_m.status,'quorum_status',v_m.quorum_status,'updated_at',v_m.updated_at),
  'attendance',coalesce((select jsonb_agg(jsonb_build_object(
   'id',a.id,'user_id',a.user_id,'membership_id',a.membership_id,'full_name_ar',u.full_name_ar,
   'status',a.attendance_status,'check_in_at',a.check_in_at,'check_out_at',a.check_out_at,
   'remarks',a.remarks,'updated_at',a.updated_at) order by u.full_name_ar,a.id)
   from public.attendance_records a join public.users u on u.id=a.user_id
   where a.meeting_id=v_m.id),'[]'::jsonb),
  'quorum',(select to_jsonb(q)-'organization_id' from public.quorum_snapshots q
   where q.meeting_id=v_m.id order by q.calculated_at desc,q.id desc limit 1),
  'open_voting_rounds',coalesce((select jsonb_agg(to_jsonb(vr)-'organization_id' order by vr.opened_at)
   from public.voting_rounds vr where vr.meeting_id=v_m.id and vr.status='open'),'[]'::jsonb));
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
 if v_m.quorum_status<>'met' then raise exception 'quorum must be met before voting'; end if;
 if p_expected_meeting_updated_at is null or p_expected_meeting_updated_at<>v_m.updated_at then
  raise exception 'meeting was modified; refresh before opening vote' using errcode='40001'; end if;
 if exists(select 1 from public.voting_rounds where agenda_item_id=v_ai.id and status='open')
 then raise exception 'voting is already open for this agenda item'; end if;
 select coalesce(max(round_number),0)+1 into v_no from public.voting_rounds where agenda_item_id=v_ai.id;
 select count(*) into v_count from public.attendance_records a
 join public.memberships ms on ms.id=a.membership_id and ms.membership_status='active'
 where a.meeting_id=v_m.id and a.attendance_status in('present','late');
 if v_count=0 then raise exception 'no eligible present members for voting'; end if;
 insert into public.voting_rounds(organization_id,meeting_id,agenda_item_id,round_number,
  eligible_voter_count,opened_by_user_id)
 values(v_m.organization_id,v_m.id,v_ai.id,v_no,v_count,auth.uid()) returning id into v_round;
 insert into public.voting_eligible_members(organization_id,voting_round_id,user_id,membership_id)
 select v_m.organization_id,v_round,a.user_id,a.membership_id from public.attendance_records a
 join public.memberships ms on ms.id=a.membership_id and ms.membership_status='active'
 where a.meeting_id=v_m.id and a.attendance_status in('present','late');
 update public.agenda_items set voting_status='open',voting_result='pending' where id=v_ai.id;
 perform public.append_audit_log(v_m.organization_id,'voting.open','voting_rounds',v_round,
  jsonb_build_object('meeting_id',v_m.id,'agenda_item_id',v_ai.id,'eligible_voter_count',v_count));
 return jsonb_build_object('voting_round_id',v_round,'meeting_id',v_m.id,
  'agenda_item_id',v_ai.id,'round_number',v_no,'status','open','eligible_voter_count',v_count);
end $$;

create or replace function public.cast_vote(
 p_voting_round_id uuid,p_vote_value text,p_vote_note text default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_r public.voting_rounds%rowtype;v_e public.voting_eligible_members%rowtype;v_topic uuid;v_id uuid;
begin
 if p_vote_value not in('approve','reject','abstain') then raise exception 'invalid vote value'; end if;
 select * into v_r from public.voting_rounds where id=p_voting_round_id
 and organization_id=public.current_organization_id() for update;
 if v_r.id is null then raise exception 'voting round not found' using errcode='P0002'; end if;
 if v_r.status<>'open' then raise exception 'voting round is not open'; end if;
 select * into v_e from public.voting_eligible_members
 where voting_round_id=v_r.id and user_id=auth.uid();
 if v_e.user_id is null then raise exception 'current user is not eligible for this voting round' using errcode='42501'; end if;
 perform public.assert_permission('voting.cast',(select governance_unit_id from public.meetings where id=v_r.meeting_id));
 select topic_id into v_topic from public.agenda_items where id=v_r.agenda_item_id;
 insert into public.votes(organization_id,meeting_id,topic_id,user_id,membership_id,
  vote_value,vote_note,voting_round_id)
 values(v_r.organization_id,v_r.meeting_id,v_topic,auth.uid(),v_e.membership_id,
  p_vote_value,nullif(btrim(coalesce(p_vote_note,'')),''),v_r.id)
 returning id into v_id;
 perform public.append_audit_log(v_r.organization_id,'voting.cast','votes',v_id,
  jsonb_build_object('voting_round_id',v_r.id,'meeting_id',v_r.meeting_id,'agenda_item_id',v_r.agenda_item_id));
 return jsonb_build_object('vote_id',v_id,'voting_round_id',v_r.id,'accepted',true,'voted_at',now());
exception when unique_violation then
 raise exception 'vote already cast for this round' using errcode='23505';
end $$;

create or replace function public.close_voting_round(
 p_voting_round_id uuid,p_reason text default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_r public.voting_rounds%rowtype;v_unit uuid;v_approve int;v_reject int;v_abstain int;v_result text;
begin
 select * into v_r from public.voting_rounds where id=p_voting_round_id
 and organization_id=public.current_organization_id() for update;
 if v_r.id is null then raise exception 'voting round not found' using errcode='P0002'; end if;
 if v_r.status<>'open' then raise exception 'voting round is not open'; end if;
 select governance_unit_id into v_unit from public.meetings where id=v_r.meeting_id and status='in_progress';
 if v_unit is null then raise exception 'meeting is not in progress'; end if;
 perform public.assert_permission('voting.manage',v_unit);
 select count(*) filter(where vote_value='approve'),count(*) filter(where vote_value='reject'),
  count(*) filter(where vote_value='abstain') into v_approve,v_reject,v_abstain
 from public.votes where voting_round_id=v_r.id;
 v_result:=case
  when v_approve+v_reject+v_abstain=0 then 'no_votes'
  when v_approve>v_reject then 'approved'
  when v_reject>v_approve then 'rejected'
  else 'tied' end;
 update public.voting_rounds set status='closed',approve_count=v_approve,reject_count=v_reject,
  abstain_count=v_abstain,result=v_result,closed_by_user_id=auth.uid(),closed_at=now(),
  close_reason=nullif(btrim(coalesce(p_reason,'')),'') where id=v_r.id;
 update public.agenda_items set voting_status='closed',
  voting_result=case v_result when 'no_votes' then 'tied' else v_result end where id=v_r.agenda_item_id;
 perform public.append_audit_log(v_r.organization_id,'voting.close','voting_rounds',v_r.id,
  jsonb_build_object('result',v_result,'approve_count',v_approve,'reject_count',v_reject,
   'abstain_count',v_abstain));
 return jsonb_build_object('voting_round_id',v_r.id,'status','closed','result',v_result,
  'eligible_voter_count',v_r.eligible_voter_count,'approve_count',v_approve,
  'reject_count',v_reject,'abstain_count',v_abstain);
end $$;

create or replace function public.get_my_open_votes(p_meeting_id uuid default null)
returns jsonb language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_agg(jsonb_build_object(
  'voting_round_id',vr.id,'meeting_id',vr.meeting_id,'agenda_item_id',vr.agenda_item_id,
  'topic_id',ai.topic_id,'topic_no',t.topic_no,'title_ar',t.title_ar,'opened_at',vr.opened_at,
  'has_voted',exists(select 1 from public.votes v where v.voting_round_id=vr.id and v.user_id=auth.uid())
 ) order by vr.opened_at),'[]'::jsonb)
 from public.voting_eligible_members e
 join public.voting_rounds vr on vr.id=e.voting_round_id and vr.status='open'
 join public.agenda_items ai on ai.id=vr.agenda_item_id
 join public.topics t on t.id=ai.topic_id
 where e.user_id=auth.uid() and e.organization_id=public.current_organization_id()
 and (p_meeting_id is null or vr.meeting_id=p_meeting_id)
$$;

create or replace function public.get_voting_round_detail(p_voting_round_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_r public.voting_rounds%rowtype;v_unit uuid;v_manage boolean;
begin
 select * into v_r from public.voting_rounds where id=p_voting_round_id
 and organization_id=public.current_organization_id();
 if v_r.id is null then raise exception 'voting round not found' using errcode='P0002'; end if;
 select governance_unit_id into v_unit from public.meetings where id=v_r.meeting_id;
 v_manage:=public.is_system_admin() or public.has_permission('voting.manage',v_unit);
 if not v_manage and not exists(select 1 from public.voting_eligible_members
  where voting_round_id=v_r.id and user_id=auth.uid())
 then raise exception 'permission denied: voting.read' using errcode='42501'; end if;
 return to_jsonb(v_r)-'organization_id'||jsonb_build_object(
  'has_voted',exists(select 1 from public.votes where voting_round_id=v_r.id and user_id=auth.uid()),
  'my_vote',(select vote_value from public.votes where voting_round_id=v_r.id and user_id=auth.uid()),
  'votes',case when v_manage then coalesce((select jsonb_agg(jsonb_build_object(
   'user_id',v.user_id,'full_name_ar',u.full_name_ar,'vote_value',v.vote_value,
   'vote_note',v.vote_note,'voted_at',v.voted_at) order by v.voted_at)
   from public.votes v join public.users u on u.id=v.user_id where v.voting_round_id=v_r.id),'[]'::jsonb)
   else null end);
end $$;

revoke insert,update,delete on public.attendance_records,public.attendance_history,
 public.quorum_snapshots,public.voting_rounds,public.voting_eligible_members,public.votes
 from authenticated;
grant select on public.attendance_history,public.quorum_snapshots,
 public.voting_rounds,public.voting_eligible_members to authenticated;
grant execute on function public.recalculate_meeting_quorum(uuid,boolean),
 public.open_meeting_session(uuid,timestamptz),
 public.record_attendance(uuid,text,text,timestamptz),
 public.get_meeting_session_detail(uuid),
 public.apply_quorum_failure(uuid,text,text,timestamptz),
 public.open_voting_round(uuid,timestamptz),
 public.cast_vote(uuid,text,text),
 public.close_voting_round(uuid,text),
 public.get_my_open_votes(uuid),
 public.get_voting_round_detail(uuid) to authenticated;
