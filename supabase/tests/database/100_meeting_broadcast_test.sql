-- Broadcasting the chair's screen to the members (product owner, 2026-10-15):
-- one controller at a time, the chair by default; the chair hands control to
-- the rapporteur and takes it back; members follow.
-- Impact map: docs/engineering/impact/MEETING_BROADCAST_AR.md
begin;
create extension if not exists pgtap;
select plan(24);

insert into public.organizations(id,code,name_ar) values
('a1000000-0000-0000-0000-000000000001','s100','Broadcast'),
('a1000000-0000-0000-0000-000000000002','s100b','Other Tenant');
insert into auth.users(id,email) values
('a1000000-0000-0000-0000-000000000011','chair@s100.test'),
('a1000000-0000-0000-0000-000000000012','rapporteur@s100.test'),
('a1000000-0000-0000-0000-000000000013','member@s100.test'),
('a1000000-0000-0000-0000-000000000015','admin@s100.test'),
('a1000000-0000-0000-0000-000000000016','other@s100b.test');
insert into public.users(id,organization_id,email,full_name_ar,is_system_admin) values
('a1000000-0000-0000-0000-000000000011','a1000000-0000-0000-0000-000000000001','chair@s100.test','Council Chair',false),
('a1000000-0000-0000-0000-000000000012','a1000000-0000-0000-0000-000000000001','rapporteur@s100.test','Council Rapporteur',false),
('a1000000-0000-0000-0000-000000000013','a1000000-0000-0000-0000-000000000001','member@s100.test','Council Member',false),
('a1000000-0000-0000-0000-000000000015','a1000000-0000-0000-0000-000000000001','admin@s100.test','System Admin',true),
('a1000000-0000-0000-0000-000000000016','a1000000-0000-0000-0000-000000000002','other@s100b.test','Other Tenant User',false);
insert into public.governance_unit_types(id,organization_id,code,name_ar) values
('a1000000-0000-0000-0000-000000000021','a1000000-0000-0000-0000-000000000001','council','Council');
insert into public.governance_units(id,organization_id,unit_type_id,code,name_ar,quorum_percentage) values
('a1000000-0000-0000-0000-000000000022','a1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000021','faculty','Faculty Council',50);
delete from public.roles where organization_id='a1000000-0000-0000-0000-000000000001' and code in ('council_chair','council_rapporteur');
insert into public.roles(id,organization_id,code,name_ar,role_scope) values
('a1000000-0000-0000-0000-000000000031','a1000000-0000-0000-0000-000000000001','council_chair','Chair','governance_unit'),
('a1000000-0000-0000-0000-000000000032','a1000000-0000-0000-0000-000000000001','council_rapporteur','Rapporteur','governance_unit'),
('a1000000-0000-0000-0000-000000000033','a1000000-0000-0000-0000-000000000001','s100_member','Member','governance_unit');
insert into public.permissions(organization_id,code,module,action,context_scope,name_ar)
select 'a1000000-0000-0000-0000-000000000001',v.code,split_part(v.code,'.',1),split_part(v.code,'.',2),'governance_unit',v.code
from (values ('meetings.manage'),('attendance.read'),('attendance.manage'),('attendance.verify'),('attendance.lock'),('quorum.read'),('quorum.manage')) v(code)
on conflict (organization_id,code) do nothing;
insert into public.role_permissions(organization_id,role_id,permission_id)
select 'a1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000031',id
from public.permissions where organization_id='a1000000-0000-0000-0000-000000000001'
 and code in ('meetings.manage','attendance.read','attendance.manage','attendance.verify','attendance.lock','quorum.read','quorum.manage');
