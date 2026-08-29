import { NextRequest, NextResponse } from "next/server";

const ACCESS_COOKIE = "qarar_access_token";
const REFRESH_COOKIE = "qarar_refresh_token";
const EXPIRY_SKEW_SECONDS = 30;

type RefreshedSession = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
};

function tokenExpiresSoon(token: string) {
  try {
    const payload = token.split(".")[1]?.replace(/-/g, "+").replace(/_/g, "/");
    if (!payload) return true;
    const { exp } = JSON.parse(Buffer.from(payload, "base64").toString("utf8")) as {
      exp?: unknown;
    };
    return typeof exp !== "number" || exp <= Math.floor(Date.now() / 1000) + EXPIRY_SKEW_SECONDS;
  } catch {
    return true;
  }
}

function clearSession(response: NextResponse) {
  for (const name of [ACCESS_COOKIE, REFRESH_COOKIE]) {
    response.cookies.set(name, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      expires: new Date(0),
      path: "/",
    });
  }
}

export async function proxy(request: NextRequest) {
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  if (accessToken && !tokenExpiresSoon(accessToken)) return NextResponse.next();

  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;
  if (!refreshToken) return NextResponse.next();

  const supabaseUrl = process.env.QARAR_SUPABASE_URL?.replace(/\/$/, "");
  const anonKey = process.env.QARAR_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return NextResponse.next();

  const refreshed = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ refresh_token: refreshToken }),
    cache: "no-store",
  });

  if (!refreshed.ok) {
    const response = NextResponse.next();
    clearSession(response);
    return response;
  }

  const session = (await refreshed.json()) as RefreshedSession;
  if (!session.access_token) {
    const response = NextResponse.next();
    clearSession(response);
    return response;
  }

  // Repeat the original navigation after persisting the rotated session so
  // Server Components read the new cookies on the same logical request.
  const response = NextResponse.redirect(request.nextUrl);
  response.cookies.set(ACCESS_COOKIE, session.access_token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: session.expires_in ?? 60 * 60,
    path: "/",
  });
  if (session.refresh_token) {
    response.cookies.set(REFRESH_COOKIE, session.refresh_token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 30,
      path: "/",
    });
  }
  return response;
}

export const config = {
  matcher: ["/", "/login", "/admin/:path*", "/api/admin/:path*"],
};
