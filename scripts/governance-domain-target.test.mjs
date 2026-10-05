import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const contract = JSON.parse(
  await readFile(new URL("../data/contracts/governance-domain-target.v1.json", import.meta.url), "utf8"),
);

test("target contract cannot activate or migrate production data", () => {
  assert.equal(contract.status, "design_only");
  assert.equal(contract.activation_allowed, false);
  assert.equal(contract.migration_allowed, false);
  assert.equal(contract.compatibility.production_data_write, false);
});

test("topic type owns workflow while classification does not", () => {
  assert.equal(contract.topic_type.selected_by_submitter, true);
  assert.equal(contract.topic_type.determines_workflow, true);
  assert.equal(contract.topic_type.classification_only_determines_workflow, false);
  assert.ok(contract.workflow.reverse_outcomes.includes("refer_to_lower_council"));
  assert.equal(contract.workflow.topic_creation_requires_finality_rule, true);
});

test("contextual human references remain display identifiers", () => {
  assert.equal(contract.identity.internal_key, "uuid");
  assert.equal(contract.identity.user_supplied_reference_forbidden, true);
  assert.ok(contract.identity.invariants.includes("human_reference_is_not_a_foreign_key"));
  assert.ok(contract.identity.invariants.includes("renaming_context_does_not_change_existing_references"));
  assert.match(contract.identity.examples.topic_attachment, /^ATT-TOP-/);
});

test("prior-route approval belongs to current destination chair", () => {
  assert.equal(contract.prior_stage_claim.primary_reviewer, "current_destination_council_chair");
  assert.equal(contract.prior_stage_claim.self_approval_forbidden, true);
  assert.deepEqual(contract.prior_stage_claim.oversight_roles, ["governance_admin", "system_admin"]);
});

test("meeting recurrence cannot create a live meeting implicitly", () => {
  assert.equal(contract.meeting.recurrence.rule_is_not_a_meeting, true);
  assert.equal(contract.meeting.recurrence.due_occurrence_is_not_in_progress, true);
  assert.equal(contract.meeting.recurrence.in_progress_requires_explicit_start, true);
  assert.equal(contract.meeting.recurrence.agenda_item_belongs_to_exactly_one_meeting, true);
  assert.equal(contract.meeting.custom.requires_council, false);
});

test("execution assignments support all required assignee contexts", () => {
  assert.deepEqual(contract.aggregates.decision_execution.assignee_target_types, [
    "user", "council", "administrative_unit", "department", "faculty",
  ]);
  assert.equal(contract.execution_assignment.assignee_acknowledgement_required, true);
  assert.equal(contract.execution_assignment.completion_requires_report, true);
  assert.equal(contract.execution_assignment.topic_submitter_can_read_status, true);
});

test("topic and meeting schedules are distinct and deduplicated", () => {
  assert.ok(contract.scheduling.meeting_rule_types.includes("monthly_week"));
  assert.ok(contract.scheduling.topic_rule_types.includes("bounded_recurrence"));
  assert.deepEqual(contract.scheduling.duplicate_due_item_prevention_key, [
    "topic_schedule_policy_version_id", "period_key",
  ]);
});
