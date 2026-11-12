begin;
create extension if not exists pgtap;
select plan(20);

-- Organisation tree: University > College A > Dept A1, University > College B > Dept B1, and a separate root R2.
insert into qarar_core.organizations(id,code,name_ar) values
('57000000-0000-0000-0000-000000000001','ov157','متابعة'),
('57000000-0000-0000-0000-000000000002','ov157x','أخرى');
insert into auth.users(id,email) select ('57000000-0000-0000-0000-0000000001'||lpad(n::text,2,'0'))::uuid, 'u'||n||'@ov157.test' from generate_series(1,9) n;
insert into qarar_iam.users(id,organization_id,email,full_name_ar,is_system_admin) values
('57000000-0000-0000-0000-000000000101','57000000-0000-0000-0000-000000000001','u1@ov157.test','طارق',false),
('57000000-0000-0000-0000-000000000102','57000000-0000-0000-0000-000000000001','u2@ov157.test','خليل',false),
('57000000-0000-0000-0000-000000000103','57000000-0000-0000-0000-000000000001','u3@ov157.test','عميد أ',false),
('57000000-0000-0000-0000-000000000104','57000000-0000-0000-0000-000000000001','u4@ov157.test','عميد أ الجديد',false),
('57000000-0000-0000-0000-000000000105','57000000-0000-0000-0000-000000000001','u5@ov157.test','عميد ب',false),
('57000000-0000-0000-0000-000000000106','57000000-0000-0000-0000-000000000001','u6@ov157.test','وكيل الدراسات العليا',false),
('57000000-0000-0000-0000-000000000107','57000000-0000-0000-0000-000000000001','u7@ov157.test','مسؤول الحوكمة',true),
('57000000-0000-0000-0000-000000000108','57000000-0000-0000-0000-000000000001','u8@ov157.test','عضو',false),
('57000000-0000-0000-0000-000000000109','57000000-0000-0000-0000-000000000002','u9@ov157.test','مؤسسة أخرى',true);
insert into qarar_core.governance_unit_types(id,organization_id,code,name_ar,is_council_type) values
('57000000-0000-0000-0000-000000000201','57000000-0000-0000-0000-000000000001','org157','وحدة',false),
('57000000-0000-0000-0000-000000000202','57000000-0000-0000-0000-000000000001','cnl157','مجلس',true),
('57000000-0000-0000-0000-000000000203','57000000-0000-0000-0000-000000000002','cnl157x','مجلس',true);
insert into qarar_governance.governance_unit_classes(id,organization_id,code,name_ar,governance_level) values
('57000000-0000-0000-0000-000000000301','57000000-0000-0000-0000-000000000001','uc157','مجلس جامعة','university'),
('57000000-0000-0000-0000-000000000302','57000000-0000-0000-0000-000000000001','fc157','مجلس كلية','faculty'),
('57000000-0000-0000-0000-000000000303','57000000-0000-0000-0000-000000000001','dc157','مجلس قسم','department');
insert into qarar_core.governance_units(id,organization_id,unit_type_id,parent_unit_id,code,name_ar,status) values
('57000000-0000-0000-0000-000000000401','57000000-0000-0000-0000-000000000001','57000000-0000-0000-0000-000000000201',null,'u','الجامعة','active'),
('57000000-0000-0000-0000-000000000402','57000000-0000-0000-0000-000000000001','57000000-0000-0000-0000-000000000201','57000000-0000-0000-0000-000000000401','ca','كلية أ','active'),
('57000000-0000-0000-0000-000000000403','57000000-0000-0000-0000-000000000001','57000000-0000-0000-0000-000000000201','57000000-0000-0000-0000-000000000401','cb','كلية ب','active'),
('57000000-0000-0000-0000-000000000404','57000000-0000-0000-0000-000000000001','57000000-0000-0000-0000-000000000201','57000000-0000-0000-0000-000000000402','da','قسم أ1','active'),
('57000000-0000-0000-0000-000000000405','57000000-0000-0000-0000-000000000001','57000000-0000-0000-0000-000000000201','57000000-0000-0000-0000-000000000403','db','قسم ب1','active'),
('57000000-0000-0000-0000-000000000406','57000000-0000-0000-0000-000000000001','57000000-0000-0000-0000-000000000201',null,'r2','الإدارة العامة','active');
insert into qarar_core.governance_units(id,organization_id,unit_type_id,scope_unit_id,governance_class_id,code,name_ar,status) values
('57000000-0000-0000-0000-000000000501','57000000-0000-0000-0000-000000000001','57000000-0000-0000-0000-000000000202','57000000-0000-0000-0000-000000000401','57000000-0000-0000-0000-000000000301','board','مجلس الأمناء','active'),
('57000000-0000-0000-0000-000000000502','57000000-0000-0000-0000-000000000001','57000000-0000-0000-0000-000000000202','57000000-0000-0000-0000-000000000401','57000000-0000-0000-0000-000000000301','grad','مجلس الدراسات العليا','active'),
('57000000-0000-0000-0000-000000000503','57000000-0000-0000-0000-000000000001','57000000-0000-0000-0000-000000000202','57000000-0000-0000-0000-000000000402','57000000-0000-0000-0000-000000000302','fa','مجلس كلية أ','active'),
('57000000-0000-0000-0000-000000000504','57000000-0000-0000-0000-000000000001','57000000-0000-0000-0000-000000000202','57000000-0000-0000-0000-000000000403','57000000-0000-0000-0000-000000000302','fb','مجلس كلية ب','active'),
('57000000-0000-0000-0000-000000000505','57000000-0000-0000-0000-000000000001','57000000-0000-0000-0000-000000000202','57000000-0000-0000-0000-000000000404','57000000-0000-0000-0000-000000000303','dka','مجلس قسم أ1','active'),
('57000000-0000-0000-0000-000000000506','57000000-0000-0000-0000-000000000001','57000000-0000-0000-0000-000000000202','57000000-0000-0000-0000-000000000405','57000000-0000-0000-0000-000000000303','dkb','مجلس قسم ب1','active'),
('57000000-0000-0000-0000-000000000507','57000000-0000-0000-0000-000000000001','57000000-0000-0000-0000-000000000202',null,'57000000-0000-0000-0000-000000000303','orph','مجلس غير مربوط','active'),
('57000000-0000-0000-0000-000000000508','57000000-0000-0000-0000-000000000001','57000000-0000-0000-0000-000000000202','57000000-0000-0000-0000-000000000406','57000000-0000-0000-0000-000000000302','r2c','مجلس الإدارة العامة','active'),
('57000000-0000-0000-0000-000000000509','57000000-0000-0000-0000-000000000002','57000000-0000-0000-0000-000000000203',null,null,'x','مجلس مؤسسة أخرى','active');
delete from qarar_iam.roles where organization_id='57000000-0000-0000-0000-000000000001' and code='council_chair';
insert into qarar_iam.roles(id,organization_id,code,name_ar,role_scope) values('57000000-0000-0000-0000-000000000601','57000000-0000-0000-0000-000000000001','council_chair','رئيس','governance_unit');
insert into qarar_iam.memberships(id,organization_id,user_id,governance_unit_id,role_id,start_date) values
('57000000-0000-0000-0000-000000000701','57000000-0000-0000-0000-000000000001','57000000-0000-0000-0000-000000000101','57000000-0000-0000-0000-000000000501','57000000-0000-0000-0000-000000000601',current_date-30),
('57000000-0000-0000-0000-000000000702','57000000-0000-0000-0000-000000000001','57000000-0000-0000-0000-000000000103','57000000-0000-0000-0000-000000000503','57000000-0000-0000-0000-000000000601',current_date-30),
('57000000-0000-0000-0000-000000000703','57000000-0000-0000-0000-000000000001','57000000-0000-0000-0000-000000000105','57000000-0000-0000-0000-000000000504','57000000-0000-0000-0000-000000000601',current_date-30);