insert into public.role_permissions(organization_id,role_id,permission_id)
select 'a1000000-0000-0000-0000-000000000001',r.role_id,p.id
from public.permissions p
cross join (values ('a1000000-0000-0000-0000-000000000032'::uuid),('a1000000-0000-0000-0000-000000000033'::uuid)) r(role_id)
where p.organization_id='a1000000-0000-0000-0000-000000000001' and p.code in ('attendance.read','quorum.read');
insert into public.memberships(id,organization_id,user_id,governance_unit_id,role_id) values
('a1000000-0000-0000-0000-000000000061','a1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000011','a1000000-0000-0000-0000-000000000022','a1000000-0000-0000-0000-000000000031'),
('a1000000-0000-0000-0000-000000000062','a1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000012','a1000000-0000-0000-0000-000000000022','a1000000-0000-0000-0000-000000000032'),
('a1000000-0000-0000-0000-000000000063','a1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000013','a1000000-0000-0000-0000-000000000022','a1000000-0000-0000-0000-000000000033');
insert into public.topics(id,organization_id,topic_no,title_ar,current_unit_id,submitted_by_user_id,status) values
('a1000000-0000-0000-0000-000000000071','a1000000-0000-0000-0000-000000000001','TOP-S100-1','Plan','a1000000-0000-0000-0000-000000000022','a1000000-0000-0000-0000-000000000012','approved'),
('a1000000-0000-0000-0000-000000000072','a1000000-0000-0000-0000-000000000001','TOP-S100-2','Budget','a1000000-0000-0000-0000-000000000022','a1000000-0000-0000-0000-000000000012','approved'),
('a1000000-0000-0000-0000-000000000073','a1000000-0000-0000-0000-000000000001','TOP-S100-3','Next meeting topic','a1000000-0000-0000-0000-000000000022','a1000000-0000-0000-0000-000000000012','approved');
-- M1 runs now; M2 has not started.
insert into public.meetings(id,organization_id,meeting_no,governance_unit_id,title_ar,scheduled_date,created_by_user_id,status) values
('a1000000-0000-0000-0000-000000000081','a1000000-0000-0000-0000-000000000001','MTG-S100-1','a1000000-0000-0000-0000-000000000022','Live meeting',current_date,'a1000000-0000-0000-0000-000000000011','ready_to_start'),
('a1000000-0000-0000-0000-000000000082','a1000000-0000-0000-0000-000000000001','MTG-S100-2','a1000000-0000-0000-0000-000000000022','Next meeting',current_date+7,'a1000000-0000-0000-0000-000000000011','ready_to_start');
insert into public.agenda_items(id,organization_id,meeting_id,topic_id,agenda_order) values
('a1000000-0000-0000-0000-000000000091','a1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000081','a1000000-0000-0000-0000-000000000071',1),
('a1000000-0000-0000-0000-000000000092','a1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000081','a1000000-0000-0000-0000-000000000072',2),
('a1000000-0000-0000-0000-000000000093','a1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000082','a1000000-0000-0000-0000-000000000073',1);

create function pg_temp.s100_as(p_user text) returns void language sql as
$$ select set_config('request.jwt.claims',json_build_object('sub',p_user,'role','authenticated')::text,true)::text; select null::void $$;
create function pg_temp.s100_meeting_token() returns timestamptz language sql security definer as
$$ select updated_at from qarar_meetings.meetings where id='a1000000-0000-0000-0000-000000000081' $$;
create function pg_temp.s100_state() returns jsonb language sql as
$$ select api_v2.get_meeting_broadcast_v2('a1000000-0000-0000-0000-000000000081') $$;
create function pg_temp.s100_revision() returns integer language sql as
$$ select (pg_temp.s100_state()->>'revision')::integer $$;
create function pg_temp.s100_handover_audits() returns bigint language sql security definer as
$$ select count(*) from qarar_audit.audit_logs where action='meetings.broadcast.handover' and entity_id='a1000000-0000-0000-0000-000000000081' $$;

set local role authenticated;
select pg_temp.s100_as('a1000000-0000-0000-0000-000000000011');

-- Before the session starts there is nothing to broadcast.
select throws_ok($$ select api_v2.set_meeting_broadcast_v2('a1000000-0000-0000-0000-000000000082','a1000000-0000-0000-0000-000000000093','instructions',0) $$,
  '23514',null,'nothing is broadcast before the session starts');

select api_v1.open_meeting_session('a1000000-0000-0000-0000-000000000081',pg_temp.s100_meeting_token());

-- The default: the chair controls, nothing chosen yet.
select is(pg_temp.s100_state()->>'controller_role','chair','the chair controls the broadcast by default');
select is(pg_temp.s100_revision(),0,'the default broadcast has revision 0');
select is((pg_temp.s100_state()->>'viewer_controls')::boolean,true,'the chair is told they control the broadcast');
select is((pg_temp.s100_state()->>'can_hand_over')::boolean,true,'the chair may hand control to the rapporteur');

