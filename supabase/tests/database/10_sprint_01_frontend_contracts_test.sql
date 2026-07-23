begin;
create extension if not exists pgtap;
select plan(20);

insert into public.organizations(id,code,name_ar) values
('42000000-0000-0000-0000-000000000001','s01-contracts','Sprint 01 Contracts'),
('42000000-0000-0000-0000-000000000002','s01-foreign','Sprint 01 Foreign');
insert into auth.users(id,email) values
('42000000-0000-0000-0000-000000000011','author@contracts.test'),
('42000000-0000-0000-0000-000000000012','reviewer@contracts.test'),
('42000000-0000-0000-0000-000000000013','foreign@contracts.test');
insert into public.users(id,organization_id,email,full_name_ar) values
('42000000-0000-0000-0000-000000000011','42000000-0000-0000-0000-000000000001','author@contracts.test','Author'),
('42000000-0000-0000-0000-000000000012','42000000-0000-0000-0000-000000000001','reviewer@contracts.test','Reviewer'),
('42000000-0000-0000-0000-000000000013','42000000-0000-0000-0000-000000000002','foreign@contracts.test','Foreign');
insert into public.governance_unit_types(id,organization_id,code,name_ar) values
('42000000-0000-0000-0000-000000000021','42000000-0000-0000-0000-000000000001','council','Council');
insert into public.governance_units(id,organization_id,unit_type_id,code,name_ar) values
('42000000-0000-0000-0000-000000000022','42000000-0000-0000-0000-000000000001','42000000-0000-0000-0000-000000000021','main','Main');
insert into public.topic_categories(id,organization_id,code,name_ar) values
('42000000-0000-0000-0000-000000000023','42000000-0000-0000-0000-000000000001','policy','Policy');
insert into public.roles(id,organization_id,code,name_ar,role_scope) values
('42000000-0000-0000-0000-000000000031','42000000-0000-0000-0000-000000000001','author','Author','governance_unit'),
('42000000-0000-0000-0000-000000000032','42000000-0000-0000-0000-000000000001','reviewer','Reviewer','governance_unit');
insert into public.permissions(id,organization_id,code,module,action,context_scope,name_ar) values
('42000000-0000-0000-0000-000000000041','42000000-0000-0000-0000-000000000001','topics.create','topics','create','governance_unit','Create'),
('42000000-0000-0000-0000-000000000042','42000000-0000-0000-0000-000000000001','topics.read','topics','read','governance_unit','Read'),
('42000000-0000-0000-0000-000000000043','42000000-0000-0000-0000-000000000001','topics.review','topics','review','governance_unit','Review');
insert into public.role_permissions(organization_id,role_id,permission_id) values
('42000000-0000-0000-0000-000000000001','42000000-0000-0000-0000-000000000031','42000000-0000-0000-0000-000000000041'),
('42000000-0000-0000-0000-000000000001','42000000-0000-0000-0000-000000000032','42000000-0000-0000-0000-000000000042'),
('42000000-0000-0000-0000-000000000001','42000000-0000-0000-0000-000000000032','42000000-0000-0000-0000-000000000043');
insert into public.memberships(organization_id,user_id,governance_unit_id,role_id) values
('42000000-0000-0000-0000-000000000001','42000000-0000-0000-0000-000000000011','42000000-0000-0000-0000-000000000022','42000000-0000-0000-0000-000000000031'),
('42000000-0000-0000-0000-000000000001','42000000-0000-0000-0000-000000000012','42000000-0000-0000-0000-000000000022','42000000-0000-0000-0000-000000000032');

set local role authenticated;
set local "request.jwt.claims"='{"sub":"42000000-0000-0000-0000-000000000011","role":"authenticated"}';
select is(jsonb_array_length(public.get_topic_form_options()->'governance_units'),1,'form options expose only creatable units');
select is(jsonb_array_length(public.get_topic_form_options()->'categories'),1,'form options expose active tenant categories');

