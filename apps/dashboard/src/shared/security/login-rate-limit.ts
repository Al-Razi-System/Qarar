import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { createClient } from "redis";

type Environment = Record<string, string | undefined>;

const TRUSTED_CLIENT_IP_HEADER = "x-qarar-client-ip";
const CONNECT_TIMEOUT_MS = 1_000;
const RATE_LIMIT_INCREMENT_SCRIPT = `
  local response = {}
  for index, key in ipairs(KEYS) do
    local count = redis.call("INCR", key)
    if count == 1 then
      redis.call("EXPIRE", key, tonumber(ARGV[index]))
    end
    table.insert(response, count)
    table.insert(response, redis.call("TTL", key))
  end
  return response
`;

export type LoginRateLimitConfig = {
  redisHost: string;
  redisPort: number;
  redisPassword: string;
  hmacSecret: string;
  emailMaxAttempts: number;
  clientMaxAttempts: number;
  globalMaxAttempts: number;
  windowSeconds: number;
  globalWindowSeconds: number;
};

type RateLimitBucket = {
  key: string;
  limit: number;
  windowSeconds: number;
};

type RateLimitUsage = {
  count: number;
  ttlSeconds: number;
};

export type LoginRateLimitStore = {
  increment(buckets: readonly RateLimitBucket[]): Promise<RateLimitUsage[]>;
};

export type LoginRateLimitResult =
  | { state: "allowed"; clientIp: string }
  | { state: "limited"; retryAfterSeconds: number }
  | { state: "identity_missing" }
  | { state: "unavailable" };

function readBoundedInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number | null {
  if (!value?.trim()) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) return null;
  return parsed;
}

function isSafeRedisPassword(value: string): boolean {
  // This credential is also interpolated into Kong's declarative YAML. Keeping
  // it base64url-safe prevents a secret from changing the YAML document.
  return /^[A-Za-z0-9_-]{32,}$/.test(value);
}

/**
 * Production has no implicit limiter configuration. It must explicitly name
 * the trusted proxy header and a shared Redis backend so multiple dashboard
 * replicas always see the same counters.
 */
export function getLoginRateLimitConfig(
  environment: Environment = process.env,
): LoginRateLimitConfig | null {
  const redisHost = environment.QARAR_LOGIN_RATE_LIMIT_REDIS_HOST?.trim();
  const redisPassword = environment.QARAR_LOGIN_RATE_LIMIT_REDIS_PASSWORD?.trim();
  const hmacSecret = environment.QARAR_LOGIN_RATE_LIMIT_HMAC_SECRET?.trim();
  const clientIpHeader = environment.QARAR_LOGIN_RATE_LIMIT_CLIENT_IP_HEADER?.trim().toLowerCase();

  if (
    !redisHost ||
    !/^[A-Za-z0-9][A-Za-z0-9.-]{0,252}$/.test(redisHost) ||
    !redisPassword ||
    !isSafeRedisPassword(redisPassword) ||
    !hmacSecret ||
    hmacSecret.length < 32 ||
    hmacSecret === redisPassword ||
    clientIpHeader !== TRUSTED_CLIENT_IP_HEADER
  ) {
    return null;
  }

  const redisPort = readBoundedInteger(
    environment.QARAR_LOGIN_RATE_LIMIT_REDIS_PORT,
    6379,
    1,
    65_535,
  );
  const emailMaxAttempts = readBoundedInteger(
    environment.QARAR_LOGIN_RATE_LIMIT_EMAIL_MAX_ATTEMPTS,
    5,
    1,
    20,
  );
  const clientMaxAttempts = readBoundedInteger(
    environment.QARAR_LOGIN_RATE_LIMIT_CLIENT_MAX_ATTEMPTS,
    20,
    1,
    100,
  );
  const globalMaxAttempts = readBoundedInteger(
    environment.QARAR_LOGIN_RATE_LIMIT_GLOBAL_MAX_ATTEMPTS,
    300,
    10,
    10_000,
  );
  const windowSeconds = readBoundedInteger(
    environment.QARAR_LOGIN_RATE_LIMIT_WINDOW_SECONDS,
    900,
    60,
    3_600,
  );
  const globalWindowSeconds = readBoundedInteger(
    environment.QARAR_LOGIN_RATE_LIMIT_GLOBAL_WINDOW_SECONDS,
    60,
    10,
    3_600,
  );

  if (
    redisPort === null ||
    emailMaxAttempts === null ||
    clientMaxAttempts === null ||
    globalMaxAttempts === null ||
    windowSeconds === null ||
    globalWindowSeconds === null
  ) {
    return null;
  }

  return {
    redisHost,
    redisPort,
    redisPassword,
    hmacSecret,
    emailMaxAttempts,
    clientMaxAttempts,
    globalMaxAttempts,
    windowSeconds,
    globalWindowSeconds,
  };
}

function hmacKey(secret: string, namespace: string, value: string): string {
  return `qarar:login-rate-limit:v1:${namespace}:${createHmac("sha256", secret)
    .update(value, "utf8")
    .digest("base64url")}`;
}

function trustedClientIp(request: Request): string | null {
  const candidate = request.headers.get(TRUSTED_CLIENT_IP_HEADER);
  if (!candidate || candidate.includes(",") || isIP(candidate) === 0) return null;
  return candidate.toLowerCase();
}

