export type ReportCell = string | number | null | undefined;
export type ReportTone = "good" | "warn" | "bad";
export type ReportColumn = { header: string; width?: number; /** Colours the cell by its meaning; the text still says it. */ tone?: (value: ReportCell) => ReportTone | null };
export type ReportSheet = { name: string; title: string; facts?: Array<[string, ReportCell]>; columns: ReportColumn[]; rows: ReportCell[][]; empty?: string };
export type Report = { filename: string; title: string; subtitle: string; sheets: ReportSheet[] };

// Qarar's identity in ARGB, the only place a report states a colour.
const brand = { blue: "FF0074B8", navy: "FF0A1D33", sky: "FFDFF0F7", skyLight: "FFF2F9FC", orange: "FFF78A2C", line: "FFC3DFEB", muted: "FF3F566B", white: "FFFFFFFF" };
const toneFill: Record<ReportTone, { fill: string; text: string }> = {
  good: { fill: "FFE3F5ED", text: "FF0F6B4B" }, warn: { fill: "FFFFF0E0", text: "FFA34F00" }, bad: { fill: "FFFDE8E6", text: "FFB3261E" },
};
const font = "Segoe UI";
/** Excel sheet names: at most 31 characters and none of \ / ? * [ ] : */
const sheetName = (name: string) => name.replace(/[\\/?*[\]:]/g, " ").replace(/\s+/g, " ").trim().slice(0, 31);

/** Builds a right-to-left workbook in Qarar's identity: a titled band, facts, and a styled, filterable table per sheet. */
export async function buildReport(report: Report, generatedAt = new Date()) {
  const { Workbook } = await import("exceljs");
  const workbook = new Workbook();
  workbook.creator = "قرار";
  workbook.created = generatedAt;
  const stamp = generatedAt.toLocaleString("ar-SA-u-ca-gregory-nu-latn", { dateStyle: "long", timeStyle: "short" });

  for (const sheet of report.sheets) {
    const width = Math.max(sheet.columns.length, 4);
    const ws = workbook.addWorksheet(sheetName(sheet.name), {
      views: [{ rightToLeft: true, showGridLines: false }],
      pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 },
      headerFooter: { oddFooter: "&Cقرار، منصة حوكمة المجالس  •  صفحة &P من &N" },
    });
    sheet.columns.forEach((column, index) => { ws.getColumn(index + 1).width = column.width ?? 18; });

    const band = (row: number, text: string, style: { size: number; bold: boolean; color: string; fill: string; height: number }) => {
      ws.mergeCells(row, 1, row, width);
      const cell = ws.getCell(row, 1);
      cell.value = text;
      cell.font = { name: font, size: style.size, bold: style.bold, color: { argb: style.color } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: style.fill } };
      cell.alignment = { horizontal: "right", vertical: "middle", indent: 1, readingOrder: "rtl" };
      ws.getRow(row).height = style.height;
    };
    band(1, "قرار  |  منصة حوكمة المجالس", { size: 11, bold: true, color: brand.white, fill: brand.blue, height: 24 });
    band(2, sheet.title, { size: 18, bold: true, color: brand.navy, fill: brand.sky, height: 36 });
    band(3, `${report.subtitle}  •  صدر في ${stamp}`, { size: 10, bold: false, color: brand.muted, fill: brand.sky, height: 22 });
    // The orange rule under the band is the identity's accent.
    for (let column = 1; column <= width; column += 1) ws.getCell(3, column).border = { bottom: { style: "medium", color: { argb: brand.orange } } };

    let row = 5;
    for (const [label, value] of sheet.facts ?? []) {
      ws.getCell(row, 1).value = label;
      ws.getCell(row, 1).font = { name: font, size: 10, color: { argb: brand.muted } };
      ws.getCell(row, 2).value = value ?? "—";
      ws.getCell(row, 2).font = { name: font, size: 11, bold: true, color: { argb: brand.navy } };
      ws.getCell(row, 1).alignment = ws.getCell(row, 2).alignment = { horizontal: "right", readingOrder: "rtl" };
      row += 1;
    }
    if (sheet.facts?.length) row += 1;

    const headerRow = row;
    sheet.columns.forEach((column, index) => {
      const cell = ws.getCell(headerRow, index + 1);
      cell.value = column.header;
      cell.font = { name: font, size: 10.5, bold: true, color: { argb: brand.white } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: brand.blue } };
      cell.alignment = { horizontal: "right", vertical: "middle", wrapText: true, readingOrder: "rtl" };
      cell.border = { bottom: { style: "thin", color: { argb: brand.navy } } };
    });
    ws.getRow(headerRow).height = 30;

    if (sheet.rows.length === 0) {
      ws.mergeCells(headerRow + 1, 1, headerRow + 1, width);
      ws.getCell(headerRow + 1, 1).value = sheet.empty ?? "لا بيانات.";
      ws.getCell(headerRow + 1, 1).font = { name: font, size: 10.5, italic: true, color: { argb: brand.muted } };
      ws.getCell(headerRow + 1, 1).alignment = { horizontal: "right", readingOrder: "rtl" };
    }
    sheet.rows.forEach((values, rowIndex) => {
      const at = headerRow + 1 + rowIndex;
      sheet.columns.forEach((column, index) => {
        const value = values[index];
        const cell = ws.getCell(at, index + 1);
        // Values are written as plain values, never formulas, so text beginning with "=" stays text.
        cell.value = value ?? "";
        const tone = value == null || value === "" ? null : column.tone?.(value) ?? null;
        cell.font = { name: font, size: 10.5, bold: Boolean(tone), color: { argb: tone ? toneFill[tone].text : brand.navy } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: tone ? toneFill[tone].fill : rowIndex % 2 ? brand.skyLight : brand.white } };
        cell.alignment = { horizontal: typeof value === "number" ? "center" : "right", vertical: "middle", wrapText: true, readingOrder: "rtl" };
        cell.border = { bottom: { style: "hair", color: { argb: brand.line } } };
      });
    });
    if (sheet.rows.length > 0) ws.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: headerRow + sheet.rows.length, column: sheet.columns.length } };
    ws.views = [{ rightToLeft: true, showGridLines: false, state: "frozen", ySplit: headerRow }];
  }
  return workbook;
}

/** Builds the report and hands it to the browser as an .xlsx file to save. */
export async function downloadReport(report: Report) {
  const workbook = await buildReport(report);
  const url = URL.createObjectURL(new Blob([await workbook.xlsx.writeBuffer()], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${report.filename}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
