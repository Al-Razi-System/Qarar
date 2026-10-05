import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sql = await readFile(new URL(
  "../supabase/migrations/20261006020000_governance_v2_authoring_options.sql", import.meta.url), "utf8");

test("authoring options require contextual edit permission", () => {
  assert.match(sql, /assert_permission\('governance\.model\.edit',null\)/i);
  assert.match(sql, /current_organization_id\(\)/i);
});

test("only usable classifications and workflow versions are returned", () => {
  assert.match(sql, /c\.status in \('draft','under_review','approved','effective'\)/i);
  assert.match(sql, /t\.status='active'/i);
  assert.match(sql, /v\.status='active' and v\.validation_status='valid'/i);
  assert.match(sql, /order by s\.sequence_no,s\.id/i);
});

test("authoring options stay behind the internal V2 boundary", () => {
  assert.match(sql, /function api_v2\.get_governance_authoring_options_v2\(\)/i);
  assert.match(sql, /governance_error_envelope/i);
  assert.match(sql, /revoke all on function api_v2\.get_governance_authoring_options_v2\(\)[\s\S]*from public,anon,authenticated,service_role/i);
  assert.doesNotMatch(sql, /grant execute[\s\S]*to (anon|authenticated|service_role)/i);
});
