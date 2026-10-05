import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../supabase/migrations/20261006010000_governance_domain_v2_draft.sql",
  import.meta.url,
);

const sql = await readFile(migrationUrl, "utf8");

const requiredTables = [
  "reference_counters_v2",
  "topic_classifications_v2",
  "topic_types_v2",
  "topic_type_versions_v2",
  "legal_authorities_v2",
  "topic_type_authorities_v2",
  "topic_type_workflow_bindings_v2",
  "topic_schedule_policies_v2",
  "meeting_policies_v2",
];

test("draft migration creates every configuration boundary", () => {
  for (const table of requiredTables) {
    assert.match(sql, new RegExp(`create table qarar_governance\\.${table}\\s*\\(`, "i"));
    assert.match(sql, new RegExp(`alter table qarar_governance\\.${table} enable row level security`, "i"));
    assert.match(sql, new RegExp(`alter table qarar_governance\\.${table} force row level security`, "i"));
  }
});

test("migration is additive and does not rewrite legacy or source data", () => {
  assert.doesNotMatch(sql, /\b(update|delete from|truncate)\s+qarar_(topics|governance|meetings|decisions)\./i);
  assert.doesNotMatch(sql, /\binsert\s+into\s+qarar_(topics|meetings|decisions)\./i);
  assert.doesNotMatch(sql, /\bdrop\s+(table|column|function)\b/i);
  assert.doesNotMatch(sql, /\balter\s+table\s+qarar_governance\.(policy_items|workflow_templates|workflow_template_versions)\b/i);
});

test("new configuration remains inactive by default", () => {
  assert.match(sql, /status text not null default 'draft'/i);
  assert.doesNotMatch(sql, /status text not null default '(effective|active)'/i);
  assert.match(sql, /activation_allowed boolean not null default false/i);
});

test("relations use tenant-safe composite foreign keys", () => {
  assert.match(sql, /unique\s*\(id, organization_id\)/i);
  assert.match(sql, /foreign key \(topic_type_version_id, organization_id\)/i);
  assert.match(sql, /foreign key \(workflow_template_version_id, organization_id\)/i);
});

test("human references are generated server-side and never accepted by an API", () => {
  assert.match(sql, /reference_number text not null default qarar_governance\.next_v2_reference/i);
  assert.doesNotMatch(sql, /create (or replace )?function api_v[0-9]+\./i);
});
