import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { InvitationTimingDialog } from "./invitation-timing-dialog";
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("../api/meetings-client", () => ({ meetingRpc: rpc }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });
const props = { meetingId: "meeting-1", expectedUpdatedAt: "2026-10-07T00:00:00Z", onClose: vi.fn(), onSent: vi.fn() };
it("requires invitation times and sends the atomic V2 command", async () => {
  rpc.mockResolvedValue({ queued: 4 });
  render(<InvitationTimingDialog {...props} />);
  expect(screen.getByLabelText("وقت البداية")).toBeRequired();
  fireEvent.change(screen.getByLabelText("وقت البداية"), { target: { value: "09:00" } });
  fireEvent.change(screen.getByLabelText("وقت النهاية"), { target: { value: "11:00" } });
  fireEvent.click(screen.getByRole("button", { name: "حفظ الوقت وتجهيز الدعوات" }));
  expect(await screen.findByRole("status")).toHaveTextContent("4");
  expect(rpc).toHaveBeenCalledWith("send_meeting_invitations_v2", { p_meeting_id: "meeting-1", p_start_time: "09:00", p_end_time: "11:00", p_expected_updated_at: props.expectedUpdatedAt });
});
it("shows network errors inside the dialog, preserves inputs and blocks double submission", async () => {
  let reject!: (reason: Error) => void;
  rpc.mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
  render(<InvitationTimingDialog {...props} />);
  fireEvent.change(screen.getByLabelText("وقت البداية"), { target: { value: "09:00" } });
  fireEvent.change(screen.getByLabelText("وقت النهاية"), { target: { value: "11:00" } });
  fireEvent.click(screen.getByRole("button", { name: "حفظ الوقت وتجهيز الدعوات" }));
  expect(screen.getByRole("button", { name: "إغلاق" })).toBeDisabled();
  reject(new Error("تعذر تجهيز الدعوات"));
  expect(await screen.findByRole("alert")).toHaveTextContent("تعذر تجهيز الدعوات");
  expect(screen.getByLabelText("وقت البداية")).toHaveValue("09:00");
  await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
});
it("rejects an invalid time interval without making a request", async () => {
  render(<InvitationTimingDialog {...props} startTime="11:00" endTime="09:00" />);
  fireEvent.click(screen.getByRole("button", { name: "حفظ الوقت وتجهيز الدعوات" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("بعد البداية");
  expect(rpc).not.toHaveBeenCalled();
});
