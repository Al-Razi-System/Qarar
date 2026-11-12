import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OversightRulesSection } from "./oversight-rules-section";

const rules = [
  { rule_code: "minutes_pending", name_ar: "محضر لم يُعتمد بعد", enabled: true, threshold_days: 7, escalation_days: 3, escalate_immediately: false, version: 0 },
  { rule_code: "quorum_continuation", name_ar: "اجتماع عُقد بنصاب غير مكتمل", enabled: true, threshold_days: 0, escalation_days: 3, escalate_immediately: true, version: 0 },
];

function mockApi(onSave?: (params: Record<string, unknown>) => Response | unknown) {
  const calls: Array<{ contract: string; params: Record<string, unknown> }> = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
    const call = JSON.parse(String(init?.body));
    calls.push(call);
    if (call.contract === "admin_save_oversight_rules_v2" && onSave) {
      const result = onSave(call.params);
      return result instanceof Response ? result : Response.json({ data: result });
    }
    return Response.json({ data: rules });
  });
  return calls;
}

afterEach(() => vi.restoreAllMocks());

async function openSection() {
  render(<OversightRulesSection />);
  fireEvent.click(screen.getByRole("button", { name: /قواعد التجاوز والتصعيد/ }));
  return screen.findByLabelText("مهلة التجاوز: محضر لم يُعتمد بعد");
}

describe("OversightRulesSection", () => {
  it("saves changed deadlines with their versions", async () => {
    const calls = mockApi((params) => (params.p_rules as typeof rules).map((rule) => ({ ...rule, name_ar: rules.find((r) => r.rule_code === rule.rule_code)!.name_ar, version: 1 })));
    const threshold = await openSection();
    expect(screen.getByRole("button", { name: "حفظ القواعد" })).toBeDisabled();
    fireEvent.change(threshold, { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: "حفظ القواعد" }));
    expect(await screen.findByText(/حُفظت قواعد التجاوز/)).toBeInTheDocument();
    expect(calls.at(-1)?.params.p_rules).toContainEqual({ rule_code: "minutes_pending", enabled: true, threshold_days: 10, escalation_days: 3, escalate_immediately: false, version: 0 });
  });

  it("blocks an out-of-range value and says why beside the action", async () => {
    mockApi();
    await openSection();
    fireEvent.change(screen.getByLabelText("مهلة التصعيد: محضر لم يُعتمد بعد"), { target: { value: "0" } });
    expect(screen.getByRole("button", { name: "حفظ القواعد" })).toBeDisabled();
    expect(screen.getByText("مهلة التجاوز من 0 إلى 365 يومًا، والتصعيد من 1 إلى 90 يومًا.")).toBeInTheDocument();
  });

  it("keeps the edits and shows the server's reason when saving fails", async () => {
    mockApi(() => Response.json({ error: { message: "تغيّر هذا التعيين منذ فتحته. أعد تحميل الصفحة ثم حاول مجددًا." } }, { status: 409 }));
    const threshold = await openSection();
    fireEvent.change(threshold, { target: { value: "9" } });
    fireEvent.click(screen.getByRole("button", { name: "حفظ القواعد" }));
    await waitFor(() => expect(screen.getByText(/أعد تحميل الصفحة/)).toBeInTheDocument());
    expect(threshold).toHaveValue(9);
  });
});
