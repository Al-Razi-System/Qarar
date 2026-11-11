import { randomUUID } from "node:crypto";
import { isIP } from "node:net";
import { logEvent } from "@/shared/observability/logger";

export const DEVICE_COOKIE = "qarar_device_id";
const DEVICE_COOKIE_MAX_AGE = 60 * 60 * 24 * 400;
const DEVICE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID_PATTERN = DEVICE_ID_PATTERN;
// Set by the reverse proxy; the same trusted header the login rate limit uses.
const TRUSTED_CLIENT_IP_HEADER = "x-qarar-client-ip";

type CookieStore = {
  get?: (name: string) => { value?: string } | undefined;
  set: (name: string, value: string, options: Record<string, unknown>) => unknown;
};

function authSessionId(accessToken: string): string | null {
  try {
    const encoded = accessToken.split(".")[1];
    if (!encoded) return null;
    const claims = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as { session_id?: unknown };
    return typeof claims.session_id === "string" && UUID_PATTERN.test(claims.session_id) ? claims.session_id : null;
  } catch {
    return null;
  }
}

function trustedClientIp(request: Request): string | null {
  const candidate = request.headers.get(TRUSTED_CLIENT_IP_HEADER);
  return candidate && !candidate.includes(",") && isIP(candidate) !== 0 ? candidate : null;
}

/** A readable Arabic label such as «Chrome على Windows»; never shown as the only identifier. */
export function browserDeviceName(userAgent: string | null): string | null {
  if (!userAgent) return null;
  const browser = /Edg\//.test(userAgent) ? "Edge"
    : /OPR\//.test(userAgent) ? "Opera"
    : /Firefox\//.test(userAgent) ? "Firefox"
    : /Chrome\//.test(userAgent) ? "Chrome"
    : /Safari\//.test(userAgent) ? "Safari" : "متصفح";
  const system = /Windows/.test(userAgent) ? "Windows"
    : /Android/.test(userAgent) ? "Android"
    : /iPhone|iPad|iPod/.test(userAgent) ? "iOS"
    : /Mac OS X/.test(userAgent) ? "macOS"
    : /Linux/.test(userAgent) ? "Linux" : null;
  return system ? `${browser} على ${system}` : browser;
}

function deviceId(cookieStore: CookieStore): string {
  const existing = cookieStore.get?.(DEVICE_COOKIE)?.value;
  if (existing && DEVICE_ID_PATTERN.test(existing)) return existing;
  const created = randomUUID();
  cookieStore.set(DEVICE_COOKIE, created, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: DEVICE_COOKIE_MAX_AGE, path: "/",
  });
  return created;
}

/**
 * Records this browser against the Auth session that a completed login just issued, so the
 * session appears in «مراقبة الجلسات» and can be revoked there. Monitoring must never block a
 * login: a failure is logged with its cause and the login continues.
 */
export async function registerBrowserSession(input: {
  request: Request;
  cookieStore: CookieStore;
  accessToken: string;
  apiUrl: string;
  anonKey: string;
}): Promise<boolean> {
  try {
    const userAgent = input.request.headers.get("user-agent")?.slice(0, 500) ?? null;
    const response = await fetch(`${input.apiUrl.replace(/\/+$/, "")}/rest/v1/rpc/register_user_session`, {
      method: "POST",
      headers: {
        apikey: input.anonKey,
        Authorization: `Bearer ${input.accessToken}`,
        "Content-Type": "application/json",
        "Accept-Profile": "api_v1",
        "Content-Profile": "api_v1",
      },
      body: JSON.stringify({
        p_device_id: deviceId(input.cookieStore),
        p_device_name: browserDeviceName(userAgent),
        p_platform: "web",
        p_app_version: null,
        p_auth_session_id: authSessionId(input.accessToken),
        p_ip_address: trustedClientIp(input.request),
        p_user_agent: userAgent,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({})) as { code?: string };
      logEvent("warn", "session.register_failed", { status: response.status, code: payload.code });
      return false;
    }
    return true;
  } catch (error) {
    logEvent("warn", "session.register_failed", { cause: error instanceof Error ? error.name : "unknown" });
    return false;
  }
}
