begin;
-- A plan occurrence cannot silently move to another council in the same tenant.
alter table qarar_meetings.council_meeting_plans_v2 add constraint plan_council_identity
 unique(id,organization_id,governance_unit_id);
alter table qarar_meetings.meetings add constraint meeting_source_plan_council
 foreign key(source_plan_id,organization_id,governance_unit_id)
 references qarar_meetings.council_meeting_plans_v2(id,organization_id,governance_unit_id) on delete restrict;
commit;
