import type { MeetingTopicAttachment } from "../model/meeting";

const linkClass = "inline-flex min-h-11 items-center rounded-q-control border border-q-border bg-q-surface px-3 text-q-caption font-bold text-q-link hover:bg-q-surface-2";

export function TopicAttachmentsPanel({ meetingId, attachments, compact = false }: {
  meetingId: string;
  attachments: MeetingTopicAttachment[];
  compact?: boolean;
}) {
  if (!attachments.length) return null;

  return (
    <section aria-label="مرفقات الموضوع" className="flex flex-col gap-3 font-sans text-q-text">
      <p className="m-0 text-q-caption font-bold text-q-text-2">ملفات العرض والمناقشة · {attachments.length}</p>
      <ul className={`m-0 grid list-none gap-2 p-0 ${compact ? "" : "sm:grid-cols-2"}`}>
        {attachments.map((attachment) => (
          <li key={attachment.id} className="flex flex-wrap items-center justify-between gap-3 rounded-q-control border border-q-border bg-q-surface-2 p-3">
            <div className="min-w-0 flex-1">
              <strong className="block truncate text-q-ui" title={attachment.file_name}>{attachment.file_name}</strong>
              <span className="block text-q-caption text-q-text-2">{[fileKind(attachment.mime_type), formatSize(attachment.file_size_bytes), attachment.description].filter(Boolean).join(" · ")}</span>
            </div>
            <div className="flex shrink-0 gap-2">
              <a href={attachmentUrl(attachment.file_url, meetingId, "inline")} target="_blank" rel="noreferrer" aria-label={`عرض ${attachment.file_name}`} className={linkClass}>عرض</a>
              <a href={attachmentUrl(attachment.file_url, meetingId, "attachment")} download aria-label={`تنزيل ${attachment.file_name}`} className={linkClass}>تنزيل</a>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function attachmentUrl(fileUrl: string, meetingId: string, disposition: "inline" | "attachment") {
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
