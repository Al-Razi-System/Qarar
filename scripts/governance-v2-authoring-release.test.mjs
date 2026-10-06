import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sql = await readFile(new URL(
  "../supabase/migrations/20261006022000_governance_v2_authoring_release.sql", import.meta.url), "utf8");

test("release exposes only options and draft save to authenticated users", () => {
  assert.match(sql, /grant usage on schema api_v2 to authenticated/i);
  assert.match(sql, /grant execute on function api_v2\.get_governance_authoring_options_v2\(\) to authenticated/i);
  assert.match(sql, /grant execute on function api_v2\.save_governance_bundle_draft_v2\(uuid,integer,uuid,jsonb\) to authenticated/i);
  for (const signature of [
    "submit_governance_bundle_v2", "request_governance_bundle_changes_v2",
    "approve_governance_bundle_v2", "activate_governance_bundle_v2",
  ]) assert.match(sql, new RegExp(`api_v2\\.${signature}\\(`, "i"));
  assert.match(sql, /from authenticated/i);
});
