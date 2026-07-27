begin;
create extension if not exists pgtap;
select plan(14);

insert into qarar_core.organizations(id,code,name_ar)
values('52000000-0000-0000-0000-000000000001','matcher-a','Matcher Tenant');
insert into auth.users(id,email)
values('52000000-0000-0000-0000-000000000011','matcher-admin@test.local');
insert into qarar_iam.users(id,organization_id,email,full_name_ar,is_system_admin)
values(
 '52000000-0000-0000-0000-000000000011',
 '52000000-0000-0000-0000-000000000001',
 'matcher-admin@test.local','Matcher Admin',true
);
insert into qarar_core.governance_unit_types(id,organization_id,code,name_ar)
values(
 '52000000-0000-0000-0000-000000000021',
 '52000000-0000-0000-0000-000000000001','council','Council'
);
insert into qarar_governance.governance_unit_classes(
 id,organization_id,code,name_ar,governance_level
) values
('52000000-0000-0000-0000-000000000031','52000000-0000-0000-0000-000000000001',
 'university_council','University Council','university'),
('52000000-0000-0000-0000-000000000032','52000000-0000-0000-0000-000000000001',
 'department_council','Department Council','department');
insert into qarar_core.governance_units(
 id,organization_id,unit_type_id,governance_class_id,parent_unit_id,code,name_ar
) values
('52000000-0000-0000-0000-000000000041','52000000-0000-0000-0000-000000000001',
 '52000000-0000-0000-0000-000000000021','52000000-0000-0000-0000-000000000031',
 null,'university','University Council'),
('52000000-0000-0000-0000-000000000042','52000000-0000-0000-0000-000000000001',
 '52000000-0000-0000-0000-000000000021','52000000-0000-0000-0000-000000000032',
 '52000000-0000-0000-0000-000000000041','department','Department Council');
insert into qarar_topics.topic_categories(id,organization_id,code,name_ar)
values(
 '52000000-0000-0000-0000-000000000051',
 '52000000-0000-0000-0000-000000000001','academic','Academic'
);
insert into qarar_governance.workflow_templates(
 id,organization_id,code,name_ar,created_by_user_id
) values(
 '52000000-0000-0000-0000-000000000061','52000000-0000-0000-0000-000000000001',
 'academic_route','Academic Route','52000000-0000-0000-0000-000000000011'
);
insert into qarar_governance.workflow_template_versions(
 id,organization_id,workflow_template_id,version_no,created_by_user_id
) values(
 '52000000-0000-0000-0000-000000000062','52000000-0000-0000-0000-000000000001',
 '52000000-0000-0000-0000-000000000061',1,'52000000-0000-0000-0000-000000000011'
);
insert into qarar_governance.workflow_template_steps(
 id,organization_id,workflow_template_version_id,step_code,name_ar,sequence_no,
 step_type,responsibility,governance_class_id,is_initial,is_terminal,allowed_outcomes
) values
('52000000-0000-0000-0000-000000000071','52000000-0000-0000-0000-000000000001',
 '52000000-0000-0000-0000-000000000062','department_review','Department Review',1,
 'review','review','52000000-0000-0000-0000-000000000032',true,false,array['approved']),
('52000000-0000-0000-0000-000000000072','52000000-0000-0000-0000-000000000001',
 '52000000-0000-0000-0000-000000000062','university_approval','University Approval',2,
 'approval','final_approve','52000000-0000-0000-0000-000000000031',false,true,array['completed']);
insert into qarar_governance.workflow_template_transitions(
 organization_id,workflow_template_version_id,from_step_id,to_step_id,outcome_code
) values(
 '52000000-0000-0000-0000-000000000001','52000000-0000-0000-0000-000000000062',
 '52000000-0000-0000-0000-000000000071','52000000-0000-0000-0000-000000000072','approved'
);
select is(
 (qarar_governance.validate_workflow_template_version(
  '52000000-0000-0000-0000-000000000062')->>'valid')::boolean,true,
 'workflow graph validates before activation'
);
update qarar_governance.workflow_template_versions set
 status='active',activated_by_user_id='52000000-0000-0000-0000-000000000011',activated_at=now()
