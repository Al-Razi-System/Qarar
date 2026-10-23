begin;
create extension if not exists pgtap;
select plan(9);

insert into qarar_core.organizations(id,code,name_ar) values
('c3000000-0000-0000-0000-000000000001','s111','منظمة سجل الموضوع'),
('c3000000-0000-0000-0000-000000000002','s111f','منظمة أخرى');
insert into auth.users(id,email) values
('c3000000-0000-0000-0000-000000000011','admin@s111.test'),
('c3000000-0000-0000-0000-000000000012','denied@s111.test'),
('c3000000-0000-0000-0000-000000000013','foreign@s111.test');
insert into qarar_iam.users(id,organization_id,email,full_name_ar,is_system_admin) values
('c3000000-0000-0000-0000-000000000011','c3000000-0000-0000-0000-000000000001','admin@s111.test','مدير السجل',true),
('c3000000-0000-0000-0000-000000000012','c3000000-0000-0000-0000-000000000001','denied@s111.test','مستخدم غير مخول',false),
('c3000000-0000-0000-0000-000000000013','c3000000-0000-0000-0000-000000000002','foreign@s111.test','مستخدم مؤسسة أخرى',true);
insert into qarar_core.governance_unit_types(id,organization_id,code,name_ar,is_council_type) values
('c3000000-0000-0000-0000-000000000021','c3000000-0000-0000-0000-000000000001','council','مجلس',true);
insert into qarar_core.governance_units(id,organization_id,unit_type_id,code,name_ar,status) values
('c3000000-0000-0000-0000-000000000022','c3000000-0000-0000-0000-000000000001','c3000000-0000-0000-0000-000000000021','department','مجلس القسم','active'),
('c3000000-0000-0000-0000-000000000023','c3000000-0000-0000-0000-000000000001','c3000000-0000-0000-0000-000000000021','college','مجلس الكلية','active');
insert into qarar_topics.topics(id,organization_id,topic_no,title_ar,current_unit_id,submitted_by_user_id,status,created_at) values
('c3000000-0000-0000-0000-000000000071','c3000000-0000-0000-0000-000000000001','TOP-S111','موضوع المسار','c3000000-0000-0000-0000-000000000023','c3000000-0000-0000-0000-000000000011','new','2026-10-20 08:00+00'),
('c3000000-0000-0000-0000-000000000072','c3000000-0000-0000-0000-000000000001','TOP-S111-X','موضوع آخر','c3000000-0000-0000-0000-000000000023','c3000000-0000-0000-0000-000000000011','new','2026-10-20 08:00+00');
insert into qarar_topics.topic_status_history(id,organization_id,topic_id,to_status,changed_by_user_id,changed_at,change_reason) values
('c3000000-0000-0000-0000-000000000075','c3000000-0000-0000-0000-000000000001','c3000000-0000-0000-0000-000000000071','new','c3000000-0000-0000-0000-000000000011','2026-10-20 08:00+00','تقديم موضوع بتصنيف معتمد');
insert into qarar_meetings.meetings(id,organization_id,meeting_no,governance_unit_id,title_ar,scheduled_date,created_by_user_id,status) values
('c3000000-0000-0000-0000-000000000081','c3000000-0000-0000-0000-000000000001','MTG-S111','c3000000-0000-0000-0000-000000000022','اجتماع المجلس السابق','2026-10-20','c3000000-0000-0000-0000-000000000011','closed'),
('c3000000-0000-0000-0000-000000000082','c3000000-0000-0000-0000-000000000001','MTG-S111-X','c3000000-0000-0000-0000-000000000022','اجتماع لا يخص الموضوع','2026-10-20','c3000000-0000-0000-0000-000000000011','closed');
set local session_replication_role=replica;
insert into qarar_meetings.agenda_items(id,organization_id,meeting_id,topic_id,agenda_order,agenda_status) values
('c3000000-0000-0000-0000-000000000091','c3000000-0000-0000-0000-000000000001','c3000000-0000-0000-0000-000000000081','c3000000-0000-0000-0000-000000000071',1,'discussed'),
('c3000000-0000-0000-0000-000000000092','c3000000-0000-0000-0000-000000000001','c3000000-0000-0000-0000-000000000082','c3000000-0000-0000-0000-000000000072',1,'discussed');
set local session_replication_role=origin;
insert into qarar_minutes.meeting_minutes(id,organization_id,meeting_id,content_draft,content_final,status,created_by_user_id,approved_at) values
('c3000000-0000-0000-0000-000000000101','c3000000-0000-0000-0000-000000000001','c3000000-0000-0000-0000-000000000081','مسودة المحضر','النص الرسمي لمحضر المجلس السابق','approved','c3000000-0000-0000-0000-000000000011','2026-10-20 11:00+00'),
('c3000000-0000-0000-0000-000000000102','c3000000-0000-0000-0000-000000000001','c3000000-0000-0000-0000-000000000082','محضر سري آخر','محضر سري آخر','approved','c3000000-0000-0000-0000-000000000011','2026-10-20 11:00+00');
insert into qarar_audit.audit_logs(id,organization_id,actor_user_id,action,entity_type,entity_id,metadata,occurred_at) values
('c3000000-0000-0000-0000-000000000111','c3000000-0000-0000-0000-000000000001','c3000000-0000-0000-0000-000000000011','meetings.agenda.discussion.complete','agenda_items','c3000000-0000-0000-0000-000000000091','{"topic_id":"c3000000-0000-0000-0000-000000000071"}','2026-10-20 10:00+00'),
('c3000000-0000-0000-0000-000000000112','c3000000-0000-0000-0000-000000000001','c3000000-0000-0000-0000-000000000011','meetings.agenda.discussion.complete','agenda_items','c3000000-0000-0000-0000-000000000092','{"topic_id":"c3000000-0000-0000-0000-000000000072"}','2026-10-20 10:00+00'),
('c3000000-0000-0000-0000-000000000113','c3000000-0000-0000-0000-000000000001','c3000000-0000-0000-0000-000000000011','meetings.invitations.request','meetings','c3000000-0000-0000-0000-000000000081','{}','2026-10-20 09:00+00');

