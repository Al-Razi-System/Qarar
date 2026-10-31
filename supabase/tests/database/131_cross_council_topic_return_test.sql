begin;
create extension if not exists pgtap;
select plan(53);

insert into public.organizations(id,code,name_ar) values
('d4000000-0000-0000-0000-000000000001','s131','Cross council return');
insert into auth.users(id,email) values
('d4000000-0000-0000-0000-000000000011','first-chair@s131.test'),
('d4000000-0000-0000-0000-000000000012','second-chair@s131.test'),
('d4000000-0000-0000-0000-000000000013','rapporteur@s131.test');
insert into public.users(id,organization_id,email,full_name_ar) values
('d4000000-0000-0000-0000-000000000011','d4000000-0000-0000-0000-000000000001','first-chair@s131.test','رئيس المجلس الأول'),
('d4000000-0000-0000-0000-000000000012','d4000000-0000-0000-0000-000000000001','second-chair@s131.test','رئيس المجلس الثاني'),
('d4000000-0000-0000-0000-000000000013','d4000000-0000-0000-0000-000000000001','rapporteur@s131.test','مقرر المجلس الثاني');
insert into public.governance_unit_types(id,organization_id,code,name_ar) values
('d4000000-0000-0000-0000-000000000021','d4000000-0000-0000-0000-000000000001','council','مجلس');
insert into public.governance_units(id,organization_id,unit_type_id,code,name_ar) values
('d4000000-0000-0000-0000-000000000022','d4000000-0000-0000-0000-000000000001','d4000000-0000-0000-0000-000000000021','first','المجلس الأول'),
('d4000000-0000-0000-0000-000000000023','d4000000-0000-0000-0000-000000000001','d4000000-0000-0000-0000-000000000021','second','المجلس الثاني');
delete from public.roles where organization_id='d4000000-0000-0000-0000-000000000001' and code in ('council_chair','council_rapporteur');
insert into public.roles(id,organization_id,code,name_ar,role_scope) values
('d4000000-0000-0000-0000-000000000031','d4000000-0000-0000-0000-000000000001','council_chair','رئيس مجلس','governance_unit'),
('d4000000-0000-0000-0000-000000000032','d4000000-0000-0000-0000-000000000001','council_rapporteur','مقرر مجلس','governance_unit');
insert into public.permissions(organization_id,code,module,action,context_scope,name_ar)
values
('d4000000-0000-0000-0000-000000000001','agenda.manage','agenda','manage','governance_unit','إدارة جدول الأعمال'),
('d4000000-0000-0000-0000-000000000001','topics.refer','topics','refer','governance_unit','إدارة إحالات الموضوع')
on conflict do nothing;
insert into public.role_permissions(organization_id,role_id,permission_id)
select 'd4000000-0000-0000-0000-000000000001',r.id,p.id from public.roles r cross join public.permissions p
where r.organization_id='d4000000-0000-0000-0000-000000000001' and r.code in ('council_chair','council_rapporteur')
  and p.organization_id=r.organization_id and p.code in ('agenda.manage','topics.refer');
insert into public.memberships(id,organization_id,user_id,governance_unit_id,role_id) values
('d4000000-0000-0000-0000-000000000041','d4000000-0000-0000-0000-000000000001','d4000000-0000-0000-0000-000000000011','d4000000-0000-0000-0000-000000000022','d4000000-0000-0000-0000-000000000031'),
('d4000000-0000-0000-0000-000000000042','d4000000-0000-0000-0000-000000000001','d4000000-0000-0000-0000-000000000012','d4000000-0000-0000-0000-000000000023','d4000000-0000-0000-0000-000000000031'),
('d4000000-0000-0000-0000-000000000043','d4000000-0000-0000-0000-000000000001','d4000000-0000-0000-0000-000000000013','d4000000-0000-0000-0000-000000000023','d4000000-0000-0000-0000-000000000032');

