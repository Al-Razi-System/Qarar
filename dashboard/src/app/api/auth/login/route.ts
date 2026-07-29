import { cookies } from "next/headers";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

function parseEnv(source: string) {
  return Object.fromEntries(
    source
      .split(/\r?\n/)
      .filter((line) => /^[A-Za-z_][A-Za-z0-9_]*=/.test(line))
      .map((line) => {
        const separator = line.indexOf("=");
        const key = line.slice(0, separator);
        const value = line.slice(separator + 1).replace(/^"|"$/g, "");
        return [key, value];
      }),
  );
}

export async function POST(request: Request) {
  const { email, password } = await request.json();

  if (!email || !password) {
    return NextResponse.json(
      { message: "أدخل البريد الإلكتروني وكلمة المرور." },
      { status: 400 },
    );
  }

  const envPath = path.resolve(
    process.cwd(),
    "../supabase/docker/.env",
  );
  const localEnv = parseEnv(await readFile(envPath, "utf8"));
  const apiUrl = "http://127.0.0.1:54321";
  const anonKey = localEnv.ANON_KEY;

  if (!anonKey) {
    return NextResponse.json(
      { message: "إعدادات خدمة الدخول غير مكتملة." },
      { status: 503 },
    );
  }

  const authResponse = await fetch(
    `${apiUrl}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: {
        apikey: anonKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
      cache: "no-store",
    },
  );

  if (!authResponse.ok) {
    return NextResponse.json(
      { message: "البريد الإلكتروني أو كلمة المرور غير صحيحة." },
      { status: 401 },
    );
  }

  const session = await authResponse.json();
  const cookieStore = await cookies();
  cookieStore.set("qarar_access_token", session.access_token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: session.expires_in,
    path: "/",
  });
  cookieStore.set("qarar_refresh_token", session.refresh_token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });

  return NextResponse.json({ authenticated: true });
}
