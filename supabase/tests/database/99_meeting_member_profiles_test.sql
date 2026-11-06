-- The member card in the live meeting room. Decision of the product owner,
-- 2026-10-15: every participant sees a member's photo, title, employer, email,
-- council role, attendance and membership date; only the council's chair and
-- rapporteur see the mobile number.
-- Impact map: docs/engineering/impact/MEETING_MEMBER_CARD_AR.md
begin;
create extension if not exists pgtap;
select plan(19);

insert into public.organizations(id,code,name_ar) values
('99000000-0000-0000-0000-000000000001','s99','Member Card'),
('99000000-0000-0000-0000-000000000002','s99b','Other Tenant');
insert into auth.users(id,email) values
('99000000-0000-0000-0000-000000000011','chair@s99.test'),
('99000000-0000-0000-0000-000000000012','rapporteur@s99.test'),
('99000000-0000-0000-0000-000000000013','member@s99.test'),
('99000000-0000-0000-0000-000000000014','outsider@s99.test'),
('99000000-0000-0000-0000-000000000015','admin@s99.test'),
('99000000-0000-0000-0000-000000000016','other@s99b.test');
insert into public.users(id,organization_id,email,full_name_ar,job_title,mobile,is_system_admin) values
('99000000-0000-0000-0000-000000000011','99000000-0000-0000-0000-000000000001','chair@s99.test','Council Chair','Dean','0500000011',false),
('99000000-0000-0000-0000-000000000012','99000000-0000-0000-0000-000000000001','rapporteur@s99.test','Council Rapporteur','Secretary','0500000012',false),
('99000000-0000-0000-0000-000000000013','99000000-0000-0000-0000-000000000001','member@s99.test','Council Member','Professor','0500000013',false),
('99000000-0000-0000-0000-000000000014','99000000-0000-0000-0000-000000000001','outsider@s99.test','Outsider','Clerk','0500000014',false),
('99000000-0000-0000-0000-000000000015','99000000-0000-0000-0000-000000000001','admin@s99.test','System Admin','Admin','0500000015',true),
('99000000-0000-0000-0000-000000000016','99000000-0000-0000-0000-000000000002','other@s99b.test','Other Tenant User','Dean','0500000016',false);
insert into public.governance_unit_types(id,organization_id,code,name_ar) values
('99000000-0000-0000-0000-000000000021','99000000-0000-0000-0000-000000000001','council','Council'),
('99000000-0000-0000-0000-000000000024','99000000-0000-0000-0000-000000000001','department','Department');
insert into public.governance_units(id,organization_id,unit_type_id,code,name_ar,quorum_percentage) values
('99000000-0000-0000-0000-000000000022','99000000-0000-0000-0000-000000000001','99000000-0000-0000-0000-000000000021','faculty','Faculty Council',50),
('99000000-0000-0000-0000-000000000023','99000000-0000-0000-0000-000000000001','99000000-0000-0000-0000-000000000024','cs','Computer Science Department',50);
delete from public.roles where organization_id='99000000-0000-0000-0000-000000000001' and code in ('council_chair','council_rapporteur');
insert into public.roles(id,organization_id,code,name_ar,role_scope) values
('99000000-0000-0000-0000-000000000031','99000000-0000-0000-0000-000000000001','council_chair','Chair','governance_unit'),
('99000000-0000-0000-0000-000000000032','99000000-0000-0000-0000-000000000001','council_rapporteur','Rapporteur','governance_unit'),
('99000000-0000-0000-0000-000000000033','99000000-0000-0000-0000-000000000001','s99_member','Member','governance_unit');
insert into public.permissions(organization_id,code,module,action,context_scope,name_ar)
select '99000000-0000-0000-0000-000000000001',v.code,split_part(v.code,'.',1),split_part(v.code,'.',2),'governance_unit',v.code
from (values ('meetings.manage'),('attendance.read'),('attendance.manage'),('attendance.verify'),('attendance.lock'),('quorum.read'),('quorum.manage')) v(code)
on conflict (organization_id,code) do nothing;
insert into public.role_permissions(organization_id,role_id,permission_id)
select '99000000-0000-0000-0000-000000000001','99000000-0000-0000-0000-000000000031',id
from public.permissions where organization_id='99000000-0000-0000-0000-000000000001'
 and code in ('meetings.manage','attendance.read','attendance.manage','attendance.verify','attendance.lock','quorum.read','quorum.manage');
