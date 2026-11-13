import { describe, expect, it } from "vitest";
import { toCsv } from "./csv";

describe("toCsv", () => {
  it("starts with the UTF-8 mark so Excel reads Arabic, and ends every row", () => {
    expect(toCsv([["المجلس", "الحضور"], ["مجلس الكلية", 83]])).toBe("﻿المجلس,الحضور\r\nمجلس الكلية,83\r\n");
  });

  it("quotes commas, quotes and line breaks, and leaves empty values empty", () => {
    expect(toCsv([["أ، ب", 'قال "نعم"', "سطر\nثانٍ", null, undefined, "a,b"]])).toBe('﻿أ، ب,"قال ""نعم""","سطر\nثانٍ",,,"a,b"\r\n');
  });

  it("stores text that a spreadsheet would run as a formula as plain text, but keeps negative numbers", () => {
    expect(toCsv([["=SUM(A1)", "+1", "-cmd", "@x", -5]])).toBe("﻿'=SUM(A1),'+1,'-cmd,'@x,-5\r\n");
  });
});
