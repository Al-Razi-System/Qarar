import { NextResponse } from "next/server";
import { getQararSupabaseRuntimeConfig } from "@/shared/config/qarar-runtime";
import { rejectUntrustedMutation } from "@/shared/security/request-guards";

const MAX_BODY_BYTES = 4096;

function response() {
  return NextResponse.json(
    { accepted: true, message: "إذا كان البريد مسجلًا فستصلك تعليمات الاستعادة." },
    { headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } },
  );
}

export async function POST(request: Request) {
  const rejected = rejectUntrustedMutation(request);
  if (rejected) return rejected;
  const length = Number(request.headers.get("content-length"));
  if (Number.isFinite(length) && length > MAX_BODY_BYTES) return response();

  let email = "";
  try {
    const body = await request.json() as { email?: unknown };
    if (typeof body.email === "string" && body.email.length <= 320) {
      email = body.email.trim().toLowerCase();
    }
  } catch {
    return response();
  }
  if (!/^\S+@\S+\.\S+$/.test(email)) return response();

  const config = getQararSupabaseRuntimeConfig();
  const origin = process.env.APP_ORIGIN?.replace(/\/$/, "");
  if (!config || !origin) {
    return NextResponse.json({ message: "خدمة الاستعادة غير متاحة مؤقتًا." }, { status: 503 });
  }

  try {
    await fetch(`${config.apiUrl}/auth/v1/recover`, {
      method: "POST",
      headers: { apikey: config.anonKey, "Content-Type": "application/json" },
      body: JSON.stringify({ email, redirect_to: `${origin}/auth/recovery` }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    // Deliberately preserve the same response to prevent account enumeration.
  }
  return response();
}
