export type CsvCell = string | number | null | undefined;

/** A cell a spreadsheet would run as a formula is stored as text instead. */
function cell(value: CsvCell) {
  const raw = value == null ? "" : String(value);
  const text = /^[=+\-@\t\r]/.test(raw) && typeof value !== "number" ? `'${raw}` : raw;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Rows as CSV text. The leading mark makes Excel read Arabic as UTF-8. */
export const toCsv = (rows: ReadonlyArray<ReadonlyArray<CsvCell>>) => `﻿${rows.map((row) => row.map(cell).join(",")).join("\r\n")}\r\n`;

/** Hands the rows to the browser as a file to save. */
export function downloadCsv(filename: string, rows: ReadonlyArray<ReadonlyArray<CsvCell>>) {
  const url = URL.createObjectURL(new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