create temporary table saved(name text primary key, result jsonb);
grant all on saved to public;
create function pg_temp.scope(p_user uuid) returns text language sql as $$
  select coalesce(string_agg(g.code, ',' order by g.code), '') from qarar_iam.overseen_councils(p_user) o join qarar_core.governance_units g on g.id=o.council_id
$$;

-- The governance administrator assigns the four kinds of follow-up.
set local "request.jwt.claims"='{"sub":"57000000-0000-0000-0000-000000000107","role":"authenticated"}';
set local role authenticated;
insert into saved values
('tariq', api_v2.admin_save_oversight_assignment_v2(null, '{"title_ar":"متابعة رئيس مجلس الأمناء","holder_kind":"council_position","holder_council_id":"57000000-0000-0000-0000-000000000501","holder_role_code":"council_chair","target_mode":"subtree","root_unit_id":"57000000-0000-0000-0000-000000000401","target_class_ids":[]}', null, gen_random_uuid())),
('khalil', api_v2.admin_save_oversight_assignment_v2(null, '{"holder_kind":"user","holder_user_id":"57000000-0000-0000-0000-000000000102","target_mode":"subtree","root_unit_id":"57000000-0000-0000-0000-000000000401","target_class_ids":["57000000-0000-0000-0000-000000000302","57000000-0000-0000-0000-000000000303"]}', null, gen_random_uuid())),
('deans', api_v2.admin_save_oversight_assignment_v2(null, '{"holder_kind":"position_rule","holder_role_code":"council_chair","holder_class_id":"57000000-0000-0000-0000-000000000302","target_mode":"subtree","target_class_ids":["57000000-0000-0000-0000-000000000303"]}', null, gen_random_uuid())),
('grad', api_v2.admin_save_oversight_assignment_v2(null, '{"holder_kind":"user","holder_user_id":"57000000-0000-0000-0000-000000000106","target_mode":"selected","council_ids":["57000000-0000-0000-0000-000000000502"]}', null, gen_random_uuid())),
('future', api_v2.admin_save_oversight_assignment_v2(null, ('{"holder_kind":"user","holder_user_id":"57000000-0000-0000-0000-000000000108","target_mode":"selected","council_ids":["57000000-0000-0000-0000-000000000502"],"starts_on":"'||(current_date+1)||'"}')::jsonb, null, gen_random_uuid()));
create temporary table preview as select api_v2.admin_preview_oversight_v2('{"holder_kind":"position_rule","holder_role_code":"council_chair","holder_class_id":"57000000-0000-0000-0000-000000000302","target_mode":"subtree","target_class_ids":["57000000-0000-0000-0000-000000000303"]}') p;
create temporary table workspace as select api_v2.admin_get_oversight_workspace_v2() w;
reset role;

