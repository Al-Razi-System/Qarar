import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sql = await readFile(
  new URL("../supabase/migrations/20261006014000_governance_v2_draft_command.sql", import.meta.url),
  "utf8",
);

test("draft command requires permission, idempotency, and optimistic locking", () => {
  assert.match(sql, /assert_permission\('governance\.model\.edit',null\)/i);
  assert.match(sql, /pg_advisory_xact_lock/i);
  assert.match(sql, /expected_lock_version/i);
  assert.match(sql, /lock_version=lock_version\+1/i);
});

test("draft payload rejects server-owned identity and lifecycle fields", () => {
  for (const field of ["id", "reference_number", "status", "activation_allowed"])
    assert.match(sql, new RegExp(`\\? '${field}'`, "i"));
});

test("draft command is audited and stores the replay response atomically", () => {
  assert.match(sql, /insert into qarar_governance\.governance_bundle_command_receipts_v2/i);
  assert.match(sql, /qarar_audit\.append_audit_log/i);
  assert.match(sql, /idempotent_replay/i);
});

test("internal command remains unavailable to API roles", () => {
  assert.doesNotMatch(sql, /create (or replace )?function api_v[12]\./i);
  assert.match(sql, /revoke all on function qarar_governance\.save_governance_bundle_draft_v2[^;]+from public,anon,authenticated,service_role/is);
});
