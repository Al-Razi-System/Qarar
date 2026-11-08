-- Development database only (devqarar): demo data to try multi-target assignments.
-- Adds members to the four management departments' councils and gives each of those
-- departments one explicit responsible (head of department), so «كل قسم» resolves to a
-- distinct person per department even where the council is still inactive.
-- Idempotent: it adds only what is missing. Never run on production.
begin;

do $seed$
declare
  v_org constant uuid:='00000000-0000-0000-0000-000000000001';
  v_admin constant uuid:='cbc2ce76-c112-4048-9ede-7d7f219758eb';
  v_member_role uuid; r record;
begin
  select id into v_member_role from qarar_iam.roles where organization_id=v_org and code='council_member' limit 1;
  if v_member_role is null then raise exception 'council_member role not found'; end if;

  -- council, member
  for r in select c.council::uuid council, u.id user_id from (values
      ('13ba2544-ed2e-4fc2-8af3-ccf75ec6d752','amal.banafea@demo.qarar.local'),
      ('13ba2544-ed2e-4fc2-8af3-ccf75ec6d752','amin.alwasabi@demo.qarar.local'),
      ('13ba2544-ed2e-4fc2-8af3-ccf75ec6d752','ahmed.muraisi@demo.qarar.local'),
      ('f55d78d9-e18d-4f7a-8f8d-feccca5d1dab','ahmed.abiyah@demo.qarar.local'),
      ('f55d78d9-e18d-4f7a-8f8d-feccca5d1dab','khalid.alwasabi@demo.qarar.local'),
      ('f55d78d9-e18d-4f7a-8f8d-feccca5d1dab','khalil.wajih@demo.qarar.local'),
      ('d30c56ae-afee-41ab-bfb0-6a87dae2e115','rania.jashan@demo.qarar.local'),
      ('d30c56ae-afee-41ab-bfb0-6a87dae2e115','rashad.nimr@demo.qarar.local'),
      ('d30c56ae-afee-41ab-bfb0-6a87dae2e115','reda.handhal@demo.qarar.local'),
      ('8c37ed4c-7ed7-4e26-b814-035ad4dd1780','salma.sunaini@demo.qarar.local'),
      ('8c37ed4c-7ed7-4e26-b814-035ad4dd1780','shaima.kahlani@demo.qarar.local'),
      ('8c37ed4c-7ed7-4e26-b814-035ad4dd1780','sabah.alqudsi@demo.qarar.local')
    ) c(council,email) join qarar_iam.users u on u.email=c.email and u.organization_id=v_org
  loop
    insert into qarar_iam.memberships(organization_id,user_id,governance_unit_id,role_id,membership_status,start_date)
    select v_org,r.user_id,r.council,v_member_role,'active',current_date
    where not exists(select 1 from qarar_iam.memberships m where m.user_id=r.user_id and m.governance_unit_id=r.council
      and m.role_id=v_member_role and m.membership_status='active');
  end loop;

  -- department, head of department
  for r in select d.unit::uuid unit, u.id user_id from (values
      ('fc8e0a58-3817-4bd9-b45c-f358322e5ccd','ghalib.ghouth@demo.qarar.local'),
      ('f962a5a7-9f5d-4acb-8936-c298776e322e','osama.almamari@demo.qarar.local'),
      ('165cc7e7-4820-4532-8621-59e9cf387f2b','rania.jashan@demo.qarar.local'),
      ('e35b5c4b-ac21-4f27-bfe2-6fd2ded6581d','iman.alshaari@demo.qarar.local')
    ) d(unit,email) join qarar_iam.users u on u.email=d.email and u.organization_id=v_org
  loop
    insert into qarar_core.organizational_unit_responsibles(organization_id,governance_unit_id,user_id,valid_from,reason,created_by_user_id)
    select v_org,r.unit,r.user_id,current_date,'رئيس القسم — بيانات تجريبية لتجربة التكليف المتعدد',v_admin
    where not exists(select 1 from qarar_core.organizational_unit_responsibles x where x.governance_unit_id=r.unit
      and x.valid_from<=current_date and (x.valid_until is null or x.valid_until>=current_date));
  end loop;
end
$seed$;

commit;
