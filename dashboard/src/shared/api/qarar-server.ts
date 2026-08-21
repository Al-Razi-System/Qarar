import "server-only";

import { cookies } from "next/headers";
import { readFile } from "node:fs/promises";
import path from "node:path";

function parseEnv(source: string) {
  return Object.fromEntries(
    source
      .split(/\r?\n/)
      .filter((line) => /^[A-Za-z_][A-Za-z0-9_]*=/.test(line))
      .map((line) => {
        const separator = line.indexOf("=");
        return [
          line.slice(0, separator),
          line.slice(separator + 1).replace(/^"|"$/g, ""),
        ];
      }),
  );
}

export async function requireQararSession() {
  const token = await getQararAccessToken();
  await assertSensitiveMfa(token);
}

type QararSession = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
};

async function refreshQararSession() {
  const cookieStore = await cookies();
  const refreshToken = cookieStore.get("qarar_refresh_token")?.value;

  if (!refreshToken) throw new Error("UNAUTHENTICATED");

  const localEnv = await getQararEnv();
  const response = await fetch(`${localEnv.SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: {
      apikey: localEnv.ANON_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ refresh_token: refreshToken }),
    cache: "no-store",
  });

  if (!response.ok) throw new Error("UNAUTHENTICATED");

  const session = await response.json() as QararSession;
  if (!session.access_token) throw new Error("UNAUTHENTICATED");

  cookieStore.set("qarar_access_token", session.access_token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: session.expires_in ?? 60 * 60,
    path: "/",
  });

  if (session.refresh_token) {
    cookieStore.set("qarar_refresh_token", session.refresh_token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 30,
      path: "/",
    });
  }

  return session.access_token;
}

async function getQararAccessToken() {
  const cookieStore = await cookies();
  return cookieStore.get("qarar_access_token")?.value ?? refreshQararSession();
}

function accessTokenAal(token: string) {
  try {
    const encoded = token.split(".")[1]?.replace(/-/g, "+").replace(/_/g, "/");
    return encoded ? (JSON.parse(Buffer.from(encoded, "base64").toString("utf8")) as { aal?: unknown }).aal : null;
  } catch { return null; }
}

async function assertSensitiveMfa(accessToken: string) {
  const localEnv = await getQararEnv();
  const response = await fetch(`${localEnv.SUPABASE_URL}/rest/v1/rpc/get_current_user_access_context`, {
    method: "POST",
    headers: { apikey: localEnv.ANON_KEY, Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", "Accept-Profile": "api_v1", "Content-Profile": "api_v1" },
    body: "{}", cache: "no-store",
  });
  if (!response.ok) throw new Error("UNAUTHENTICATED");
  const context = await response.json() as { is_system_admin?: boolean; permissions?: string[]; roles?: Array<{ code?: string }> } | null;
  const sensitive = Boolean(context?.is_system_admin || context?.permissions?.some((permission) => permission.startsWith("iam.")) || context?.roles?.some((role) => /break[-_]?glass/i.test(role.code ?? "")));
  if (sensitive && accessTokenAal(accessToken) !== "aal2") throw new Error("MFA_REQUIRED");
}

export async function qararRpc<T>(
  name: string,
  body: Record<string, unknown>,
): Promise<T> {
  let accessToken = await getQararAccessToken();
  await assertSensitiveMfa(accessToken);
  const localEnv = await getQararEnv();
  const request = (token: string) => fetch(
    `${localEnv.SUPABASE_URL}/rest/v1/rpc/${name}`,
    {
      method: "POST",
      headers: {
        apikey: localEnv.ANON_KEY,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Accept-Profile": "api_v1",
        "Content-Profile": "api_v1",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    },
  );

  let response = await request(accessToken);

  if (response.status === 401) {
    accessToken = await refreshQararSession();
    await assertSensitiveMfa(accessToken);
    response = await request(accessToken);
    if (response.status === 401) throw new Error("UNAUTHENTICATED");
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as {
      code?: string; message?: string; details?: string; hint?: string;
    };
    throw new QararApiError(
      payload.message ?? `QARAR_API_${response.status}`,
      response.status,
      payload.code,
      payload.details,
      payload.hint,
    );
  }

  return response.json() as Promise<T>;
}

export class QararApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly details?: string,
    readonly hint?: string,
  ) {
    super(message);
    this.name = "QararApiError";
  }
}

export async function qararEdge<T>(
  name: string,
  body: Record<string, unknown>,
): Promise<T> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("qarar_access_token")?.value;

  if (!accessToken) {
    throw new Error("UNAUTHENTICATED");
  }
  await assertSensitiveMfa(accessToken);

  const localEnv = await getQararEnv();
  const response = await fetch(
    `${localEnv.SUPABASE_URL}/functions/v1/${name}`,
    {
      method: "POST",
      headers: {
        apikey: localEnv.ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    },
  );

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      typeof result.message === "string"
        ? result.message
        : `QARAR_EDGE_${response.status}`,
    );
  }

  return result as T;
}

export async function qararTable<T>(table: string, query: string): Promise<T> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("qarar_access_token")?.value;
  if (!accessToken) throw new Error("UNAUTHENTICATED");
  await assertSensitiveMfa(accessToken);
  const localEnv = await getQararEnv();
  const response = await fetch(`${localEnv.SUPABASE_URL}/rest/v1/${table}?${query}`, {
    headers: { apikey: localEnv.ANON_KEY, Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(response.status === 401 ? "UNAUTHENTICATED" : `QARAR_API_${response.status}`);
  return response.json() as Promise<T>;
}

export async function getQararEnv() {
  const url = process.env.QARAR_SUPABASE_URL;
  const anonKey = process.env.QARAR_SUPABASE_ANON_KEY;
  if (url && anonKey) return { SUPABASE_URL: url.replace(/\/$/, ""), ANON_KEY: anonKey, SERVICE_ROLE_KEY: process.env.QARAR_SUPABASE_SERVICE_ROLE_KEY ?? "" };
  if (process.env.NODE_ENV === "production") throw new Error("QARAR_CONFIGURATION_ERROR");
  const envPath = path.resolve(process.cwd(), "../supabase/docker/.env");
  const localEnv = parseEnv(await readFile(envPath, "utf8"));
  return { SUPABASE_URL: localEnv.SUPABASE_URL ?? localEnv.SUPABASE_PUBLIC_URL ?? "http://127.0.0.1:8000", ANON_KEY: localEnv.ANON_KEY ?? "", SERVICE_ROLE_KEY: localEnv.SERVICE_ROLE_KEY ?? "" };
}
