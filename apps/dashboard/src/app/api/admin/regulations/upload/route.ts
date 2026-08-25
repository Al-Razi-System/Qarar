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

function safeName(mimeType: Parameters<typeof extensionForUploadMime>[0]) {
  return `${randomUUID()}${extensionForUploadMime(mimeType)}`;
}

async function authenticated() {
  return Boolean((await cookies()).get("qarar_access_token")?.value);
}

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
  const file = form.get("file");
  const policyId = String(form.get("policyId") ?? "");
  const target = String(form.get("target") ?? "policy");
  const versionId = String(form.get("versionId") ?? "");
  const itemId = String(form.get("itemId") ?? "");
  const description = String(form.get("description") ?? "");
  if (!(file instanceof File) || !policyId) return NextResponse.json({ error: { message: "اختر ملفًا صالحًا." } }, { status: 400 });
  if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: { message: "حجم الملف يجب ألا يتجاوز 25 ميجابايت." } }, { status: 413 });
  const mimeType = await detectAllowedUploadMime(file);
  if (!mimeType) return NextResponse.json({ error: { message: "نوع الملف غير مسموح. استخدم PDF أو PNG أو JPEG أو DOCX أصلية." } }, { status: 415 });
  const malwareScan = await scanUploadForMalware(file);
  if (malwareScan.state === "infected") return NextResponse.json({ error: { message: "رُفض الملف لأسباب أمنية." } }, { status: 422 });
  if (malwareScan.state === "unavailable") return NextResponse.json({ error: { message: "فحص أمان الملفات غير متاح حاليًا. لم يُخزّن الملف." } }, { status: 503 });
  if (target === "version" && !versionId || target === "item" && !itemId) return NextResponse.json({ error: { message: "حدد موضع إرفاق الملف." } }, { status: 400 });

  const origin = getDashboardOrigin();
  if (!origin) return NextResponse.json({ error: { message: "إعداد APP_ORIGIN مطلوب لخدمة المرفقات." } }, { status: 503 });
  await qararRpc("admin_get_policy_detail", { p_policy_id: policyId });
  const env = await getQararEnv();
  if (!env.SERVICE_ROLE_KEY) return NextResponse.json({ error: { message: "مخزن الملفات غير مهيأ." } }, { status: 503 });
  const objectPath = `${policyId}/${safeName(mimeType)}`;
  const storage = await fetch(`${env.SUPABASE_URL}/storage/v1/object/qarar-evidence/${objectPath}`, {
    method: "POST",
    headers: {
      apikey: env.SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SERVICE_ROLE_KEY}`,
      "Content-Type": mimeType,
      "x-upsert": "false",
    },
    body: await file.arrayBuffer(),
  });
  if (!storage.ok) return NextResponse.json({ error: { message: "تعذر رفع الملف إلى المخزن الخاص." } }, { status: 502 });
  // Attachments are served through this authenticated route. Persist an
  // absolute URL because policy_attachments only accepts valid HTTP(S) links.
  const fileUrl = new URL("/api/admin/regulations/upload", origin);
  fileUrl.searchParams.set("policyId", policyId);
  fileUrl.searchParams.set("path", objectPath);
  try {
    const attachment = await qararRpc("admin_add_policy_attachment", {
      p_policy_id: target === "policy" ? policyId : null,
      p_policy_version_id: target === "version" ? versionId : null,
      p_policy_item_id: target === "item" ? itemId : null,
      p_file_name: file.name,
      p_file_url: fileUrl.toString(),
      p_mime_type: mimeType,
      p_file_size_bytes: file.size,
      p_description: description || null,
    });
    return NextResponse.json({ data: { attachment, fileUrl: fileUrl.toString(), fileName: file.name } });
  } catch (error) {
    await fetch(`${env.SUPABASE_URL}/storage/v1/object/qarar-evidence/${objectPath}`, {
      method: "DELETE",
      headers: { apikey: env.SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SERVICE_ROLE_KEY}` },
    });
    throw error;
  }
}

export async function GET(request: Request) {
  if (!(await authenticated())) return NextResponse.json({ error: { message: "انتهت الجلسة." } }, { status: 401 });
  const url = new URL(request.url);
  const policyId = url.searchParams.get("policyId") ?? "";
  const objectPath = url.searchParams.get("path") ?? "";
  if (!policyId || !objectPath.startsWith(`${policyId}/`) || objectPath.includes("..")) return NextResponse.json({ error: { message: "مسار ملف غير صالح." } }, { status: 400 });
  await qararRpc("admin_get_policy_detail", { p_policy_id: policyId });
  const env = await getQararEnv();
  const stored = await fetch(`${env.SUPABASE_URL}/storage/v1/object/qarar-evidence/${objectPath}`, {
    headers: { apikey: env.SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SERVICE_ROLE_KEY}` },
    cache: "no-store",
  });
  if (!stored.ok || !stored.body) return NextResponse.json({ error: { message: "الملف غير موجود." } }, { status: 404 });
  return new NextResponse(stored.body, {
    headers: {
      "Content-Type": contentTypeForStoredAttachment(objectPath),
      "Content-Disposition": "attachment",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
