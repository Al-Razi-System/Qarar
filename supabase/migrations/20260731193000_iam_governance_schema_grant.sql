-- Migration to resolve schema permission denied for qarar_iam across module executors
begin;

grant usage on schema qarar_iam, qarar_core, qarar_governance, qarar_topics, qarar_audit, api_v1
  to public, authenticated, anon, qarar_governance_executor, qarar_api_executor, postgres;

grant all privileges on all tables in schema qarar_iam, qarar_core, qarar_governance, qarar_topics, qarar_audit
  to public, authenticated, anon, qarar_governance_executor, qarar_api_executor, postgres;

grant all privileges on all routines in schema api_v1, qarar_governance, qarar_iam, qarar_core, qarar_topics
  to public, authenticated, anon, qarar_governance_executor, qarar_api_executor, postgres;

commit;
