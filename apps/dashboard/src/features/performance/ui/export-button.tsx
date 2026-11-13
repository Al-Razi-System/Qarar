"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import type { Report } from "@/shared/lib/excel-report";
import { Button } from "@/shared/ui/button";
import { InlineMessage } from "@/shared/ui/inline-message";

/** Saves what the screen shows as a formatted Excel report. The spreadsheet library loads only when asked for. */
export function ExportButton({ report, label = "تصدير إلى Excel" }: { report: () => Report; label?: string }) {
  const [state, setState] = useState<"idle" | "pending" | "failed">("idle");
  async function save() {
    setState("pending");
    try {
      const { downloadReport } = await import("@/shared/lib/excel-report");
      await downloadReport(report());
      setState("idle");
    } catch {
      setState("failed");
    }
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button variant="secondary" pending={state === "pending"} pendingLabel="يجري تجهيز الملف…" onClick={() => void save()}>
        <Download size={18} aria-hidden="true" />{label}
      </Button>
      {state === "failed" && <InlineMessage tone="error">تعذر تجهيز الملف. حاول مرة أخرى.</InlineMessage>}
    </span>
  );
}
