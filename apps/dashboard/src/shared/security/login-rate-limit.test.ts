import { describe, expect, it, vi } from "vitest";
import {
  enforceLoginRateLimit,
  getLoginRateLimitConfig,
  type LoginRateLimitConfig,
  type LoginRateLimitStore,
} from "./login-rate-limit";

const environment = {
  QARAR_LOGIN_RATE_LIMIT_REDIS_HOST: "login-rate-limit-redis",
  QARAR_LOGIN_RATE_LIMIT_REDIS_PORT: "6379",
  QARAR_LOGIN_RATE_LIMIT_REDIS_PASSWORD: "r".repeat(32),
  QARAR_LOGIN_RATE_LIMIT_HMAC_SECRET: "h".repeat(32),
  QARAR_LOGIN_RATE_LIMIT_CLIENT_IP_HEADER: "x-qarar-client-ip",
  QARAR_LOGIN_RATE_LIMIT_EMAIL_MAX_ATTEMPTS: "5",
  QARAR_LOGIN_RATE_LIMIT_CLIENT_MAX_ATTEMPTS: "20",
  QARAR_LOGIN_RATE_LIMIT_GLOBAL_MAX_ATTEMPTS: "300",
  QARAR_LOGIN_RATE_LIMIT_WINDOW_SECONDS: "900",
  QARAR_LOGIN_RATE_LIMIT_GLOBAL_WINDOW_SECONDS: "60",
};

function config(): LoginRateLimitConfig {
  const result = getLoginRateLimitConfig(environment);
  if (!result) throw new Error("Expected valid rate-limit test configuration");
  return result;
}

function request(headers: HeadersInit = {}) {
  return new Request("https://admin.example.gov/api/auth/login", { headers });
}

describe("login rate-limit configuration", () => {
  it("يرفض إعدادًا يثق برأس forwarded قابل للتزوير", () => {
    expect(getLoginRateLimitConfig({
      ...environment,
      QARAR_LOGIN_RATE_LIMIT_CLIENT_IP_HEADER: "x-forwarded-for",
    })).toBeNull();
  });

  it("يرفض كلمة Redis غير الآمنة لـ YAML", () => {
    expect(getLoginRateLimitConfig({
      ...environment,
      QARAR_LOGIN_RATE_LIMIT_REDIS_PASSWORD: "unsafe:password",
    })).toBeNull();
  });

  it("يفرض فصل سر Redis عن مفتاح HMAC", () => {
    expect(getLoginRateLimitConfig({
      ...environment,
      QARAR_LOGIN_RATE_LIMIT_HMAC_SECRET: environment.QARAR_LOGIN_RATE_LIMIT_REDIS_PASSWORD,
    })).toBeNull();
  });
});

describe("enforceLoginRateLimit", () => {
  it("لا يستخدم X-Forwarded-For ولا يصل إلى Redis دون الرأس الداخلي", async () => {
    const store: LoginRateLimitStore = { increment: vi.fn() };

    await expect(enforceLoginRateLimit(
      request({ "x-forwarded-for": "203.0.113.40" }),
      "admin@example.gov",
      config(),
      store,
    )).resolves.toEqual({ state: "identity_missing" });
    expect(store.increment).not.toHaveBeenCalled();
  });

  it("ينشئ مفاتيح HMAC بلا بريد أو IP خام ويقبل الحدود السليمة", async () => {
    let receivedKeys: string[] = [];
    const store: LoginRateLimitStore = {
      increment: async (buckets) => {
        receivedKeys = buckets.map((bucket) => bucket.key);
        return buckets.map(() => ({ count: 1, ttlSeconds: 900 }));
      },
    };

    await expect(enforceLoginRateLimit(
      request({ "x-qarar-client-ip": "2001:db8::7" }),
      "admin@example.gov",
      config(),
      store,
    )).resolves.toEqual({ state: "allowed", clientIp: "2001:db8::7" });

    expect(receivedKeys).toHaveLength(3);
    expect(receivedKeys.join(" ")).not.toContain("admin@example.gov");
    expect(receivedKeys.join(" ")).not.toContain("2001:db8::7");
    expect(receivedKeys[2]).toBe("qarar:login-rate-limit:v1:global");
  });

  it("يعيد 429 مع أطول TTL عند استنفاد أي عداد", async () => {
    const store: LoginRateLimitStore = {
      increment: async () => [
        { count: 6, ttlSeconds: 120 },
        { count: 21, ttlSeconds: 300 },
        { count: 1, ttlSeconds: 60 },
      ],
    };

    await expect(enforceLoginRateLimit(
      request({ "x-qarar-client-ip": "203.0.113.41" }),
      "admin@example.gov",
      config(),
      store,
    )).resolves.toEqual({ state: "limited", retryAfterSeconds: 300 });
  });

  it("يفشل مغلقًا عند تعذر مخزن Redis", async () => {
    const store: LoginRateLimitStore = {
      increment: async () => { throw new Error("redis unavailable"); },
    };

    await expect(enforceLoginRateLimit(
      request({ "x-qarar-client-ip": "203.0.113.42" }),
      "admin@example.gov",
      config(),
      store,
    )).resolves.toEqual({ state: "unavailable" });
  });
});
