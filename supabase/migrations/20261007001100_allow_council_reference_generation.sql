begin;

-- Council creation owns the CNL aggregate while reusing the reviewed V2
-- reference generator for both CNL and its optional MTP child.
grant usage on schema qarar_governance to qarar_core_executor;
grant execute on function qarar_governance.next_v2_reference(text) to qarar_core_executor;

commit;
