import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sql = await readFile(
  new URL("../supabase/migrations/20261006017000_governance_v2_activation.sql", import.meta.url),
  "utf8",
);

test("activation requires its own permission and an approved bundle", () => {
  assert.match(sql, /assert_permission\('governance\.model\.activate',null\)/i);
  assert.match(sql, /v_bundle\.status<>'approved'/i);
  assert.match(sql, /الحزمة غير معتمدة ولا يمكن تفعيلها/i);
});

test("activation is conflict-safe, idempotent, and revalidates dependencies", () => {
  assert.match(sql, /pg_advisory_xact_lock/i);
  assert.match(sql, /lock_version<>p_expected_lock_version/i);
  assert.match(sql, /validate_governance_bundle_v2_core/i);
  assert.match(sql, /governance_bundle_command_receipts_v2/i);
});

test("activation rejects overlapping effective versions instead of retiring them implicitly", () => {
  assert.match(sql, /topic_type_versions_v2[\s\S]*status='effective'/i);
  assert.match(sql, /توجد نسخة فعالة أخرى لنوع الموضوع/i);
  assert.doesNotMatch(sql, /set status='retired'/i);
});

test("activation changes only the reviewed v2 aggregate and remains internal", () => {
  for (const table of [
    "governance_bundles_v2",
    "topic_classifications_v2",
    "topic_type_versions_v2",
    "topic_type_workflow_bindings_v2",
    "topic_schedule_policies_v2",
  ]) assert.match(sql, new RegExp(`update qarar_governance\\.${table}`, "i"));
  assert.doesNotMatch(sql, /\b(update|delete from|truncate)\s+qarar_(topics|meetings|decisions)\./i);
  assert.doesNotMatch(sql, /create (or replace )?function api_v[12]\./i);
});

test("successful activation is audited with an immutable receipt", () => {
  assert.match(sql, /governance\.model\.activated/i);
  assert.match(sql, /governance_bundle_reviews_v2/i);
  assert.match(sql, /'activated'/i);
});
