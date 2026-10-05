import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sql = await readFile(
  new URL("../supabase/migrations/20261006011000_reconcile_architecture_registry.sql", import.meta.url),
  "utf8",
);

test("existing unregistered entities are assigned to their owning modules", () => {
  for (const [entity, module] of [
    ["reference_counters_v2", "governance"],
    ["topic_classifications_v2", "governance"],
    ["topic_types_v2", "governance"],
    ["topic_type_versions_v2", "governance"],
    ["legal_authorities_v2", "governance"],
    ["topic_type_authorities_v2", "governance"],
    ["topic_type_workflow_bindings_v2", "governance"],
    ["topic_schedule_policies_v2", "governance"],
    ["meeting_policies_v2", "governance"],
    ["topic_custom_route_drafts", "governance"],
    ["topic_custom_route_draft_steps", "governance"],
    ["meeting_series", "meetings"],
    ["meeting_series_occurrences", "meetings"],
  ]) assert.match(sql, new RegExp(`\\('${entity}',\\s*'${module}',\\s*false\\)`, "i"));
});

test("API registry is derived from callable wrapper signatures", () => {
  assert.match(sql, /pg_get_function_identity_arguments\(p\.oid\)/i);
  assert.match(sql, /admin_import_policy_bundle_v4/i);
  assert.match(sql, /create_topic_governance_exception_request/i);
});

test("reconciliation does not alter product tables or function behavior", () => {
  assert.doesNotMatch(sql, /\b(update|delete from|truncate)\s+qarar_(topics|governance|meetings|decisions|execution)\./i);
  assert.doesNotMatch(sql, /create (or replace )?function\s+(qarar_|api_v)/i);
  assert.doesNotMatch(sql, /\bdrop\s+(table|function|column)\b/i);
});
