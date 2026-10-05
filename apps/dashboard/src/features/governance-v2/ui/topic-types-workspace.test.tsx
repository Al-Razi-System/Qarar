import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { TopicTypesWorkspace } from "./topic-types-workspace";

describe("TopicTypesWorkspace", () => {
  it("keeps validation feedback beside the first step and preserves entered values", async () => {
    const user = userEvent.setup();
    render(<TopicTypesWorkspace />);

    await user.click(screen.getAllByRole("button", { name: /إنشاء نوع موضوع/ })[0]);
    await user.click(screen.getByRole("button", { name: /^التالي/ }));

    expect(screen.getByText(/اختر تصنيف الموضوع/)).toBeInTheDocument();
    expect(screen.getByText(/اكتب اسماً واضحاً/)).toBeInTheDocument();
    expect(screen.getByText(/استخدم رمزاً إنجليزياً/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "أكاديمي" }));
    await user.type(screen.getByPlaceholderText("مثال: اعتماد برنامج أكاديمي"), "اعتماد برنامج أكاديمي");
    await user.type(screen.getByPlaceholderText("academic.program"), "academic.program");
    await user.click(screen.getByRole("button", { name: /^التالي/ }));

    expect(screen.getByRole("heading", { name: "ماذا يحدث بعد القرار؟" })).toBeInTheDocument();
    expect(screen.getByText("اعتماد برنامج أكاديمي")).toBeInTheDocument();
  });

  it("explains why saving is unavailable in the internal preview", async () => {
    const user = userEvent.setup();
    render(<TopicTypesWorkspace />);
    await user.click(screen.getAllByRole("button", { name: /إنشاء نوع موضوع/ })[0]);
    await user.click(screen.getByRole("button", { name: "أكاديمي" }));
    await user.type(screen.getByPlaceholderText("مثال: اعتماد برنامج أكاديمي"), "اعتماد برنامج أكاديمي");
    await user.type(screen.getByPlaceholderText("academic.program"), "academic.program");
    await user.click(screen.getByRole("button", { name: /^التالي/ }));
    await user.click(screen.getByRole("button", { name: /^التالي/ }));
    await user.click(screen.getByRole("button", { name: /^التالي/ }));
    await user.click(screen.getByRole("button", { name: /^التالي/ }));

    expect(screen.getByText(/المعاينة غير متصلة بالحفظ بعد/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /حفظ المسودة/ })).toBeDisabled();
  });

  it("uses a compact mobile progress indicator and renders the route without a fixed-width step rail", async () => {
    const user = userEvent.setup();
    render(<TopicTypesWorkspace />);
    await user.click(screen.getAllByRole("button", { name: /إنشاء نوع موضوع/ })[0]);

    expect(screen.getByText("الخطوة 1 من 5")).toBeInTheDocument();
    const navigation = screen.getByRole("navigation", { name: "خطوات إعداد نوع الموضوع" });
    expect(screen.getByText("الخطوة 1 من 5").closest("div.rounded-2xl")).toHaveClass("sm:hidden");
    expect(navigation.querySelector("ol")).toHaveClass("hidden", "sm:grid", "sm:grid-cols-5");
    expect(navigation.querySelector("ol")).not.toHaveClass("min-w-[720px]");

    await user.click(screen.getByRole("button", { name: "أكاديمي" }));
    await user.type(screen.getByPlaceholderText("مثال: اعتماد برنامج أكاديمي"), "اعتماد برنامج أكاديمي");
    await user.type(screen.getByPlaceholderText("academic.program"), "academic.program");
    await user.click(screen.getByRole("button", { name: /^التالي/ }));
    await user.click(screen.getByRole("button", { name: /^التالي/ }));

    expect(screen.getByRole("heading", { name: "ما مسار الحوكمة؟" })).toBeInTheDocument();
    expect(screen.getByLabelText("معاينة مسار الحوكمة")).toHaveTextContent("مجلس القسم");
    expect(screen.getByLabelText("معاينة مسار الحوكمة")).toHaveTextContent("مجلس الجامعة");
  });
});
