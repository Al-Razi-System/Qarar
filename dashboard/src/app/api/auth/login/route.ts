import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getQararSupabaseRuntimeConfig } from "@/shared/config/qarar-runtime";
import {
  enforceLoginRateLimit,
  getLoginRateLimitConfig,
  isProductionEnvironment,
} from "@/shared/security/login-rate-limit";
import { incrementMetric, logEvent } from "@/shared/observability/logger";

const MAX_LOGIN_BODY_BYTES = 8 * 1024;

type LoginCredentials = {
  email: string;
  password: string;
};

type AccessContext = { is_system_admin?: boolean; permissions?: string[]; roles?: Array<{ code?: string }> };

async function requiresMfa(apiUrl: string, anonKey: string, accessToken: string) {
  const response = await fetch(`${apiUrl}/rest/v1/rpc/get_current_user_access_context`, {
    method: "POST",
    headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", "Accept-Profile": "api_v1", "Content-Profile": "api_v1" },
    body: "{}", cache: "no-store", signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error("ACCESS_CONTEXT_UNAVAILABLE");
  const context = await response.json() as AccessContext | null;
  return Boolean(
    context?.is_system_admin ||
    context?.permissions?.some((permission) => permission.startsWith("iam.")) ||
    context?.roles?.some((role) => /break[-_]?glass/i.test(role.code ?? "")),
  );
}

function jwtAal(token: string) {
  try {
    const payload = token.split(".")[1]?.replace(/-/g, "+").replace(/_/g, "/");
    if (!payload) return null;
    return (JSON.parse(Buffer.from(payload, "base64").toString("utf8")) as { aal?: unknown }).aal;
  } catch { return null; }
}

function jsonError(message: string, status: number, headers?: HeadersInit) {
  incrementMetric(`login.http_status.${status}`);
  logEvent(status >= 500 ? "error" : "warn", "login.rejected", { status });
  return NextResponse.json(
    { message },
    { status, headers: { "Cache-Control": "no-store", ...headers } },
  );
}

async function readLoginCredentials(request: Request): Promise<LoginCredentials | null> {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_LOGIN_BODY_BYTES) return null;

  const reader = request.body?.getReader();
  if (!reader) return null;

  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > MAX_LOGIN_BODY_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }

  const payload = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    payload.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    const body = JSON.parse(new TextDecoder().decode(payload)) as Record<string, unknown>;
    if (
      typeof body.email !== "string" ||
      typeof body.password !== "string" ||
      !body.email.trim() ||
      !body.password ||
      body.email.length > 320 ||
      body.password.length > 4_096
    ) {
      return null;
    }
    return { email: body.email.trim().toLowerCase(), password: body.password };
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const credentials = await readLoginCredentials(request);
  if (!credentials) return jsonError("أدخل البريد الإلكتروني وكلمة المرور.", 400);

  const { email, password } = credentials;

  const runtimeConfig = getQararSupabaseRuntimeConfig();

  if (!runtimeConfig) {
    return jsonError("إعدادات خدمة الدخول غير مكتملة.", 503);
  }

  const rateLimitConfig = getLoginRateLimitConfig();
  if (!rateLimitConfig && isProductionEnvironment()) {
    return jsonError("حماية محاولات تسجيل الدخول غير مهيأة.", 503);
  }
  let trustedClientIp: string | null = null;
  if (rateLimitConfig) {
    const rateLimit = await enforceLoginRateLimit(request, email, rateLimitConfig);
    if (rateLimit.state === "limited") {
      return jsonError(
        "تم تجاوز الحد المسموح لمحاولات تسجيل الدخول. حاول لاحقًا.",
        429,
        { "Retry-After": String(rateLimit.retryAfterSeconds) },
      );
    }
    if (rateLimit.state !== "allowed") {
      return jsonError("حماية محاولات تسجيل الدخول غير متاحة مؤقتًا.", 503);
    }

    // Kong applies a second distributed limit to direct /auth/v1/token traffic.
    // Forward only the identity that this module already validated, never the
    // raw X-Forwarded-For value supplied by a client.
    trustedClientIp = rateLimit.clientIp;
  }

  let authResponse: Response;
  try {
    authResponse = await fetch(
      `${runtimeConfig.apiUrl}/auth/v1/token?grant_type=password`,
      {
        method: "POST",
        headers: {
          apikey: runtimeConfig.anonKey,
          "Content-Type": "application/json",
          ...(trustedClientIp ? { "X-Qarar-Client-IP": trustedClientIp } : {}),
        },
        body: JSON.stringify({ email, password }),
        cache: "no-store",
      },
    );
  } catch {
    return jsonError("خدمة الدخول غير متاحة مؤقتًا.", 503);
  }

  if (!authResponse.ok) {
    if (authResponse.status === 429) {
      const retryAfter = authResponse.headers.get("retry-after");
      return jsonError(
        "تم تجاوز الحد المسموح لمحاولات تسجيل الدخول. حاول لاحقًا.",
        429,
        retryAfter && /^\d+$/.test(retryAfter) ? { "Retry-After": retryAfter } : undefined,
      );
    }
    return jsonError("البريد الإلكتروني أو كلمة المرور غير صحيحة.", 401);
  }

  let session: { access_token?: unknown; refresh_token?: unknown; expires_in?: unknown };
  try {
    session = await authResponse.json() as { access_token?: unknown; refresh_token?: unknown; expires_in?: unknown };
  } catch {
    return jsonError("خدمة الدخول غير متاحة مؤقتًا.", 503);
  }
  const expiresIn = session.expires_in;
  if (
    typeof session.access_token !== "string" ||
    !session.access_token ||
    typeof session.refresh_token !== "string" ||
    !session.refresh_token ||
    typeof expiresIn !== "number" ||
    !Number.isInteger(expiresIn) ||
    expiresIn < 1 ||
    expiresIn > 86_400
  ) {
    return jsonError("خدمة الدخول غير متاحة مؤقتًا.", 503);
  }
  const cookieStore = await cookies();
  let mfaRequired: boolean;
  try {
    mfaRequired = await requiresMfa(runtimeConfig.apiUrl, runtimeConfig.anonKey, session.access_token);
  } catch {
    return jsonError("تعذر التحقق من سياسة الحماية للحساب.", 503);
  }

  if (mfaRequired && jwtAal(session.access_token) !== "aal2") {
    cookieStore.set("qarar_mfa_access_token", session.access_token, {
      httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", maxAge: 300, path: "/",
    });
    cookieStore.set("qarar_mfa_refresh_token", session.refresh_token, {
      httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", maxAge: 300, path: "/",
    });
    incrementMetric("login.mfa_required");
    return NextResponse.json(
      { authenticated: false, mfa_required: true },
      { status: 202, headers: { "Cache-Control": "no-store" } },
    );
  }
  cookieStore.set("qarar_access_token", session.access_token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: expiresIn,
    path: "/",
  });
  cookieStore.set("qarar_refresh_token", session.refresh_token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });

  incrementMetric("login.succeeded");
  logEvent("info", "login.succeeded");

  return NextResponse.json(
    { authenticated: true },
    { headers: { "Cache-Control": "no-store" } },
  );
}
