begin;
create extension if not exists pgtap;
select no_plan();
select has_function('api_v2','admin_update_organizational_unit_v2',array['uuid','text','uuid','uuid','text','timestamp with time zone'],'unit lifecycle API exists');
select has_function('api_v2','send_meeting_invitations_v2',array['uuid','time without time zone','time without time zone','timestamp with time zone'],'atomic invitation timing API exists');
insert into qarar_core.organizations(id,code,name_ar) values ('62000000-0000-0000-0000-000000000001','lifecycle-ci','اختبار الدورة'),('62000000-0000-0000-0000-000000000002','lifecycle-other','منظمة أخرى');
insert into auth.users(id,email) values ('62000000-0000-0000-0000-000000000010','lifecycle-admin@example.test'),('62000000-0000-0000-0000-000000000011','lifecycle-denied@example.test');
insert into qarar_iam.users(id,organization_id,email,full_name_ar,is_system_admin) values
('62000000-0000-0000-0000-000000000010','62000000-0000-0000-0000-000000000001','lifecycle-admin@example.test','مسؤول',true),
('62000000-0000-0000-0000-000000000011','62000000-0000-0000-0000-000000000001','lifecycle-denied@example.test','غير مخول',false);
insert into qarar_core.governance_unit_types(id,organization_id,code,name_ar,is_council_type) values
('62000000-0000-0000-0000-000000000020','62000000-0000-0000-0000-000000000001','college','كلية',false),
('62000000-0000-0000-0000-000000000021','62000000-0000-0000-0000-000000000001','council','مجلس',true),
('62000000-0000-0000-0000-000000000022','62000000-0000-0000-0000-000000000002','college','كلية',false);
insert into qarar_core.governance_units(id,organization_id,unit_type_id,code,name_ar,status) values ('62000000-0000-0000-0000-000000000030','62000000-0000-0000-0000-000000000002','62000000-0000-0000-0000-000000000022','outside','وحدة خارجية','active');
insert into qarar_meetings.meeting_types(id,organization_id,code,name_ar) values ('62000000-0000-0000-0000-000000000040','62000000-0000-0000-0000-000000000001','regular','دوري');
select set_config('request.jwt.claim.sub','62000000-0000-0000-0000-000000000010',true);
select set_config('request.jwt.claim.role','authenticated',true);
create temporary table unit_created as select api_v2.admin_create_organizational_unit_v2('كلية العلوم','62000000-0000-0000-0000-000000000020',null,'62000000-0000-0000-0000-000000000050') payload;
create temporary table council_created as select api_v2.admin_create_council_v2('مجلس العلوم',null,null,'62000000-0000-0000-0000-000000000021',(select (payload->>'id')::uuid from unit_created),null,null,3,false,
jsonb_build_object('meeting_type_id','62000000-0000-0000-0000-000000000040','recurrence','monthly','first_meeting_date','2026-11-01'),'62000000-0000-0000-0000-000000000051') payload;
select ok((select start_time is null and end_time is null from qarar_meetings.council_meeting_plans_v2 where governance_unit_id=(select (payload->>'id')::uuid from council_created)),'plan creation requires no fabricated clock times');
select lives_ok($$select api_v2.admin_update_organizational_unit_v2((select (payload->>'id')::uuid from unit_created),'كلية الحاسوب','62000000-0000-0000-0000-000000000020',null,'inactive',(select updated_at from qarar_core.governance_units where id=(select (payload->>'id')::uuid from unit_created)))$$,'deactivation preserves an existing council scope');
select is((select reference_number from qarar_core.governance_units where id=(select (payload->>'id')::uuid from unit_created)),(select payload->>'reference_number' from unit_created),'renaming and deactivation preserve the original reference');
select throws_ok($$select api_v2.admin_create_council_v2('مجلس غير صالح',null,null,'62000000-0000-0000-0000-000000000021',(select (payload->>'id')::uuid from unit_created),null,null,3,false,null,'62000000-0000-0000-0000-000000000059')$$,'23514',null,'inactive unit cannot become a new council scope');
select is(jsonb_array_length(api_v1.get_council_form_options()->'scope_units'),0,'inactive unit excluded from new council choices');
select throws_ok($$select api_v2.admin_create_organizational_unit_v2('قسم جديد','62000000-0000-0000-0000-000000000020',(select (payload->>'id')::uuid from unit_created),'62000000-0000-0000-0000-000000000052')$$,'23514',null,'inactive parents refused at database boundary');
select throws_ok($$select api_v2.admin_update_organizational_unit_v2((select (payload->>'id')::uuid from unit_created),'كلية الحاسوب','62000000-0000-0000-0000-000000000020',null,'active','2000-01-01')$$,'40001',null,'stale update rejected');
select lives_ok($$select api_v2.admin_update_organizational_unit_v2((select (payload->>'id')::uuid from unit_created),'كلية الحاسوب','62000000-0000-0000-0000-000000000020',null,'active',(select updated_at from qarar_core.governance_units where id=(select (payload->>'id')::uuid from unit_created)))$$,'reactivation succeeds');
create temporary table child_created as select api_v2.admin_create_organizational_unit_v2('قسم الذكاء','62000000-0000-0000-0000-000000000020',(select (payload->>'id')::uuid from unit_created),'62000000-0000-0000-0000-000000000053') payload;
select throws_ok($$select api_v2.admin_update_organizational_unit_v2((select (payload->>'id')::uuid from unit_created),'كلية الحاسوب','62000000-0000-0000-0000-000000000020',(select (payload->>'id')::uuid from child_created),'active',(select updated_at from qarar_core.governance_units where id=(select (payload->>'id')::uuid from unit_created)))$$,'23514',null,'descendant cannot become parent');
select throws_ok($$select api_v2.admin_update_organizational_unit_v2((select (payload->>'id')::uuid from unit_created),'كلية الحاسوب','62000000-0000-0000-0000-000000000020',null,'archived',(select updated_at from qarar_core.governance_units where id=(select (payload->>'id')::uuid from unit_created)))$$,'23514',null,'active children must be handled before logical deletion');
select lives_ok($$select api_v2.admin_update_organizational_unit_v2((select (payload->>'id')::uuid from child_created),'قسم الذكاء','62000000-0000-0000-0000-000000000020',(select (payload->>'id')::uuid from unit_created),'archived',(select updated_at from qarar_core.governance_units where id=(select (payload->>'id')::uuid from child_created)))$$,'logical deletion succeeds');
select is((api_v2.admin_list_organizational_units_v2(null,20,0)->>'total')::integer,1,'logically deleted unit hidden from normal list');
select throws_ok($$select api_v2.admin_update_organizational_unit_v2('62000000-0000-0000-0000-000000000030','اسم مختلف','62000000-0000-0000-0000-000000000022',null,'active',now())$$,'P0002',null,'cannot edit a foreign tenant unit');
select throws_ok($$select api_v2.admin_update_organizational_unit_v2((select (payload->>'id')::uuid from unit_created),'كلية الحاسوب','62000000-0000-0000-0000-000000000022',null,'active',(select updated_at from qarar_core.governance_units where id=(select (payload->>'id')::uuid from unit_created)))$$,'22023',null,'foreign tenant unit type rejected');
select throws_ok($$select api_v2.admin_update_organizational_unit_v2((select (payload->>'id')::uuid from unit_created),'كلية الحاسوب','62000000-0000-0000-0000-000000000020','62000000-0000-0000-0000-000000000030','active',(select updated_at from qarar_core.governance_units where id=(select (payload->>'id')::uuid from unit_created)))$$,'23514',null,'foreign parent rejected');
select is((select count(*)::integer from qarar_core.governance_unit_status_history where governance_unit_id=(select (payload->>'id')::uuid from child_created)),2,'history survives logical deletion');
select throws_ok($$delete from qarar_core.governance_units where id=(select (payload->>'id')::uuid from child_created)$$,'23503',null,'physical deletion remains forbidden');
update qarar_core.governance_units set status='active',activated_at=now() where id=(select (payload->>'id')::uuid from council_created);
create temporary table meeting_created as select api_v1.create_meeting((select (payload->>'id')::uuid from council_created),'62000000-0000-0000-0000-000000000040','اجتماع بلا أوقات',current_date,null,null,'onsite',null,null,'62000000-0000-0000-0000-000000000060') payload;
select ok((select start_time is null and end_time is null from qarar_meetings.meetings where id=(select (payload->>'id')::uuid from meeting_created)),'meeting created without planned times');
update qarar_meetings.meetings set status='scheduled' where id=(select (payload->>'id')::uuid from meeting_created);
select throws_ok($$select api_v2.send_meeting_invitations_v2((select (payload->>'id')::uuid from meeting_created),'11:00','09:00',(select updated_at from qarar_meetings.meetings where id=(select (payload->>'id')::uuid from meeting_created)))$$,'22023',null,'invalid invitation time range rejected');
select throws_ok($$select api_v2.send_meeting_invitations_v2((select (payload->>'id')::uuid from meeting_created),'09:00','11:00',(select updated_at from qarar_meetings.meetings where id=(select (payload->>'id')::uuid from meeting_created)))$$,'23514',null,'missing agenda rejects invitations');
select ok((select start_time is null and end_time is null from qarar_meetings.meetings where id=(select (payload->>'id')::uuid from meeting_created)),'failed invitation preparation rolls back timing');
insert into qarar_topics.topics(id,organization_id,topic_no,title_ar,current_unit_id,submitted_by_user_id,status) values
('62000000-0000-0000-0000-000000000070','62000000-0000-0000-0000-000000000001','TOP-CI-INVITATION','موضوع دعوات',(select (payload->>'id')::uuid from council_created),'62000000-0000-0000-0000-000000000010','new');
insert into qarar_meetings.agenda_items(organization_id,meeting_id,topic_id,agenda_order,is_exception,exception_reason)
values ('62000000-0000-0000-0000-000000000001',(select (payload->>'id')::uuid from meeting_created),'62000000-0000-0000-0000-000000000070',1,true,'استثناء موثق لاختبار الدعوات فقط');
select throws_ok($$select api_v1.send_meeting_invitations((select (payload->>'id')::uuid from meeting_created),(select updated_at from qarar_meetings.meetings where id=(select (payload->>'id')::uuid from meeting_created)))$$,'22023',null,'V1 invitation caller cannot bypass required timing');
insert into qarar_iam.roles(organization_id,code,name_ar,role_scope) values ('62000000-0000-0000-0000-000000000001','council_member','عضو','governance_unit');
insert into qarar_iam.memberships(organization_id,user_id,governance_unit_id,role_id,start_date,membership_status)
select '62000000-0000-0000-0000-000000000001','62000000-0000-0000-0000-000000000011',(select (payload->>'id')::uuid from council_created),id,current_date,'active' from qarar_iam.roles where organization_id='62000000-0000-0000-0000-000000000001' and code='council_member';
select is((api_v2.send_meeting_invitations_v2((select (payload->>'id')::uuid from meeting_created),'09:00','11:00',(select updated_at from qarar_meetings.meetings where id=(select (payload->>'id')::uuid from meeting_created)))->>'queued')::integer,1,'timing and invitation queued atomically for actual member');
select is((select payload->>'end_time' from qarar_governance.notification_outbox where aggregate_id=(select (payload->>'id')::uuid from meeting_created)),'11:00:00','invitation contains the selected end time');
select is((api_v2.send_meeting_invitations_v2((select (payload->>'id')::uuid from meeting_created),'09:00','11:00',(select updated_at from qarar_meetings.meetings where id=(select (payload->>'id')::uuid from meeting_created)))->>'queued')::integer,0,'retry does not duplicate invitations');
select throws_ok($$select api_v2.send_meeting_invitations_v2((select (payload->>'id')::uuid from meeting_created),'10:00','12:00',(select updated_at from qarar_meetings.meetings where id=(select (payload->>'id')::uuid from meeting_created)))$$,'23514',null,'already queued invitation timing cannot silently change');
select set_config('request.jwt.claim.sub','62000000-0000-0000-0000-000000000011',true);
select throws_ok($$select api_v2.admin_update_organizational_unit_v2((select (payload->>'id')::uuid from unit_created),'كلية أخرى','62000000-0000-0000-0000-000000000020',null,'active',now())$$,'42501',null,'unauthorized actor cannot edit units');
select throws_ok($$select api_v2.send_meeting_invitations_v2((select (payload->>'id')::uuid from meeting_created),'09:00','11:00',now())$$,'42501',null,'ordinary member cannot prepare invitations');
select ok(not has_function_privilege('authenticated','qarar_core.admin_update_organizational_unit_v2(uuid,text,uuid,uuid,text,timestamptz)','execute'),'private unit command inaccessible');
select * from finish();
rollback;
