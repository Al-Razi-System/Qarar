-- Development databases only. Safe to run repeatedly: it acts only while the ledger
-- still holds the two OLD migration numbers, and otherwise does nothing.
--
-- Why: the migrations 20261106030000_inactive_council_agenda_preparation_contract
-- and 20261106031000_inactive_council_route_resolution_and_labels were renumbered
-- to 20261107030000_ and 20261107031000_ so they run AFTER the cycle migrations
-- (20261106040000, 20261107010000), which patch get_meeting_detail by text. A
-- database that applied the old numbers already has get_meeting_detail and
-- search_meetings wrapped, so the cycle migrations cannot find their text.
--
-- This file removes those two wrappers and the two ledger rows. Afterwards apply
-- the pending migrations in order; the renumbered ones wrap the functions again.
-- Run the pending migrations in the same transaction when possible, and take a
-- backup first. Never run it on production; production never applied the old numbers.
begin;

do $repair$
declare
  v_search regprocedure:=to_regprocedure('qarar_meetings.search_meetings_before_unit_status(text,text,uuid,date,date,integer,integer)');
  v_detail regprocedure:=to_regprocedure('qarar_meetings.get_meeting_detail_before_unit_status(uuid)');
begin
  -- Only a database that recorded the OLD numbers has the wrappers in the wrong
  -- place. After the renumbered migrations ran, the wrappers are correct and
  -- must stay, so there is nothing to do.
  if not exists(select 1 from qarar_internal.applied_migrations where version in(
    '20261106030000_inactive_council_agenda_preparation_contract',
    '20261106031000_inactive_council_route_resolution_and_labels')) then
    return;
  end if;
  if v_search is not null then
    delete from qarar_architecture.function_registry
    where function_oid='qarar_meetings.search_meetings(text,text,uuid,date,date,integer,integer)'::regprocedure;
    drop function qarar_meetings.search_meetings(text,text,uuid,date,date,integer,integer);
    alter function qarar_meetings.search_meetings_before_unit_status(text,text,uuid,date,date,integer,integer)
      rename to search_meetings;
  end if;
  if v_detail is not null then
    delete from qarar_architecture.function_registry
    where function_oid='qarar_meetings.get_meeting_detail(uuid)'::regprocedure;
    drop function qarar_meetings.get_meeting_detail(uuid);
    alter function qarar_meetings.get_meeting_detail_before_unit_status(uuid) rename to get_meeting_detail;
  end if;
  update qarar_architecture.function_registry registry
  set function_name=procedure.proname
  from pg_proc procedure
  where procedure.oid=registry.function_oid
    and procedure.proname in('search_meetings','get_meeting_detail')
    and registry.function_name like '%before_unit_status';
  delete from qarar_internal.applied_migrations
  where version in(
    '20261106030000_inactive_council_agenda_preparation_contract',
    '20261106031000_inactive_council_route_resolution_and_labels');
end;
$repair$;

commit;