set local session_replication_role=replica;
insert into public.topics(id,organization_id,topic_no,title_ar,current_unit_id,submitted_by_user_id,status) values
('d4000000-0000-0000-0000-000000000051','d4000000-0000-0000-0000-000000000001','TOP-S131','موضوع عابر للمجالس','d4000000-0000-0000-0000-000000000023','d4000000-0000-0000-0000-000000000011','approved');
insert into qarar_governance.workflow_templates(id,organization_id,code,name_ar,created_by_user_id) values
('d4000000-0000-0000-0000-000000000061','d4000000-0000-0000-0000-000000000001','s131','مسار مجلسين','d4000000-0000-0000-0000-000000000011');
insert into qarar_governance.workflow_template_versions(id,organization_id,workflow_template_id,version_no,status,validation_status,created_by_user_id,activated_by_user_id,activated_at) values
('d4000000-0000-0000-0000-000000000062','d4000000-0000-0000-0000-000000000001','d4000000-0000-0000-0000-000000000061',1,'active','valid','d4000000-0000-0000-0000-000000000011','d4000000-0000-0000-0000-000000000011',now());
insert into qarar_governance.workflow_template_steps(id,organization_id,workflow_template_version_id,step_code,name_ar,sequence_no,step_type,responsibility,governance_unit_id,is_initial,is_terminal,allowed_outcomes) values
('d4000000-0000-0000-0000-000000000063','d4000000-0000-0000-0000-000000000001','d4000000-0000-0000-0000-000000000062','first','مناقشة المجلس الأول',1,'discussion','discuss','d4000000-0000-0000-0000-000000000022',true,false,array['approved','rejected']),
('d4000000-0000-0000-0000-000000000064','d4000000-0000-0000-0000-000000000001','d4000000-0000-0000-0000-000000000062','second','اعتماد المجلس الثاني',2,'approval','final_approve','d4000000-0000-0000-0000-000000000023',false,true,array['approved','rejected']);
insert into qarar_governance.topic_governance_mappings(id,organization_id,topic_id,governance_source,routing_status,routing_decision_id,workflow_template_version_id,snapshot,mapped_by_user_id) values
('d4000000-0000-0000-0000-000000000065','d4000000-0000-0000-0000-000000000001','d4000000-0000-0000-0000-000000000051','regulated','routing_ready',gen_random_uuid(),'d4000000-0000-0000-0000-000000000062','{}','d4000000-0000-0000-0000-000000000011');
insert into qarar_governance.workflow_instances(id,organization_id,topic_id,topic_governance_mapping_id,workflow_template_version_id,status,current_step_id,started_by_user_id,snapshot) values
('d4000000-0000-0000-0000-000000000066','d4000000-0000-0000-0000-000000000001','d4000000-0000-0000-0000-000000000051','d4000000-0000-0000-0000-000000000065','d4000000-0000-0000-0000-000000000062','active','d4000000-0000-0000-0000-000000000068','d4000000-0000-0000-0000-000000000011','{}');
insert into qarar_governance.workflow_instance_steps(id,organization_id,workflow_instance_id,template_step_id,sequence_no,status,assigned_unit_id,opened_at,acted_by_user_id,acted_at,outcome_code,comment,snapshot,action_version) values
('d4000000-0000-0000-0000-000000000067','d4000000-0000-0000-0000-000000000001','d4000000-0000-0000-0000-000000000066','d4000000-0000-0000-0000-000000000063',1,'completed','d4000000-0000-0000-0000-000000000022',now()-interval '2 days','d4000000-0000-0000-0000-000000000011',now()-interval '1 day','approved','اعتمد المجلس الأول','{}',1),
('d4000000-0000-0000-0000-000000000068','d4000000-0000-0000-0000-000000000001','d4000000-0000-0000-0000-000000000066','d4000000-0000-0000-0000-000000000064',2,'active','d4000000-0000-0000-0000-000000000023',now(),null,null,null,null,'{}',0);
update qarar_topics.topics set governance_source='regulated',routing_status='routing_ready',workflow_template_version_id='d4000000-0000-0000-0000-000000000062',workflow_instance_id='d4000000-0000-0000-0000-000000000066',current_workflow_step_id='d4000000-0000-0000-0000-000000000068' where id='d4000000-0000-0000-0000-000000000051';
set local session_replication_role=origin;
insert into public.meetings(id,organization_id,meeting_no,governance_unit_id,title_ar,scheduled_date,created_by_user_id,status) values
('d4000000-0000-0000-0000-000000000071','d4000000-0000-0000-0000-000000000001','MTG-S131','d4000000-0000-0000-0000-000000000023','اجتماع المجلس الثاني',current_date,'d4000000-0000-0000-0000-000000000012','draft');