select is(pg_temp.scope('57000000-0000-0000-0000-000000000101'),'board,dka,dkb,fa,fb,grad','the board chair follows every council in the university tree, and no unlinked or foreign-root council');
select is(pg_temp.scope('57000000-0000-0000-0000-000000000102'),'dka,dkb,fa,fb','Khalil follows college and department councils only');
select is(pg_temp.scope('57000000-0000-0000-0000-000000000103'),'dka','each dean follows only the department councils of their own college');
select is(pg_temp.scope('57000000-0000-0000-0000-000000000105'),'dkb','and the other dean only theirs');
select is(pg_temp.scope('57000000-0000-0000-0000-000000000106'),'grad','a selected council is followed on its own');
select is(pg_temp.scope('57000000-0000-0000-0000-000000000108'),'','an assignment that has not started yet grants nothing');
select is((select p->>'council_count' from preview)::int, 2,'the preview counts what a rule would cover across all colleges');
select ok((select w->'unlinked_councils' @> '[{"name_ar":"مجلس غير مربوط"}]' from workspace),'councils without a unit are reported to the administrator');
select ok(exists(select 1 from qarar_audit.audit_logs where organization_id='57000000-0000-0000-0000-000000000001' and entity_type='oversight_assignments'),'every assignment change is audited');

