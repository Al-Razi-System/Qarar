import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { MeetingMinutesDownloadButton } from "./meeting-minutes-download-button";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("downloads the approved official minutes with local progress", async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(new Blob(["minutes"], { type: "application/pdf" }), {
    status: 200,
    headers: { "Content-Disposition": "attachment; filename=\"MTG-1-minutes.pdf\"" },
  }));
  vi.stubGlobal("fetch", fetchMock);
  const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:minutes") });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });

  render(<MeetingMinutesDownloadButton meetingId="meeting-1" meetingTitle="اجتماع مجلس القسم" />);
  fireEvent.click(screen.getByRole("button", { name: "تنزيل محضر اجتماع مجلس القسم" }));

  expect(screen.getByRole("button", { name: "تنزيل محضر اجتماع مجلس القسم" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "تنزيل محضر اجتماع مجلس القسم" })).toHaveTextContent("جارٍ إعداد المحضر…");
  await waitFor(() => expect(click).toHaveBeenCalledOnce());
  expect(fetchMock).toHaveBeenCalledWith("/api/admin/meetings/meeting-1/minutes/pdf", { cache: "no-store" });
});

it("keeps the history visible and explains a minutes export failure in place", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: "المحضر غير معتمد بعد." } }), {
    status: 409,
    headers: { "Content-Type": "application/json" },
  })));
  render(<MeetingMinutesDownloadButton meetingId="meeting-1" meetingTitle="اجتماع مجلس القسم" />);

  fireEvent.click(screen.getByRole("button", { name: "تنزيل محضر اجتماع مجلس القسم" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("المحضر غير معتمد بعد.");
  expect(screen.getByRole("button", { name: "تنزيل محضر اجتماع مجلس القسم" })).toBeEnabled();
});