select has_table('qarar_governance','workflow_step_cycles','step-cycle history exists');
select has_function('api_v1','return_topic_to_previous_council',array['uuid','text','uuid','integer'],'return contract exists');
select function_returns('api_v1','return_topic_to_previous_council',array['uuid','text','uuid','integer'],'jsonb','return contract is stable');
select has_function('api_v1','get_topic_return_option',array['uuid','uuid'],'contextual option contract exists');

-- Accepting a consultation does not desynchronise a governed topic from its
-- active council. Legacy direct referrals remain covered by tests 11 and 103.
set local session_replication_role=replica;
insert into qarar_topics.topic_referrals(
  id,organization_id,topic_id,from_unit_id,to_unit_id,referred_by_user_id,referral_reason,status
) values (
  'd4000000-0000-0000-0000-000000000075','d4000000-0000-0000-0000-000000000001',
  'd4000000-0000-0000-0000-000000000051','d4000000-0000-0000-0000-000000000023',
  'd4000000-0000-0000-0000-000000000022','d4000000-0000-0000-0000-000000000012',
  'استشارة المجلس السابق دون نقل ملكية المسار','pending'
);
set local session_replication_role=origin;
select set_config('request.jwt.claims','{"sub":"d4000000-0000-0000-0000-000000000011","role":"authenticated"}',true);
set local role authenticated;
select is(api_v1.respond_topic_referral('d4000000-0000-0000-0000-000000000075','accept',null)->>'route_effect','temporary_consultation','governed referral is explicitly a temporary consultation');
reset role;
select is((select current_unit_id from qarar_topics.topics where id='d4000000-0000-0000-0000-000000000051'),'d4000000-0000-0000-0000-000000000023'::uuid,'accepting consultation keeps topic at its active council');
select is((select current_workflow_step_id from qarar_topics.topics where id='d4000000-0000-0000-0000-000000000051'),'d4000000-0000-0000-0000-000000000068'::uuid,'accepting consultation keeps the active workflow step');
select is((select metadata->>'route_effect' from qarar_audit.audit_logs where entity_id='d4000000-0000-0000-0000-000000000075' and action='topics.referral.accept'),'temporary_consultation','audit explains that the consultation did not transfer route ownership');