-- The chair broadcasts an item and a panel.
select is((api_v2.set_meeting_broadcast_v2('a1000000-0000-0000-0000-000000000081','a1000000-0000-0000-0000-000000000092','attachments',0)->>'revision')::integer,1,'the chair broadcasts an item');
select is(pg_temp.s100_state()->>'agenda_item_id','a1000000-0000-0000-0000-000000000092','every screen reads the broadcast item');
select is(pg_temp.s100_state()->>'panel','attachments','every screen reads the broadcast panel');
select throws_ok($$ select api_v2.set_meeting_broadcast_v2('a1000000-0000-0000-0000-000000000081','a1000000-0000-0000-0000-000000000091','instructions',0) $$,
  '40001',null,'a stale revision is refused instead of overwriting the broadcast');
select throws_ok($$ select api_v2.set_meeting_broadcast_v2('a1000000-0000-0000-0000-000000000081','a1000000-0000-0000-0000-000000000093','instructions',1) $$,
  '22023',null,'an item from another meeting cannot be broadcast');
select throws_ok($$ select api_v2.set_meeting_broadcast_v2('a1000000-0000-0000-0000-000000000081','a1000000-0000-0000-0000-000000000091','minutes',1) $$,
  '22023',null,'an unknown panel cannot be broadcast');

-- A member reads the broadcast but cannot steer it.
select pg_temp.s100_as('a1000000-0000-0000-0000-000000000013');
select is((pg_temp.s100_state()->>'viewer_controls')::boolean,false,'a member is told they follow the broadcast');
select throws_ok($$ select api_v2.set_meeting_broadcast_v2('a1000000-0000-0000-0000-000000000081','a1000000-0000-0000-0000-000000000091','instructions',1) $$,
  '42501',null,'a member cannot steer the broadcast');
select throws_ok($$ select api_v2.hand_over_meeting_broadcast_v2('a1000000-0000-0000-0000-000000000081','rapporteur',1) $$,
  '42501',null,'a member cannot hand over the broadcast');

-- A system administrator is not the chair.
select pg_temp.s100_as('a1000000-0000-0000-0000-000000000015');
select throws_ok($$ select api_v2.set_meeting_broadcast_v2('a1000000-0000-0000-0000-000000000081','a1000000-0000-0000-0000-000000000091','instructions',1) $$,
  '42501',null,'a system administrator cannot steer the broadcast');

-- The rapporteur steers only once the chair hands over.
select pg_temp.s100_as('a1000000-0000-0000-0000-000000000012');
select throws_ok($$ select api_v2.set_meeting_broadcast_v2('a1000000-0000-0000-0000-000000000081','a1000000-0000-0000-0000-000000000091','instructions',1) $$,
  '42501',null,'the rapporteur cannot steer while the chair controls');
select pg_temp.s100_as('a1000000-0000-0000-0000-000000000011');
select is(api_v2.hand_over_meeting_broadcast_v2('a1000000-0000-0000-0000-000000000081','rapporteur',1)->>'controller_role','rapporteur','the chair hands control to the rapporteur');
select throws_ok($$ select api_v2.set_meeting_broadcast_v2('a1000000-0000-0000-0000-000000000081','a1000000-0000-0000-0000-000000000091','instructions',2) $$,
  '42501',null,'the chair no longer steers once control is handed over');
select pg_temp.s100_as('a1000000-0000-0000-0000-000000000012');
select is((pg_temp.s100_state()->>'can_return')::boolean,true,'the rapporteur in control may return it');
select is((api_v2.set_meeting_broadcast_v2('a1000000-0000-0000-0000-000000000081','a1000000-0000-0000-0000-000000000091','history',2)->>'revision')::integer,3,'the rapporteur steers the broadcast');
select throws_ok($$ select api_v2.hand_over_meeting_broadcast_v2('a1000000-0000-0000-0000-000000000081','rapporteur',3) $$,
  '42501',null,'the rapporteur can only return control to the chair');

-- The chair takes control back at any time; each handover is audited.
select pg_temp.s100_as('a1000000-0000-0000-0000-000000000011');
select is(api_v2.hand_over_meeting_broadcast_v2('a1000000-0000-0000-0000-000000000081','chair',3)->>'controller_role','chair','the chair takes control back');
select is(pg_temp.s100_handover_audits(),2::bigint,'every handover is audited');

-- Another tenant cannot see the meeting.
select pg_temp.s100_as('a1000000-0000-0000-0000-000000000016');
select throws_ok($$ select api_v2.get_meeting_broadcast_v2('a1000000-0000-0000-0000-000000000081') $$,'P0002',null,'another tenant cannot read the broadcast');

select * from finish();
rollback;
