import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuditWorkspace } from "./audit-workspace";

const systemEvent = {
  id: "11111111-1111-4111-8111-111111111111",
  organization_id: "22222222-2222-4222-8222-222222222222",
  actor_user_id: null,
  action: "users.insert",
  entity_type: "users",
  entity_id: "33333333-3333-4333-8333-333333333333",
  result: "success",
  previous_data: null,
  new_data: { full_name_ar: "عضو" },
  metadata: { source: "trigger" },
  occurred_at: "2026-11-11T21:00:00Z",
  actor_name_ar: null,
  actor_email: null,
};

type Call = { contract: string; params: Record<string, unknown> };

function mockAudit(handler: (call: Call) => unknown) {
  const calls: Call[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
    const call = JSON.parse(String(init?.body)) as Call;
    calls.push(call);
    return new Response(JSON.stringify({ data: handler(call) }), { status: 200 });
  });
  return calls;
}

afterEach(() => vi.restoreAllMocks());

describe("AuditWorkspace contract", () => {
  it("searches with the contract's parameter names and renders occurred_at in Arabic", async () => {
    const calls = mockAudit(() => ({ items: [systemEvent], total: 1, limit: 50, offset: 0 }));
    render(<AuditWorkspace />);

    expect(await screen.findByText("النظام")).toBeInTheDocument();
    const search = calls.find((call) => call.contract === "admin_search_audit_logs");
    expect(search?.params).toEqual({
      p_query: null, p_action: null, p_entity_type: null, p_actor_user_id: null,
      p_result: null, p_from: null, p_to: null, p_limit: 50, p_offset: 0,
    });
    expect(document.body).toHaveTextContent("إضافة · المستخدمون");
    expect(document.body).not.toHaveTextContent("Invalid Date");
    expect(document.body).not.toHaveTextContent("users.insert");
  });

  it("filters by result, which the contract matches exactly", async () => {
    const calls = mockAudit(() => ({ items: [], total: 0, limit: 50, offset: 0 }));
    render(<AuditWorkspace />);
    await waitFor(() => expect(calls).toHaveLength(1));

    fireEvent.change(screen.getByLabelText("نتيجة العملية"), { target: { value: "denied" } });
    await waitFor(() => expect(calls.at(-1)?.params.p_result).toBe("denied"));
  });

  it("downloads the exported items as a JSON file", async () => {
    const createObjectURL = vi.fn(() => "blob:audit");
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const calls = mockAudit((call) => call.contract === "admin_export_audit_logs"
      ? { schema_version: 1, exported_at: "2026-11-12T00:00:00Z", items: [systemEvent] }
      : { items: [], total: 0, limit: 50, offset: 0 });
    render(<AuditWorkspace />);
    await waitFor(() => expect(calls).toHaveLength(1));

    fireEvent.click(screen.getByRole("button", { name: /تصدير/ }));

    expect(await screen.findByText("تم تصدير 1 سجل.")).toBeInTheDocument();
    expect(calls.at(-1)).toEqual({
      contract: "admin_export_audit_logs",
      params: { p_action: null, p_entity_type: null, p_actor_user_id: null, p_result: null, p_from: null, p_to: null },
    });
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
  });
});
