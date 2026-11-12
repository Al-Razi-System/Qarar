"use client";

import { useState } from "react";
import { Download, Eye } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Dialog } from "@/shared/ui/dialog";
import { InlineMessage } from "@/shared/ui/inline-message";
import type { MeetingTopicAttachment } from "../model/meeting";

const linkClass = "inline-flex min-h-11 items-center rounded-q-control border border-q-border bg-q-surface px-3 text-q-caption font-bold text-q-link hover:bg-q-surface-2";

/** Council leadership's decision on member downloads, with in-place feedback. */
export type DownloadControl = {
  allowed: boolean;
  /** Only the contextual council chair or rapporteur decides. */
  canChange: boolean;
  pending: boolean;
  error?: string | null;
  onChange: (allowed: boolean) => void;
};

export function TopicAttachmentsPanel({ meetingId, attachments, compact = false, onView, viewingId, downloads, followsBroadcast = false }: {
  meetingId: string;
  attachments: MeetingTopicAttachment[];
  compact?: boolean;
  /** Inside the live room a file opens in the room's viewer instead of a new tab. */
  onView?: (attachment: MeetingTopicAttachment) => void;
  /** The file open in the viewer now. */
  viewingId?: string | null;
  downloads?: DownloadControl;
  /** A participant following the broadcast sees what the controller opens and opens nothing of their own. */
  followsBroadcast?: boolean;
}) {
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  if (!attachments.length) return null;

  return (
    <section aria-label="مرفقات الموضوع" className="flex flex-col gap-3 font-sans text-q-text">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="m-0 text-q-caption font-bold text-q-text-2">ملفات العرض والمناقشة · {attachments.length}</p>
      </div>
      {downloads?.canChange && <div className="flex flex-wrap items-center justify-between gap-3 rounded-q-control border border-q-border bg-q-surface-2 p-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-q-control bg-q-surface text-q-link" aria-hidden="true">{downloads.allowed ? <Download size={20}/> : <Eye size={20}/>}</span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2"><strong className="text-q-ui">تنزيل المرفقات للأعضاء</strong><Badge tone={downloads.allowed ? "success" : "neutral"}>{downloads.allowed ? "التنزيل متاح" : "عرض فقط"}</Badge></div>
            <p className="m-0 mt-1 text-q-caption text-q-text-2">يستطيع الأعضاء عرض الملفات داخل قرار دائمًا، ولا يظهر لهم التنزيل إلا عند فتحه لهذا البند.</p>
          </div>
        </div>
        <Button variant="secondary" pending={downloads.pending} pendingLabel="جارٍ الحفظ…" onClick={() => setConfirmationOpen(true)}>
          {downloads.allowed ? "إيقاف تنزيل المرفقات للأعضاء" : "فتح تنزيل المرفقات للأعضاء"}
        </Button>
      </div>}
      {downloads?.pending && <p role="status" className="m-0 text-q-caption font-bold text-q-text-2">جارٍ حفظ إذن التنزيل…</p>}
      {downloads?.error && <p role="alert" className="m-0 text-q-caption font-bold text-q-danger">{downloads.error}</p>}
      <ul className={`m-0 grid list-none gap-2 p-0 ${compact ? "" : "sm:grid-cols-2"}`}>
        {attachments.map((attachment) => {
          const downloadable = (attachment.viewer_download_allowed ?? attachment.download_allowed) !== false;
          const viewable = attachment.mime_type === "application/pdf" || attachment.mime_type.startsWith("image/");
          const viewing = attachment.id === viewingId;
          return (
            <li key={attachment.id} className={cn("flex flex-wrap items-center justify-between gap-3 rounded-q-control border bg-q-surface-2 p-3", viewing ? "border-q-primary" : "border-q-border")}>
              <div className="min-w-0 flex-1">
                <strong className="block truncate text-q-ui" title={attachment.file_name}>{attachment.file_name}</strong>
                <span className="block text-q-caption text-q-text-2">{[fileKind(attachment.mime_type), formatSize(attachment.file_size_bytes), attachment.description].filter(Boolean).join(" · ")}</span>
                {!downloadable && <span className="block text-q-caption text-q-text-2">هذا المرفق للعرض داخل النظام فقط.</span>}
              </div>
              <div className="flex shrink-0 gap-2">
                {followsBroadcast ? null : onView
                  ? viewable && (
                    <button type="button" onClick={() => onView(attachment)} aria-pressed={viewing} aria-label={`عرض ${attachment.file_name}`} className={linkClass}>
                      {viewing ? "معروض" : "عرض"}
                    </button>
                  )
                  : viewable && <a href={attachmentUrl(attachment.file_url, meetingId, "inline")} target="_blank" rel="noreferrer" aria-label={`عرض ${attachment.file_name}`} className={linkClass}>عرض</a>}
                {downloadable && <a href={attachmentUrl(attachment.file_url, meetingId, "attachment")} download aria-label={`تنزيل ${attachment.file_name}`} className={linkClass}>تنزيل</a>}
              </div>
              {!viewable && !downloadable && <p className="m-0 w-full text-q-caption text-q-text-2">لا تتوفر معاينة آمنة لهذا النوع من الملفات.</p>}
            </li>
          );
        })}
      </ul>
      {downloads?.canChange && confirmationOpen && <Dialog
        title={downloads.allowed ? "إيقاف تنزيل المرفقات للأعضاء؟" : "فتح تنزيل المرفقات للأعضاء؟"}
        description="يسري القرار على مرفقات هذا البند فقط، ويُحفظ في سجل التدقيق."
        closeDisabled={downloads.pending}
        onClose={() => setConfirmationOpen(false)}
        footer={<>
          <Button variant="secondary" disabled={downloads.pending} onClick={() => setConfirmationOpen(false)}>إلغاء</Button>
          <Button
            variant={downloads.allowed ? "danger" : "primary"}
            pending={downloads.pending}
            pendingLabel="جارٍ الحفظ…"
            onClick={() => { setConfirmationOpen(false); downloads.onChange(!downloads.allowed); }}
          >
            {downloads.allowed ? "تأكيد الإيقاف" : "تأكيد فتح التنزيل"}
          </Button>
        </>}
      >
        <InlineMessage tone={downloads.allowed ? "warning" : "info"}>
          {downloads.allowed
            ? "بعد الإيقاف تبقى المعاينة داخل النظام متاحة، وتختفي روابط التنزيل من شاشات الأعضاء."
            : "بعد الفتح يستطيع أعضاء الاجتماع تنزيل جميع مرفقات هذا البند حتى يُغلق الإذن مجددًا."}
        </InlineMessage>
      </Dialog>}
    </section>
  );
}

export function attachmentUrl(fileUrl: string, meetingId: string, disposition: "inline" | "attachment") {
  try {
    const url = new URL(fileUrl);
    url.searchParams.set("meetingId", meetingId);
    url.searchParams.set("disposition", disposition);
    return `${url.pathname}${url.search}`;
  } catch {
    return fileUrl;
  }
}

function fileKind(mimeType: string) {
  if (mimeType.startsWith("image/")) return "صورة";
  if (mimeType === "application/pdf") return "ملف PDF";
  return "مستند";
}

function formatSize(bytes?: number) {
  if (!bytes) return "";
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} م.ب`;
  return `${Math.ceil(bytes / 1024)} ك.ب`;
}
