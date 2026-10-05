import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const manifest = JSON.parse(
  await readFile(new URL("../data/contracts/governance-v1-v2-compatibility.v1.json", import.meta.url), "utf8"),
);

const boundaries = new Map(manifest.boundaries.map((item) => [item.legacy_boundary, item]));

test("compatibility manifest forbids immediate legacy removal", () => {
  assert.equal(manifest.legacy_removal_allowed, false);
  assert.equal(manifest.migration_mode, "additive_then_shadow_then_cutover");
  assert.ok(manifest.boundaries.every((item) => item.removal_status !== "remove_now"));
});

test("every legacy boundary has consumers, target, strategy, and regression tests", () => {
  for (const boundary of manifest.boundaries) {
    assert.ok(boundary.live_consumers.length > 0, boundary.legacy_boundary);
    assert.ok(boundary.target_boundaries.length > 0, boundary.legacy_boundary);
    assert.ok(boundary.strategy.length > 0, boundary.legacy_boundary);
    assert.ok(boundary.required_tests.length > 0, boundary.legacy_boundary);
  }
});

test("critical previously discovered couplings are explicitly registered", () => {
  for (const name of [
    "topic_categories",
    "policy_items.topic_category_id",
    "policy_items.workflow_template_version_id",
    "workflow_template_versions",
    "topic_prior_route_requests",
    "meeting_series",
    "action_items.assigned_unit_id_and_assigned_user_id",
  ]) assert.ok(boundaries.has(name), name);
});

test("workflow engine is reused while mutable route ownership moves away from policy items", () => {
  assert.equal(boundaries.get("workflow_template_versions").strategy, "reuse_not_replace");
  assert.equal(boundaries.get("policy_items.workflow_template_version_id").strategy, "dual_read_shadow_compare");
});

test("cutover requires shadow parity, rollback, staging, and separate production authority", () => {
  for (const gate of [
    "shadow_comparison_has_no_unresolved_difference",
    "rollback_switch_tested",
    "staging_journey_approved",
    "production_migration_separately_authorized",
  ]) assert.ok(manifest.cutover_gates.includes(gate), gate);
});
