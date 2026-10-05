import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sql = await readFile(
  new URL("../supabase/migrations/20261006015000_governance_v2_validation_submit.sql", import.meta.url),
  "utf8",
);

test("validation covers every activation dependency without changing bundle state", () => {
  for (const code of ["LEGAL_AUTHORITY_MISSING", "WORKFLOW_BINDING_MISSING", "WORKFLOW_INVALID", "SCHEDULE_POLICY_MISSING"])
    assert.match(sql, new RegExp(code));
  assert.match(sql, /create or replace function qarar_governance\.validate_governance_bundle_v2_core/i);
});

test("submission is permissioned, idempotent, conflict-safe, and audited", () => {
  assert.match(sql, /assert_permission\('governance\.model\.edit',null\)/i);
  assert.match(sql, /pg_advisory_xact_lock/i);
  assert.match(sql, /lock_version<>p_expected_lock_version/i);
  assert.match(sql, /governance\.model\.submitted/i);
  assert.match(sql, /governance_bundle_command_receipts_v2/i);
});

test("submission cannot bypass blocking validation", () => {
  assert.match(sql, /if not \(v_validation->>'is_valid'\)::boolean then/i);
  assert.match(sql, /أكمل متطلبات الحزمة الموضحة قبل إرسالها للمراجعة/i);
});

test("validation and submission remain internal", () => {
  assert.doesNotMatch(sql, /create (or replace )?function api_v[12]\./i);
  assert.match(sql, /from public,anon,authenticated,service_role/i);
});
