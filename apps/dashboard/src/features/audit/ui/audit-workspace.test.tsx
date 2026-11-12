import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuditWorkspace } from "./audit-workspace";

const councilEdit = {
  id: "11111111-1111-4111-8111-111111111111",
  action: "governance_units.update", entity_type: "governance_units", entity_id: "33333333-3333-4333-8333-333333333333",
  result: "success", occurred_at: "2026-11-11T21:00:00Z",
  actor_user_id: "44444444-4444-4444-8444-444444444444", actor_name_ar: "مدير النظام", actor_kind: "user",
  request_id: "req-1", client_ip: "203.0.113.9", changed_fields: ["status", "updated_at"],
  entity_label: { reference: "GU-2026-000004", title: "مجلس الكلية" }, metadata: {},
  actor_capacity: { source: "derived", declared: null, roles: ["council_chair"], system_admin: true, governance_unit_id: "33333333-3333-4333-8333-333333333333", governance_unit_name: "مجلس الكلية" },
};
const denial = {
  id: "22222222-2222-4222-8222-222222222222",
  action: "api.denied", entity_type: "api_contract", entity_id: null, result: "denied", occurred_at: "2026-11-11T22:00:00Z",
  actor_user_id: "55555555-5555-4555-8555-555555555555", actor_name_ar: "عضو المجلس", actor_kind: "user",
  changed_fields: [], entity_label: null, metadata: { contract: "admin_list_sessions", error_code: "42501", http_status: 403 },
};
const systemEvent = { ...councilEdit, id: "66666666-6666-4666-8666-666666666666", action: "user_sessions.insert", entity_type: "user_sessions",
  actor_user_id: null, actor_name_ar: null, actor_kind: "system", entity_label: { reference: "Chrome على Windows", title: "عضو المجلس" } };

type Call = { contract: string; params: Record<string, unknown> };

function mockAudit(overrides: Partial<Record<string, (call: Call) => unknown>> = {}) {
  const calls: Call[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
    const call = JSON.parse(String(init?.body)) as Call;
    calls.push(call);
    const handler = overrides[call.contract];
    if (handler) {
      const value = handler(call);
      if (value instanceof Response) return value;
      return Response.json({ data: value });
    }
    if (call.contract === "admin_get_audit_facets_v2") {
      return Response.json({ data: {
        entity_types: [{ value: "governance_units", count: 4 }, { value: "api_contract", count: 1 }],
        actors: [{ id: "44444444-4444-4444-8444-444444444444", name_ar: "مدير النظام", count: 4 }],
        results: { success: 4, denied: 1 },
      } });
    }
    if (call.contract === "admin_get_audit_log") {
      return Response.json({ data: { ...councilEdit, user_agent: "Mozilla/5.0 (Windows NT 10.0) Chrome/130",
        previous_data: { status: "draft", name_ar: "مجلس الكلية", updated_at: "1" }, new_data: { status: "active", name_ar: "مجلس الكلية", updated_at: "2" } } });
    }
    return Response.json({ data: { items: [councilEdit, denial, systemEvent], total: 120, limit: 50, offset: 0 } });
  });
  return calls;
}

afterEach(() => vi.restoreAllMocks());

