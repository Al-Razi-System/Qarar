import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("../api/meetings-client", () => ({ meetingRpc: rpc }));
import { MeetingArchivePolicy } from "./meeting-archive-policy";

const settings = { academic_year_start_month: 9, archive_after_days: 30, updated_at: "2026-11-01T00:00:00Z", can_manage: true };

beforeEach(() => rpc.mockReset());

it("states when meetings archive and when numbering restarts", async () => {
  rpc.mockResolvedValueOnce(settings);
  render(<MeetingArchivePolicy/>);
  expect(await screen.findByText(/يُؤرشف الاجتماع تلقائيًا بعد 30 يومًا من اعتماد محضره/)).toBeVisible();
  expect(screen.getByText(/من 1 في سبتمبر/)).toBeVisible();
});

it("hides the edit action from someone who cannot manage meetings", async () => {
  rpc.mockResolvedValueOnce({ ...settings, can_manage: false });
  render(<MeetingArchivePolicy/>);
  await screen.findByText(/يُؤرشف الاجتماع تلقائيًا/);
  expect(screen.queryByRole("button", { name: "تعديل الأرشفة والترقيم" })).not.toBeInTheDocument();
});

it("refuses an out-of-range delay before sending, then saves with the version it read", async () => {
  rpc.mockResolvedValueOnce(settings).mockResolvedValueOnce({ ...settings, archive_after_days: 45, updated_at: "2026-11-02T00:00:00Z" });
  render(<MeetingArchivePolicy/>);
  fireEvent.click(await screen.findByRole("button", { name: "تعديل الأرشفة والترقيم" }));
  fireEvent.change(screen.getByLabelText("الأرشفة بعد اعتماد المحضر (بالأيام)"), { target: { value: "0" } });
  fireEvent.click(screen.getByRole("button", { name: "حفظ الإعدادات" }));
  expect(await screen.findByText("مدة الأرشفة يجب أن تكون من 1 إلى 365 يومًا.")).toBeVisible();
  expect(rpc).toHaveBeenCalledTimes(1);
  fireEvent.change(screen.getByLabelText("الأرشفة بعد اعتماد المحضر (بالأيام)"), { target: { value: "45" } });
  fireEvent.click(screen.getByRole("button", { name: "حفظ الإعدادات" }));
  await waitFor(() => expect(rpc).toHaveBeenLastCalledWith("save_meeting_settings_v2", { p_academic_year_start_month: 9, p_archive_after_days: 45, p_expected_updated_at: "2026-11-01T00:00:00Z" }));
  expect(await screen.findByText("حُفظت إعدادات الأرشفة والترقيم.")).toBeVisible();
  expect(screen.getByText(/بعد 45 يومًا/)).toBeVisible();
});

it("keeps a server refusal in the dialog", async () => {
  rpc.mockResolvedValueOnce(settings).mockRejectedValueOnce(new Error("عدّل شخص آخر هذه الإعدادات للتو. حدّث الصفحة ثم أعد المحاولة."));
  render(<MeetingArchivePolicy/>);
  fireEvent.click(await screen.findByRole("button", { name: "تعديل الأرشفة والترقيم" }));
  fireEvent.click(screen.getByRole("button", { name: "حفظ الإعدادات" }));
  expect(await screen.findByText("عدّل شخص آخر هذه الإعدادات للتو. حدّث الصفحة ثم أعد المحاولة.")).toBeVisible();
  expect(screen.getByRole("dialog", { name: "الأرشفة وترقيم الجلسات" })).toBeVisible();
});
