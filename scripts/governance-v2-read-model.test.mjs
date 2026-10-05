import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sql = await readFile(new URL(
  "../supabase/migrations/20261006018000_governance_v2_read_model.sql", import.meta.url), "utf8");

test("bundle details require governance read permission", () => {
  assert.match(sql, /get_governance_bundle_v2/i);
  assert.match(sql, /assert_permission\('governance\.model\.read',null\)/i);
});

test("effective type discovery is scoped to the origin unit", () => {
  assert.match(sql, /assert_permission\('topics\.create',p_origin_governance_unit_id\)/i);
  assert.match(sql, /resolve_step_unit\([\s\S]*p_origin_governance_unit_id/i);
  assert.match(sql, /s\.is_initial/i);
  assert.match(sql, /status='effective'/i);
});

test("route preview returns governed evidence without mutation", () => {
  for (const token of ["authorities", "steps", "schedule", "acceptance_finality", "rejection_finality"])
    assert.match(sql, new RegExp(`'${token}'`, "i"));
  assert.doesNotMatch(sql, /\b(update|delete from|truncate|insert into)\s+qarar_/i);
});

test("read model remains internal and isolated from legacy product data", () => {
  assert.doesNotMatch(sql, /create (or replace )?function api_v[12]\./i);
  assert.match(sql, /revoke all on function[\s\S]*from public,anon,authenticated,service_role/i);
  assert.doesNotMatch(sql, /qarar_(topics|meetings|decisions)\./i);
});
