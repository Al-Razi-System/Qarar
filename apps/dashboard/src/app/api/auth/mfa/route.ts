import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getQararSupabaseRuntimeConfig } from "@/shared/config/qarar-runtime";
import { rejectUntrustedMutation } from "@/shared/security/request-guards";

async function context() {
  const store = await cookies();
  const token = store.get("qarar_mfa_access_token")?.value;
  const config = getQararSupabaseRuntimeConfig();
  if (!token || !config) return null;
  return { store, token, config, headers: { apikey: config.anonKey, Authorization: `Bearer ${token}`, "Content-Type": "application/json" } };
}

type AuthFactor = {
  id: string;
  factor_type: string;
  status: string;
  friendly_name?: string;
};

function safeQrCodeSource(value: unknown) {
  if (typeof value !== "string") return undefined;
  if (value.startsWith("data:image/")) return value;
  if (!value.trimStart().startsWith("<svg") && !value.trimStart().startsWith("<?xml")) return undefined;
  return `data:image/svg+xml;base64,${Buffer.from(value, "utf8").toString("base64")}`;
}

export async function GET() {
  const value = await context(); if (!value) return NextResponse.json({ message: "انتهت جلسة التحقق." }, { status: 401 });
  const response = await fetch(`${value.config.apiUrl}/auth/v1/user`, { headers: value.headers, cache: "no-store" });
  if (!response.ok) return NextResponse.json({ message: "انتهت جلسة التحقق." }, { status: 401 });
  const user = await response.json() as { factors?: AuthFactor[] };
  return NextResponse.json(
    { factors: (user.factors ?? []).filter((factor) => factor.factor_type === "totp") },
    { headers: { "Cache-Control": "no-store" } },
  );
}
export async function POST(request: Request) {
  const rejected = rejectUntrustedMutation(request); if (rejected) return rejected;
  const value = await context(); if (!value) return NextResponse.json({ message: "انتهت جلسة التحقق." }, { status: 401 });
  let body: { action?: unknown; factor_id?: unknown; code?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ message: "طلب غير صالح." }, { status: 400 }); }

  if (body.action === "enroll") {
    const currentUserResponse = await fetch(`${value.config.apiUrl}/auth/v1/user`, { headers: value.headers, cache: "no-store" });
    if (!currentUserResponse.ok) return NextResponse.json({ message: "انتهت جلسة التحقق." }, { status: 401 });
    const currentUser = await currentUserResponse.json() as { factors?: AuthFactor[] };
    const incompleteFactors = (currentUser.factors ?? []).filter(
      (factor) => factor.factor_type === "totp" && factor.status === "unverified",
    );
    for (const factor of incompleteFactors) {
      const removed = await fetch(`${value.config.apiUrl}/auth/v1/factors/${encodeURIComponent(factor.id)}`, {
        method: "DELETE",
        headers: value.headers,
        cache: "no-store",
      });
      if (!removed.ok) return NextResponse.json({ message: "تعذر استبدال إعداد التحقق غير المكتمل." }, { status: 400 });
    }

    const response = await fetch(`${value.config.apiUrl}/auth/v1/factors`, { method: "POST", headers: value.headers, body: JSON.stringify({ factor_type: "totp", friendly_name: "Qarar Authenticator" }), cache: "no-store" });
    const payload = await response.json().catch(() => ({})) as { totp?: { qr_code?: unknown } };
    if (response.ok && payload.totp) payload.totp.qr_code = safeQrCodeSource(payload.totp.qr_code);
    return NextResponse.json(response.ok ? payload : { message: "تعذر إنشاء عامل التحقق." }, { status: response.ok ? 200 : 400, headers: { "Cache-Control": "no-store" } });
  }
  if (body.action !== "verify" || typeof body.factor_id !== "string" || typeof body.code !== "string" || !/^\d{6}$/.test(body.code)) {
    return NextResponse.json({ message: "رمز التحقق غير صالح." }, { status: 400 });
  }
  const challenge = await fetch(`${value.config.apiUrl}/auth/v1/factors/${encodeURIComponent(body.factor_id)}/challenge`, { method: "POST", headers: value.headers, body: "{}", cache: "no-store" });
  const challengeBody = await challenge.json().catch(() => ({})) as { id?: string };
  if (!challenge.ok || !challengeBody.id) return NextResponse.json({ message: "تعذر بدء التحقق." }, { status: 400 });
  const verified = await fetch(`${value.config.apiUrl}/auth/v1/factors/${encodeURIComponent(body.factor_id)}/verify`, { method: "POST", headers: value.headers, body: JSON.stringify({ challenge_id: challengeBody.id, code: body.code }), cache: "no-store" });
  const session = await verified.json().catch(() => ({})) as { access_token?: string; refresh_token?: string; expires_in?: number };
  if (!verified.ok || !session.access_token || !session.refresh_token) return NextResponse.json({ message: "رمز التحقق غير صحيح." }, { status: 401 });
  value.store.set("qarar_access_token", session.access_token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: session.expires_in ?? 3600, path: "/" });
  value.store.set("qarar_refresh_token", session.refresh_token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 2592000, path: "/" });
  value.store.delete("qarar_mfa_access_token"); value.store.delete("qarar_mfa_refresh_token");
  return NextResponse.json({ verified: true }, { headers: { "Cache-Control": "no-store" } });
}
