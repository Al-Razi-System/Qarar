"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { InlineMessage } from "@/shared/ui/inline-message";

export function MeetingMinutesDownloadButton({ meetingId, meetingTitle }: { meetingId: string; meetingTitle: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/meetings/${encodeURIComponent(meetingId)}/minutes/pdf`, { cache: "no-store" });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: { message?: string }; message?: string } | null;
        throw new Error(payload?.error?.message ?? payload?.message ?? "تعذر إعداد المحضر الرسمي. أعد المحاولة.");
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = fileNameFrom(response.headers.get("Content-Disposition")) ?? "محضر-الاجتماع.pdf";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "تعذر إعداد المحضر الرسمي. أعد المحاولة.");
    } finally {
      setPending(false);
    }
  }

  return <div className="flex min-w-0 flex-col items-start gap-2">
    <Button
      variant="secondary"
      pending={pending}
      pendingLabel="جارٍ إعداد المحضر…"
      aria-label={`تنزيل محضر ${meetingTitle}`}
      onClick={() => void download()}
    >
      <Download size={17} />تنزيل المحضر الرسمي
    </Button>
    {error && <InlineMessage tone="error">{error}</InlineMessage>}
  </div>;
}

function fileNameFrom(contentDisposition: string | null) {
  if (!contentDisposition) return null;
  const utf8 = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (utf8) {
    try { return decodeURIComponent(utf8); } catch { return null; }
  }
  return contentDisposition.match(/filename="([^"]+)"/i)?.[1] ?? null;
}
