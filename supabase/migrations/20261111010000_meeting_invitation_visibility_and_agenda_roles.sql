begin;

-- Keep the established detail contract intact and add the contextual visibility
-- boundary at its outermost layer. This is forward-only because earlier wrappers
-- may already exist in shared development environments.
alter function qarar_meetings.get_meeting_detail(uuid)
  rename to get_meeting_detail_before_invitation_visibility;

create function qarar_meetings.get_meeting_detail(p_meeting_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog
as $$
declare
  v_detail jsonb;
  v_unit_id uuid;
  v_can_manage_agenda boolean:=false;
  v_can_view_delivery boolean:=false;
begin
  v_detail:=qarar_meetings.get_meeting_detail_before_invitation_visibility(p_meeting_id);
  v_unit_id:=nullif(v_detail->>'governance_unit_id','')::uuid;
  v_can_manage_agenda:=coalesce((v_detail#>>'{capabilities,can_manage_agenda}')::boolean,false);
  v_can_view_delivery:=qarar_iam.is_system_admin()
    or (v_unit_id is not null and qarar_iam.has_unit_role_code(
      v_unit_id,
      array['council_chair','council_rapporteur']
    ));

  v_detail:=jsonb_set(
    v_detail,
    '{capabilities,can_view_invitation_delivery}',
    to_jsonb(v_can_view_delivery),
    true
  );
  -- Editing the discussion instructions follows the same contextual agenda
  -- authority as adding, removing and ordering agenda items. This includes both
  -- chair and rapporteur, not the chair alone.
  v_detail:=jsonb_set(
    v_detail,
    '{capabilities,can_edit_topic_instructions}',
    to_jsonb(v_can_manage_agenda),
    true
  );

  if not v_can_view_delivery then
    v_detail:=v_detail-'invitation_summary';
  end if;

  return v_detail;
end;
$$;

alter function qarar_meetings.get_meeting_detail(uuid) owner to qarar_meetings_executor;
revoke all on function qarar_meetings.get_meeting_detail(uuid)
  from public,anon,authenticated,service_role;
grant execute on function qarar_meetings.get_meeting_detail(uuid) to qarar_api_executor;
grant execute on function qarar_meetings.get_meeting_detail(uuid) to qarar_topics_executor;

update qarar_architecture.function_registry registry
set function_name=procedure.proname
from pg_proc procedure
where procedure.oid=registry.function_oid
  and procedure.proname='get_meeting_detail_before_invitation_visibility';

insert into qarar_architecture.function_registry(
  function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate
) values (
  'qarar_meetings.get_meeting_detail(uuid)'::regprocedure,
  'get_meeting_detail',
  'p_meeting_id uuid',
  'meetings',
  'qarar_meetings',
  false
)
on conflict(function_name,identity_arguments) do update
set function_oid=excluded.function_oid,
    module_code=excluded.module_code,
    owning_schema=excluded.owning_schema,
    is_rls_predicate=excluded.is_rls_predicate;

comment on function qarar_meetings.get_meeting_detail(uuid) is
  'Meeting detail with contextual invitation-delivery visibility and shared chair/rapporteur agenda-instruction authority.';

notify pgrst,'reload schema';
commit;
