begin;

-- Objects in the evidence bucket are accessed through controlled upload and
-- signed-download flows.  Client database roles must not enumerate storage
-- metadata directly; the topics executor retains the narrow server-side read
-- needed to verify attachment provenance.
revoke all on table storage.objects from anon, authenticated;
grant usage on schema storage to qarar_topics_executor;
grant select on table storage.objects to qarar_topics_executor;

commit;
