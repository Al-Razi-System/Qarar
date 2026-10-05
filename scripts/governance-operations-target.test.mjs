import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const contract = JSON.parse(
  await readFile(new URL("../data/contracts/governance-operations-target.v1.json", import.meta.url), "utf8"),
);

test("all target mutations are idempotent, atomic, audited, and traceable", () => {
  const common = contract.common_mutation_contract;
  assert.equal(common.client_request_id_required, true);
  assert.equal(common.atomic, true);
  assert.equal(common.audit_event_required, true);
  assert.equal(common.safe_arabic_error_required, true);
  assert.equal(common.internal_cause_trace_required, true);
  assert.equal(common.double_submit_prevention_required, true);
});

test("prior-stage review is contextual and rejects self approval", () => {
  const operation = contract.operations.review_prior_stage_claim;
  assert.equal(operation.actor, "current_destination_council_chair");
  assert.equal(operation.context, "destination_council");
  assert.ok(operation.preconditions.includes("actor_is_not_requester"));
  assert.ok(operation.failure_codes.includes("NOT_DESTINATION_CHAIR"));
});

test("agenda attachment targets exactly one meeting", () => {
  const operation = contract.operations.attach_agenda_item;
  assert.deepEqual(operation.effects, ["attach_to_exact_meeting_only"]);
  assert.ok(operation.preconditions.includes("topic_is_eligible_for_this_exact_meeting"));
});

test("execution cannot complete without acceptance, report, evidence, and verification", () => {
  const accept = contract.operations.accept_execution_assignment;
  const submit = contract.operations.submit_execution_completion;
  const verify = contract.operations.verify_execution_completion;
  assert.equal(accept.actor, "assignee_representative");
  assert.ok(submit.preconditions.includes("completion_report_present"));
  assert.ok(submit.preconditions.includes("required_evidence_present"));
  assert.equal(verify.actor, "configured_verifier");
});

test("UI failures must be visible where the operation is performed", () => {
  assert.equal(contract.ui_error_contract.display_at_action_location, true);
  assert.equal(contract.ui_error_contract.modal_errors_stay_inside_modal, true);
  assert.equal(contract.ui_error_contract.disabled_action_explains_unmet_requirements, true);
  assert.equal(contract.ui_error_contract.raw_enum_or_sql_forbidden, true);
});
