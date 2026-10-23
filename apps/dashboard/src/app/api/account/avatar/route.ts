import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { qararRpcV2 } from "@/shared/api/qarar-server";
import { normalizeAvatar, MAX_AVATAR_BYTES } from "@/shared/security/avatar-image";
import { rejectUntrustedMutation } from "@/shared/security/request-guards";
import { safeAdminError } from "@/shared/security/admin-error";
import { logEvent } from "@/shared/observability/logger";
export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
type Avatar = { revision: number; has_image: boolean; content_base64?: string | null; saved?: boolean };
function failure(error: unknown) {
  const traceId = randomUUID();
  const safe = safeAdminError(error, "تعذر تحديث الصورة. أعد تحميلها قبل المحاولة مجددًا.", 503);
  logEvent("warn", "account.avatar.failed", { traceId, code: safe.code, cause: error instanceof Error ? error.message : "unknown" });
  return NextResponse.json({ message: safe.message, traceId }, { status: safe.code === "40001" ? 409 : safe.status, headers });
}
export async function GET(request: Request) {
  try {
    const metadata = new URL(request.url).searchParams.has("metadata");
    const result = await qararRpcV2<Avatar>("get_my_avatar_v2", { p_include_content: !metadata });
    if (metadata) return NextResponse.json({ revision: result.revision, has_image: result.has_image }, { headers });
    if (!result.content_base64) return new NextResponse(null, { status: 204, headers });
    return new NextResponse(new Uint8Array(Buffer.from(result.content_base64, "base64")), { headers: { ...headers, "Content-Type": "image/jpeg", "Content-Disposition": "inline" } });
  } catch (error) { return failure(error); }
}
async function mutate(request: Request, remove: boolean) {
  const denied = rejectUntrustedMutation(request); if (denied) return denied;
  try {
    await qararRpcV2("get_my_avatar_v2", {}); // Authenticate before decoding untrusted input.
    const declared = request.headers.get("content-length");
    if (declared && (!/^\d+$/.test(declared) || Number(declared)>MAX_AVATAR_BYTES+16384)) return NextResponse.json({ message: "حجم طلب الصورة غير صالح أو يتجاوز الحد المسموح." }, { status: 413, headers });
    // Bound the actual body, including requests with a missing/forged length.
    const reader = request.body?.getReader(); const chunks: Uint8Array[] = []; let size = 0;
    if (!reader) return NextResponse.json({ message: "طلب الصورة فارغ." }, { status: 400, headers });
    try { while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size>MAX_AVATAR_BYTES+16384) { await reader.cancel(); return NextResponse.json({ message: "حجم الصورة يتجاوز الحد المسموح." }, { status: 413, headers }); } chunks.push(value); } } finally { reader.releaseLock(); }
    const form = await new Response(Buffer.concat(chunks), { headers: { "Content-Type": request.headers.get("content-type") ?? "" } }).formData().catch(() => null);
    if (!form || form.has("user_id")) return NextResponse.json({ message: "طلب الصورة غير صالح." }, { status: 400, headers });
    const revision = String(form.get("revision") ?? ""); const requestId = String(form.get("request_id") ?? "");
    if (!/^\d+$/.test(revision) || !Number.isSafeInteger(Number(revision)) || !/^[a-f\d]{8}(-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(requestId)) return NextResponse.json({ message: "أعد تحميل حسابك قبل تعديل الصورة." }, { status: 400, headers });
    let content: string | null = null;
    if (!remove) {
      const file = form.get("file");
      if (!(file instanceof File)) return NextResponse.json({ message: "اختر صورة أولًا." }, { status: 400, headers });
      try { content = (await normalizeAvatar(file)).toString("base64"); }
      catch (error) { return NextResponse.json({ message: error instanceof Error ? error.message : "الصورة غير صالحة." }, { status: 400, headers }); }
    }
    const result = await qararRpcV2<Avatar>("set_my_avatar_v2", { p_content_base64: content, p_expected_revision: Number(revision), p_request_id: requestId });
    if (result.saved !== true || !Number.isInteger(result.revision)) throw new Error("invalid avatar receipt");
    return NextResponse.json(result, { headers });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) { return mutate(request, false); }
export async function DELETE(request: Request) { return mutate(request, true); }
