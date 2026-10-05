import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sql = await readFile(
  new URL("../supabase/migrations/20261006013000_governance_v2_bundle_foundation.sql", import.meta.url),
  "utf8",
);

test("bundle foundation creates aggregate, review history, and command receipts", () => {
  for (const table of [
    "governance_bundles_v2",
    "governance_bundle_reviews_v2",
    "governance_bundle_command_receipts_v2",
  ]) {
    assert.match(sql, new RegExp(`create table qarar_governance\\.${table}`, "i"));
    assert.match(sql, new RegExp(`alter table qarar_governance\\.${table} force row level security`, "i"));
    assert.match(sql, new RegExp(`\\('${table}',\\s*'governance',\\s*false\\)`, "i"));
  }
});

test("bundle lifecycle cannot activate implicitly or self approve", () => {
  assert.match(sql, /status in \('draft','under_review','changes_requested','approved','effective','retired'\)/i);
  assert.match(sql, /reviewed_by_user_id is distinct from created_by_user_id/i);
  assert.match(sql, /constraint governance_bundles_v2_activation_blocked check \(status<>'effective'\)/i);
});

test("future mutations have durable idempotency and conflict fields", () => {
  assert.match(sql, /lock_version integer not null default 1/i);
  assert.match(sql, /client_request_id uuid not null/i);
  assert.match(sql, /unique\(organization_id,actor_user_id,command_name,client_request_id\)/i);
  assert.match(sql, /response_payload jsonb/i);
});

test("review history and command receipts are append only", () => {
  assert.match(sql, /grant select,insert on table\s+qarar_governance\.governance_bundle_reviews_v2,\s+qarar_governance\.governance_bundle_command_receipts_v2/is);
  assert.doesNotMatch(sql, /grant[^;]*(update|delete)[^;]*governance_bundle_(reviews|command_receipts)_v2/is);
});

test("foundation has no public API and does not touch legacy product data", () => {
  assert.doesNotMatch(sql, /create (or replace )?function api_v[12]\./i);
  assert.doesNotMatch(sql, /grant .* to (anon|authenticated|service_role)/i);
  assert.doesNotMatch(sql, /\b(update|delete from|truncate)\s+qarar_(topics|meetings|decisions)\./i);
});
