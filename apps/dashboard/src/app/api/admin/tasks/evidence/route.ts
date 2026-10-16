import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getQararEnv, qararRpcV2 } from "@/shared/api/qarar-server";
import { safeAdminError } from "@/shared/security/admin-error";
import {
  contentTypeForStoredAttachment,
  detectAllowedUploadMime,
  extensionForUploadMime,
  inspectMultipartRequestSize,
  MAX_UPLOAD_BYTES,
} from "@/shared/security/upload-security";
import { scanUploadForMalware } from "@/shared/security/upload-malware-scan";
import { rejectUntrustedMutation } from "@/shared/security/request-guards";

export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type TaskEvidence = { id: string; storage_path: string };

async function authenticated() { return Boolean((await cookies()).get("qarar_access_token")?.value); }
const failure = (message: string, status: number) => NextResponse.json({ error: { message } }, { status });

async function storage(path: string, init: RequestInit = {}) {
  const env = await getQararEnv();
  if (!env.SERVICE_ROLE_KEY) return null;
  return fetch(`${env.SUPABASE_URL}/storage/v1/object/qarar-evidence/${path}`, {
    ...init,
    headers: { apikey: env.SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SERVICE_ROLE_KEY}`, ...(init.headers ?? {}) },
  });
}

function rpcFailure(error: unknown, fallback: string) {
  const safe = safeAdminError(error, fallback, 500);
  return failure(safe.message, safe.status);
}

/** Uploads one evidence file: the task's executor only, checked by the database after the store accepts the file. */
export async function POST(request: Request) {
  const originError = rejectUntrustedMutation(request);
  if (originError) return originError;
  if (!(await authenticated())) return failure("انتهت الجلسة.", 401);

  const requestSize = await inspectMultipartRequestSize(request);
  if (requestSize === "invalid_content_length") return failure("رأس حجم الطلب غير صالح.", 400);
  if (requestSize === "invalid_body") return failure("جسم طلب الرفع غير صالح.", 400);
  if (requestSize === "too_large") return failure("حجم طلب الرفع يتجاوز الحد المسموح.", 413);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return failure("تعذر قراءة بيانات الرفع.", 400);
  }
  const file = form.get("file");
  const taskId = String(form.get("taskId") ?? "");
  const description = String(form.get("description") ?? "");
  if (!(file instanceof File) || !UUID.test(taskId)) return failure("اختر ملفاً صالحاً للمهمة.", 400);
  if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) return failure("حجم الملف يجب ألا يتجاوز 25 ميجابايت.", 413);
  const mimeType = await detectAllowedUploadMime(file);
  if (!mimeType) return failure("الملفات المسموحة: PDF أو PNG أو JPEG أو DOCX أصلية.", 415);
  const malwareScan = await scanUploadForMalware(file);
  if (malwareScan.state === "infected") return failure("رُفض الملف لأسباب أمنية.", 422);
  if (malwareScan.state === "unavailable") return failure("فحص أمان الملفات غير متاح حالياً. لم يُخزّن الملف.", 503);

  // Read first: a task the user cannot see is refused before anything is stored.
  try {
    await qararRpcV2("get_task_v2", { p_task_id: taskId });
  } catch (error) {
    return rpcFailure(error, "تعذر الوصول إلى المهمة.");
  }
  const path = `tasks/${taskId}/${randomUUID()}${extensionForUploadMime(mimeType)}`;
  const put = await storage(path, { method: "POST", headers: { "Content-Type": mimeType, "x-upsert": "false" }, body: await file.arrayBuffer() });
  if (!put) return failure("مخزن الملفات غير مهيأ.", 503);
  if (!put.ok) return failure("تعذر رفع الملف إلى المخزن الخاص.", 502);
  try {
    const evidence = await qararRpcV2("add_task_evidence_v2", {
      p_task_id: taskId, p_file_name: file.name, p_storage_path: path, p_mime_type: mimeType,
      p_file_size_bytes: file.size, p_description: description || null,
    });
    return NextResponse.json({ data: evidence });
  } catch (error) {
    await storage(path, { method: "DELETE" });
    return rpcFailure(error, "تعذر تسجيل الدليل.");
  }
}

/** Serves an evidence file to whoever may read its task. */
export async function GET(request: Request) {
  if (!(await authenticated())) return failure("انتهت الجلسة.", 401);
  const url = new URL(request.url);
  const taskId = url.searchParams.get("taskId") ?? "";
  const evidenceId = url.searchParams.get("evidenceId") ?? "";
  if (!UUID.test(taskId) || !UUID.test(evidenceId)) return failure("رابط الدليل غير صالح.", 400);
  let evidence: TaskEvidence | undefined;
  try {
    const task = await qararRpcV2<{ evidence: TaskEvidence[] }>("get_task_v2", { p_task_id: taskId });
    evidence = task.evidence.find((row) => row.id === evidenceId);
  } catch (error) {
    return rpcFailure(error, "تعذر الوصول إلى المهمة.");
  }
  if (!evidence || !evidence.storage_path.startsWith(`tasks/${taskId}/`)) return failure("الدليل غير مرتبط بهذه المهمة.", 404);
  const contentType = contentTypeForStoredAttachment(evidence.storage_path);
  const inline = url.searchParams.get("disposition") === "inline" && (contentType === "application/pdf" || contentType.startsWith("image/"));
  const stored = await storage(evidence.storage_path, { cache: "no-store" });
  if (!stored?.ok || !stored.body) return failure("الملف غير موجود.", 404);
  return new NextResponse(stored.body, { headers: { "Content-Type": contentType, "Content-Disposition": inline ? "inline" : "attachment", "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store" } });
}

/** Removes an evidence file before submission: the database decides, then the store forgets the file. */
export async function DELETE(request: Request) {
  const originError = rejectUntrustedMutation(request);
  if (originError) return originError;
  if (!(await authenticated())) return failure("انتهت الجلسة.", 401);
  const evidenceId = new URL(request.url).searchParams.get("evidenceId") ?? "";
  if (!UUID.test(evidenceId)) return failure("رابط الدليل غير صالح.", 400);
  try {
    const removed = await qararRpcV2<{ storage_path: string }>("remove_task_evidence_v2", { p_evidence_id: evidenceId });
    // The record is gone; a file left behind in the private store is unreachable and harmless.
    await storage(removed.storage_path, { method: "DELETE" });
    return NextResponse.json({ data: removed });
  } catch (error) {
    return rpcFailure(error, "تعذر حذف الدليل.");
  }
}
