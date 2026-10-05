import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sql = await readFile(new URL(
  "../supabase/migrations/20261006021000_governance_v2_atomic_draft_fix.sql", import.meta.url), "utf8");

test("draft save reuses shared classifications without renaming them", () => {
  assert.match(sql, /on conflict\(organization_id,code\) do nothing returning id into v_classification_id/i);
  assert.match(sql, /select id into v_classification_id[\s\S]*status<>'retired'/i);
  assert.doesNotMatch(sql, /update qarar_governance\.topic_classifications_v2 set/i);
  assert.match(sql, /set classification_id=v_classification_id/i);
});

test("route and schedule are persisted in the same draft transaction", () => {
  assert.match(sql, /insert into qarar_governance\.topic_type_workflow_bindings_v2/i);
  assert.match(sql, /insert into qarar_governance\.topic_schedule_policies_v2/i);
  assert.match(sql, /w\.status='active' and w\.validation_status='valid'/i);
  assert.match(sql, /rule_type=excluded\.rule_type/i);
});

test("corrective migration preserves idempotency locking audit and API boundary", () => {
  assert.match(sql, /pg_advisory_xact_lock/i);
  assert.match(sql, /request_fingerprint/i);
  assert.match(sql, /lock_version=lock_version\+1/i);
  assert.match(sql, /append_audit_log/i);
  assert.match(sql, /revoke all on function[\s\S]*public,anon,authenticated,service_role/i);
});
