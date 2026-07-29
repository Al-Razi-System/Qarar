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

export async function qararRpc<T>(
  name: string,
  body: Record<string, unknown>,
): Promise<T> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("qarar_access_token")?.value;

  if (!accessToken) {
    throw new Error("UNAUTHENTICATED");
  }

  const envPath = path.resolve(process.cwd(), "../supabase/docker/.env");
  const localEnv = parseEnv(await readFile(envPath, "utf8"));
  const response = await fetch(
    `http://127.0.0.1:54321/rest/v1/rpc/${name}`,
    {
      method: "POST",
      headers: {
        apikey: localEnv.ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "Accept-Profile": "api_v1",
        "Content-Profile": "api_v1",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    },
  );

  if (response.status === 401) {
    throw new Error("UNAUTHENTICATED");
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

  const envPath = path.resolve(process.cwd(), "../supabase/docker/.env");
  const localEnv = parseEnv(await readFile(envPath, "utf8"));
  const response = await fetch(
    `http://127.0.0.1:54321/functions/v1/${name}`,
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
  const envPath = path.resolve(process.cwd(), "../supabase/docker/.env");
  const localEnv = parseEnv(await readFile(envPath, "utf8"));
  const response = await fetch(`http://127.0.0.1:54321/rest/v1/${table}?${query}`, {
    headers: { apikey: localEnv.ANON_KEY, Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(response.status === 401 ? "UNAUTHENTICATED" : `QARAR_API_${response.status}`);
  return response.json() as Promise<T>;
}