create function pg_temp.s111_meetings() returns jsonb language sql as $$select api_v1.get_topic_meeting_history('c3000000-0000-0000-0000-000000000071')$$;
create function pg_temp.s111_timeline() returns jsonb language sql as $$select api_v1.get_topic_activity_timeline('c3000000-0000-0000-0000-000000000071')$$;
select set_config('request.jwt.claims','{"sub":"c3000000-0000-0000-0000-000000000011","role":"authenticated"}',true);
set local role authenticated;
select is(jsonb_array_length(pg_temp.s111_meetings()),1,'only meetings containing the topic are returned');
select is(pg_temp.s111_meetings()#>>'{0,minutes,status}','approved','the previous council minute status is returned');
select is(pg_temp.s111_meetings()#>>'{0,minutes,content}','النص الرسمي لمحضر المجلس السابق','the final approved minute content is returned');
select ok(position('محضر سري آخر' in pg_temp.s111_meetings()::text)=0,'another meeting minute is not disclosed');
select is(jsonb_array_length(pg_temp.s111_timeline()),2,'status and related audit events form one persisted timeline');
select is(pg_temp.s111_timeline()#>>'{1,action}','meetings.agenda.discussion.complete','related agenda audit event is included chronologically');
select ok(position('000000000112' in pg_temp.s111_timeline()::text)=0,'unrelated topic audit event is excluded');
select set_config('request.jwt.claims','{"sub":"c3000000-0000-0000-0000-000000000012","role":"authenticated"}',true);
select throws_ok($$select pg_temp.s111_timeline()$$,'42501',null,'same organization user without contextual access is denied');
select set_config('request.jwt.claims','{"sub":"c3000000-0000-0000-0000-000000000013","role":"authenticated"}',true);
select throws_ok($$select pg_temp.s111_meetings()$$,'P0002',null,'foreign organization cannot discover the topic');
select * from finish();
rollback;
