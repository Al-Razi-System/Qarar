import "server-only";

import { cookies, headers } from "next/headers";
import { randomUUID } from "node:crypto";
import { isIP } from "node:net";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { cache } from "react";
import { readEdgeResponse } from "./edge-response";
import { measure } from "@/shared/observability/logger";

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
  await assertSensitiveMfaOnce(token);
}

async function getQararAccessToken() {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("qarar_access_token")?.value;
  if (!accessToken) throw new Error("UNAUTHENTICATED");
  return accessToken;
}

function accessTokenAal(token: string) {
  try {
    const encoded = token.split(".")[1]?.replace(/-/g, "+").replace(/_/g, "/");
    return encoded ? (JSON.parse(Buffer.from(encoded, "base64").toString("utf8")) as { aal?: unknown }).aal : null;
  } catch { return null; }
}

async function assertSensitiveMfa(accessToken: string, signal?: AbortSignal) {
  // An AAL2 token has already passed MFA; no role lookup can impose a higher
  // assurance level, so avoid an unnecessary database call on every request.
  if (accessTokenAal(accessToken) === "aal2") return;
  const localEnv = await getQararEnv();
  const response = await fetch(`${localEnv.SUPABASE_URL}/rest/v1/rpc/get_current_user_access_context`, {
    method: "POST",
    headers: { apikey: localEnv.ANON_KEY, Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", "Accept-Profile": "api_v1", "Content-Profile": "api_v1" },
    body: "{}", cache: "no-store", ...(signal ? { signal } : {}),
  });
  if (!response.ok) throw new Error("UNAUTHENTICATED");
  const context = await response.json() as { is_system_admin?: boolean; permissions?: string[]; roles?: Array<{ code?: string }> } | null;
  const sensitive = Boolean(context?.is_system_admin || context?.permissions?.some((permission) => permission.startsWith("iam.")) || context?.roles?.some((role) => /break[-_]?glass/i.test(role.code ?? "")));
  if (sensitive && accessTokenAal(accessToken) !== "aal2") throw new Error("MFA_REQUIRED");
}

// React request memoization prevents the layout and its data loaders from
// repeating the same access-context request during one server render.
const assertSensitiveMfaOnce = cache(assertSensitiveMfa);

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,100}$/;

/**
 * Context the database stamps on every audit row: one request id per incoming request, the client
 * address the reverse proxy reported (the same trusted header the login rate limit uses) and the
 * device. Outside a request (tests, scripts) it is simply empty.
 */
export const qararRequestContextHeaders = cache(async (): Promise<Record<string, string>> => {
  try {
    const incoming = await headers();
    const context: Record<string, string> = {};
    const requestId = incoming.get("x-request-id");
    context["X-Qarar-Request-Id"] = requestId && REQUEST_ID_PATTERN.test(requestId) ? requestId : randomUUID();
    const clientIp = incoming.get("x-qarar-client-ip");
    if (clientIp && !clientIp.includes(",") && isIP(clientIp) !== 0) context["X-Qarar-Client-IP"] = clientIp;
    const userAgent = incoming.get("user-agent");
    if (userAgent) context["X-Qarar-User-Agent"] = userAgent.slice(0, 500);
    return context;
  } catch {
    return {};
  }
});

function tokenSubject(token: string) {
  try {
    const encoded = token.split(".")[1];
    const sub = encoded ? (JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as { sub?: unknown }).sub : null;
    return typeof sub === "string" && /^[0-9a-f-]{36}$/i.test(sub) ? sub : null;
  } catch { return null; }
}

/**
 * A rejected command rolls back its own transaction, so its audit row never lands. Denials and
 * failures are therefore recorded here, as the service, in a separate transaction. Recording must
 * never change what the user is told, so every error is swallowed.
 */
