import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_INTERVAL_MS = 5_000;
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_BATCH_SIZE = 25;
const DEFAULT_LEASE_SECONDS = 600;

function parseBoolean(value, key, defaultValue) {
  if (value === undefined || value === "") return defaultValue;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${key} must be true or false`);
}

function parseBoundedInteger(value, key, defaultValue, minimum, maximum) {
  if (value === undefined || value === "") return defaultValue;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${key} must be an integer between ${minimum} and ${maximum}`);
  }
  return parsed;
}

function requireHttpsWebhook(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("QARAR_OUTBOX_WEBHOOK_URL must be a valid HTTPS URL");
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    throw new Error("QARAR_OUTBOX_WEBHOOK_URL must be an HTTPS URL without credentials");
  }
  return parsed.toString();
}

function requireHttpUrl(value, key) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${key} must be a valid HTTP(S) URL`);
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`${key} must be a valid HTTP(S) URL`);
  }
  return parsed.toString().replace(/\/$/, "");
}

export function loadConfig(env = process.env) {
  const enabled = parseBoolean(
    env.QARAR_OUTBOX_DISPATCHER_ENABLED,
    "QARAR_OUTBOX_DISPATCHER_ENABLED",
    false,
  );
  const required = parseBoolean(
    env.QARAR_OUTBOX_REQUIRED,
    "QARAR_OUTBOX_REQUIRED",
    false,
  );
  const config = {
    enabled,
    required,
    intervalMs: parseBoundedInteger(
      env.QARAR_OUTBOX_DISPATCH_INTERVAL_MS,
      "QARAR_OUTBOX_DISPATCH_INTERVAL_MS",
      DEFAULT_INTERVAL_MS,
      1_000,
      60_000,
    ),
    timeoutMs: parseBoundedInteger(
      env.QARAR_OUTBOX_WEBHOOK_TIMEOUT_MS,
      "QARAR_OUTBOX_WEBHOOK_TIMEOUT_MS",
      DEFAULT_TIMEOUT_MS,
      1_000,
      30_000,
    ),
    batchSize: parseBoundedInteger(
      env.QARAR_OUTBOX_BATCH_SIZE,
      "QARAR_OUTBOX_BATCH_SIZE",
      DEFAULT_BATCH_SIZE,
      1,
      25,
    ),
    leaseSeconds: parseBoundedInteger(
      env.QARAR_OUTBOX_LEASE_SECONDS,
      "QARAR_OUTBOX_LEASE_SECONDS",
      DEFAULT_LEASE_SECONDS,
      60,
      3_600,
    ),
    healthFile: env.QARAR_OUTBOX_HEALTH_FILE ?? "/tmp/qarar-outbox-dispatcher-health.json",
  };

  if (required && !enabled) {
    throw new Error("QARAR_OUTBOX_REQUIRED=true requires QARAR_OUTBOX_DISPATCHER_ENABLED=true");
  }
  if (!enabled) return config;

  if (!env.QARAR_SUPABASE_URL || !env.QARAR_SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("A Supabase URL and service-role key are required for the outbox dispatcher");
  }
  if (!env.QARAR_OUTBOX_WEBHOOK_URL || !env.QARAR_OUTBOX_WEBHOOK_TOKEN) {
    throw new Error("A notification webhook URL and token are required when dispatch is enabled");
  }
  if (env.QARAR_OUTBOX_WEBHOOK_TOKEN.length < 32) {
    throw new Error("QARAR_OUTBOX_WEBHOOK_TOKEN must contain at least 32 characters");
  }

  return {
    ...config,
    supabaseUrl: requireHttpUrl(env.QARAR_SUPABASE_URL, "QARAR_SUPABASE_URL"),
    serviceRoleKey: env.QARAR_SUPABASE_SERVICE_ROLE_KEY,
    webhookUrl: requireHttpsWebhook(env.QARAR_OUTBOX_WEBHOOK_URL),
    webhookToken: env.QARAR_OUTBOX_WEBHOOK_TOKEN,
  };
}

export function createRpcClient({ baseUrl, serviceRoleKey, fetchImpl = fetch }) {
  async function rpc(functionName, body) {
    const response = await fetchImpl(`${baseUrl}/rest/v1/rpc/${functionName}`, {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        authorization: `Bearer ${serviceRoleKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(`rpc_${functionName}_http_${response.status}`);
    }
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  return { rpc };
}