select set_config('request.jwt.claims','{"sub":"d4000000-0000-0000-0000-000000000013","role":"authenticated"}',true);
set local role authenticated;
select is((api_v1.get_topic_return_option('d4000000-0000-0000-0000-000000000051','d4000000-0000-0000-0000-000000000071')->>'available')::boolean,false,'rapporteur sees no enabled return action');
select throws_ok($$select api_v1.return_topic_to_previous_council('d4000000-0000-0000-0000-000000000051','تحتاج المعاملة إلى استكمال الوثائق',gen_random_uuid(),0)$$,'42501',null,'rapporteur cannot return the topic');
select set_config('request.jwt.claims','{"sub":"d4000000-0000-0000-0000-000000000012","role":"authenticated"}',true);
select is((api_v1.get_topic_return_option('d4000000-0000-0000-0000-000000000051','d4000000-0000-0000-0000-000000000071')->>'available')::boolean,true,'contextual chair can return an unlisted proposal');
select is(api_v1.get_topic_return_option('d4000000-0000-0000-0000-000000000051','d4000000-0000-0000-0000-000000000071')->>'previous_unit_name_ar','المجلس الأول','the UI receives the exact return destination');
select throws_ok($$select api_v1.return_topic_to_previous_council('d4000000-0000-0000-0000-000000000051','قصير',gen_random_uuid(),0)$$,'22023',null,'reason shorter than ten characters is rejected');
select throws_ok($$select api_v1.return_topic_to_previous_council('d4000000-0000-0000-0000-000000000051','تحتاج المعاملة إلى استكمال الوثائق',gen_random_uuid(),9)$$,'40001',null,'stale version is rejected');
create temporary table s131_result(value jsonb);
insert into s131_result select api_v1.return_topic_to_previous_council('d4000000-0000-0000-0000-000000000051','تحتاج المعاملة إلى استكمال الوثائق', 'd4000000-0000-0000-0000-000000000099',0);
reset role;
select is((select value->>'returned_to_unit_id' from s131_result),'d4000000-0000-0000-0000-000000000022','return targets the previous council');
select is((select current_unit_id from qarar_topics.topics where id='d4000000-0000-0000-0000-000000000051'),'d4000000-0000-0000-0000-000000000022'::uuid,'topic current unit follows the reopened step');
select is((select current_workflow_step_id from qarar_topics.topics where id='d4000000-0000-0000-0000-000000000051'),'d4000000-0000-0000-0000-000000000067'::uuid,'topic points to the previous step');
select is((select status from qarar_governance.workflow_instance_steps where id='d4000000-0000-0000-0000-000000000067'),'active','previous operational step reopens');
select is((select status from qarar_governance.workflow_instance_steps where id='d4000000-0000-0000-0000-000000000068'),'returned','current operational step records the return');
select is((select count(*) from qarar_governance.workflow_step_cycles where workflow_instance_id='d4000000-0000-0000-0000-000000000066' and template_step_id='d4000000-0000-0000-0000-000000000063'),2::bigint,'a second immutable cycle opens for the prior council');
select is((select outcome_code from qarar_governance.workflow_step_cycles where workflow_instance_id='d4000000-0000-0000-0000-000000000066' and template_step_id='d4000000-0000-0000-0000-000000000063' and cycle_no=1),'approved','the prior approval is preserved');
select is((select reason from qarar_governance.workflow_step_cycles where workflow_instance_id='d4000000-0000-0000-0000-000000000066' and template_step_id='d4000000-0000-0000-0000-000000000064' and cycle_no=1),'تحتاج المعاملة إلى استكمال الوثائق','the written reason is preserved');
set local role authenticated;
select is((api_v1.return_topic_to_previous_council('d4000000-0000-0000-0000-000000000051','تحتاج المعاملة إلى استكمال الوثائق','d4000000-0000-0000-0000-000000000099',0)->>'idempotent_replay')::boolean,true,'retry is idempotent');
reset role;
select is((select count(*) from qarar_audit.audit_logs where entity_id='d4000000-0000-0000-0000-000000000051' and action='topic.returned_to_previous_council'),1::bigint,'one auditable return event is written');

