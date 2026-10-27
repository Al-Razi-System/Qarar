import { readFile } from "node:fs/promises";
import path from "node:path";
import { renderToBuffer } from "@react-pdf/renderer";
import { qararRpc } from "@/shared/api/qarar-server";
import { safeAdminError } from "@/shared/security/admin-error";
import { TopicDocument, type TopicPdfData } from "@/features/topics/pdf/topic-document";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request, context: { params: Promise<{ topicId: string }> }) {
  try {
    const { topicId } = await context.params;
    const meetingId = new URL(request.url).searchParams.get("meetingId");
    if (!uuidPattern.test(topicId) || (meetingId !== null && !uuidPattern.test(meetingId))) {
      return Response.json({ error: { code: "INVALID_IDENTIFIER", message: "معرّف الموضوع أو الاجتماع غير صالح." } }, { status: 400 });
    }

    const meetingAuthorization = meetingId
      ? qararRpc("get_meeting_detail", { p_meeting_id: meetingId })
      : Promise.resolve(null);
    const [topic, workflow, attachments, requirements, references, referrals, meetings, activity, account, logoBuffer] = await Promise.all([
      qararRpc<TopicPdfData["topic"]>("get_topic_detail", { p_topic_id: topicId }),
      qararRpc<TopicPdfData["workflow"]>("get_topic_workflow", { p_topic_id: topicId }),
      qararRpc<TopicPdfData["attachments"]>("list_topic_attachments", { p_topic_id: topicId }),
      qararRpc<TopicPdfData["requirements"]>("get_topic_requirements_status", { p_topic_id: topicId }),
      qararRpc<TopicPdfData["references"]>("list_topic_regulation_references", { p_topic_id: topicId }),
      qararRpc<TopicPdfData["referrals"]>("get_topic_route_history", { p_topic_id: topicId }),
      qararRpc<TopicPdfData["meetings"]>("get_topic_meeting_history", { p_topic_id: topicId }),
      qararRpc<TopicPdfData["activity"]>("get_topic_activity_timeline", { p_topic_id: topicId }),
      qararRpc<{ full_name_ar?: string; profile?: { full_name_ar?: string } }>("get_my_account", {}),
      readFile(path.join(process.cwd(), "public/brand/razi-university.jpg")),
      meetingAuthorization,
    ]);

    const document = TopicDocument({
      topic,
      workflow,
      attachments: attachments ?? [],
      requirements,
      references: references ?? [],
      referrals: referrals ?? [],
      meetings: meetings ?? [],
      activity: activity ?? [],
      printedBy: account.profile?.full_name_ar ?? account.full_name_ar ?? "مستخدم نظام قرار",
      printedAt: new Date().toISOString(),
      logo: `data:image/jpeg;base64,${logoBuffer.toString("base64")}`,
    });
    const pdf = await renderToBuffer(document as Parameters<typeof renderToBuffer>[0]);

    // The export is not successful until both document creation and its audit
    // receipt succeed. A failed render therefore never creates a false event.
    await qararRpc("record_topic_pdf_export", { p_topic_id: topicId, p_meeting_id: meetingId });

    const safeNumber = (topic.topic_no ?? topic.id).replace(/[^A-Za-z0-9_-]/g, "-");
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${safeNumber}-topic.pdf"; filename*=UTF-8''${encodeURIComponent(`ملف-${topic.topic_no ?? topic.id}.pdf`)}`,
        "Cache-Control": "private, no-store, no-cache, must-revalidate, max-age=0",
        "Pragma": "no-cache",
        "Expires": "0",
      },
    });
  } catch (error) {
    const safeError = safeAdminError(error, "تعذر إنشاء ملف الموضوع. تحقق من الاتصال والصلاحية ثم أعد المحاولة.", 500);
    return Response.json({ error: { code: safeError.code, message: safeError.message } }, { status: safeError.status });
  }
}
