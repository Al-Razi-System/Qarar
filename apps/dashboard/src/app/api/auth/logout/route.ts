import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getQararEnv } from "@/shared/api/qarar-server";
import { rejectUntrustedMutation } from "@/shared/security/request-guards";

async function revokeRemoteSession(accessToken: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const environment = await getQararEnv();
    if (!environment.SUPABASE_URL || !environment.ANON_KEY) return;

    await fetch(`${environment.SUPABASE_URL}/auth/v1/logout`, {
      method: "POST",
      headers: {
        apikey: environment.ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
      signal: controller.signal,
    });
  } catch {
    // Logout must still clear the browser session when GoTrue is unavailable.
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(request: Request) {
  const originError = rejectUntrustedMutation(request);
  if (originError) return originError;

  const cookieStore = await cookies();
  const accessToken = cookieStore.get("qarar_access_token")?.value;
  if (accessToken) await revokeRemoteSession(accessToken);

  ["qarar_access_token", "qarar_refresh_token"].forEach((name) => {
    cookieStore.set({
      name,
      value: "",
      path: "/",
      expires: new Date(0),
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
  });
  return NextResponse.json({ authenticated: false });
}
