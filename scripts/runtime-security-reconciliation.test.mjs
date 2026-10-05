import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sql = await readFile(
  new URL("../supabase/migrations/20261006012000_reconcile_runtime_security_boundaries.sql", import.meta.url),
  "utf8",
);

test("database trigger routines are not callable by API roles", () => {
  assert.match(sql, /revoke all on function qarar_meetings\.require_final_agenda_summaries\(\)/i);
  assert.match(sql, /revoke all on function qarar_minutes\.ensure_final_content_hash\(\)/i);
});

test("public topic category implementation is removed after rebinding", () => {
  assert.match(sql, /create or replace function api_v1\.get_topic_categories_for_unit/i);
  assert.match(sql, /qarar_topics\.get_topic_categories_for_unit/i);
  assert.match(sql, /drop function public\.get_topic_categories_for_unit\(uuid, date\)/i);
});

test("observed cross-module dependencies are explicitly registered", () => {
  for (const token of ["topic_attachments", "decisions", "roles", "create_topic_unrouted", "is_system_admin", "assert_permission"])
    assert.match(sql, new RegExp(token, "i"));
});

test("registered topic creation dependency receives only its explicit execute grant", () => {
  assert.match(sql, /grant execute on function qarar_topics\.create_topic_unrouted\([\s\S]*?\) to qarar_governance_executor/i);
});

test("workflow action wrapper establishes tenant context", () => {
  assert.match(sql, /create or replace function qarar_governance\.act_topic_workflow_step/i);
  assert.match(sql, /qarar_iam\.current_organization_id\(\)/i);
});

test("workflow replay is resolved before an expired temporary route is rejected", () => {
  const replay = sql.indexOf("select s.* into replay");
  const expiry = sql.indexOf("from qarar_governance.topic_governance_mappings");
  assert.ok(replay >= 0 && expiry > replay);
});

test("release fingerprint is recomputed from the reviewed registry", () => {
  assert.match(sql, /update qarar_architecture\.api_release_registry/i);
  assert.match(sql, /md5\(string_agg/i);
});
