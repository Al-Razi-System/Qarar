import assert from "node:assert/strict";
import test from "node:test";
import { dispatchBatch, loadConfig } from "./notification-dispatcher.mjs";

const productionLikeEnv = {
  QARAR_OUTBOX_DISPATCHER_ENABLED: "true",
  QARAR_OUTBOX_REQUIRED: "true",
  QARAR_SUPABASE_URL: "http://kong:8000",
  QARAR_SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  QARAR_OUTBOX_WEBHOOK_URL: "https://notifications.internal.example/dispatch",
  QARAR_OUTBOX_WEBHOOK_TOKEN: "a".repeat(32),
};

test("disabled dispatcher is fail-closed and performs no RPC or webhook call", async () => {
  const config = loadConfig({ QARAR_OUTBOX_DISPATCHER_ENABLED: "false" });
  const summary = await dispatchBatch({
    config,
    rpc: async () => assert.fail("disabled dispatcher must not call RPC"),
    deliveryFetch: async () => assert.fail("disabled dispatcher must not call webhook"),
  });
  assert.deepEqual(summary, { claimed: 0, delivered: 0, deliveryFailures: 0, disabled: true });
});

test("enabled dispatcher requires HTTPS webhook and a strong token", () => {
  assert.throws(
    () => loadConfig({ ...productionLikeEnv, QARAR_OUTBOX_WEBHOOK_URL: "http://mailer.local" }),
    /HTTPS URL/,
  );
  assert.throws(
    () => loadConfig({ ...productionLikeEnv, QARAR_OUTBOX_WEBHOOK_TOKEN: "short" }),
    /at least 32 characters/,
  );
});

test("dispatcher claims, posts an idempotent envelope, and acknowledges only after a 2xx response", async () => {
  const config = loadConfig(productionLikeEnv);
  const calls = [];
  const event = {
    id: "11111111-1111-1111-1111-111111111111",
    organization_id: "22222222-2222-2222-2222-222222222222",
    aggregate_type: "meeting",
    aggregate_id: "33333333-3333-3333-3333-333333333333",
    event_type: "meeting.invitation.requested",
    payload: { recipient_user_id: "44444444-4444-4444-4444-444444444444" },
    deduplication_key: "meeting-invitation:333:444",
    attempts: 1,
    lock_token: "55555555-5555-5555-5555-555555555555",
    lease_expires_at: "2026-08-16T01:10:00.000Z",
  };
  const rpc = async (name, payload) => {
    calls.push({ name, payload });
    if (name === "service_claim_notification_outbox") return [event];
    if (name === "service_acknowledge_notification_outbox") return { acknowledged: true };
    assert.fail(`unexpected RPC ${name}`);
  };
  let webhookRequest;
  const summary = await dispatchBatch({
    config,
    rpc,
    newUuid: () => "66666666-6666-6666-6666-666666666666",
    deliveryFetch: async (url, request) => {
      webhookRequest = { url, request };
      return new Response(null, { status: 202 });
    },
  });

  assert.deepEqual(summary, { claimed: 1, delivered: 1, deliveryFailures: 0, disabled: false });
  assert.equal(webhookRequest.url, productionLikeEnv.QARAR_OUTBOX_WEBHOOK_URL);
  assert.equal(webhookRequest.request.headers["x-qarar-delivery-id"], event.id);
  assert.equal(webhookRequest.request.headers["x-qarar-deduplication-key"], event.deduplication_key);
  assert.equal(JSON.parse(webhookRequest.request.body).event_id, event.id);
  assert.deepEqual(calls.map(({ name }) => name), [
    "service_claim_notification_outbox",
    "service_acknowledge_notification_outbox",
  ]);
});

test("non-2xx webhook responses record a retryable failure without acknowledging", async () => {
  const config = loadConfig(productionLikeEnv);
  const calls = [];
  const event = {
    id: "77777777-7777-7777-7777-777777777777",
    organization_id: "22222222-2222-2222-2222-222222222222",
    aggregate_type: "topic",
    aggregate_id: "33333333-3333-3333-3333-333333333333",
    event_type: "governance.workflow.started",
    payload: {},
    deduplication_key: "workflow-started:333",
    attempts: 1,
    lock_token: "88888888-8888-8888-8888-888888888888",
    lease_expires_at: "2026-08-16T01:10:00.000Z",
  };
  const summary = await dispatchBatch({
    config,
    rpc: async (name, payload) => {
      calls.push({ name, payload });
      if (name === "service_claim_notification_outbox") return [event];
      if (name === "service_fail_notification_outbox") return { accepted: true, status: "failed" };
      assert.fail(`unexpected RPC ${name}`);
    },
    deliveryFetch: async () => new Response(null, { status: 503 }),
  });

  assert.deepEqual(summary, { claimed: 1, delivered: 0, deliveryFailures: 1, disabled: false });
  assert.deepEqual(calls.map(({ name }) => name), [
    "service_claim_notification_outbox",
    "service_fail_notification_outbox",
  ]);
  assert.equal(calls[1].payload.p_error, "webhook_http_503");
});
