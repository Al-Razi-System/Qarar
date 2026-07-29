begin;
create extension if not exists pgtap;
select plan(12);

select has_function('api_v1','admin_get_councils_tree',array[]::text[],
 'council tree is exposed through api_v1');
select has_function('api_v1','admin_move_council',
 array['uuid','uuid','text','timestamp with time zone'],
 'council move is exposed through api_v1');

insert into qarar_core.organizations(id,code,name_ar)values
('56000000-0000-0000-0000-000000000001','tree-a','Tree A'),
('56000000-0000-0000-0000-000000000002','tree-b','Tree B');
insert into auth.users(id,email)values
('56000000-0000-0000-0000-000000000011','tree@test.local');
insert into qarar_iam.users(id,organization_id,email,full_name_ar,is_system_admin)values
('56000000-0000-0000-0000-000000000011','56000000-0000-0000-0000-000000000001',
 'tree@test.local','Tree Admin',true);
insert into qarar_core.governance_unit_types(id,organization_id,code,name_ar,is_council_type)values
('56000000-0000-0000-0000-000000000021','56000000-0000-0000-0000-000000000001','council','Council',true),
('56000000-0000-0000-0000-000000000022','56000000-0000-0000-0000-000000000002','council','Council',true);
insert into qarar_core.governance_units(id,organization_id,unit_type_id,parent_unit_id,code,name_ar,level_no)values
('56000000-0000-0000-0000-000000000031','56000000-0000-0000-0000-000000000001','56000000-0000-0000-0000-000000000021',null,'root','Root',1),
('56000000-0000-0000-0000-000000000032','56000000-0000-0000-0000-000000000001','56000000-0000-0000-0000-000000000021','56000000-0000-0000-0000-000000000031','child','Child',2),
('56000000-0000-0000-0000-000000000033','56000000-0000-0000-0000-000000000001','56000000-0000-0000-0000-000000000021','56000000-0000-0000-0000-000000000032','grand','Grand',3),
('56000000-0000-0000-0000-000000000034','56000000-0000-0000-0000-000000000001','56000000-0000-0000-0000-000000000021',null,'sibling','Sibling',1),
('56000000-0000-0000-0000-000000000035','56000000-0000-0000-0000-000000000002','56000000-0000-0000-0000-000000000022',null,'other','Other',1);
select set_config('request.jwt.claim.sub','56000000-0000-0000-0000-000000000011',true);
select set_config('request.jwt.claim.role','authenticated',true);

select is(jsonb_array_length(api_v1.admin_get_councils_tree()),4,
 'tree contains only tenant councils');
select throws_ok($$select api_v1.admin_move_council(
 '56000000-0000-0000-0000-000000000032','56000000-0000-0000-0000-000000000032',
 'self','2000-01-01')$$,'23514',null,'self-parent is rejected');
select throws_ok($$select api_v1.admin_move_council(
 '56000000-0000-0000-0000-000000000031','56000000-0000-0000-0000-000000000033',
 'cycle',(select updated_at from qarar_core.governance_units where id='56000000-0000-0000-0000-000000000031'))$$,
 '23514',null,'moving below any descendant is rejected');
select throws_ok($$select api_v1.admin_move_council(
 '56000000-0000-0000-0000-000000000032','56000000-0000-0000-0000-000000000035',
 'cross tenant',(select updated_at from qarar_core.governance_units where id='56000000-0000-0000-0000-000000000032'))$$,
 '23503',null,'cross-tenant parents are rejected');
select throws_ok($$select api_v1.admin_move_council(
 '56000000-0000-0000-0000-000000000032','56000000-0000-0000-0000-000000000034',
 'stale','2000-01-01')$$,'40001',null,'stale moves are rejected');
select lives_ok($$select api_v1.admin_move_council(
 '56000000-0000-0000-0000-000000000032','56000000-0000-0000-0000-000000000034',
 'إعادة تنظيم',(select updated_at from qarar_core.governance_units where id='56000000-0000-0000-0000-000000000032'))$$,
 'valid subtree move succeeds atomically');
select is((select parent_unit_id from qarar_core.governance_units where id='56000000-0000-0000-0000-000000000032'),
 '56000000-0000-0000-0000-000000000034'::uuid,'new parent is persisted');
select is((select level_no from qarar_core.governance_units where id='56000000-0000-0000-0000-000000000033'),
 3,'descendant levels remain consistent after equal-depth move');
select is((select metadata->>'from_parent_unit_id' from qarar_audit.audit_logs
 where action='council.parent_changed' and entity_id='56000000-0000-0000-0000-000000000032'),
 '56000000-0000-0000-0000-000000000031','audit stores the previous parent');
select ok(not has_function_privilege('authenticated',
 'qarar_core.admin_move_council(uuid,uuid,text,timestamp with time zone)','execute'),
 'clients cannot bypass the versioned move contract');

select * from finish();
rollback;
