begin;
create extension if not exists pgtap;
select plan(5);

insert into public.organizations(id,code,name_ar)
values('11111111-1111-1111-1111-111111111111','s02-guards','Sprint 02 Guards');
insert into auth.users(id,email)
values('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','guard@s02.test');
insert into public.users(id,organization_id,email,full_name_ar)
values('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','guard@s02.test','Guard User');
insert into public.governance_unit_types(id,organization_id,code,name_ar)
values('33333333-3333-3333-3333-333333333333','11111111-1111-1111-1111-111111111111','committee','Committee');
insert into public.governance_units(id,organization_id,unit_type_id,code,name_ar)
values('44444444-4444-4444-4444-444444444444','11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333333','unit','Unit');
insert into public.topics(id,organization_id,topic_no,title_ar,current_unit_id,submitted_by_user_id,status)
values('55555555-5555-5555-5555-555555555555','11111111-1111-1111-1111-111111111111','T-GUARD','Guard Topic',
'44444444-4444-4444-4444-444444444444','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','new');
insert into public.meetings(id,organization_id,meeting_no,governance_unit_id,title_ar,scheduled_date,created_by_user_id,status)
values('66666666-6666-6666-6666-666666666666','11111111-1111-1111-1111-111111111111','M-GUARD',
'44444444-4444-4444-4444-444444444444','Guard Meeting',current_date,'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','draft');

select throws_like(
 $$insert into public.agenda_items(organization_id,meeting_id,topic_id,agenda_order,is_exception)
 values('11111111-1111-1111-1111-111111111111','66666666-6666-6666-6666-666666666666',
 '55555555-5555-5555-5555-555555555555',1,false)$$,
 '%topic is not eligible for agenda without an exception%',
 'database guard blocks an ineligible topic');
select throws_like(
 $$update public.meetings set status='closed' where id='66666666-6666-6666-6666-666666666666'$$,
 '%Invalid transition from draft to closed%',
 'database guard blocks invalid lifecycle transition');
select lives_ok(
 $$update public.meetings set status='scheduled' where id='66666666-6666-6666-6666-666666666666'$$,
 'database guard permits valid lifecycle transition');

set local role authenticated;
set local "request.jwt.claims"='{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
select throws_ok(
 $$insert into public.meetings(organization_id,meeting_no,governance_unit_id,title_ar,scheduled_date,created_by_user_id)
 values('11111111-1111-1111-1111-111111111111','BYPASS','44444444-4444-4444-4444-444444444444',
 'Bypass',current_date,'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')$$,
 '42501','permission denied for table meetings',
 'authenticated clients cannot bypass meeting RPCs');
select throws_ok(
 $$insert into public.agenda_items(organization_id,meeting_id,topic_id,agenda_order)
 values('11111111-1111-1111-1111-111111111111','66666666-6666-6666-6666-666666666666',
 '55555555-5555-5555-5555-555555555555',1)$$,
 '42501','permission denied for table agenda_items',
 'authenticated clients cannot bypass agenda RPCs');

select * from finish();
rollback;
