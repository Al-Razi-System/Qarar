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

    expect(screen.getByText(/المعاينة غير متصلة بالحفظ بعد/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /حفظ المسودة/ })).toBeDisabled();
  });
});
