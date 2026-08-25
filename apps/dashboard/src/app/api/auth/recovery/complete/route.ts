import { NextResponse } from "next/server";
import { getQararSupabaseRuntimeConfig } from "@/shared/config/qarar-runtime";
import { rejectUntrustedMutation } from "@/shared/security/request-guards";

const invalid = () => NextResponse.json(
  { message: "رابط الاستعادة غير صالح أو انتهت صلاحيته." },
  { status: 410, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } },
);

function isRecoveryToken(token: string) {
  try {
    const encoded = token.split(".")[1]?.replace(/-/g, "+").replace(/_/g, "/");
    if (!encoded) return false;
    const claims = JSON.parse(Buffer.from(encoded, "base64").toString("utf8")) as { amr?: Array<{ method?: unknown }> };
    return claims.amr?.some((entry) => entry.method === "recovery") === true;
  } catch { return false; }
}

export async function POST(request: Request) {
  const rejected = rejectUntrustedMutation(request);
  if (rejected) return rejected;
  const length = Number(request.headers.get("content-length"));
  if (Number.isFinite(length) && length > 16_384) return invalid();

  let body: { access_token?: unknown; refresh_token?: unknown; password?: unknown };
  try { body = await request.json(); } catch { return invalid(); }
  if (
    typeof body.access_token !== "string" || body.access_token.length > 8192 ||
    typeof body.refresh_token !== "string" || body.refresh_token.length > 8192 ||
    typeof body.password !== "string" || body.password.length < 12 || body.password.length > 128 ||
    !/[A-Z]/.test(body.password) || !/[a-z]/.test(body.password) || !/\d/.test(body.password) ||
    !/[^A-Za-z0-9]/.test(body.password)
  ) return invalid();
  if (!isRecoveryToken(body.access_token)) return invalid();

  const config = getQararSupabaseRuntimeConfig();
  if (!config) return NextResponse.json({ message: "خدمة الاستعادة غير متاحة مؤقتًا." }, { status: 503 });
  const headers = { apikey: config.anonKey, Authorization: `Bearer ${body.access_token}` };

  try {
    const user = await fetch(`${config.apiUrl}/auth/v1/user`, { headers, cache: "no-store", signal: AbortSignal.timeout(10_000) });
    if (!user.ok) return invalid();
    const changed = await fetch(`${config.apiUrl}/auth/v1/user`, {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ password: body.password }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!changed.ok) return invalid();

    // Global logout revokes every refresh token, including the recovery session.
    // Existing short-lived access JWTs expire at JWT_EXPIRY and cannot be recalled by GoTrue.
    await fetch(`${config.apiUrl}/auth/v1/logout?scope=global`, {
      method: "POST", headers, cache: "no-store", signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return NextResponse.json({ message: "تعذر إكمال الاستعادة مؤقتًا." }, { status: 503 });
  }

  return NextResponse.json(
    { completed: true },
    { headers: { "Cache-Control": "no-store", "Clear-Site-Data": '"cache", "storage"' } },
  );
}
