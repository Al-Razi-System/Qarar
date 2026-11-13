"use client";

import { Download } from "lucide-react";
import { downloadCsv, type CsvCell } from "@/shared/lib/csv";
import { Button } from "@/shared/ui/button";

/** Saves what the screen shows as a spreadsheet file. Disabled, with the reason, when there is nothing to save. */
export function ExportButton({ filename, rows, label = "تصدير إلى Excel" }: { filename: string; rows: () => CsvCell[][]; label?: string }) {
  return (
    <Button variant="secondary" onClick={() => downloadCsv(filename, rows())}>
      <Download size={18} aria-hidden="true" />{label}
    </Button>
  );
}
