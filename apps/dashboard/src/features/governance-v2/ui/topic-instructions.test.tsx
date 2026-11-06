import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { TopicInstructions } from "./topic-instructions";
it("renders marked Markdown and safe formatting without executing unsafe HTML", () => {
  const view = render(<TopicInstructions title="تعليمات التقديم" text={'qarar:markdown:v1\n# خطة البرنامج\n\n**مهم**\n\n<span style="color: #0066cc; font-size: 24px">الموعد</span>\n\n<script>alert(1)</script><img src="https://tracker.test" onerror="alert(1)"/><a href="javascript:alert(1)">خطر</a>'}/>);
  expect(screen.getByRole("heading", { name: "خطة البرنامج" })).toBeInTheDocument();
  expect(screen.getByText("مهم").tagName).toBe("STRONG");
  expect(screen.getByText("الموعد")).toHaveStyle({ color: "#0066cc", fontSize: "24px" });
  expect(view.container.querySelector("script, img, [onerror], a[href^='javascript:']")).toBeNull();
});
it("hides empty instructions and sanitizes legacy HTML while rendering safe emphasis", () => {
  const view = render(<TopicInstructions title="تعليمات التقديم" text="  "/>);
  expect(screen.queryByRole("region")).not.toBeInTheDocument();
  view.rerender(<TopicInstructions title="تعليمات التقديم" text={'الخطوة الأولى\n\n<em>مطلوبة</em><script>unsafe</script>'}/>);
  expect(screen.getByRole("region", { name: "تعليمات التقديم" })).toHaveTextContent("الخطوة الأولى");
  expect(screen.getByText("مطلوبة").tagName).toBe("EM");
  expect(screen.queryByText("unsafe")).not.toBeInTheDocument();
  expect(view.container.querySelector("script")).toBeNull();
});