describe("AuditWorkspace", () => {
  it("lists events in Arabic with the record each one touched", async () => {
    const calls = mockAudit();
    render(<AuditWorkspace />);

    const row = await screen.findByRole("button", { name: /مدير النظام/ });
    expect(row).toHaveTextContent("تعديل");
    expect(row).toHaveTextContent("المجالس والوحدات");
    expect(row).toHaveTextContent("GU-2026-000004");
    expect(row).toHaveTextContent("مجلس الكلية");
    expect(row).toHaveTextContent("بصفته رئيس المجلس في «مجلس الكلية»");
    expect(screen.getByText("النظام (تهيئة أو ترحيل)")).toBeInTheDocument();
    expect(screen.getAllByText("مرفوضة").length).toBeGreaterThan(0);
    expect(document.body).not.toHaveTextContent("governance_units.update");
    expect(document.body).not.toHaveTextContent("Invalid Date");
    expect(calls.find((call) => call.contract === "admin_search_audit_logs")?.params).toEqual({
      p_query: null, p_action: null, p_entity_type: null, p_actor_user_id: null,
      p_result: null, p_from: null, p_to: null, p_limit: 50, p_offset: 0,
    });
  });

  it("opens the details directly under the clicked event, with a readable before/after", async () => {
    mockAudit();
    render(<AuditWorkspace />);
    const row = await screen.findByRole("button", { name: /مدير النظام/ });

    fireEvent.click(row);

    expect(row).toHaveAttribute("aria-expanded", "true");
    const panel = document.getElementById(row.getAttribute("aria-controls") ?? "");
    expect(panel).not.toBeNull();
    expect(row.closest("li")).toContainElement(panel);
    const changes = await within(panel!).findByRole("table", { name: "التغييرات" });
    expect(within(changes).getByText("الحالة")).toBeInTheDocument();
    expect(within(changes).getByText("مسودة")).toBeInTheDocument();
    expect(within(changes).getByText("نشط")).toBeInTheDocument();
    expect(within(changes).queryByText("updated_at")).not.toBeInTheDocument();
    expect(within(panel!).getByText("203.0.113.9")).toBeInTheDocument();
    expect(within(panel!).getByText("Chrome على Windows")).toBeInTheDocument();
    expect(within(panel!).getByText("req-1")).toBeInTheDocument();
    expect(within(panel!).getByText("رئيس المجلس في «مجلس الكلية»")).toBeInTheDocument();
    expect(within(panel!).getByText("الأدوار التي كان يشغلها في هذا المجلس وقت الحدث")).toBeInTheDocument();

    fireEvent.click(row);
    expect(row).toHaveAttribute("aria-expanded", "false");
  });

  it("explains a denied attempt in words", async () => {
    mockAudit({ admin_get_audit_log: () => ({ ...denial }) });
    render(<AuditWorkspace />);
    fireEvent.click(await screen.findByRole("button", { name: /محاولة مرفوضة/ }));
    expect(await screen.findByText(/رُفضت محاولة «عضو المجلس» تنفيذ عملية لا تملك صلاحيتها/)).toBeInTheDocument();
  });

  it("filters by result, record type, actor and period", async () => {
    const calls = mockAudit();
    render(<AuditWorkspace />);
    await screen.findByRole("button", { name: /مدير النظام/ });

    fireEvent.click(screen.getByRole("radio", { name: /مرفوضة/ }));
    await waitFor(() => expect(calls.at(-1)?.params.p_result).toBe("denied"));
    fireEvent.change(screen.getByLabelText("نوع السجل"), { target: { value: "governance_units" } });
    await waitFor(() => expect(calls.at(-1)?.params.p_entity_type).toBe("governance_units"));
    fireEvent.change(screen.getByLabelText("المنفذ"), { target: { value: "44444444-4444-4444-8444-444444444444" } });
    await waitFor(() => expect(calls.at(-1)?.params.p_actor_user_id).toBe("44444444-4444-4444-8444-444444444444"));
    fireEvent.change(screen.getByLabelText("من تاريخ"), { target: { value: "2026-11-01" } });
    await waitFor(() => expect(String(calls.at(-1)?.params.p_from)).toMatch(/^2026-1[01]-/));
  });

  it("loads the next page and keeps the events already shown", async () => {
    const calls = mockAudit();
    render(<AuditWorkspace />);
    await screen.findByRole("button", { name: /مدير النظام/ });
    expect(screen.getByText("يعرض 3 من 120")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "عرض المزيد" }));

    await waitFor(() => expect(calls.at(-1)?.params.p_offset).toBe(3));
    expect(await screen.findAllByRole("button", { name: /مدير النظام/ })).toHaveLength(2);
  });

  it("shows a detail failure inside the event, not over the page", async () => {
    mockAudit({ admin_get_audit_log: () => Response.json({ error: { message: "تعذر تحميل تفاصيل الحدث." } }, { status: 500 }) });
    render(<AuditWorkspace />);
    const row = await screen.findByRole("button", { name: /مدير النظام/ });
    fireEvent.click(row);
    const panel = document.getElementById(row.getAttribute("aria-controls") ?? "");
    expect(await within(panel!).findByText("تعذر تحميل تفاصيل الحدث.")).toBeInTheDocument();
  });

  it("downloads the exported events as a JSON file", async () => {
    const createObjectURL = vi.fn(() => "blob:audit");
    Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const calls = mockAudit({ admin_export_audit_logs: () => ({ schema_version: 1, items: [councilEdit] }) });
    render(<AuditWorkspace />);
    await screen.findByRole("button", { name: /مدير النظام/ });

    fireEvent.click(screen.getByRole("button", { name: /تصدير/ }));

    expect(await screen.findByText("تم تصدير 1 حدث بالفلاتر الحالية.")).toBeInTheDocument();
    expect(calls.at(-1)?.contract).toBe("admin_export_audit_logs");
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
  });
});
