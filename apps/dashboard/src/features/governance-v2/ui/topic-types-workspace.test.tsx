import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TopicTypesWorkspace } from "./topic-types-workspace";

describe("TopicTypesWorkspace", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { classifications: [], workflow_versions: [{ id: "workflow-1", code: "academic.route", name_ar: "المسار الأكاديمي", version_no: 1, steps: [{ id: "step-1", name_ar: "مجلس القسم", sequence_no: 1 }, { id: "step-2", name_ar: "مجلس الجامعة", sequence_no: 2 }] } ] } }),
    }));
  });
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

  it("saves the complete draft and shows success beside the action", async () => {
    const user = userEvent.setup();
    render(<TopicTypesWorkspace />);
    await user.click(screen.getAllByRole("button", { name: /إنشاء نوع موضوع/ })[0]);
    await user.click(screen.getByRole("button", { name: "أكاديمي" }));
    await user.type(screen.getByPlaceholderText("مثال: اعتماد برنامج أكاديمي"), "اعتماد برنامج أكاديمي");
    await user.type(screen.getByPlaceholderText("academic.program"), "academic.program");
    await user.click(screen.getByRole("button", { name: /^التالي/ }));
    await user.click(screen.getByRole("button", { name: /^التالي/ }));
    await user.click(await screen.findByRole("button", { name: /المسار الأكاديمي/ }));
    await user.click(screen.getByRole("button", { name: /^التالي/ }));
    await user.click(screen.getByRole("button", { name: /^التالي/ }));

    await user.click(screen.getByRole("button", { name: /حفظ المسودة/ }));
    expect(await screen.findByText(/حُفظت المسودة كاملة بنجاح/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /تم الحفظ/ })).toBeDisabled();
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
    await user.click(await screen.findByRole("button", { name: /المسار الأكاديمي/ }));
    expect(screen.getByLabelText("معاينة مسار الحوكمة")).toHaveTextContent("مجلس القسم");
    expect(screen.getByLabelText("معاينة مسار الحوكمة")).toHaveTextContent("مجلس الجامعة");
  });
});
