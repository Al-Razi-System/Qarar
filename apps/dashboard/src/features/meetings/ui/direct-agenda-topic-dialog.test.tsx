import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { DirectAgendaTopicDialog } from "./direct-agenda-topic-dialog";

test("keeps voting optional and submits the selected policy", async () => {
  const user = userEvent.setup();
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  render(<DirectAgendaTopicDialog pending={false} error={null} onClose={() => {}} onSubmit={onSubmit} />);

  await user.type(screen.getByLabelText("عنوان الموضوع"), "إحاطة المجلس بنتائج الربع الأول");
  await user.type(screen.getByLabelText("وصف الموضوع"), "عرض موجز للنتائج دون الحاجة إلى إصدار قرار.");
  await user.click(screen.getByRole("button", { name: "إضافة إلى جدول الأعمال" }));
  expect(onSubmit).toHaveBeenLastCalledWith(expect.objectContaining({ requiresVoting: false }));

  await user.click(screen.getByRole("checkbox", { name: "يتطلب تصويت المجلس" }));
  await user.click(screen.getByRole("button", { name: "إضافة إلى جدول الأعمال" }));
  expect(onSubmit).toHaveBeenLastCalledWith(expect.objectContaining({ requiresVoting: true }));
});

test("shows the action error beside the form and preserves typed content", async () => {
  const user = userEvent.setup();
  const { rerender } = render(<DirectAgendaTopicDialog pending={false} error={null} onClose={() => {}} onSubmit={async () => {}} />);
  await user.type(screen.getByLabelText("عنوان الموضوع"), "موضوع مباشر للاجتماع");
  rerender(<DirectAgendaTopicDialog pending={false} error="تعذر حفظ الموضوع." onClose={() => {}} onSubmit={async () => {}} />);
  expect(screen.getByRole("alert")).toHaveTextContent("تعذر حفظ الموضوع.");
  expect(screen.getByLabelText("عنوان الموضوع")).toHaveValue("موضوع مباشر للاجتماع");
});
