import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sql = await readFile(
  new URL("../supabase/migrations/20261006016000_governance_v2_independent_review.sql", import.meta.url),
  "utf8",
);

test("review paths use separate contextual permissions", () => {
  assert.match(sql, /assert_permission\('governance\.model\.review',null\)/i);
  assert.match(sql, /assert_permission\('governance\.model\.approve',null\)/i);
});

test("self review and self approval are rejected", () => {
  assert.match(sql, /v_bundle\.created_by_user_id=v_actor/i);
  assert.match(sql, /لا يجوز لمعد الحزمة مراجعتها أو اعتمادها بنفسه/i);
});

test("changes return every mutable component to an editable draft", () => {
  assert.match(sql, /topic_classifications_v2\s+c\s+set status='draft'/i);
  assert.match(sql, /topic_type_versions_v2 set status='draft'/i);
  assert.match(sql, /topic_type_workflow_bindings_v2 set status='draft'/i);
  assert.match(sql, /topic_schedule_policies_v2 set status='draft'/i);
});

test("approval is idempotent, conflict-safe, append-only audited, and internal", () => {
  assert.match(sql, /pg_advisory_xact_lock/i);
  assert.match(sql, /lock_version<>p_expected_lock_version/i);
  assert.match(sql, /governance_bundle_reviews_v2/i);
  assert.match(sql, /governance\.model\.approved/i);
  assert.doesNotMatch(sql, /create (or replace )?function api_v[12]\./i);
});
