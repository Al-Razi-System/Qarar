import { afterEach, describe, expect, it, vi } from "vitest";

const { cookieSet, cookies } = vi.hoisted(() => ({
  cookieSet: vi.fn(),
  cookies: vi.fn(),
}));
const { temporaryState, cookieDelete } = vi.hoisted(() => ({ temporaryState: vi.fn(), cookieDelete: vi.fn() }));
vi.mock("@/shared/api/qarar-service", () => ({ qararServiceRpc: temporaryState }));
const { enforceLoginRateLimit, getLoginRateLimitConfig, isProductionEnvironment } = vi.hoisted(() => ({
  enforceLoginRateLimit: vi.fn(),
  getLoginRateLimitConfig: vi.fn(),
  isProductionEnvironment: vi.fn(),
}));

vi.mock("next/headers", () => ({ cookies }));
vi.mock("@/shared/security/login-rate-limit", () => ({
  enforceLoginRateLimit,
  getLoginRateLimitConfig,
  isProductionEnvironment,
}));

import { POST } from "./route";

function loginRequest(headers: HeadersInit = {}) {
  return new Request("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ email: "admin@example.com", password: "password" }),
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  temporaryState.mockResolvedValue({ must_change_password: false });
  getLoginRateLimitConfig.mockReturnValue(null);
  isProductionEnvironment.mockReturnValue(false);
});

