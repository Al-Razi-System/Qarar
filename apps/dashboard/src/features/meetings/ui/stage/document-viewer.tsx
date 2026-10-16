"use client";

import { useState } from "react";
import { Button } from "@/shared/ui/button";
import type { MeetingTopicAttachment } from "../../model/meeting";
import { attachmentUrl } from "../topic-attachments-panel";

type Props = {
  meetingId: string;
  attachment: MeetingTopicAttachment;
  /** The page on screen, for PDF files. */
  page: number;
  /** Whoever controls the broadcast turns pages and closes the file; everyone else follows. */
  controls: boolean;
  /** Who opened the file, for a follower. */
  controllerName?: string;
  onPage?: (page: number) => void;
  onClose?: () => void;
};

/**
 * A meeting file shown inside the room. PDF files open on the broadcast page
 * and images as they are; the controller's page turns reach every screen.
 */
export function DocumentViewer({ meetingId, attachment, page, controls, controllerName, onPage, onClose }: Props) {
  const [pageDraft, setPageDraft] = useState<{ base: number; value: string } | null>(null);
  const pdf = attachment.mime_type === "application/pdf";
  const image = attachment.mime_type.startsWith("image/");
  const source = attachmentUrl(attachment.file_url, meetingId, "inline");
  const draft = pageDraft && pageDraft.base === page ? pageDraft.value : String(page);

  function goTo(next: number) {
    if (!Number.isInteger(next) || next < 1 || next > 10_000) return;
    setPageDraft(null);
    onPage?.(next);
  }

  return (
    <section aria-label={`عرض ${attachment.file_name}`} className="flex flex-col gap-2 rounded-q-control border border-q-primary bg-q-surface p-2">
      <header className="flex flex-wrap items-center justify-between gap-2 px-1">
        <div className="min-w-0">
          <p className="m-0 truncate text-q-ui font-bold" title={attachment.file_name}>{attachment.file_name}</p>
          <p className="m-0 text-q-caption text-q-text-2">
            {controls ? "يظهر هذا الملف على كل الشاشات." : `يعرضه ${controllerName ?? "رئيس المجلس"} على كل الشاشات.`}
            {pdf && ` الصفحة ${page}.`}
          </p>
        </div>
        {controls && (
          <div className="flex flex-wrap items-center gap-2">
            {pdf && (
              <>
                <Button variant="secondary" disabled={page <= 1} onClick={() => goTo(page - 1)} aria-label="الصفحة السابقة">السابقة</Button>
                <label className="flex items-center gap-1 text-q-caption font-bold">
                  <span className="sr-only">رقم الصفحة</span>
                  <input
                    inputMode="numeric"
                    value={draft}
                    onChange={(event) => setPageDraft({ base: page, value: event.target.value.replace(/[^0-9]/g, "") })}
                    onKeyDown={(event) => { if (event.key === "Enter") goTo(Number(draft)); }}
                    onBlur={() => { if (draft !== String(page)) goTo(Number(draft)); }}
                    className="h-11 w-16 rounded-q-control border border-q-border bg-q-surface text-center text-q-ui text-q-text"
                  />
                </label>
                <Button variant="secondary" onClick={() => goTo(page + 1)} aria-label="الصفحة التالية">التالية</Button>
              </>
            )}
            <Button variant="ghost" onClick={onClose}>إغلاق الملف</Button>
          </div>
        )}
      </header>
      {pdf && (
        // The page is part of the address, so a page turn reloads the file on every screen at that page.
        <iframe key={page} title={attachment.file_name} src={`${source}#page=${page}&toolbar=0&navpanes=0`} className="h-[70vh] min-h-96 w-full rounded-q-control border-0 bg-q-surface-2 lg:h-[60vh]" />
      )}
      {image && (
        // eslint-disable-next-line @next/next/no-img-element -- a private, authenticated file; the image optimizer cannot fetch it.
        <img src={source} alt={attachment.file_name} className="max-h-[70vh] w-full rounded-q-control object-contain" />
      )}
      {!pdf && !image && <p className="m-0 p-3 text-q-ui text-q-text-2">لا يُعرض هذا النوع من الملفات داخل الغرفة.</p>}
    </section>
  );
}