create temporary table contract_state(topic_id uuid, request_id uuid, updated_at timestamptz);
insert into contract_state(request_id) values('42000000-0000-0000-0000-000000000099');
update contract_state set topic_id=(
  public.create_topic('Idempotent topic','Complete idempotent topic description',
    '42000000-0000-0000-0000-000000000023','42000000-0000-0000-0000-000000000022',
    'medium','new',null,request_id)->>'id'
)::uuid;
select is(
  public.create_topic('Idempotent topic','Complete idempotent topic description',
    '42000000-0000-0000-0000-000000000023','42000000-0000-0000-0000-000000000022',
    'medium','new',null,(select request_id from contract_state))->>'id',
  (select topic_id::text from contract_state),
  'same client request id returns the same topic'
);
select is((select count(*) from public.topics)::integer,1,'idempotent replay creates no duplicate');
create temporary table review_outcomes(action text primary key, topic_id uuid, updated_at timestamptz);
insert into review_outcomes(action,topic_id)
select 'return',(public.create_topic(
  'Return workflow topic','Description for successful return workflow',
  '42000000-0000-0000-0000-000000000023','42000000-0000-0000-0000-000000000022'
)->>'id')::uuid
union all
select 'reject',(public.create_topic(
  'Reject workflow topic','Description for successful rejection workflow',
  '42000000-0000-0000-0000-000000000023','42000000-0000-0000-0000-000000000022'
)->>'id')::uuid;
update review_outcomes o set updated_at=t.updated_at from public.topics t where t.id=o.topic_id;
select is((public.search_my_topics(null,null,null,25,0)->>'total')::integer,3,'my topics endpoint returns submitter records');
select is(
  public.get_topic_detail((select topic_id from contract_state))->>'topic_no',
  (select topic_no from public.topics where id=(select topic_id from contract_state)),
  'submitter can load complete detail'
);
select is(jsonb_array_length(public.get_topic_detail((select topic_id from contract_state))->'history'),1,'detail includes ordered history');
update contract_state s set updated_at=t.updated_at from public.topics t where t.id=s.topic_id;

set local "request.jwt.claims"='{"sub":"42000000-0000-0000-0000-000000000012","role":"authenticated"}';
select is(jsonb_array_length(public.get_topic_detail((select topic_id from contract_state))->'allowed_review_actions'),5,'review detail exposes allowed actions');
select is(public.review_topic((select topic_id from contract_state),'start_review',null,(select updated_at from contract_state))->>'status','under_review','reviewer can start review');
update contract_state s set updated_at=t.updated_at from public.topics t where t.id=s.topic_id;
select is(public.review_topic((select topic_id from contract_state),'defer','Waiting for policy input',(select updated_at from contract_state))->>'status','deferred','reviewer can defer');
update contract_state s set updated_at=t.updated_at from public.topics t where t.id=s.topic_id;
select is(public.review_topic((select topic_id from contract_state),'resume','Policy input received',(select updated_at from contract_state))->>'status','under_review','reviewer can resume deferred topic');
update contract_state s set updated_at=t.updated_at from public.topics t where t.id=s.topic_id;
select is(public.review_topic((select topic_id from contract_state),'approve','Approved after review',(select updated_at from contract_state))->>'status','approved','reviewer can approve');
select is(public.review_topic(
  (select topic_id from review_outcomes where action='return'),'return','Missing financial details',
  (select updated_at from review_outcomes where action='return')
)->>'status','returned','reviewer can return topic with a reason');
select is(public.review_topic(
  (select topic_id from review_outcomes where action='reject'),'reject','Outside governance mandate',
  (select updated_at from review_outcomes where action='reject')
)->>'status','rejected','reviewer can reject topic with a reason');
select is((select count(*) from public.topic_status_history where topic_id=(select topic_id from contract_state))::integer,5,'all workflow operations append history');
select is((select count(*) from public.topic_status_history where to_status in('returned','rejected'))::integer,2,'return and reject append status history');
reset role;
select is((select count(*) from public.audit_logs where entity_id=(select topic_id from contract_state))::integer,5,'all operations append audit events');
select is((select count(*) from public.audit_logs where action in('topics.review.return','topics.review.reject'))::integer,2,'return and reject append audit events');

set local role authenticated;
set local "request.jwt.claims"='{"sub":"42000000-0000-0000-0000-000000000013","role":"authenticated"}';
select throws_ok(
  format('select public.get_topic_detail(%L)',(select topic_id from contract_state)),
  'P0002','topic not found','foreign tenant cannot discover topic detail'
);
select is((select count(*) from public.topics)::integer,0,'foreign tenant cannot read topic rows through RLS');

select * from finish();
rollback;