function deliveryEnvelope(event) {
  return {
    event_id: event.id,
    organization_id: event.organization_id,
    aggregate_type: event.aggregate_type,
    aggregate_id: event.aggregate_id,
    event_type: event.event_type,
    payload: event.payload,
    deduplication_key: event.deduplication_key,
    attempt: event.attempts,
    lease_expires_at: event.lease_expires_at,
    dispatched_at: new Date().toISOString(),
  };
}

async function notifyFailure(rpc, event, errorCode) {
  const result = await rpc("service_fail_notification_outbox", {
    p_event_id: event.id,
    p_lock_token: event.lock_token,
    p_error: errorCode.slice(0, 1_000),
  });
  return result?.accepted === true;
}

export async function dispatchBatch({ config, rpc, deliveryFetch = fetch, workerId = randomUUID(), newUuid = randomUUID, logger = console }) {
  if (!config.enabled) {
    return { claimed: 0, delivered: 0, deliveryFailures: 0, disabled: true };
  }

  const events = await rpc("service_claim_notification_outbox", {
    p_worker_id: workerId,
    p_lock_token: newUuid(),
    p_limit: config.batchSize,
    p_lease_seconds: config.leaseSeconds,
  });
  if (!Array.isArray(events)) throw new Error("outbox_claim_returned_non_array");

  let delivered = 0;
  let deliveryFailures = 0;
  for (const event of events) {
    try {
      const response = await deliveryFetch(config.webhookUrl, {
        method: "POST",
        headers: {
          authorization: `Bearer ${config.webhookToken}`,
          "content-type": "application/json",
          "x-qarar-delivery-id": event.id,
          "x-qarar-deduplication-key": event.deduplication_key,
        },
        body: JSON.stringify(deliveryEnvelope(event)),
        signal: AbortSignal.timeout(config.timeoutMs),
      });

      if (!response.ok) {
        deliveryFailures += 1;
        await notifyFailure(rpc, event, `webhook_http_${response.status}`);
        continue;
      }

      const acknowledged = await rpc("service_acknowledge_notification_outbox", {
        p_event_id: event.id,
        p_lock_token: event.lock_token,
      });
      if (acknowledged?.acknowledged === true) {
        delivered += 1;
      } else {
        deliveryFailures += 1;
        logger.warn?.("outbox_acknowledgement_rejected", { eventId: event.id });
      }
    } catch (error) {
      deliveryFailures += 1;
      const errorCode = error?.name === "TimeoutError" ? "webhook_timeout" : "webhook_transport_error";
      try {
        await notifyFailure(rpc, event, errorCode);
      } catch {
        // Do not manufacture a second state transition. The lease reaper will
        // safely recover this event if the failure RPC itself is unavailable.
        logger.error?.("outbox_failure_transition_unavailable", { eventId: event.id });
      }
    }
  }

  return { claimed: events.length, delivered, deliveryFailures, disabled: false };
}

export async function writeHealth(file, payload) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(
    file,
    `${JSON.stringify({ ...payload, updatedAt: new Date().toISOString() })}\n`,
    { mode: 0o600 },
  );
}

const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export async function runWorker({ env = process.env, rpcClientFactory = createRpcClient, deliveryFetch = fetch, workerId = randomUUID(), signal, logger = console } = {}) {
  const config = loadConfig(env);
  const rpc = config.enabled
    ? rpcClientFactory({ baseUrl: config.supabaseUrl, serviceRoleKey: config.serviceRoleKey }).rpc
    : null;

  while (!signal?.aborted) {
    try {
      const summary = config.enabled
        ? await dispatchBatch({ config, rpc, deliveryFetch, workerId, logger })
        : { claimed: 0, delivered: 0, deliveryFailures: 0, disabled: true };
      await writeHealth(config.healthFile, {
        healthy: summary.deliveryFailures === 0,
        enabled: config.enabled,
        required: config.required,
        ...summary,
      });
    } catch (error) {
      logger.error?.("outbox_dispatcher_cycle_failed", { code: error?.message ?? "unknown" });
      await writeHealth(config.healthFile, {
        healthy: false,
        enabled: config.enabled,
        required: config.required,
        claimed: 0,
        delivered: 0,
        deliveryFailures: 1,
      });
    }
    await pause(config.intervalMs);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const controller = new AbortController();
  for (const signalName of ["SIGINT", "SIGTERM"]) {
    process.once(signalName, () => controller.abort());
  }
  runWorker({ signal: controller.signal }).catch((error) => {
    console.error("outbox_dispatcher_startup_failed", { code: error?.message ?? "unknown" });
    process.exitCode = 1;
  });
}
