import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { InstructionEditor } from "./instruction-editor";
import { encodeInstruction, instructionHtml } from "../content/instruction-markdown";
import { serializeInstruction } from "../content/instruction-serialization";

function Harness({ initial = "" }) {
  const [value, setValue] = useState(initial);
  return <><InstructionEditor label="تعليمات التقديم" value={value} onChange={setValue} hint="تظهر لمقدم الموضوع"/><output data-testid="stored">{value}</output></>;
}
describe("InstructionEditor", () => {
  it("preserves old literal text without writing on mount and previews Markdown safely", async () => {
    const user = userEvent.setup(); render(<Harness initial="نص **قديم**"/>);
    expect(await screen.findByRole("textbox", { name: "تعليمات التقديم" })).toHaveTextContent("نص **قديم**");
    expect(screen.getByTestId("stored")).toHaveTextContent("نص **قديم**");
    await user.click(screen.getByRole("tab", { name: "Markdown" }));
    const source = screen.getByLabelText("مصدر Markdown — تعليمات التقديم");
    await user.clear(source); await user.type(source, "# التقديم\n\n**أرفق الخطة**");
    await user.click(screen.getByRole("tab", { name: "عرض" }));
    expect(screen.getByRole("heading", { name: "التقديم" })).toBeInTheDocument();
    expect(screen.getByRole("tabpanel").querySelector(':scope > div[dir="auto"] strong')).toHaveTextContent("أرفق الخطة");
    await user.click(screen.getByRole("tab", { name: "محرر" }));
    expect(screen.getByRole("textbox", { name: "تعليمات التقديم" }).querySelector("h1")).toHaveTextContent("التقديم");
    expect(screen.getByTestId("stored").textContent).toBe(encodeInstruction("# التقديم\n\n**أرفق الخطة**"));
  });
  it("imports md locally and preserves the previous content on a read failure", async () => {
    const user = userEvent.setup(); render(<Harness initial="النص السابق"/>);
    await screen.findByRole("textbox", { name: "تعليمات التقديم" });
    const file = new File(["# ملف التعليمات"], "guide.md", { type: "text/markdown" });
    Object.defineProperty(file, "text", { value: async () => "# ملف التعليمات" });
    await user.upload(screen.getByLabelText("استيراد ملف تعليمات التقديم"), file);
    await waitFor(() => expect(screen.getByLabelText("مصدر Markdown — تعليمات التقديم")).toHaveValue("# ملف التعليمات"));
    const broken = new File(["bad"], "broken.md", { type: "text/markdown" });
    Object.defineProperty(broken, "text", { value: async () => { throw new Error("تعذر قراءة الملف"); } });
    await user.upload(screen.getByLabelText("استيراد ملف تعليمات التقديم"), broken);
    expect(await screen.findByRole("alert")).toHaveTextContent("تعذر قراءة الملف");
    expect(screen.getByTestId("stored").textContent).toBe(encodeInstruction("# ملف التعليمات"));
  });
  it("round trips headings, bold, underline, sizes and colors without unsafe CSS", () => {
    const value = serializeInstruction('<h2>التقديم</h2><p><span style="color: rgb(255, 0, 0); font-size:24px"><strong>الخطة</strong></span> <u>مطلوبة</u></p>');
    const html = instructionHtml(value);
    expect(html).toContain("<h2>التقديم</h2>");
    expect(html).toContain("<strong>الخطة</strong>");
    expect(html).toContain("font-size: 24px");
    expect(html).toContain("color: #ff0000");
    expect(html).toContain("<u>مطلوبة</u>");
    expect(instructionHtml(encodeInstruction('<span style="position:fixed;color:#ff0000;background:url(https://x)">آمن</span>'))).not.toMatch(/position|background|https/);
  });
  it("updates when another classification is opened and reports overlong content without truncation", async () => {
    const onChange = vi.fn();
    const view = render(<InstructionEditor label="تعليمات التقديم" value="قديم" onChange={onChange} hint="اختياري"/>);
    await screen.findByRole("textbox", { name: "تعليمات التقديم" });
    view.rerender(<InstructionEditor label="تعليمات التقديم" value={encodeInstruction("## جديد")} onChange={onChange} hint="اختياري"/>);
    await waitFor(() => expect(screen.getByRole("textbox", { name: "تعليمات التقديم" }).querySelector("h2")).toHaveTextContent("جديد"));
    view.rerender(<InstructionEditor label="تعليمات التقديم" value={"ن".repeat(10001)} onChange={onChange} hint="اختياري"/>);
    expect(screen.getByRole("alert")).toHaveTextContent("التعليمات طويلة");
    expect(onChange).not.toHaveBeenCalled();
  });
  it("rejects oversized imports and preserves existing text", async () => {
    const user = userEvent.setup(); render(<Harness initial="محفوظ"/>);
    const file = new File(["x".repeat(40001)], "large.md", { type: "text/markdown" });
    await user.upload(screen.getByLabelText("استيراد ملف تعليمات التقديم"), file);
    expect(await screen.findByRole("alert")).toHaveTextContent("40 كيلوبايت");
    expect(screen.getByTestId("stored")).toHaveTextContent("محفوظ");
  });
});