describe("POST /api/auth/login", () => {
  it("يعطي جلسة استبدال فقط للحساب المؤقت ولا يستدعي MFA", async () => {
    vi.stubEnv("QARAR_SUPABASE_URL", "http://kong:8000");
    vi.stubEnv("QARAR_SUPABASE_ANON_KEY", "runtime-anon-key");
    cookies.mockResolvedValue({ set: cookieSet, delete: cookieDelete });
    temporaryState.mockResolvedValue({ must_change_password: true, expires_at: "2099-01-01T00:00:00Z" });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ access_token: "temporary", refresh_token: "refresh", expires_in: 3600, user: { id: "user-id" } })));
    vi.stubGlobal("fetch", fetchMock);
    const response = await POST(loginRequest());
    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ password_change_required: true, authenticated: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(cookieSet).toHaveBeenCalledWith("qarar_temporary_access_token", "temporary", expect.objectContaining({ httpOnly: true, maxAge: 900 }));
    expect(cookieSet).not.toHaveBeenCalledWith("qarar_access_token", expect.anything(), expect.anything());
  });
  it("يفرض MFA ولا ينشئ جلسة تطبيق لحساب IAM عند مستوى aal1", async () => {
    vi.stubEnv("QARAR_SUPABASE_URL", "http://kong:8000");
    vi.stubEnv("QARAR_SUPABASE_ANON_KEY", "runtime-anon-key");
    cookies.mockResolvedValue({ set: cookieSet, delete: cookieDelete });
    temporaryState.mockResolvedValue({ must_change_password: false });
    const payload = Buffer.from(JSON.stringify({ aal: "aal1" })).toString("base64url");
    const token = `x.${payload}.x`;
    const fetchMock = vi.fn().mockImplementation((input: string | URL | Request) => Promise.resolve(
      new Response(JSON.stringify(String(input).includes("get_current_user_access_context")
        ? { is_system_admin: false, permissions: ["iam.users.manage"], roles: [] }
        : { access_token: token, refresh_token: "refresh-token", expires_in: 3600, user: { id: "user-id" } }), { status: 200 }),
    ));
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(loginRequest());
    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ mfa_required: true });
    expect(cookieSet).toHaveBeenCalledWith("qarar_mfa_access_token", token, expect.objectContaining({ httpOnly: true, maxAge: 300 }));
    expect(cookieSet).not.toHaveBeenCalledWith("qarar_access_token", expect.anything(), expect.anything());
  });
  it("يرفض الطلب عندما لا تتوفر إعدادات Supabase وقت التشغيل", async () => {
    vi.stubEnv("QARAR_SUPABASE_URL", "");
    vi.stubEnv("QARAR_SUPABASE_ANON_KEY", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(loginRequest());

    expect(response.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("لا يعرض عطل خدمة المصادقة على أنه بيانات دخول خاطئة", async () => {
    vi.stubEnv("QARAR_SUPABASE_URL", "http://kong:8000");
    vi.stubEnv("QARAR_SUPABASE_ANON_KEY", "runtime-anon-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response("Internal Server Error", { status: 500 }),
    ));

    const response = await POST(loginRequest());

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      message: "خدمة الدخول غير متاحة مؤقتًا.",
    });
  });

  it("يستخدم عنوان ومفتاح Supabase المحقونين في وقت التشغيل", async () => {
    vi.stubEnv("QARAR_SUPABASE_URL", "http://kong:8000/");
    vi.stubEnv("QARAR_SUPABASE_ANON_KEY", "runtime-anon-key");
    cookies.mockResolvedValue({ set: cookieSet, delete: cookieDelete });
    const fetchMock = vi.fn().mockImplementation((input: string | URL | Request) =>
      Promise.resolve(new Response(JSON.stringify(String(input).includes("get_current_user_access_context") ? {
        is_system_admin: false, permissions: [], roles: [],
      } : {
        access_token: "access-token", refresh_token: "refresh-token", expires_in: 3_600, user: { id: "user-id" },
      }), { status: 200 })),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(loginRequest());

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://kong:8000/auth/v1/token?grant_type=password",
      expect.objectContaining({
        headers: expect.objectContaining({ apikey: "runtime-anon-key" }),
      }),
    );
    expect(cookieSet).toHaveBeenCalledWith(
      "qarar_access_token",
      "access-token",
      expect.objectContaining({ httpOnly: true }),
    );
  });

  it("يفشل مغلقًا في الإنتاج إن لم تكتمل إعدادات الحد الموزع", async () => {
    vi.stubEnv("QARAR_SUPABASE_URL", "http://kong:8000");
    vi.stubEnv("QARAR_SUPABASE_ANON_KEY", "runtime-anon-key");
    isProductionEnvironment.mockReturnValue(true);
    getLoginRateLimitConfig.mockReturnValue(null);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(loginRequest());

    expect(response.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("لا يستدعي GoTrue بعد حظر العداد المشترك", async () => {
    vi.stubEnv("QARAR_SUPABASE_URL", "http://kong:8000");
    vi.stubEnv("QARAR_SUPABASE_ANON_KEY", "runtime-anon-key");
    getLoginRateLimitConfig.mockReturnValue({});
    enforceLoginRateLimit.mockResolvedValue({ state: "limited", retryAfterSeconds: 123 });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(loginRequest({ "x-qarar-client-ip": "203.0.113.10" }));

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("123");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("يعيد 503 عند غياب هوية العميل الموثوقة أو Redis", async () => {
    vi.stubEnv("QARAR_SUPABASE_URL", "http://kong:8000");
    vi.stubEnv("QARAR_SUPABASE_ANON_KEY", "runtime-anon-key");
    getLoginRateLimitConfig.mockReturnValue({});
    enforceLoginRateLimit.mockResolvedValue({ state: "identity_missing" });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(loginRequest());

    expect(response.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("يمرر المحاولة المسموح بها بعد التحقق الموزع", async () => {
    vi.stubEnv("QARAR_SUPABASE_URL", "http://kong:8000");
    vi.stubEnv("QARAR_SUPABASE_ANON_KEY", "runtime-anon-key");
    getLoginRateLimitConfig.mockReturnValue({});
    enforceLoginRateLimit.mockResolvedValue({ state: "allowed", clientIp: "203.0.113.11" });
    cookies.mockResolvedValue({ set: cookieSet, delete: cookieDelete });
    const fetchMock = vi.fn().mockImplementation((input: string | URL | Request) =>
      Promise.resolve(new Response(JSON.stringify(String(input).includes("get_current_user_access_context") ? {
        is_system_admin: false, permissions: [], roles: [],
      } : {
        access_token: "access-token", refresh_token: "refresh-token", expires_in: 3_600, user: { id: "user-id" },
      }), { status: 200 })),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(loginRequest({ "x-qarar-client-ip": "203.0.113.11" }));

    expect(response.status).toBe(200);
    expect(enforceLoginRateLimit).toHaveBeenCalledWith(
      expect.any(Request),
      "admin@example.com",
      {},
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "http://kong:8000/auth/v1/token?grant_type=password",
      expect.objectContaining({
        headers: expect.objectContaining({ "X-Qarar-Client-IP": "203.0.113.11" }),
      }),
    );
  });
});