select set_config('request.jwt.claims','{"sub":"d4000000-0000-0000-0000-000000000011","role":"authenticated"}',true);
set local role authenticated;
create temporary table s131_submitter_result(value jsonb);
insert into s131_submitter_result select api_v1.return_topic_to_previous_council(
  'd4000000-0000-0000-0000-000000000051','يلزم مقدم الموضوع باستكمال النواقص النظامية',
  'd4000000-0000-0000-0000-000000000098',2
);
reset role;
select is((select value->>'returned_to_submitter' from s131_submitter_result),'true','the first council returns the topic to its submitter');
select is((select status from qarar_topics.topics where id='d4000000-0000-0000-0000-000000000051'),'returned','topic becomes returned for submitter completion');
select is((select current_unit_id from qarar_topics.topics where id='d4000000-0000-0000-0000-000000000051'),null,'submitter return clears the current council');
select is((select status from qarar_governance.workflow_instances where id='d4000000-0000-0000-0000-000000000066'),'blocked','workflow waits while the submitter completes the topic');
select is((select status from qarar_governance.workflow_step_cycles where workflow_instance_id='d4000000-0000-0000-0000-000000000066' and template_step_id='d4000000-0000-0000-0000-000000000063' order by cycle_no desc limit 1),'returned','the reopened first-council cycle closes as returned');
select is((select count(*) from qarar_audit.audit_logs where entity_id='d4000000-0000-0000-0000-000000000051' and action='topic.returned_to_previous_council'),2::bigint,'each return has one audit event');

select has_function('api_v1','get_topic_resubmission_option',array['uuid'],'submitter resubmission option contract exists');
select has_function('api_v1','resubmit_returned_topic',array['uuid','uuid','integer'],'submitter resubmission mutation contract exists');
select set_config('request.jwt.claims','{"sub":"d4000000-0000-0000-0000-000000000012","role":"authenticated"}',true);
set local role authenticated;
select is((api_v1.get_topic_resubmission_option('d4000000-0000-0000-0000-000000000051')->>'available')::boolean,false,'a non-submitter never receives the resubmit action');
select throws_ok($$select api_v1.resubmit_returned_topic('d4000000-0000-0000-0000-000000000051',gen_random_uuid(),3)$$,'42501',null,'a non-submitter cannot resubmit');
select set_config('request.jwt.claims','{"sub":"d4000000-0000-0000-0000-000000000011","role":"authenticated"}',true);
select is((api_v1.get_topic_resubmission_option('d4000000-0000-0000-0000-000000000051')->>'available')::boolean,true,'the submitter receives the resubmit action after return');
select throws_ok($$select api_v1.resubmit_returned_topic('d4000000-0000-0000-0000-000000000051',gen_random_uuid(),99)$$,'40001',null,'resubmit rejects a stale workflow version');
select lives_ok($$select api_v1.resubmit_returned_topic('d4000000-0000-0000-0000-000000000051','d4000000-0000-0000-0000-000000000097',3)$$,'submitter can resubmit the completed topic');
reset role;
select is((select status||':'||routing_status from qarar_topics.topics where id='d4000000-0000-0000-0000-000000000051'),'approved:routing_ready','resubmitted topic returns to the council proposal queue');
select is((select status from qarar_governance.workflow_instances where id='d4000000-0000-0000-0000-000000000066'),'active','workflow reactivates after resubmission');
select is((select count(*) from qarar_audit.audit_logs where entity_id='d4000000-0000-0000-0000-000000000051' and action='topic.resubmitted_after_return'),1::bigint,'resubmission writes one audit event');

