import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { TopicPdfDownloadButton } from "./topic-pdf-download-button";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("downloads once with meeting context and shows local progress", async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(new Blob(["pdf"], { type: "application/pdf" }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:topic") });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });

  render(<TopicPdfDownloadButton topicId="topic-1" meetingId="meeting-1" />);
  fireEvent.click(screen.getByRole("button", { name: "طباعة / تنزيل PDF" }));

  expect(screen.getByRole("button", { name: "جارٍ إعداد ملف الموضوع…" })).toBeDisabled();
  await waitFor(() => expect(click).toHaveBeenCalledOnce());
  expect(fetchMock).toHaveBeenCalledWith("/api/admin/topics/topic-1/pdf?meetingId=meeting-1", expect.objectContaining({ cache: "no-store" }));
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("keeps the screen usable and explains a server failure beside the action", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: "لا تملك صلاحية تنزيل هذا الملف." } }), { status: 403, headers: { "Content-Type": "application/json" } })));
  render(<TopicPdfDownloadButton topicId="topic-1" />);

  fireEvent.click(screen.getByRole("button", { name: "طباعة / تنزيل PDF" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("لا تملك صلاحية تنزيل هذا الملف.");
  expect(screen.getByRole("button", { name: "طباعة / تنزيل PDF" })).toBeEnabled();
});
