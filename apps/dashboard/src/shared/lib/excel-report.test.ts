import { describe, expect, it } from "vitest";
import { buildReport, type Report } from "./excel-report";

const report: Report = {
  filename: "تقرير", title: "متابعة المجالس", subtitle: "العام الجامعي 2026–2027",
  sheets: [{
    name: "المجالس: [كلية/قسم]", title: "متابعة المجالس", facts: [["عدد المجالس", 2]],
    columns: [{ header: "المجلس", width: 30 }, { header: "الحالة", tone: (value) => (value === "متعثر" ? "bad" : null) }, { header: "الحضور %" }],
    rows: [["مجلس الكلية", "متعثر", 38], ["=SUM(A1)", "منتظم", null]],
  }, { name: "فارغة", title: "بلا صفوف", columns: [{ header: "أ" }], rows: [], empty: "لا تكليفات." }],
};

describe("buildReport", () => {
  it("builds a right-to-left sheet with Qarar's band, the facts and a filterable header", async () => {
    const workbook = await buildReport(report, new Date("2026-11-13T10:00:00Z"));
    const sheet = workbook.worksheets[0];
    expect(sheet.name).toBe("المجالس كلية قسم");
    expect(sheet.views[0]).toMatchObject({ rightToLeft: true, state: "frozen", ySplit: 7 });
    expect(sheet.getCell("A1").value).toBe("قرار  |  منصة حوكمة المجالس");
    expect(sheet.getCell("A2").value).toBe("متابعة المجالس");
    expect(String(sheet.getCell("A3").value)).toContain("العام الجامعي 2026–2027");
    expect([sheet.getCell("A5").value, sheet.getCell("B5").value]).toEqual(["عدد المجالس", 2]);
    expect([1, 2, 3].map((column) => sheet.getCell(7, column).value)).toEqual(["المجلس", "الحالة", "الحضور %"]);
    expect(sheet.autoFilter).toEqual({ from: { row: 7, column: 1 }, to: { row: 9, column: 3 } });
  });

  it("writes values as values, colours a cell by its meaning, and keeps numbers numeric", async () => {
    const sheet = (await buildReport(report)).worksheets[0];
    expect(sheet.getCell("A9").value).toBe("=SUM(A1)");
    expect(sheet.getCell("A9").type).not.toBe(6);
    expect(sheet.getCell("C8").value).toBe(38);
    expect((sheet.getCell("B8").fill as { fgColor: { argb: string } }).fgColor.argb).toBe("FFFDE8E6");
    expect(sheet.getCell("C9").value).toBe("");
  });

  it("says so on a sheet without rows instead of leaving it blank", async () => {
    const sheet = (await buildReport(report)).worksheets[1];
    expect(sheet.getCell("A6").value).toBe("لا تكليفات.");
    expect(sheet.autoFilter).toBeFalsy();
  });
});
