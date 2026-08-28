begin;
create extension if not exists pgtap;
select plan(6);

select is((select count(*)::integer from qarar_iam.users where status <> 'active' and is_system_admin), 0,
  'inactive users cannot remain system administrators');
select ok((select count(*) from qarar_iam.users where status='active' and is_system_admin) between 1 and 3,
  'active system administrator count is controlled');
select is((select count(*)::integer from qarar_iam.memberships m join qarar_iam.users u on u.id=m.user_id where m.membership_status='active' and u.status<>'active'), 0,
  'inactive users have no active memberships');
select is((select count(*)::integer from qarar_iam.memberships m join qarar_iam.roles r on r.id=m.role_id where m.membership_status='active' and not r.is_active), 0,
  'active memberships never reference disabled roles');
select is((select count(*)::integer from qarar_iam.memberships where membership_status='active' and end_date is not null and end_date<current_date), 0,
  'expired memberships are not active');
select is((select count(*)::integer from qarar_iam.memberships m left join qarar_iam.users u on u.id=m.user_id left join qarar_iam.roles r on r.id=m.role_id where u.id is null or r.id is null), 0,
  'memberships contain no orphan identities or roles');

select * from finish();
rollback;
