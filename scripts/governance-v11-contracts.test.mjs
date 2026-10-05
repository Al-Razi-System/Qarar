import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const review = JSON.parse(
  await readFile(
    new URL("../data/reviewed/governance-v11-corrected-linkage.review.json", import.meta.url),
    "utf8",
  ),
);

test("the reviewed workbook decision is versioned and remains non-activating", () => {
  assert.equal(review.schema_version, "qarar.governance_foundation.v1");
  assert.match(review.source.sha256, /^[a-f0-9]{64}$/);
  assert.equal(review.authority_review.accepted_status, "accepted_as_authority_source");
  assert.equal(review.authority_review.activation_allowed, false);
});

test("only the 39 complete and non-conflicting authority records are accepted", () => {
  const accepted = review.authority_review.accepted_topic_ids;
  const blocked = new Set(review.blocked_records.map((record) => record.record_id));

  assert.equal(accepted.length, 39);
  assert.equal(new Set(accepted).size, accepted.length);
  assert.ok(accepted.every((id) => /^NEW-[0-9]{4}$/.test(id)));
  assert.ok(accepted.every((id) => !blocked.has(id)));
  assert.ok(!accepted.includes("NEW-0010"));
  assert.ok(!accepted.includes("NEW-0018"));
  assert.ok(!accepted.includes("NEW-0019"));
});

test("topic workflows cannot be mistaken for executable routes", () => {
  const codes = review.topic_workflows.map((workflow) => workflow.workflow_code);
  const steps = review.topic_workflows.flatMap((workflow) => workflow.source_step_ids);

  assert.equal(new Set(codes).size, codes.length);
  assert.equal(new Set(steps).size, steps.length);
  assert.ok(review.topic_workflows.every((workflow) => workflow.status === "blocked"));
  assert.ok(review.topic_workflows.every((workflow) => workflow.topic_type_code === null));
  assert.ok(
    review.topic_workflows.every((workflow) =>
      workflow.missing_requirements.includes("topic_type_code") &&
      workflow.missing_requirements.includes("outcome_transitions")),
  );
  assert.ok(codes.every((code) => !code.startsWith("WFL-MTG-")));
});

test("meeting and decision operations are separated from topic workflows", () => {
  const policies = review.operational_policies;
  const codes = policies.map((policy) => policy.policy_code);
  const recurrence = policies.filter((policy) => policy.policy_kind === "recurrence");

  assert.equal(new Set(codes).size, codes.length);
  assert.equal(recurrence.length, 4);
  assert.ok(policies.every((policy) => policy.status === "draft_model_ready"));
  assert.ok(codes.includes("WFL-DEAN-DEPT-MINUTES"));
  assert.ok(codes.includes("WFL-MTG-OBJECTION"));
  assert.ok(codes.includes("WFL-MTG-EXECUTION"));
});

test("known spreadsheet blockers remain explicit", () => {
  const blockers = new Map(
    review.blocked_records.map((record) => [record.record_id, record.reason_code]),
  );

  assert.equal(blockers.get("NEW-0010"), "duplicate_topic_requires_merge");
  assert.equal(blockers.get("NEW-0018"), "missing_clause");
  assert.equal(blockers.get("NEW-0019"), "missing_clause");
  assert.equal(blockers.get("R-PG-02"), "missing_authority_link");
});