select has_function('api_v1','list_pending_rejected_vote_resolutions',array['uuid'],'pending rejected-vote read contract exists');
select has_function('api_v1','resolve_rejected_vote',array['uuid','text','text','uuid','integer'],'chair resolution mutation exists');
set local session_replication_role=replica;
insert into qarar_governance.workflow_template_transitions(
  organization_id,workflow_template_version_id,from_step_id,to_step_id,outcome_code,transition_type,conditions
) values (
  'd4000000-0000-0000-0000-000000000001','d4000000-0000-0000-0000-000000000062',
  'd4000000-0000-0000-0000-000000000063',null,'rejected','reject','{"chair_decides":true}'
);
insert into public.meetings(id,organization_id,meeting_no,governance_unit_id,title_ar,scheduled_date,created_by_user_id,status)
values ('d4000000-0000-0000-0000-000000000072','d4000000-0000-0000-0000-000000000001','MTG-S131-LIVE','d4000000-0000-0000-0000-000000000022','اجتماع المجلس الأول',current_date,'d4000000-0000-0000-0000-000000000011','in_progress');
insert into public.agenda_items(id,organization_id,meeting_id,topic_id,agenda_order,agenda_status)
values ('d4000000-0000-0000-0000-000000000073','d4000000-0000-0000-0000-000000000001','d4000000-0000-0000-0000-000000000072','d4000000-0000-0000-0000-000000000051',1,'discussed');
insert into qarar_voting.voting_rounds(id,organization_id,meeting_id,agenda_item_id,round_number,status,eligible_voter_count,opened_by_user_id,workflow_instance_step_id)
values ('d4000000-0000-0000-0000-000000000074','d4000000-0000-0000-0000-000000000001','d4000000-0000-0000-0000-000000000072','d4000000-0000-0000-0000-000000000073',1,'open',3,'d4000000-0000-0000-0000-000000000011','d4000000-0000-0000-0000-000000000067');
set local session_replication_role=origin;
select set_config('request.jwt.claims','{"sub":"d4000000-0000-0000-0000-000000000011","role":"authenticated"}',true);
update qarar_voting.voting_rounds set status='closed',result='rejected',approve_count=1,reject_count=2,abstain_count=0,closed_by_user_id='d4000000-0000-0000-0000-000000000011',closed_at=clock_timestamp() where id='d4000000-0000-0000-0000-000000000074';
select is((select status from qarar_governance.workflow_instance_steps where id='d4000000-0000-0000-0000-000000000067'),'active','chair-decides rejection keeps the workflow step active');
select is((select status from qarar_voting.rejected_vote_resolutions where voting_round_id='d4000000-0000-0000-0000-000000000074'),'pending','rejected vote opens one pending chair resolution');
select set_config('request.jwt.claims','{"sub":"d4000000-0000-0000-0000-000000000013","role":"authenticated"}',true);
set local role authenticated;
select is(jsonb_array_length(api_v1.list_pending_rejected_vote_resolutions('d4000000-0000-0000-0000-000000000072')->'items'),0,'members never receive the chair resolution action');
select throws_ok($$select api_v1.resolve_rejected_vote('d4000000-0000-0000-0000-000000000074','return_previous','يلزم استكمال البيانات النظامية',gen_random_uuid(),0)$$,'42501',null,'a non-chair cannot resolve the rejected vote');
select set_config('request.jwt.claims','{"sub":"d4000000-0000-0000-0000-000000000011","role":"authenticated"}',true);
select is(jsonb_array_length(api_v1.list_pending_rejected_vote_resolutions('d4000000-0000-0000-0000-000000000072')->'items'),1,'the contextual chair receives the resolution action');
select lives_ok($$select api_v1.resolve_rejected_vote('d4000000-0000-0000-0000-000000000074','return_previous','يلزم استكمال البيانات النظامية','d4000000-0000-0000-0000-000000000096',0)$$,'chair can return after the rejected vote');
reset role;
select is((select status from qarar_voting.rejected_vote_resolutions where voting_round_id='d4000000-0000-0000-0000-000000000074'),'resolved','the pending choice is resolved exactly once');
select is((select outcome_kind from qarar_decisions.decisions where agenda_item_id='d4000000-0000-0000-0000-000000000073'),'return','decision records the return outcome');
select ok((select decision_text like '%يلزم استكمال البيانات النظامية%' from qarar_decisions.decisions where agenda_item_id='d4000000-0000-0000-0000-000000000073'),'decision text preserves the written reason');
select is((select status from qarar_topics.topics where id='d4000000-0000-0000-0000-000000000051'),'returned','return from the first council sends the topic to its submitter');
select is((select count(*) from qarar_audit.audit_logs where entity_id='d4000000-0000-0000-0000-000000000074' and action='voting.rejection_resolved'),1::bigint,'resolution writes one audit event');

select * from finish();
rollback;
