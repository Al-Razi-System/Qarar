import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { InstructionContent } from "./instruction-content";

describe("InstructionContent legacy guidance", () => {
  it("renders imported escaped Markdown inside legacy HTML containers", () => {
    render(<InstructionContent value={'qarar:markdown:v1\n<div dir="rtl" style="line-height:2">\n\n<h2>دليل المناقشة</h2>\n\n<div>\n\n\\### 💰 الإيرادات\n\n\\- واقعية الإيرادات\n\n\\- سلامة المصروفات\n\n</div>\n\n\\---\n\n1\\. افتتاح الموضوع\n\n2\\. عرض المشروع\n\n| المسؤول | الدور |\n\n|:---|:---|\n\n| الرئيس | إدارة النقاش |\n\n</div>'} />);
    expect(screen.getByRole("heading", { level: 3, name: "💰 الإيرادات" })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
    expect(screen.getByRole("table")).toHaveTextContent("إدارة النقاش");
    expect(screen.getByRole("separator")).toBeInTheDocument();
  });
  it("renders prefixed imported escaped Markdown even when it has no legacy HTML wrapper", () => {
    render(<InstructionContent value={'qarar:markdown:v1\n\\# مناقشة الاعتماد\n\n\\---\n\n\\### استعراض الطلب\n\n\\- اسم الطالب\n\n\\- عنوان الرسالة\n\n1\\. التحقق من المرفقات'} />);
    expect(screen.getByRole("heading", { level: 1, name: "مناقشة الاعتماد" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "استعراض الطلب" })).toBeInTheDocument();
    expect(screen.getByRole("separator")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });
  it("renders unprefixed Markdown and safe HTML without rewriting the source", () => {
    render(<InstructionContent value={'### المخاطر المالية\n\n- السيولة\n\n<strong>أرفق التقرير</strong>'} />);
    expect(screen.getByRole("heading", { name: "المخاطر المالية", level: 3 })).toBeInTheDocument();
    expect(screen.getByRole("listitem")).toHaveTextContent("السيولة");
    expect(screen.getByText("أرفق التقرير").tagName).toBe("STRONG");
  });
  it("sanitizes legacy HTML, links and embedded content", () => {
    const { container } = render(<InstructionContent value={'<script>alert(1)</script><iframe src="https://evil.test"></iframe><a href="javascript:alert(1)" onclick="alert(1)">خطر</a><span style="position:fixed;color:#0066cc">آمن</span>'} />);
    expect(container.querySelector("script,iframe,[onclick],[href^='javascript:']")).toBeNull();
    expect(screen.getByText("آمن")).not.toHaveAttribute("style", expect.stringContaining("position"));
  });
  it("preserves escaped literal Markdown and fenced HTML examples", () => {
    const { container } = render(<InstructionContent value={'\\### عنوان حرفي\n\n```html\n<div>مثال برمجي</div>\n```'} />);
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(container.querySelector("code")).toHaveTextContent("<div>مثال برمجي</div>");
  });
  it("does not normalize blank lines inside a fenced table example", () => {
    const { container } = render(<InstructionContent value={'```md\n| اسم | قيمة |\n\n| أ | ب |\n```'} />);
    expect(container.querySelector("code")?.textContent).toContain("| اسم | قيمة |\n\n| أ | ب |");
  });
});