where id='52000000-0000-0000-0000-000000000062';
insert into qarar_governance.policies(
 id,organization_id,code,name_ar,created_by_user_id
) values(
 '52000000-0000-0000-0000-000000000081','52000000-0000-0000-0000-000000000001',
 'academic-policy','Academic Policy','52000000-0000-0000-0000-000000000011'
);
insert into qarar_governance.policy_versions(
 id,organization_id,policy_id,version_no,legal_status,automation_status,effective_from,
 readiness_percent,approved_by_user_id,activated_by_user_id,activated_at,created_by_user_id
) values(
 '52000000-0000-0000-0000-000000000082','52000000-0000-0000-0000-000000000001',
 '52000000-0000-0000-0000-000000000081',1,'draft','ready',current_date,100,
 '52000000-0000-0000-0000-000000000011','52000000-0000-0000-0000-000000000011',now(),
 '52000000-0000-0000-0000-000000000011'
);
insert into qarar_governance.policy_items(
 id,organization_id,policy_version_id,item_code,title_ar,sort_order,topic_category_id,
 workflow_template_version_id
) values(
 '52000000-0000-0000-0000-000000000083','52000000-0000-0000-0000-000000000001',
 '52000000-0000-0000-0000-000000000082','1','Academic Item',1,
 '52000000-0000-0000-0000-000000000051','52000000-0000-0000-0000-000000000062'
);
insert into qarar_governance.policy_scope_assignments(
 id,organization_id,policy_version_id,scope_type,governance_class_id,priority,created_by_user_id
) values(
 '52000000-0000-0000-0000-000000000084','52000000-0000-0000-0000-000000000001',
 '52000000-0000-0000-0000-000000000082','governance_class',
 '52000000-0000-0000-0000-000000000032',10,'52000000-0000-0000-0000-000000000011'
);
insert into qarar_topics.topics(
 id,organization_id,topic_no,title_ar,description,category_id,current_unit_id,
 submitted_by_user_id,source_type,priority,status
) values(
 '52000000-0000-0000-0000-000000000091','52000000-0000-0000-0000-000000000001',
 'TOP-MATCH-1','Academic topic','Academic topic description',
 '52000000-0000-0000-0000-000000000051','52000000-0000-0000-0000-000000000042',
 '52000000-0000-0000-0000-000000000011','new','medium','new'
);

update qarar_governance.policy_versions
set legal_status='effective'
where id='52000000-0000-0000-0000-000000000082';

select set_config('request.jwt.claim.sub','52000000-0000-0000-0000-000000000011',true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role qarar_governance_executor;

select is(
 (qarar_governance.resolve_topic_governance(
   '52000000-0000-0000-0000-000000000042','52000000-0000-0000-0000-000000000051',
   current_date,'52000000-0000-0000-0000-000000000091')->>'outcome'),
 'resolved',
 'matcher resolves one effective and technically ready policy'
);
select is(
 (select candidate_count from qarar_governance.regulation_match_decisions
  where topic_id='52000000-0000-0000-0000-000000000091' order by created_at desc limit 1),
 1,
 'decision stores candidate count'
);
select ok(
 (select jsonb_array_length(candidates)=1 from qarar_governance.regulation_match_decisions
  where topic_id='52000000-0000-0000-0000-000000000091' order by created_at desc limit 1),
 'decision stores explainable candidates'
);
select lives_ok(
 $$select qarar_governance.instantiate_topic_workflow(
  '52000000-0000-0000-0000-000000000091',
  (select id from qarar_governance.regulation_match_decisions
   where topic_id='52000000-0000-0000-0000-000000000091' order by created_at desc limit 1)
 )$$,
 'resolved decision instantiates workflow atomically'
);
select is(
 (select routing_status from qarar_topics.topics where id='52000000-0000-0000-0000-000000000091'),
 'routing_ready',
 'topic becomes ready only after workflow snapshot'
);
select is(
 (select count(*)::integer from qarar_governance.workflow_instance_steps s
  join qarar_governance.workflow_instances i on i.id=s.workflow_instance_id
  where i.topic_id='52000000-0000-0000-0000-000000000091'),
 2,
 'all template steps are snapshotted'
);
select is(
 (select assigned_unit_id from qarar_governance.workflow_instance_steps s
  join qarar_governance.workflow_instances i on i.id=s.workflow_instance_id
  where i.topic_id='52000000-0000-0000-0000-000000000091' and s.sequence_no=1),
 '52000000-0000-0000-0000-000000000042'::uuid,
 'department-class step resolves to department council'
);
select is(
 (select assigned_unit_id from qarar_governance.workflow_instance_steps s
  join qarar_governance.workflow_instances i on i.id=s.workflow_instance_id
  where i.topic_id='52000000-0000-0000-0000-000000000091' and s.sequence_no=2),
 '52000000-0000-0000-0000-000000000041'::uuid,
 'university-class step resolves to ancestor university council'
);
select is(
 (select s.status from qarar_governance.workflow_instance_steps s
  join qarar_governance.workflow_instances i on i.id=s.workflow_instance_id
  where i.topic_id='52000000-0000-0000-0000-000000000091' and s.sequence_no=1),
 'active',
 'initial council step is active'
);
select is(
 (select s.status from qarar_governance.workflow_instance_steps s
  join qarar_governance.workflow_instances i on i.id=s.workflow_instance_id
  where i.topic_id='52000000-0000-0000-0000-000000000091' and s.sequence_no=2),
 'pending',
 'later council step remains pending'
);
select is(
 (select count(*)::integer from qarar_governance.notification_outbox
  where aggregate_id='52000000-0000-0000-0000-000000000091'),
 1,
 'workflow start writes transactional outbox event'
);
select is(
 (select count(*)::integer from qarar_governance.governance_compliance_events
  where topic_id='52000000-0000-0000-0000-000000000091'),
 1,
 'workflow start writes compliance trace'
);
select ok(
 (select snapshot ? 'decision' from qarar_governance.topic_governance_mappings
  where topic_id='52000000-0000-0000-0000-000000000091'),
 'mapping keeps immutable decision snapshot'
);

reset role;
select * from finish();
rollback;
