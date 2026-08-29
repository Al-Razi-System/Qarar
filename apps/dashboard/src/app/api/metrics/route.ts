import { metricsSnapshot, metricsSnapshotPrometheus } from "@/shared/observability/logger";
import { apiSuccess, requestId } from "@/shared/api/response";
import { constantTimeTokenEquals } from "@/shared/security/request-guards";

export async function GET(request: Request) {
  // This endpoint is intentionally internal; production ingress must protect
  // it too. A missing server secret must never turn into an implicit allow.
  if (process.env.NODE_ENV === "production") {
    const configuredToken = process.env.METRICS_TOKEN;
    if (!configuredToken || !configuredToken.trim()) {
      return Response.json(
        { error: { code: "CONFIGURATION_ERROR", message: "Metrics endpoint is not configured", requestId: requestId(request) } },
        { status: 503, headers: { "Cache-Control": "no-store", Vary: "x-internal-metrics-token" } },
      );
    }

    const authorization = request.headers.get("authorization");
    const bearerToken = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
    if (!constantTimeTokenEquals(request.headers.get("x-internal-metrics-token") ?? bearerToken, configuredToken)) {
      return Response.json(
        { error: { code: "FORBIDDEN", message: "Access denied", requestId: requestId(request) } },
        { status: 403, headers: { "Cache-Control": "no-store", Vary: "x-internal-metrics-token" } },
      );
    }
  }
  if (new URL(request.url).searchParams.get("format") === "prometheus") {
    return new Response(metricsSnapshotPrometheus(), {
      headers: { "Content-Type": "text/plain; version=0.0.4; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
  return apiSuccess(metricsSnapshot(), requestId(request));
}