async function recordApiOutcome(apiVersion: "v1" | "v2", contract: string, accessToken: string, status: number, code?: string) {
  const denied = status === 403 || code === "42501";
  const failed = status >= 500 || (typeof code === "string" && code.startsWith("PGRST2"));
  if (!denied && !failed) return;
  const actor = tokenSubject(accessToken);
  if (!actor || !/^[a-z][a-z0-9_]{0,79}$/.test(contract)) return;
  try {
    const env = await getQararEnv();
    if (!env.SERVICE_ROLE_KEY) return;
    await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/service_record_api_outcome_v2`, {
      method: "POST",
      headers: {
        apikey: env.SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        "Accept-Profile": "api_v2",
        "Content-Profile": "api_v2",
        ...(await qararRequestContextHeaders()),
      },
      body: JSON.stringify({
        p_actor_user_id: actor, p_api_version: apiVersion, p_contract: contract,
        p_result: denied ? "denied" : "failure",
        p_error_code: code && /^[A-Za-z0-9_]{1,20}$/.test(code) ? code : null,
        p_http_status: status,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(2_000),
    });
  } catch {
    // The original error is what the user must see.
  }
}

export async function qararRpc<T>(
  name: string,
  body: Record<string, unknown>,
  options: { signal?: AbortSignal } = {},
): Promise<T> {
  return measure(`rpc.v1.${name}`, async () => {
  const accessToken = await getQararAccessToken();
  if (options.signal) await assertSensitiveMfa(accessToken, options.signal);
  else await assertSensitiveMfaOnce(accessToken);
  const localEnv = await getQararEnv();
  const context = await qararRequestContextHeaders();
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
        ...context,
      },
      body: JSON.stringify(body),
      cache: "no-store",
      ...(options.signal ? { signal: options.signal } : {}),
    },
  );

  const response = await request(accessToken);

  if (response.status === 401) throw new Error("UNAUTHENTICATED");

  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as {
      code?: string; message?: string; details?: string; hint?: string;
    };
    await recordApiOutcome("v1", name, accessToken, response.status, payload.code);
    throw new QararApiError(
      payload.message ?? `QARAR_API_${response.status}`,
      response.status,
      payload.code,
      payload.details,
      payload.hint,
    );
  }

  // PostgREST void commands commit successfully and return no JSON body.
  if (response.status === 204) return null as T;
  return response.json() as Promise<T>;
  });
}

export async function qararRpcV2<T>(
  name: string,
  body: Record<string, unknown>,
): Promise<T> {
  return measure(`rpc.v2.${name}`, async () => {
  const accessToken = await getQararAccessToken();
  await assertSensitiveMfaOnce(accessToken);
  const localEnv = await getQararEnv();
  const response = await fetch(`${localEnv.SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: localEnv.ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "Accept-Profile": "api_v2",
      "Content-Profile": "api_v2",
      ...(await qararRequestContextHeaders()),
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (response.status === 401) throw new Error("UNAUTHENTICATED");
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { code?: string; message?: string; details?: string; hint?: string };
    await recordApiOutcome("v2", name, accessToken, response.status, payload.code);
    throw new QararApiError(payload.message ?? `QARAR_API_${response.status}`, response.status, payload.code, payload.details, payload.hint);
  }
  if (response.status === 204) return null as T;
  return response.json() as Promise<T>;
  });
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
  return measure(`edge.${name}`, async () => {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("qarar_access_token")?.value;

  if (!accessToken) {
    throw new Error("UNAUTHENTICATED");
  }
  await assertSensitiveMfaOnce(accessToken);

  const localEnv = await getQararEnv();
  const response = await fetch(
    `${localEnv.SUPABASE_URL}/functions/v1/${name}`,
    {
      method: "POST",
      headers: {
        apikey: localEnv.ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        ...(await qararRequestContextHeaders()),
      },
      body: JSON.stringify(body),
      cache: "no-store",
    },
  );

  return readEdgeResponse<T>(response);
  });
}

export async function qararTable<T>(table: string, query: string): Promise<T> {
  return measure(`table.${table}`, async () => {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("qarar_access_token")?.value;
  if (!accessToken) throw new Error("UNAUTHENTICATED");
  await assertSensitiveMfaOnce(accessToken);
  const localEnv = await getQararEnv();
  const response = await fetch(`${localEnv.SUPABASE_URL}/rest/v1/${table}?${query}`, {
    headers: { apikey: localEnv.ANON_KEY, Authorization: `Bearer ${accessToken}`, ...(await qararRequestContextHeaders()) },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(response.status === 401 ? "UNAUTHENTICATED" : `QARAR_API_${response.status}`);
  return response.json() as Promise<T>;
  });
}

type QararEnv = { SUPABASE_URL: string; ANON_KEY: string; SERVICE_ROLE_KEY: string };
let cachedQararEnv: QararEnv | null = null;

export async function getQararEnv(): Promise<QararEnv> {
  if (cachedQararEnv) return cachedQararEnv;
  const url = process.env.QARAR_SUPABASE_URL;
  const anonKey = process.env.QARAR_SUPABASE_ANON_KEY;
  if (url && anonKey) {
    cachedQararEnv = { SUPABASE_URL: url.replace(/\/$/, ""), ANON_KEY: anonKey, SERVICE_ROLE_KEY: process.env.QARAR_SUPABASE_SERVICE_ROLE_KEY ?? "" };
    return cachedQararEnv;
  }
  if (process.env.NODE_ENV === "production") throw new Error("QARAR_CONFIGURATION_ERROR");
  const envCandidates = [
    process.env.QARAR_ENV_FILE,
    path.resolve(process.cwd(), "../supabase/docker/.env"),
    path.resolve(process.cwd(), "../../../Qarar-core01/supabase/docker/.env"),
  ].filter((candidate): candidate is string => Boolean(candidate));
  let envSource: string | null = null;
  for (const candidate of envCandidates) {
    try {
      envSource = await readFile(candidate, "utf8");
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  if (!envSource) throw new Error("QARAR_CONFIGURATION_ERROR");
  const localEnv = parseEnv(envSource);
  cachedQararEnv = { SUPABASE_URL: localEnv.SUPABASE_URL ?? localEnv.SUPABASE_PUBLIC_URL ?? "http://127.0.0.1:8000", ANON_KEY: localEnv.ANON_KEY ?? "", SERVICE_ROLE_KEY: localEnv.SERVICE_ROLE_KEY ?? "" };
  return cachedQararEnv;
}
