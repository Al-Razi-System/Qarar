import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { TopicTypeActions } from "./topic-type-actions";
afterEach(() => vi.unstubAllGlobals());
it("shows direct activation without an independent approval journey", () => {
  render(<TopicTypeActions bundleId="id" lockVersion={1} actions={{ submit: true, activate: true }} reasons={[]} onChanged={() => {}}/>);
  expect(screen.queryByRole("button", { name: "إرسال للاعتماد" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "تنشيط التصنيف" })).toBeEnabled();
});
it("explains activation blockers instead of presenting a rejected action", () => {
  render(<TopicTypeActions bundleId="id" lockVersion={1} actions={{ activate: false }} reasons={["اعتماد التصنيف مطلوب قبل التنشيط."]} onChanged={() => {}}/>);
  expect(screen.getByRole("button", { name: "تنشيط التصنيف" })).toBeDisabled();
  expect(screen.getByText("اعتماد التصنيف مطلوب قبل التنشيط.")).toBeInTheDocument();
});
it("preserves the request key and displays an in-place failure", async () => {
  const fetcher = vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: { message: "تم تعديل التصنيف في جلسة أخرى." } }) });
  vi.stubGlobal("fetch", fetcher);
  render(<TopicTypeActions bundleId="id" lockVersion={2} actions={{ disable: true }} reasons={[]} onChanged={() => {}}/>);
  await userEvent.click(screen.getByRole("button", { name: "تعطيل التصنيف" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("تم تعديل التصنيف في جلسة أخرى.");
  await userEvent.click(screen.getByRole("button", { name: "تعطيل التصنيف" }));
  const bodies = fetcher.mock.calls.map(call => JSON.parse(call[1].body));
  expect(bodies[0]).toMatchObject({ action: "disable", bundleId: "id", expectedLockVersion: 2 });
  expect(bodies[0].clientRequestId).toBe(bodies[1].clientRequestId);
});
it("safely replays a committed mutation when refreshing its result fails", async () => {
  const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { bundle_id: "id" } }) });
  vi.stubGlobal("fetch", fetcher);
  const refresh = vi.fn().mockRejectedValueOnce(new Error("تعذر تحديث العرض")).mockResolvedValueOnce(undefined);
  render(<TopicTypeActions bundleId="id" lockVersion={2} actions={{ activate: true }} reasons={[]} onChanged={refresh}/>);
  await userEvent.click(screen.getByRole("button", { name: "تنشيط التصنيف" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("تعذر تحديث العرض");
  await userEvent.click(screen.getByRole("button", { name: "تنشيط التصنيف" }));
  const requests = fetcher.mock.calls.map(call => JSON.parse(call[1].body));
  expect(requests[0].clientRequestId).toBe(requests[1].clientRequestId);
});
