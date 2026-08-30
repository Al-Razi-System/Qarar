import assert from "node:assert/strict";
import test from "node:test";
import {
  BootstrapInputError,
  BootstrapOperationError,
  executeBootstrap,
  expectedConfirmation,
  normalizeBootstrapConfiguration,
  parseArguments,
  resolveServiceBaseUrl,
  validateExecutionApproval,
} from "./bootstrap-initial-admin.mjs";

const configuration = normalizeBootstrapConfiguration({
  organization_code: "demo_university",
  auth_user_id: "11111111-1111-4111-8111-111111111111",
  email: "First.Admin@example.edu",
  full_name_ar: "المدير الأول",
  full_name_en: "First Administrator",
  employee_no: "EMP-001",
  mobile: "+966500000000",
  job_title: "Platform Administrator",
  approval_reference: "CHG-20260816-001",
});

const approvedEnvironment = {
  QARAR_BOOTSTRAP_APPROVED: "true",
  QARAR_BOOTSTRAP_APPROVAL_ID: configuration.approval_reference,
};

const response = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json" },
});

test("configuration rejects unreviewed fields so a secret cannot be placed in the input file", () => {
  assert.throws(
    () => normalizeBootstrapConfiguration({ ...configuration, service_role_key: "do-not-store-secrets-here" }),
    BootstrapInputError,
  );
});

test("execution requires the exact typed confirmation and separately injected approval id", () => {
  assert.throws(
    () => validateExecutionApproval(configuration, "BOOTSTRAP demo_university wrong", approvedEnvironment),
    BootstrapInputError,
  );
  assert.throws(
    () => validateExecutionApproval(configuration, expectedConfirmation(configuration), {
      ...approvedEnvironment,
      QARAR_BOOTSTRAP_APPROVAL_ID: "CHG-OTHER-001",
    }),
    BootstrapInputError,
  );
  assert.doesNotThrow(() => validateExecutionApproval(
    configuration,
    expectedConfirmation(configuration),
    approvedEnvironment,
  ));
});

test("service URL is constrained to an HTTPS origin before a credential can be used", () => {
  assert.equal(resolveServiceBaseUrl("https://api.example.gov"), "https://api.example.gov");
  assert.throws(() => resolveServiceBaseUrl("https://api.example.gov/internal"), BootstrapInputError);
  assert.throws(() => resolveServiceBaseUrl("http://api.example.gov"), BootstrapInputError);
});

test("dry run verifies the pre-provisioned confirmed Auth identity and makes no bootstrap write", async () => {
  const calls = [];
  const result = await executeBootstrap({
    configuration,
    baseUrl: "https://api.example.gov",
    serviceRoleKey: "service-role-key-used-only-in-memory",
    dryRun: true,
    fetchImplementation: async (url, options) => {
      calls.push({ url, options });
      return response({ user: {
        id: configuration.auth_user_id,
        email: configuration.email,
        email_confirmed_at: "2026-08-16T00:00:00Z",
        banned_until: null,
      } });
    },
  });

  assert.equal(result.dry_run, true);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/auth\/v1\/admin\/users\//);
});

test("bootstrap refuses an unconfirmed or mismatched Auth identity before the privileged RPC", async () => {
  for (const user of [
    { id: configuration.auth_user_id, email: configuration.email, email_confirmed_at: null },
    { id: configuration.auth_user_id, email: "different@example.edu", email_confirmed_at: "2026-08-16T00:00:00Z" },
  ]) {
    let calls = 0;
    await assert.rejects(
      () => executeBootstrap({
        configuration,
        baseUrl: "https://api.example.gov",
        serviceRoleKey: "service-role-key-used-only-in-memory",
        dryRun: false,
        fetchImplementation: async () => {
          calls += 1;
          return response({ user });
        },
      }),
      BootstrapOperationError,
    );
    assert.equal(calls, 1);
  }
});

test("the production operation calls only the Auth lookup then the service-only RPC", async () => {
  const calls = [];
  const result = await executeBootstrap({
    configuration,
    baseUrl: "https://api.example.gov",
    serviceRoleKey: "service-role-key-used-only-in-memory",
    dryRun: false,
    fetchImplementation: async (url, options) => {
      calls.push({ url, options });
      if (url.includes("/auth/v1/admin/users/")) {
        return response({ user: {
          id: configuration.auth_user_id,
          email: configuration.email,
          email_confirmed_at: "2026-08-16T00:00:00Z",
          banned_until: null,
        } });
      }
      return response({
        user_id: configuration.auth_user_id,
        organization_code: configuration.organization_code,
        approval_reference: configuration.approval_reference,
        is_system_admin: true,
      });
    },
  });

  assert.equal(result.is_system_admin, true);
  assert.equal(calls.length, 2);
  assert.match(calls[1].url, /\/rest\/v1\/rpc\/service_bootstrap_organization_admin$/);
  assert.equal(calls[1].options.headers.Authorization, "Bearer service-role-key-used-only-in-memory");
  const body = JSON.parse(calls[1].options.body);
  assert.equal(body.p_approval_reference, configuration.approval_reference);
  assert.equal(body.p_auth_user_id, configuration.auth_user_id);
});

test("CLI parser exposes no secret-valued option", () => {
  assert.deepEqual(
    parseArguments(["--config", "approved.json", "--confirm", expectedConfirmation(configuration), "--dry-run"]),
    { configPath: "approved.json", confirmation: expectedConfirmation(configuration), dryRun: true, help: false },
  );
  assert.throws(
    () => parseArguments(["--service-role-key", "secret"]),
    BootstrapInputError,
  );
});
