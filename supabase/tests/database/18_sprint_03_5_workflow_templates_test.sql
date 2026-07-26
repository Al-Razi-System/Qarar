begin;
create extension if not exists pgtap;
select plan(13);

select is(
  (select count(*)::integer from qarar_architecture.entity_registry
   where module_code='governance'
     and entity_name = any(array[
       'governance_unit_classes','policies','policy_versions','policy_items',
       'policy_item_roles','policy_scope_assignments','policy_item_scope_overrides',
       'workflow_templates','workflow_template_versions',
       'workflow_template_steps','workflow_template_transitions'
     ])),
  11,
  'governance module owns foundation and workflow entities'
);
select is(
  (select count(*)::integer from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='qarar_governance'
     and c.relname = any(array[
       'workflow_templates','workflow_template_versions',
       'workflow_template_steps','workflow_template_transitions'
     ])
     and c.relrowsecurity),
  4,
  'all workflow entities enforce RLS'
);
select ok(
  not has_table_privilege('authenticated','qarar_governance.workflow_templates','select'),
  'clients cannot read workflow internals directly'
);

insert into qarar_core.organizations(id,code,name_ar)
values('51000000-0000-0000-0000-000000000001','workflow-a','Workflow Tenant');
insert into auth.users(id,email)
values('51000000-0000-0000-0000-000000000011','workflow-admin@test.local');
insert into qarar_iam.users(id,organization_id,email,full_name_ar,is_system_admin)
values(
 '51000000-0000-0000-0000-000000000011',
 '51000000-0000-0000-0000-000000000001',
 'workflow-admin@test.local','Workflow Admin',true
);
insert into qarar_governance.governance_unit_classes(
 id,organization_id,code,name_ar,governance_level
) values(
 '51000000-0000-0000-0000-000000000021',
 '51000000-0000-0000-0000-000000000001',
 'department_council','Department Council','department'
);
insert into qarar_governance.workflow_templates(
 id,organization_id,code,name_ar,created_by_user_id
) values(
 '51000000-0000-0000-0000-000000000031',
 '51000000-0000-0000-0000-000000000001',
 'department_approval','Department Approval',
 '51000000-0000-0000-0000-000000000011'
);
insert into qarar_governance.workflow_template_versions(
 id,organization_id,workflow_template_id,version_no,created_by_user_id
) values(
 '51000000-0000-0000-0000-000000000041',
 '51000000-0000-0000-0000-000000000001',
 '51000000-0000-0000-0000-000000000031',1,
 '51000000-0000-0000-0000-000000000011'
);
insert into qarar_governance.workflow_template_steps(
 id,organization_id,workflow_template_version_id,step_code,name_ar,sequence_no,
 step_type,responsibility,governance_class_id,is_initial,is_terminal,allowed_outcomes
) values
(
 '51000000-0000-0000-0000-000000000051',
 '51000000-0000-0000-0000-000000000001',
 '51000000-0000-0000-0000-000000000041',
 'department_review','Department Review',1,'review','review',
 '51000000-0000-0000-0000-000000000021',true,false,array['approved']
),(
 '51000000-0000-0000-0000-000000000052',
 '51000000-0000-0000-0000-000000000001',
 '51000000-0000-0000-0000-000000000041',
 'final_approval','Final Approval',2,'approval','final_approve',
 '51000000-0000-0000-0000-000000000021',false,true,array['completed']
);
insert into qarar_governance.workflow_template_transitions(
 organization_id,workflow_template_version_id,from_step_id,to_step_id,outcome_code
) values(
 '51000000-0000-0000-0000-000000000001',
 '51000000-0000-0000-0000-000000000041',
 '51000000-0000-0000-0000-000000000051',
 '51000000-0000-0000-0000-000000000052','approved'
);

