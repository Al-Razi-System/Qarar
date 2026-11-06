import { randomUUID } from "node:crypto";
import { createClient } from "redis";
import { getLoginRateLimitConfig } from "@/shared/security/login-rate-limit";

export type MeetingEvent = {
  kind: "room" | "voting";
  scope?: "room" | "broadcast";
  revision: number;
  source: string;
};

type Listener = (event: MeetingEvent) => void;
type RedisClient = ReturnType<typeof createClient>;
type Runtime = typeof globalThis & {
  qararMeetingPublisher?: RedisClient;
  qararMeetingPublisherConnecting?: Promise<void>;
  qararMeetingSubscriber?: RedisClient;
  qararMeetingSubscriberConnecting?: Promise<void>;
  qararMeetingEventListeners?: Map<string, Set<Listener>>;
  qararMeetingSubscribedChannels?: Set<string>;
  qararMeetingEventPollers?: Map<string, ReturnType<typeof setInterval>>;
  qararMeetingEventRevisions?: Map<string, number>;
};

const runtime = globalThis as Runtime;
// Deliberately module-local. Next may isolate route bundles while keeping one
// global object; each isolated publisher/subscriber must still accept the
// other's Redis message.
const source = randomUUID();
const listeners = runtime.qararMeetingEventListeners ??= new Map();
const subscribedChannels = runtime.qararMeetingSubscribedChannels ??= new Set();
const pollers = runtime.qararMeetingEventPollers ??= new Map();
const deliveredRevisions = runtime.qararMeetingEventRevisions ??= new Map();
const CONNECT_TIMEOUT_MS = 1_000;

function redisOptions() {
  const config = getLoginRateLimitConfig();
  if (!config) return null;
  return {
    password: config.redisPassword,
    socket: {
      host: config.redisHost,
      port: config.redisPort,
      connectTimeout: CONNECT_TIMEOUT_MS,
      reconnectStrategy: false as const,
    },
    disableOfflineQueue: true,
  };
}

async function connectedClient(kind: "publisher" | "subscriber") {
  const options = redisOptions();
  if (!options) return null;
  const clientKey = kind === "publisher" ? "qararMeetingPublisher" : "qararMeetingSubscriber";
  const connectingKey = kind === "publisher" ? "qararMeetingPublisherConnecting" : "qararMeetingSubscriberConnecting";
  let client = runtime[clientKey];
  if (!client) {
    client = createClient(options);
    client.on("error", () => undefined);
    runtime[clientKey] = client;
  }
  if (!client.isReady) {
    runtime[connectingKey] ??= client.connect().then(() => undefined).finally(() => {
      runtime[connectingKey] = undefined;
    });
    await runtime[connectingKey];
  }
  return client;
}

function channel(meetingId: string) {
  return `qarar:meeting-events:v1:${meetingId}`;
}

function revisionKey(meetingId: string) {
  return `qarar:meeting-events:v1:revision:${meetingId}`;
}

function latestEventKey(meetingId: string) {
  return `qarar:meeting-events:v1:latest:${meetingId}`;
}

function deliver(meetingId: string, event: MeetingEvent) {
  if (!Number.isSafeInteger(event.revision) || event.revision < 1) return;
  if (event.kind !== "room" && event.kind !== "voting") return;
  if (event.kind === "room" && event.scope !== "room" && event.scope !== "broadcast") return;
  if (event.revision <= (deliveredRevisions.get(meetingId) ?? 0)) return;
  deliveredRevisions.set(meetingId, event.revision);
  for (const listener of listeners.get(meetingId) ?? []) listener(event);
}

export async function publishMeetingEvent(
  meetingId: string,
  event: { kind: MeetingEvent["kind"]; scope?: MeetingEvent["scope"] },
) {
  const client = await connectedClient("publisher");
  if (!client) return;
  const key = revisionKey(meetingId);
  const revision = await client.incr(key);
  await client.expire(key, 24 * 60 * 60);
  const message = JSON.stringify({ ...event, revision, source } satisfies MeetingEvent);
  await client.set(latestEventKey(meetingId), message, { EX: 24 * 60 * 60 });
  await client.publish(channel(meetingId), message);
}

async function ensureSubscribed(meetingId: string) {
  const name = channel(meetingId);
  if (subscribedChannels.has(name)) return;
  const client = await connectedClient("subscriber");
  if (!client || subscribedChannels.has(name)) return;
  await client.subscribe(name, (message) => {
    let event: MeetingEvent;
    try { event = JSON.parse(message) as MeetingEvent; } catch { return; }
    // Do not discard a message by process identity. Next can share this module
    // identity across isolated route bundles whose listener registries do not
    // share delivery; the Redis revision is the deduplication boundary.
    deliver(meetingId, event);
  });
  subscribedChannels.add(name);
}

/**
 * Subscribes this server process to changes published by other dashboard
 * processes. Failure is deliberately non-fatal: the authorised SSE snapshot
 * and periodic read remain the safety net.
 */
export function watchMeetingEvents(meetingId: string, listener: Listener) {
  const meetingListeners = listeners.get(meetingId) ?? new Set<Listener>();
  meetingListeners.add(listener);
  listeners.set(meetingId, meetingListeners);
  void ensureSubscribed(meetingId).catch(() => undefined);
  if (!pollers.has(meetingId)) {
    const poll = setInterval(() => {
      void connectedClient("publisher").then(async client => {
        const message = await client?.get(latestEventKey(meetingId));
        if (!message) return;
        try { deliver(meetingId, JSON.parse(message) as MeetingEvent); } catch { /* Ignore malformed infrastructure data. */ }
      }).catch(() => undefined);
    }, 500);
    poll.unref?.();
    pollers.set(meetingId, poll);
  }
  return () => {
    meetingListeners.delete(listener);
    if (meetingListeners.size) return;
    listeners.delete(meetingId);
    const poller = pollers.get(meetingId);
    if (poller) clearInterval(poller);
    pollers.delete(meetingId);
    deliveredRevisions.delete(meetingId);
    const name = channel(meetingId);
    const client = runtime.qararMeetingSubscriber;
    if (client?.isReady && subscribedChannels.delete(name)) void client.unsubscribe(name).catch(() => undefined);
  };
}
