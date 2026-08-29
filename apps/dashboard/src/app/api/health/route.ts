import { apiSuccess } from "@/shared/api/response";

export async function GET(request: Request) {
  return apiSuccess({ status: "ok", service: "dashboard" }, request.headers.get("x-request-id") ?? crypto.randomUUID());
}
