begin;
-- The wrapper still enforces governance.model.read and organization isolation.
-- Do not grant direct module/table access or broaden other lifecycle commands.
grant execute on function api_v2.get_governance_bundle_v2(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
