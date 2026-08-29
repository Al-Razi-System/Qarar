import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getQararEnv, qararRpc } from "@/shared/api/qarar-server";
import {
  contentTypeForStoredAttachment,
  detectAllowedUploadMime,
  extensionForUploadMime,
  inspectMultipartRequestSize,
  MAX_UPLOAD_BYTES,
} from "@/shared/security/upload-security";
import { scanUploadForMalware } from "@/shared/security/upload-malware-scan";
import { getDashboardOrigin, rejectUntrustedMutation } from "@/shared/security/request-guards";

export const runtime = "nodejs";

function objectName(mimeType: Parameters<typeof extensionForUploadMime>[0]) {
  return `${randomUUID()}${extensionForUploadMime(mimeType)}`;
}
async function authenticated() { return Boolean((await cookies()).get("qarar_access_token")?.value); }

export async function POST(request: Request) {
  const originError = rejectUntrustedMutation(request);
  if (originError) return originError;

  if (!(await authenticated())) return NextResponse.json({ error: { message: "انتهت الجلسة." } }, { status: 401 });
  const requestSize = await inspectMultipartRequestSize(request);
  if (requestSize === "invalid_content_length") return NextResponse.json({ error: { message: "رأس حجم الطلب غير صالح." } }, { status: 400 });
  if (requestSize === "invalid_body") return NextResponse.json({ error: { message: "جسم طلب الرفع غير صالح." } }, { status: 400 });
  if (requestSize === "too_large") return NextResponse.json({ error: { message: "حجم طلب الرفع يتجاوز الحد المسموح." } }, { status: 413 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: { message: "تعذر قراءة بيانات الرفع." } }, { status: 400 });
  }
  const file = form.get("file"); const topicId = String(form.get("topicId") ?? ""); const description = String(form.get("description") ?? ""); const requirementCode = String(form.get("requirementCode") ?? "");
  if (!(file instanceof File) || !topicId) return NextResponse.json({ error: { message: "اختر ملفًا صالحًا للموضوع." } }, { status: 400 });
  if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: { message: "حجم الملف يجب ألا يتجاوز 25 ميجابايت." } }, { status: 413 });
  const mimeType = await detectAllowedUploadMime(file);
  if (!mimeType) return NextResponse.json({ error: { message: "الملفات المسموحة: PDF أو PNG أو JPEG أو DOCX أصلية." } }, { status: 415 });
  const malwareScan = await scanUploadForMalware(file);
  if (malwareScan.state === "infected") return NextResponse.json({ error: { message: "رُفض الملف لأسباب أمنية." } }, { status: 422 });
  if (malwareScan.state === "unavailable") return NextResponse.json({ error: { message: "فحص أمان الملفات غير متاح حاليًا. لم يُخزّن الملف." } }, { status: 503 });

  const origin = getDashboardOrigin();
  if (!origin) return NextResponse.json({ error: { message: "إعداد APP_ORIGIN مطلوب لخدمة المرفقات." } }, { status: 503 });
  await qararRpc("get_topic_detail", { p_topic_id: topicId });
  const env = await getQararEnv();
  if (!env.SERVICE_ROLE_KEY) return NextResponse.json({ error: { message: "مخزن الملفات غير مهيأ." } }, { status: 503 });
  const path = `topics/${topicId}/${objectName(mimeType)}`;
  const put = await fetch(`${env.SUPABASE_URL}/storage/v1/object/qarar-evidence/${path}`, { method: "POST", headers: { apikey: env.SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SERVICE_ROLE_KEY}`, "Content-Type": mimeType, "x-upsert": "false" }, body: await file.arrayBuffer() });
  if (!put.ok) return NextResponse.json({ error: { message: "تعذر رفع الملف إلى المخزن الخاص." } }, { status: 502 });
  const fileUrl = new URL("/api/admin/topics/upload", origin);
  fileUrl.searchParams.set("topicId", topicId);
  fileUrl.searchParams.set("path", path);
  try {
    const attachment = await qararRpc("add_topic_attachment", { p_topic_id: topicId, p_file_name: file.name, p_file_url: fileUrl.toString(), p_mime_type: mimeType, p_file_size_bytes: file.size, p_description: description || null, p_requirement_code: requirementCode || null });
    return NextResponse.json({ data: { attachment, fileName: file.name, fileUrl: fileUrl.toString() } });
  } catch (error) {
    await fetch(`${env.SUPABASE_URL}/storage/v1/object/qarar-evidence/${path}`, { method: "DELETE", headers: { apikey: env.SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SERVICE_ROLE_KEY}` } });
    throw error;
  }
}

export async function GET(request: Request) {
  if (!(await authenticated())) return NextResponse.json({ error: { message: "انتهت الجلسة." } }, { status: 401 });
  const url = new URL(request.url); const topicId = url.searchParams.get("topicId") ?? ""; const path = url.searchParams.get("path") ?? "";
  if (!topicId || !path.startsWith(`topics/${topicId}/`) || path.includes("..")) return NextResponse.json({ error: { message: "مسار الملف غير صالح." } }, { status: 400 });
  await qararRpc("get_topic_detail", { p_topic_id: topicId }); const env = await getQararEnv();
  const stored = await fetch(`${env.SUPABASE_URL}/storage/v1/object/qarar-evidence/${path}`, { headers: { apikey: env.SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SERVICE_ROLE_KEY}` }, cache: "no-store" });
  if (!stored.ok || !stored.body) return NextResponse.json({ error: { message: "الملف غير موجود." } }, { status: 404 });
  return new NextResponse(stored.body, { headers: { "Content-Type": contentTypeForStoredAttachment(path), "Content-Disposition": "attachment", "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store" } });
}
