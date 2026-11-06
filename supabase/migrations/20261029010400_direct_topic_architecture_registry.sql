-- Register the internal routines introduced by direct meeting topics.
begin;

revoke all on function qarar_meetings.guard_agenda_voting_policy()
  from public,anon,authenticated,service_role;
revoke all on function qarar_voting.guard_optional_direct_vote()
  from public,anon,authenticated,service_role;

insert into qarar_architecture.function_registry(
  function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate
)
select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),v.module_code,n.nspname,false
from (
  values
    ('qarar_topics.create_meeting_scoped_topic(uuid,uuid,uuid,text,text,text,uuid,uuid)'::regprocedure,'topics'),
    ('qarar_meetings.create_direct_agenda_topic(uuid,text,text,text,boolean,uuid)'::regprocedure,'meetings'),
    ('qarar_meetings.guard_agenda_voting_policy()'::regprocedure,'meetings'),
    ('qarar_voting.guard_optional_direct_vote()'::regprocedure,'voting')
) v(function_oid,module_code)
join pg_proc p on p.oid=v.function_oid
join pg_namespace n on n.oid=p.pronamespace
on conflict(function_oid) do update set
  function_name=excluded.function_name,
  identity_arguments=excluded.identity_arguments,
  module_code=excluded.module_code,
  owning_schema=excluded.owning_schema,
  is_rls_predicate=false;

commit;