select is(
 (qarar_governance.validate_workflow_template_version(
   '51000000-0000-0000-0000-000000000041'
 )->>'valid')::boolean,
 true,
 'complete sequential workflow validates'
);
select is(
 (select validation_status from qarar_governance.workflow_template_versions
  where id='51000000-0000-0000-0000-000000000041'),
 'valid',
 'validation result is persisted'
);
select throws_ok(
 $$update qarar_governance.workflow_template_versions
   set status='active' where id='51000000-0000-0000-0000-000000000041'$$,
 '23514',
 null,
 'activation requires actor and timestamp'
);
update qarar_governance.workflow_template_versions
set status='active',
    activated_by_user_id='51000000-0000-0000-0000-000000000011',
    activated_at=now()
where id='51000000-0000-0000-0000-000000000041';
select is(
 (select status from qarar_governance.workflow_template_versions
  where id='51000000-0000-0000-0000-000000000041'),
 'active',
 'validated workflow can be activated'
);
select throws_ok(
  $$update qarar_governance.workflow_template_steps set name_ar='Changed'
   where id='51000000-0000-0000-0000-000000000051'$$,
  '55000',
  null,
 'active workflow graph is immutable'
);
select lives_ok(
 $$update qarar_governance.workflow_template_versions
   set status='retired' where id='51000000-0000-0000-0000-000000000041'$$,
 'active workflow can be retired without mutating its graph'
);

insert into qarar_governance.workflow_template_versions(
 id,organization_id,workflow_template_id,version_no,created_by_user_id
) values(
 '51000000-0000-0000-0000-000000000042',
 '51000000-0000-0000-0000-000000000001',
 '51000000-0000-0000-0000-000000000031',2,
 '51000000-0000-0000-0000-000000000011'
);
insert into qarar_governance.workflow_template_steps(
 id,organization_id,workflow_template_version_id,step_code,name_ar,sequence_no,
 step_type,responsibility,governance_class_id,is_initial,is_terminal,allowed_outcomes
) values
(
 '51000000-0000-0000-0000-000000000061',
 '51000000-0000-0000-0000-000000000001',
 '51000000-0000-0000-0000-000000000042',
 'first','First',1,'review','review',
 '51000000-0000-0000-0000-000000000021',true,false,array['approved']
),(
 '51000000-0000-0000-0000-000000000062',
 '51000000-0000-0000-0000-000000000001',
 '51000000-0000-0000-0000-000000000042',
 'second','Second',2,'approval','final_approve',
 '51000000-0000-0000-0000-000000000021',false,true,array['returned']
);
insert into qarar_governance.workflow_template_transitions(
 organization_id,workflow_template_version_id,from_step_id,to_step_id,outcome_code,transition_type
) values
(
 '51000000-0000-0000-0000-000000000001',
 '51000000-0000-0000-0000-000000000042',
 '51000000-0000-0000-0000-000000000061',
 '51000000-0000-0000-0000-000000000062','approved','forward'
),(
 '51000000-0000-0000-0000-000000000001',
 '51000000-0000-0000-0000-000000000042',
 '51000000-0000-0000-0000-000000000062',
 '51000000-0000-0000-0000-000000000061','returned','return'
);
select is(
 (qarar_governance.validate_workflow_template_version(
   '51000000-0000-0000-0000-000000000042'
 )->>'valid')::boolean,
 false,
 'unauthorized cycle is rejected'
);
select ok(
 (select jsonb_array_length(validation_errors) > 0
  from qarar_governance.workflow_template_versions
  where id='51000000-0000-0000-0000-000000000042'),
 'cycle failure is explainable in Arabic'
);
select throws_ok(
 $$insert into qarar_governance.workflow_template_steps(
   organization_id,workflow_template_version_id,step_code,name_ar,sequence_no,
   step_type,responsibility,allowed_outcomes
 ) values(
   '51000000-0000-0000-0000-000000000001',
   '51000000-0000-0000-0000-000000000042',
   'ownerless','Ownerless',3,'review','review',array['approved']
 )$$,
 '23514',
 null,
 'a workflow step cannot be ownerless'
);
select is(
 (select count(*)::integer from qarar_governance.workflow_template_versions
  where workflow_template_id='51000000-0000-0000-0000-000000000031'),
 2,
 'template changes are versioned instead of overwriting history'
);

select * from finish();
rollback;
