begin;

grant usage on schema api_v2 to authenticated;
grant execute on function api_v2.get_governance_authoring_options_v2() to authenticated;
grant execute on function api_v2.save_governance_bundle_draft_v2(uuid,integer,uuid,jsonb) to authenticated;

revoke execute on function
  api_v2.validate_governance_bundle_v2(uuid),
  api_v2.submit_governance_bundle_v2(uuid,integer,uuid),
  api_v2.request_governance_bundle_changes_v2(uuid,integer,text,uuid),
  api_v2.approve_governance_bundle_v2(uuid,integer,text,uuid),
  api_v2.activate_governance_bundle_v2(uuid,integer,date,uuid)
from authenticated;

commit;