insert into public.role_permissions(organization_id,role_id,permission_id)
select '99000000-0000-0000-0000-000000000001',r.role_id,p.id
from public.permissions p
cross join (values ('99000000-0000-0000-0000-000000000032'::uuid),('99000000-0000-0000-0000-000000000033'::uuid)) r(role_id)
where p.organization_id='99000000-0000-0000-0000-000000000001' and p.code in ('attendance.read','quorum.read');
insert into public.memberships(id,organization_id,user_id,governance_unit_id,role_id,membership_title,start_date) values
('99000000-0000-0000-0000-000000000061','99000000-0000-0000-0000-000000000001','99000000-0000-0000-0000-000000000011','99000000-0000-0000-0000-000000000022','99000000-0000-0000-0000-000000000031',null,'2025-09-01'),
('99000000-0000-0000-0000-000000000062','99000000-0000-0000-0000-000000000001','99000000-0000-0000-0000-000000000012','99000000-0000-0000-0000-000000000022','99000000-0000-0000-0000-000000000032',null,'2025-09-01'),
('99000000-0000-0000-0000-000000000063','99000000-0000-0000-0000-000000000001','99000000-0000-0000-0000-000000000013','99000000-0000-0000-0000-000000000022','99000000-0000-0000-0000-000000000033','Department representative','2026-01-15');
-- The member works in the CS department and has a photo; the chair has neither.
insert into qarar_iam.user_submission_profiles_v2(user_id,organization_id,home_unit_id) values
('99000000-0000-0000-0000-000000000013','99000000-0000-0000-0000-000000000001','99000000-0000-0000-0000-000000000023');
insert into qarar_iam.user_avatars_v2(user_id,organization_id,content,revision) values
('99000000-0000-0000-0000-000000000013','99000000-0000-0000-0000-000000000001',decode('ffd8ffe000104a46','hex'),3);

insert into public.meetings(id,organization_id,meeting_no,governance_unit_id,title_ar,scheduled_date,created_by_user_id,status) values
('99000000-0000-0000-0000-000000000081','99000000-0000-0000-0000-000000000001','MTG-S99-1','99000000-0000-0000-0000-000000000022','Faculty Council Meeting',current_date,'99000000-0000-0000-0000-000000000011','ready_to_start');

create function pg_temp.s99_as(p_user text) returns void language sql as
$$ select set_config('request.jwt.claims',json_build_object('sub',p_user,'role','authenticated')::text,true)::text; select null::void $$;
create function pg_temp.s99_meeting_token() returns timestamptz language sql security definer as
$$ select updated_at from qarar_meetings.meetings where id='99000000-0000-0000-0000-000000000081' $$;
create function pg_temp.s99_member(p_profiles jsonb, p_user text) returns jsonb language sql as
$$ select m from jsonb_array_elements(p_profiles->'members') m where m->>'user_id'=p_user $$;

set local role authenticated;
select pg_temp.s99_as('99000000-0000-0000-0000-000000000011');
select api_v1.open_meeting_session('99000000-0000-0000-0000-000000000081',pg_temp.s99_meeting_token());
select api_v1.verify_attendance(ar.id,'present','Verified in the room',ar.updated_at)
from public.attendance_records ar
where ar.meeting_id='99000000-0000-0000-0000-000000000081' and ar.user_id='99000000-0000-0000-0000-000000000013';

-- The chair sees every roster member, with the mobile number.
create temporary table s99_chair as
select api_v2.list_meeting_member_profiles_v2('99000000-0000-0000-0000-000000000081') as p;
select is((select (p->>'mobile_visible')::boolean from s99_chair),true,'the chair is told the mobile numbers are visible');
select is((select jsonb_array_length(p->'members') from s99_chair),3,'every roster member is listed, and only them');
select is((select pg_temp.s99_member(p,'99000000-0000-0000-0000-000000000013')->>'mobile' from s99_chair),'0500000013','the chair sees a member''s mobile');
select is((select pg_temp.s99_member(p,'99000000-0000-0000-0000-000000000011')->>'council_role_code' from s99_chair),'council_chair','the chair''s seat carries the chair role');
select is(
  (select jsonb_build_object('job_title',m->>'job_title','home_unit_name_ar',m->>'home_unit_name_ar','email',m->>'email',
     'council_role_name_ar',m->>'council_role_name_ar','membership_title',m->>'membership_title','membership_start_date',m->>'membership_start_date')
   from s99_chair, pg_temp.s99_member(p,'99000000-0000-0000-0000-000000000013') m),
  jsonb_build_object('job_title','Professor','home_unit_name_ar','Computer Science Department','email','member@s99.test',
     'council_role_name_ar','Member','membership_title','Department representative','membership_start_date','2026-01-15'),
  'the card carries title, employer, email, council role and membership date');
