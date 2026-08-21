import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

type Environment = Record<string, string | undefined>;

function configuredDashboardOrigin(
  environment: Environment = process.env,
): string | null {
  const rawOrigin = environment.APP_ORIGIN?.trim();
  if (!rawOrigin) return null;

  try {
    const url = new URL(rawOrigin);
    if (
      (url.protocol !== "https:" &&
        !(environment.NODE_ENV !== "production" && url.protocol === "http:")) ||
      url.username ||
      url.password ||
      (environment.NODE_ENV === "production" && rawOrigin !== url.origin) ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) {
      return null;
    }

    return url.origin;
  } catch {
    return null;
  }
}

/**
 * Returns the deployment-owned dashboard origin. It deliberately never falls
 * back to request headers: Host and forwarded host headers are attacker
 * controlled unless every proxy in front of the application is trusted.
 */
export function getDashboardOrigin(
  environment: Environment = process.env,
): string | null {
  const configuredOrigin = configuredDashboardOrigin(environment);
  if (configuredOrigin) return configuredOrigin;

  // Local development remains usable without a deployment file. Production
  // never receives this fallback and must provide a verified HTTPS origin.
  if (!environment.APP_ORIGIN?.trim() && environment.NODE_ENV !== "production") {
    return "http://localhost:3000";
  }

  return null;
}

function originError(status: number, message: string) {
  return NextResponse.json(
    { error: { code: status === 503 ? "CONFIGURATION_ERROR" : "CSRF_FORBIDDEN", message } },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        Vary: "Origin",
      },
    },
  );
}

/**
 * Defends cookie-authenticated mutation routes against cross-site requests.
 * Production must explicitly configure APP_ORIGIN. Non-production remains
 * usable without it, but enforces it whenever one is supplied.
 */
export function rejectUntrustedMutation(
  request: Request,
  environment: Environment = process.env,
): NextResponse | null {
  const allowedOrigin = configuredDashboardOrigin(environment);
  if (!allowedOrigin) {
    if (environment.NODE_ENV === "production") {
      return originError(503, "إعداد APP_ORIGIN مطلوب لحماية طلبات الإدارة.");
    }
    return null;
  }

  const origin = request.headers.get("origin");
  if (!origin || origin === "null" || origin !== allowedOrigin) {
    return originError(403, "مصدر الطلب غير موثوق.");
  }

  return null;
}

/** Uses a length-independent comparison for secret bearer-style values. */
export function constantTimeTokenEquals(
  supplied: string | null,
  expected: string | undefined,
): boolean {
  if (!supplied || !expected) return false;

  const suppliedBytes = Buffer.from(supplied, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");
  return (
    suppliedBytes.byteLength === expectedBytes.byteLength &&
    timingSafeEqual(suppliedBytes, expectedBytes)
  );
}
