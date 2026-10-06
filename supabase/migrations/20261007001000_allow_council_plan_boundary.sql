begin;

-- The atomic council command validates the selected meeting type and writes
-- the optional plan. Keep the grant limited to those explicit dependencies.
grant usage on schema qarar_meetings to qarar_core_executor;
grant select on table qarar_meetings.meeting_types to qarar_core_executor;
grant select, insert on table qarar_meetings.council_meeting_plans_v2 to qarar_core_executor;

commit;