select is((select pg_temp.s99_member(p,'99000000-0000-0000-0000-000000000013')->>'attendance_status' from s99_chair),'present','the card carries the attendance status');
select is((select jsonb_build_object('has_avatar',m->'has_avatar','avatar_revision',m->'avatar_revision') from s99_chair, pg_temp.s99_member(p,'99000000-0000-0000-0000-000000000013') m),
  '{"has_avatar":true,"avatar_revision":3}'::jsonb,'a member with a photo is marked with its revision');
select is((select pg_temp.s99_member(p,'99000000-0000-0000-0000-000000000011')->>'has_avatar' from s99_chair),'false','a member without a photo is marked as such');
select ok((select not (pg_temp.s99_member(p,'99000000-0000-0000-0000-000000000013') ? 'content_base64') from s99_chair),'the list never carries photo bytes');

-- The rapporteur also sees the mobile number.
select pg_temp.s99_as('99000000-0000-0000-0000-000000000012');
select is((api_v2.list_meeting_member_profiles_v2('99000000-0000-0000-0000-000000000081')->>'mobile_visible')::boolean,true,'the rapporteur is told the mobile numbers are visible');
select is(pg_temp.s99_member(api_v2.list_meeting_member_profiles_v2('99000000-0000-0000-0000-000000000081'),'99000000-0000-0000-0000-000000000011')->>'mobile','0500000011','the rapporteur sees the chair''s mobile');

-- A member sees the card without any mobile number.
select pg_temp.s99_as('99000000-0000-0000-0000-000000000013');
create temporary table s99_member_view as
select api_v2.list_meeting_member_profiles_v2('99000000-0000-0000-0000-000000000081') as p;
select is((select (p->>'mobile_visible')::boolean from s99_member_view),false,'a member is told the mobile numbers are hidden');
select is((select count(*) from s99_member_view, jsonb_array_elements(p->'members') m where m->>'mobile' is not null),0::bigint,'a member receives no mobile number, not even their own colleague''s');
select is((select pg_temp.s99_member(p,'99000000-0000-0000-0000-000000000011')->>'email' from s99_member_view),'chair@s99.test','a member still sees the email');

-- A system administrator is not the chair: no mobile numbers.
select pg_temp.s99_as('99000000-0000-0000-0000-000000000015');
select is((api_v2.list_meeting_member_profiles_v2('99000000-0000-0000-0000-000000000081')->>'mobile_visible')::boolean,false,'a system administrator does not see mobile numbers');

-- Without attendance.read, and from another tenant, nothing is returned.
select pg_temp.s99_as('99000000-0000-0000-0000-000000000014');
select throws_ok($$ select api_v2.list_meeting_member_profiles_v2('99000000-0000-0000-0000-000000000081') $$,'42501',null,'a user without attendance.read in the council is refused');
select pg_temp.s99_as('99000000-0000-0000-0000-000000000016');
select throws_ok($$ select api_v2.list_meeting_member_profiles_v2('99000000-0000-0000-0000-000000000081') $$,'P0002',null,'another tenant cannot see the meeting');

-- Photos: only for a roster member of the meeting.
select pg_temp.s99_as('99000000-0000-0000-0000-000000000013');
select is(api_v2.get_meeting_member_avatar_v2('99000000-0000-0000-0000-000000000081','99000000-0000-0000-0000-000000000013'),
  jsonb_build_object('revision',3,'has_image',true,'content_base64',encode(decode('ffd8ffe000104a46','hex'),'base64')),
  'a participant receives a roster member''s photo');
select throws_ok($$ select api_v2.get_meeting_member_avatar_v2('99000000-0000-0000-0000-000000000081','99000000-0000-0000-0000-000000000014') $$,'P0002',null,
  'the photo of someone outside the meeting''s roster is not served');

select * from finish();
rollback;
