import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sql = await readFile(new URL(
  "../supabase/migrations/20261006019000_governance_v2_api_preview.sql", import.meta.url), "utf8");

test("preview API exposes every contracted operation through safe envelopes", () => {
  for (const name of [
    "save_governance_bundle_draft_v2", "validate_governance_bundle_v2", "submit_governance_bundle_v2",
    "request_governance_bundle_changes_v2", "approve_governance_bundle_v2", "activate_governance_bundle_v2",
    "get_governance_bundle_v2", "list_effective_topic_types_v2", "preview_topic_route_v2",
  ]) assert.match(sql, new RegExp(`function api_v2\\.${name}\\(`, "i"));
  assert.match(sql, /jsonb_build_object\('ok',true,'data'/i);
});

test("error mapping uses stable codes, Arabic copy, and trace ids", () => {
  for (const code of ["MODEL_BUNDLE_NOT_FOUND", "MODEL_VERSION_CONFLICT", "MODEL_PERMISSION_DENIED", "MODEL_SERVER_FAILURE"])
    assert.match(sql, new RegExp(code));
  assert.match(sql, /'trace_id',p_trace_id/i);
  assert.match(sql, /[\u0600-\u06FF]/u);
});

test("preview API never leaks raw database messages or details", () => {
  assert.doesNotMatch(sql, /'message_ar'\s*,\s*p_(message|detail)/i);
  assert.match(sql, /'field_errors','\[\]'::jsonb/i);
});

test("preview API is not executable by external API roles", () => {
  assert.match(sql, /revoke all on (all )?functions? in schema api_v2 from public,anon,authenticated,service_role/i);
  assert.doesNotMatch(sql, /grant execute[\s\S]*to (anon|authenticated|service_role)/i);
});
