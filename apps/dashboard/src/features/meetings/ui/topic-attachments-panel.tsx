import { Download, Eye, FileImage, FileText, Paperclip } from "lucide-react";
import type { MeetingTopicAttachment } from "../model/meeting";

export function TopicAttachmentsPanel({ meetingId, attachments, compact = false }: {
  meetingId: string;
  attachments: MeetingTopicAttachment[];
  compact?: boolean;
}) {
  if (!attachments.length) return null;

  return <section className={`rounded-2xl border border-[#dce8f2] bg-[#f8fbfe] ${compact ? "p-3" : "p-4"}`} aria-label="مرفقات الموضوع">
    <div className="mb-3 flex items-center justify-between gap-2">
      <div className="flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-xl bg-[#e5f2ff] text-[#0877d6]"><Paperclip size={15} /></span><div><h4 className="text-[11px] font-black text-[#173652]">ملفات العرض والمناقشة</h4><p className="text-[9px] text-[#718399]">مرفقات الموضوع المحفوظة في المخزن الخاص</p></div></div>
      <span className="rounded-full bg-white px-2.5 py-1 text-[9px] font-black text-[#0877d6] ring-1 ring-[#d8e6f2]">{attachments.length}</span>
    </div>
    <div className={`grid gap-2 ${compact ? "" : "sm:grid-cols-2"}`}>{attachments.map((attachment) => {
      const image = attachment.mime_type.startsWith("image/");
      const viewUrl = attachmentUrl(attachment.file_url, meetingId, "inline");
      const downloadUrl = attachmentUrl(attachment.file_url, meetingId, "attachment");
      return <article key={attachment.id} className="flex items-center gap-3 rounded-xl border border-[#e2eaf2] bg-white p-3">
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${image ? "bg-violet-50 text-violet-700" : "bg-blue-50 text-blue-700"}`}>{image ? <FileImage size={18} /> : <FileText size={18} />}</span>
        <div className="min-w-0 flex-1"><strong className="block truncate text-[10px] text-[#243b53]" title={attachment.file_name}>{attachment.file_name}</strong><p className="mt-1 text-[8px] text-[#7b8da0]">{formatSize(attachment.file_size_bytes)}{attachment.description ? ` · ${attachment.description}` : ""}</p></div>
        <div className="flex shrink-0 gap-1"><a href={viewUrl} target="_blank" rel="noreferrer" title="عرض الملف" className="grid h-8 w-8 place-items-center rounded-lg border border-[#d8e5ef] text-[#0877d6] hover:bg-blue-50"><Eye size={14} /></a><a href={downloadUrl} download title="تنزيل الملف" className="grid h-8 w-8 place-items-center rounded-lg border border-[#d8e5ef] text-[#526a81] hover:bg-slate-50"><Download size={14} /></a></div>
      </article>;
    })}</div>
  </section>;
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

function formatSize(bytes?: number) {
  if (!bytes) return "";
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.ceil(bytes / 1024)} KB`;
}
