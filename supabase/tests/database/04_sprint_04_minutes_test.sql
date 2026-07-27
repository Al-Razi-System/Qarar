begin;
create extension if not exists pgtap;
select plan(10);

insert into qarar_core.organizations(id,code,name_ar) values
 ('44000000-0000-0000-0000-000000000001','s04-minutes','Sprint 4 Minutes'),
 ('44000000-0000-0000-0000-000000000002','s04-foreign','Sprint 4 Foreign');
insert into auth.users(id,email) values
 ('44000000-0000-0000-0000-000000000011','minutes-admin@s04.test'),
 ('44000000-0000-0000-0000-000000000012','foreign@s04.test');
insert into qarar_iam.users(id,organization_id,email,full_name_ar,is_system_admin) values
 ('44000000-0000-0000-0000-000000000011','44000000-0000-0000-0000-000000000001','minutes-admin@s04.test','Minutes Admin',true),
 ('44000000-0000-0000-0000-000000000012','44000000-0000-0000-0000-000000000002','foreign@s04.test','Foreign Admin',true);
insert into qarar_core.governance_unit_types(id,organization_id,code,name_ar) values
 ('44000000-0000-0000-0000-000000000021','44000000-0000-0000-0000-000000000001','council','Council');
insert into qarar_core.governance_units(id,organization_id,unit_type_id,code,name_ar) values
 ('44000000-0000-0000-0000-000000000022','44000000-0000-0000-0000-000000000001','44000000-0000-0000-0000-000000000021','minutes-council','Minutes Council');
insert into qarar_meetings.meetings(
 id,organization_id,meeting_no,governance_unit_id,title_ar,scheduled_date,created_by_user_id,status
) values(
 '44000000-0000-0000-0000-000000000031','44000000-0000-0000-0000-000000000001','MTG-S04-1',
 '44000000-0000-0000-0000-000000000022','Minutes meeting',current_date,
 '44000000-0000-0000-0000-000000000011','waiting_for_minutes'
);

set local role authenticated;
set local "request.jwt.claims"='{"sub":"44000000-0000-0000-0000-000000000011","role":"authenticated"}';

select is(
 api_v1.create_minute_draft('44000000-0000-0000-0000-000000000031','First governed draft')->>'status',
 'draft','a permitted caller creates the first governed draft'
);
select is(
 api_v1.get_meeting_minutes('44000000-0000-0000-0000-000000000031')->'minute'->>'content_draft',
 'First governed draft','the draft is loaded only through the API contract'
);
select is(
 api_v1.update_minute_draft(
  (api_v1.get_meeting_minutes('44000000-0000-0000-0000-000000000031')->'minute'->>'id')::uuid,
  'Second governed draft',
  (api_v1.get_meeting_minutes('44000000-0000-0000-0000-000000000031')->'minute'->>'updated_at')::timestamptz
 )->>'revision_no','2','editing creates the second immutable revision'
);
select is(
 (api_v1.get_meeting_minutes('44000000-0000-0000-0000-000000000031')->'minute'->'revisions'->0->>'content'),
 'Second governed draft','the latest revision is returned first'
);
select is(
 jsonb_array_length(api_v1.get_meeting_minutes('44000000-0000-0000-0000-000000000031')->'minute'->'revisions'),
 2,'both immutable revisions are retained'
);
select is(
 api_v1.get_meeting_minutes('44000000-0000-0000-0000-000000000031')->>'meeting_status',
 'waiting_for_minutes','editing a draft does not advance or close the meeting'
);
select throws_ok(
 $$select api_v1.update_minute_draft(
   (api_v1.get_meeting_minutes('44000000-0000-0000-0000-000000000031')->'minute'->>'id')::uuid,
   'Stale overwrite','2000-01-01T00:00:00Z'::timestamptz)$$,
 '40001','minute has changed; reload it before saving','stale optimistic-concurrency update is rejected'
);
select ok(
 not has_table_privilege('authenticated','public.meeting_minutes','select')
 and not has_table_privilege('authenticated','public.meeting_minutes','update'),
 'authenticated has no direct public minute-table access'
);
select throws_ok(
 $$update public.meeting_minutes set content_draft='bypass'$$,
 '42501',null,'direct compatibility-view mutation is denied'
);

set local "request.jwt.claims"='{"sub":"44000000-0000-0000-0000-000000000012","role":"authenticated"}';
select throws_ok(
 $$select api_v1.get_meeting_minutes('44000000-0000-0000-0000-000000000031')$$,
 'P0002','meeting not found','a different organization cannot load the minute'
);

reset role;
select * from finish();
rollback;
