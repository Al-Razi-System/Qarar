import "server-only";
import { getQararEnv, QararApiError } from "@/shared/api/qarar-server";

export async function qararServiceRpc<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const env = await getQararEnv();
  if (!env.SERVICE_ROLE_KEY) throw new Error("QARAR_CONFIGURATION_ERROR");
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: env.SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      "Accept-Profile": "api_v1",
      "Content-Profile": "api_v1",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { message?: string; code?: string };
    throw new QararApiError(payload.message ?? "QARAR_SERVICE_ERROR", response.status, payload.code);
  }
  return response.json() as Promise<T>;
}

export async function updateQararAuthUser(userId: string, password: string) {
  const env = await getQararEnv();
  if (!env.SERVICE_ROLE_KEY) throw new Error("QARAR_CONFIGURATION_ERROR");
  const response = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: "PUT",
    headers: {
      apikey: env.SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ password, email_confirm: true, ban_duration: "none" }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("AUTH_ACTIVATION_FAILED");
}
