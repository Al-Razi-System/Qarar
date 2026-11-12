"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronLeft } from "lucide-react";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { InlineMessage } from "@/shared/ui/inline-message";
import { SegmentedControl } from "@/shared/ui/segmented-control";

type Violation = {
  id: string;
  rule_code: string;
  rule_name_ar: string;
  council_id: string;
  council_name_ar: string;
  subject_label: string;
  subject_link: string;
  due_since: string;
  status: "open" | "resolved";
  resolved_at: string | null;
  days_open: number;
  escalation_level: number;
  relation: "leader" | "follower";
};
type ViolationsPage = {
  items: Violation[];
  total: number;
  councils: Array<{ id: string; name_ar: string }>;
  rules: Array<{ rule_code: string; name_ar: string }>;
};
type StatusFilter = "open" | "resolved" | "all";

async function loadViolations(status: StatusFilter, rule: string, council: string): Promise<ViolationsPage> {
  const response = await fetch("/api/admin/oversight", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contract: "get_my_oversight_violations_v2", params: { p_status: status, p_rule_code: rule || null, p_council_id: council || null } }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error?.message ?? "تعذر تحميل التجاوزات.");
  return payload.data as ViolationsPage;
}

function days(count: number) {
  if (count <= 0) return "اليوم";
  if (count === 1) return "منذ يوم";
  if (count === 2) return "منذ يومين";
  return `منذ ${count.toLocaleString("ar-SA")} ${count % 100 >= 3 && count % 100 <= 10 ? "أيام" : "يومًا"}`;
}

function escalationText(level: number) {
  if (level <= 0) return null;
  return level === 1 ? "صُعّد إلى أقرب متابع" : `صُعّد ${level.toLocaleString("ar-SA")} مستويات`;
}

const selectClass = "min-h-11 w-full rounded-q-control border border-q-border bg-q-surface px-3 text-q-ui text-q-text outline-none focus:border-q-focus";

/** Late items in the councils the user leads or follows; each links to the record to act on. */
export function ViolationsWorkspace() {
  const [status, setStatus] = useState<StatusFilter>("open");
  const [rule, setRule] = useState("");
  const [council, setCouncil] = useState("");
  const [page, setPage] = useState<ViolationsPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void loadViolations(status, rule, council)
      .then((value) => { if (!cancelled) { setPage(value); setError(null); } })
      .catch((failure: unknown) => { if (!cancelled) setError(failure instanceof Error ? failure.message : "تعذر تحميل التجاوزات."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [status, rule, council, reloadKey]);

  const change = (apply: () => void) => { setLoading(true); apply(); };
  const openItems = page?.items.filter((item) => item.status === "open") ?? [];
  const byRule = new Map<string, { name: string; count: number }>();
  for (const item of openItems) byRule.set(item.rule_code, { name: item.rule_name_ar, count: (byRule.get(item.rule_code)?.count ?? 0) + 1 });

  return (
    <div className="space-y-4">
      <section aria-label="فلاتر التجاوزات" className="space-y-3 rounded-q-card border border-q-border bg-q-surface p-4 sm:p-5">
        <SegmentedControl<StatusFilter>
          label="حالة التجاوز"
          options={[{ value: "open", label: "المفتوحة" }, { value: "resolved", label: "المعالَجة" }, { value: "all", label: "الكل" }]}
          value={status}
          onChange={(value) => change(() => setStatus(value))}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-q-caption font-bold text-q-text-2">
            نوع التجاوز
            <select value={rule} onChange={(event) => { const value = event.target.value; change(() => setRule(value)); }} className={`mt-1 ${selectClass}`}>
              <option value="">كل الأنواع</option>
              {(page?.rules ?? []).map((item) => <option key={item.rule_code} value={item.rule_code}>{item.name_ar}</option>)}
            </select>
          </label>
          <label className="text-q-caption font-bold text-q-text-2">
            المجلس
            <select value={council} onChange={(event) => { const value = event.target.value; change(() => setCouncil(value)); }} className={`mt-1 ${selectClass}`}>
              <option value="">كل المجالس في نطاقي</option>
              {(page?.councils ?? []).slice().sort((a, b) => a.name_ar.localeCompare(b.name_ar, "ar")).map((item) => <option key={item.id} value={item.id}>{item.name_ar}</option>)}
            </select>
          </label>
        </div>
        {status !== "resolved" && byRule.size > 0 && (
          <ul aria-label="ملخص التجاوزات المفتوحة" className="flex flex-wrap gap-2">
            {[...byRule.entries()].map(([code, value]) => <li key={code}><Badge tone="warning">{value.name}: {value.count.toLocaleString("ar-SA")}</Badge></li>)}
          </ul>
        )}
      </section>

      <section aria-label="التجاوزات" className="overflow-hidden rounded-q-card border border-q-border bg-q-surface">
        {loading && !page ? (
          <p role="status" className="px-5 py-12 text-center text-q-ui text-q-text-3">يجري تحميل التجاوزات…</p>
        ) : error ? (
          <div className="flex flex-wrap items-center gap-3 p-5">
            <InlineMessage tone="error">{error}</InlineMessage>
            <Button variant="ghost" onClick={() => change(() => setReloadKey((key) => key + 1))}>إعادة المحاولة</Button>
          </div>
        ) : !page || page.items.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <CheckCircle2 size={32} aria-hidden="true" className="mx-auto text-q-success" />
            <p className="mt-3 text-q-ui font-bold text-q-text">{status === "open" ? "لا تجاوزات مفتوحة في نطاقك." : "لا تجاوزات بهذه الفلاتر."}</p>
            {page && page.councils.length === 0 && (
              <p className="mt-1 text-q-caption text-q-text-3">لا تقود أي مجلس ولا تتابع أي مجالس. يحدد مسؤول الحوكمة صلاحيات المتابعة.</p>
            )}
          </div>
        ) : (
          <ul className={`divide-y divide-q-border ${loading ? "opacity-60" : ""}`} aria-busy={loading}>
            {page.items.map((item) => (
              <li key={item.id}>
                <Link href={item.subject_link} className="flex min-h-16 items-start gap-3 px-4 py-3 hover:bg-q-surface-2 sm:px-5">
                  <AlertTriangle size={18} aria-hidden="true" className={`mt-1 shrink-0 ${item.status === "open" ? "text-q-warning" : "text-q-text-3"}`} />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-q-ui font-bold text-q-text">{item.rule_name_ar}</span>
                      {item.status === "resolved" ? <Badge tone="success">عولج</Badge> : escalationText(item.escalation_level) && <Badge tone="danger">{escalationText(item.escalation_level)}</Badge>}
                      <Badge tone="neutral">{item.relation === "leader" ? "مجلس تقوده" : "مجلس تتابعه"}</Badge>
                    </span>
                    <span className="mt-0.5 block text-q-caption text-q-text-2"><span className="font-bold">{item.council_name_ar}</span> · {item.subject_label}</span>
                    <span className="mt-0.5 block text-q-caption text-q-text-3">
                      {item.status === "open" ? `متأخر ${days(item.days_open)}` : `عولج ${item.resolved_at ? new Date(item.resolved_at).toLocaleDateString("ar-SA", { dateStyle: "medium" }) : ""}`}
                    </span>
                  </span>
                  <ChevronLeft size={18} aria-hidden="true" className="mt-1 shrink-0 text-q-text-3" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