-- The dean changes: follow-up moves with the position.
update qarar_iam.memberships set end_date=current_date-1 where id='57000000-0000-0000-0000-000000000702';
insert into qarar_iam.memberships(organization_id,user_id,governance_unit_id,role_id,start_date) values
('57000000-0000-0000-0000-000000000001','57000000-0000-0000-0000-000000000104','57000000-0000-0000-0000-000000000503','57000000-0000-0000-0000-000000000601',current_date);
select is(pg_temp.scope('57000000-0000-0000-0000-000000000103')||'|'||pg_temp.scope('57000000-0000-0000-0000-000000000104'),'|dka','when the dean changes, follow-up passes to the new dean');

-- Following is not managing.
set local "request.jwt.claims"='{"sub":"57000000-0000-0000-0000-000000000101","role":"authenticated"}';
set local role authenticated;
select is(qarar_iam.has_permission('meetings.manage','57000000-0000-0000-0000-000000000505'),false,'following a council grants no management permission in it');
select is((select jsonb_array_length(api_v2.get_my_oversight_scope_v2()->'councils')),6,'a follower reads their own scope');
select is((select api_v2.get_my_oversight_scope_v2()->'councils'->0->'via'->0->>'title_ar'),'متابعة رئيس مجلس الأمناء','with the assignment it comes from');
reset role;

-- Only oversight managers change assignments; definitions are validated, versioned and tenant-scoped.
set local "request.jwt.claims"='{"sub":"57000000-0000-0000-0000-000000000108","role":"authenticated"}';
set local role authenticated;
select throws_ok($$select api_v2.admin_save_oversight_assignment_v2(null,'{"holder_kind":"user","holder_user_id":"57000000-0000-0000-0000-000000000108","target_mode":"selected","council_ids":["57000000-0000-0000-0000-000000000501"]}',null,gen_random_uuid())$$,'42501',null,'a member cannot grant themselves follow-up');
select throws_ok($$select api_v2.admin_preview_oversight_v2('{"holder_kind":"user","holder_user_id":"57000000-0000-0000-0000-000000000108","target_mode":"selected","council_ids":[]}')$$,'42501',null,'nor preview one');
reset role;
set local "request.jwt.claims"='{"sub":"57000000-0000-0000-0000-000000000107","role":"authenticated"}';
set local role authenticated;
select throws_ok($$select api_v2.admin_save_oversight_assignment_v2(null,'{"holder_kind":"user","target_mode":"subtree","root_unit_id":"57000000-0000-0000-0000-000000000401"}',null,gen_random_uuid())$$,'22023',null,'a person assignment must name the person');
select throws_ok($$select api_v2.admin_save_oversight_assignment_v2(null,'{"holder_kind":"user","holder_user_id":"57000000-0000-0000-0000-000000000102","target_mode":"selected","council_ids":["57000000-0000-0000-0000-000000000509"]}',null,gen_random_uuid())$$,'22023',null,'a council of another organisation cannot be followed');
select throws_ok(format($$select api_v2.admin_end_oversight_assignment_v2(%L,'انتهى التكليف',99)$$,(select result->>'id' from saved where name='grad')),'40001',null,'a stale version is rejected');
select lives_ok(format($$select api_v2.admin_end_oversight_assignment_v2(%L,'انتهى التكليف',%s)$$,(select result->>'id' from saved where name='grad'),(select result->>'version' from saved where name='grad')),'an assignment is ended with a reason');
reset role;
select is(pg_temp.scope('57000000-0000-0000-0000-000000000106'),'','an ended assignment grants nothing');

select * from finish();
rollback;
