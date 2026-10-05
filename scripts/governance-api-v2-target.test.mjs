import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const contract = JSON.parse(
  await readFile(new URL("../data/contracts/governance-api-v2.target.json", import.meta.url), "utf8"),
);

test("API v2 remains unimplemented and unexposed", () => {
  assert.equal(contract.implementation_status, "not_implemented");
  assert.equal(contract.public_exposure_allowed, false);
});

test("write commands never accept generated identity or lifecycle fields", () => {
  const forbidden = ["id", "reference_number", "status", "activation_allowed"];
  const save = contract.commands.save_governance_bundle_draft_v2;
  assert.deepEqual(save.forbidden_inputs, forbidden);
  for (const [name, command] of Object.entries(contract.commands)) {
    if (name !== "validate_governance_bundle_v2") {
      assert.ok(command.required_inputs.includes("client_request_id"), name);
    }
  }
});

test("review and activation permissions remain separated", () => {
  assert.equal(contract.commands.save_governance_bundle_draft_v2.permission, "governance.model.edit");
  assert.equal(contract.commands.approve_governance_bundle_v2.permission, "governance.model.approve");
  assert.equal(contract.commands.activate_governance_bundle_v2.permission, "governance.model.activate");
});

test("every public failure has safe Arabic copy and a traceable envelope", () => {
  for (const [code, error] of Object.entries(contract.error_catalog)) {
    assert.match(code, /^[A-Z0-9_]+$/);
    assert.ok(error.http >= 400 && error.http <= 599);
    assert.match(error.ar, /[\u0600-\u06FF]/);
  }
  assert.ok(contract.response_envelope.failure.includes("trace_id"));
  assert.ok(contract.response_envelope.failure.includes("message_ar"));
});
