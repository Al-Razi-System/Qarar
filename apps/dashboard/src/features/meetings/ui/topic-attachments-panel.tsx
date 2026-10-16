import { cn } from "@/shared/lib/utils";
import type { MeetingTopicAttachment } from "../model/meeting";

const linkClass = "inline-flex min-h-11 items-center rounded-q-control border border-q-border bg-q-surface px-3 text-q-caption font-bold text-q-link hover:bg-q-surface-2";

/** The chair's decision on downloading this item's files, with its in-place feedback. */
export type DownloadControl = {
  allowed: boolean;
  /** Only the council's chair decides. */
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
  if (!attachments.length) return null;

  return (
    <section aria-label="مرفقات الموضوع" className="flex flex-col gap-3 font-sans text-q-text">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="m-0 text-q-caption font-bold text-q-text-2">ملفات العرض والمناقشة · {attachments.length}</p>
        {downloads?.canChange && (
          <label className="flex min-h-11 items-center gap-2 text-q-caption font-bold text-q-text">
            <input
              type="checkbox"
              className="h-5 w-5 accent-q-primary"
              checked={downloads.allowed}
              disabled={downloads.pending}
              onChange={(event) => downloads.onChange(event.target.checked)}
            />
            السماح للمشاركين بتنزيل مرفقات هذا البند
          </label>
        )}
      </div>
      {downloads?.pending && <p role="status" className="m-0 text-q-caption font-bold text-q-text-2">جارٍ حفظ إذن التنزيل…</p>}
      {downloads?.error && <p role="alert" className="m-0 text-q-caption font-bold text-q-danger">{downloads.error}</p>}
      <ul className={`m-0 grid list-none gap-2 p-0 ${compact ? "" : "sm:grid-cols-2"}`}>
        {attachments.map((attachment) => {
          const downloadable = attachment.download_allowed !== false;
          const viewable = attachment.mime_type === "application/pdf" || attachment.mime_type.startsWith("image/");
          const viewing = attachment.id === viewingId;
          return (
            <li key={attachment.id} className={cn("flex flex-wrap items-center justify-between gap-3 rounded-q-control border bg-q-surface-2 p-3", viewing ? "border-q-primary" : "border-q-border")}>
              <div className="min-w-0 flex-1">
                <strong className="block truncate text-q-ui" title={attachment.file_name}>{attachment.file_name}</strong>
                <span className="block text-q-caption text-q-text-2">{[fileKind(attachment.mime_type), formatSize(attachment.file_size_bytes), attachment.description].filter(Boolean).join(" · ")}</span>
                {!downloadable && <span className="block text-q-caption text-q-text-2">التنزيل غير متاح لهذا البند؛ يُعرض داخل الغرفة.</span>}
              </div>
              <div className="flex shrink-0 gap-2">
                {followsBroadcast ? null : onView
                  ? viewable && (
                    <button type="button" onClick={() => onView(attachment)} aria-pressed={viewing} aria-label={`عرض ${attachment.file_name}`} className={linkClass}>
                      {viewing ? "معروض" : "عرض"}
                    </button>
                  )
                  : <a href={attachmentUrl(attachment.file_url, meetingId, "inline")} target="_blank" rel="noreferrer" aria-label={`عرض ${attachment.file_name}`} className={linkClass}>عرض</a>}
                {downloadable && <a href={attachmentUrl(attachment.file_url, meetingId, "attachment")} download aria-label={`تنزيل ${attachment.file_name}`} className={linkClass}>تنزيل</a>}
              </div>
            </li>
          );
        })}
      </ul>
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
