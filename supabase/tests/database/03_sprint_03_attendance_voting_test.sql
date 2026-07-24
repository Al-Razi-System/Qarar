begin;
create extension if not exists pgtap;
select plan(11);

select ok(
 not has_table_privilege('authenticated','public.attendance_records','INSERT'),
 'authenticated clients cannot insert attendance directly');
select ok(
 not has_table_privilege('authenticated','public.attendance_records','UPDATE'),
 'authenticated clients cannot update attendance directly');
select ok(
 not has_table_privilege('authenticated','public.votes','INSERT'),
 'authenticated clients cannot insert votes directly');
select ok(
 not has_function_privilege('authenticated','qarar_attendance.calculate_meeting_quorum(uuid)','EXECUTE'),
 'legacy quorum mutation function is not client callable');
select ok(
 has_function_privilege('authenticated','api_v1.cast_vote(uuid,text,text)','EXECUTE'),
 'authenticated clients use the validated vote RPC');
select ok(
 not has_function_privilege('authenticated','qarar_voting.cast_vote(uuid,text,text)','EXECUTE'),
 'authenticated clients cannot bypass api_v1 to cast votes');
select ok(
 not has_function_privilege('anon','api_v1.open_meeting_session(uuid,timestamptz)','EXECUTE'),
 'anonymous clients cannot open meeting sessions');
select ok(
 not has_function_privilege('anon','api_v1.cast_vote(uuid,text,text)','EXECUTE'),
 'anonymous clients cannot cast votes');
select ok(
 not has_function_privilege('authenticated','qarar_attendance.record_attendance(uuid,text,text,timestamptz)','EXECUTE'),
 'legacy direct attendance RPC is not client callable');
select ok(
 has_function_privilege('authenticated','api_v1.self_check_in(uuid,text,text)','EXECUTE'),
 'authenticated members can use governed self check-in');
select ok(
 not has_function_privilege('anon','api_v1.self_check_in(uuid,text,text)','EXECUTE'),
 'anonymous clients cannot submit check-in claims');

select * from finish();
rollback;