function createBuckets(
  config: LoginRateLimitConfig,
  email: string,
  clientIp: string,
): RateLimitBucket[] {
  return [
    {
      key: hmacKey(config.hmacSecret, "email", email),
      limit: config.emailMaxAttempts,
      windowSeconds: config.windowSeconds,
    },
    {
      key: hmacKey(config.hmacSecret, "client", clientIp),
      limit: config.clientMaxAttempts,
      windowSeconds: config.windowSeconds,
    },
    {
      // This bucket limits distributed credential-stuffing across arbitrary
      // email/IP combinations. It contains no personal identifier.
      key: "qarar:login-rate-limit:v1:global",
      limit: config.globalMaxAttempts,
      windowSeconds: config.globalWindowSeconds,
    },
  ];
}

type RedisClient = {
  readonly isReady: boolean;
  connect(): Promise<unknown>;
  destroy(): void;
  on(event: "error", listener: (error: Error) => void): unknown;
  sendCommand<T = unknown>(args: readonly string[]): Promise<T>;
};

let redisClientSlot: {
  fingerprint: string;
  client: RedisClient;
  connecting?: Promise<void>;
} | null = null;

function clientFingerprint(config: LoginRateLimitConfig): string {
  return `${config.redisHost}:${config.redisPort}:${config.redisPassword}`;
}

async function getRedisClient(config: LoginRateLimitConfig): Promise<RedisClient> {
  const fingerprint = clientFingerprint(config);
  if (redisClientSlot?.fingerprint !== fingerprint) {
    redisClientSlot?.client.destroy();
    const client = createClient({
      password: config.redisPassword,
      socket: {
        host: config.redisHost,
        port: config.redisPort,
        connectTimeout: CONNECT_TIMEOUT_MS,
        reconnectStrategy: false,
      },
      disableOfflineQueue: true,
    });
    // A command call handles the failure explicitly. This listener prevents an
    // EventEmitter error from taking down the dashboard process first.
    client.on("error", () => undefined);
    redisClientSlot = { fingerprint, client };
  }

  if (!redisClientSlot) throw new Error("Redis rate-limit client was not initialized");
  const slot = redisClientSlot;
  const client = slot.client;
  if (!client.isReady) {
    if (!slot.connecting) {
      slot.connecting = client.connect().then(() => undefined).finally(() => {
        if (redisClientSlot === slot) slot.connecting = undefined;
      });
    }
    await slot.connecting;
  }
  if (!client.isReady) throw new Error("Redis rate-limit client is not ready");
  return client;
}

function clearRedisClient(client: RedisClient) {
  if (redisClientSlot?.client === client) redisClientSlot = null;
  client.destroy();
}

async function incrementRedisBuckets(
  config: LoginRateLimitConfig,
  buckets: readonly RateLimitBucket[],
): Promise<RateLimitUsage[]> {
  let client: RedisClient | null = null;
  try {
    client = await getRedisClient(config);
    const response = await client.sendCommand<unknown>([
      "EVAL",
      RATE_LIMIT_INCREMENT_SCRIPT,
      String(buckets.length),
      ...buckets.map((bucket) => bucket.key),
      ...buckets.map((bucket) => String(bucket.windowSeconds)),
    ]);
    if (!Array.isArray(response) || response.length !== buckets.length * 2) {
      throw new Error("Unexpected Redis rate-limit response");
    }

    return buckets.map((_, index) => {
      const count = Number(response[index * 2]);
      const ttlSeconds = Number(response[index * 2 + 1]);
      if (!Number.isInteger(count) || count < 1 || !Number.isInteger(ttlSeconds)) {
        throw new Error("Invalid Redis rate-limit response");
      }
      return { count, ttlSeconds: Math.max(1, ttlSeconds) };
    });
  } catch (error) {
    if (client) {
      clearRedisClient(client);
    } else if (redisClientSlot?.fingerprint === clientFingerprint(config)) {
      clearRedisClient(redisClientSlot.client);
    }
    throw error;
  }
}

export async function enforceLoginRateLimit(
  request: Request,
  email: string,
  config: LoginRateLimitConfig,
  store: LoginRateLimitStore = { increment: (buckets) => incrementRedisBuckets(config, buckets) },
): Promise<LoginRateLimitResult> {
  const clientIp = trustedClientIp(request);
  if (!clientIp) return { state: "identity_missing" };

  try {
    const buckets = createBuckets(config, email, clientIp);
    const usages = await store.increment(buckets);
    if (usages.length !== buckets.length) return { state: "unavailable" };

    const exhausted = usages
      .map((usage, index) => ({ usage, bucket: buckets[index] }))
      .filter(({ usage, bucket }) => usage.count > bucket.limit);
    if (!exhausted.length) return { state: "allowed", clientIp };

    return {
      state: "limited",
      retryAfterSeconds: Math.max(...exhausted.map(({ usage }) => usage.ttlSeconds)),
    };
  } catch {
    // The route deliberately reveals no backend details and does not fall back
    // to a per-process counter when the shared store is unavailable.
    return { state: "unavailable" };
  }
}

export function isProductionEnvironment(environment: Environment = process.env): boolean {
  return environment.NODE_ENV === "production";
}
