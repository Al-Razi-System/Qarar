"use client";

import { useEffect, useState } from "react";
import { Button } from "@/shared/ui/button";
import { CollapsibleSection } from "@/shared/ui/collapsible-section";
import { InlineMessage } from "@/shared/ui/inline-message";

export type OversightRule = {
  rule_code: string;
  name_ar: string;
  enabled: boolean;
  threshold_days: number;
  escalation_days: number;
  escalate_immediately: boolean;
  version: number;
};

async function rpc<T>(contract: string, params: Record<string, unknown> = {}) {
  const response = await fetch("/api/admin/oversight", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contract, params }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error?.message ?? "تعذر تنفيذ العملية.");
  return payload.data as T;
}

const thresholdHint: Record<string, string> = {
  meeting_cycle_missed: "بعد نهاية نافذة الاجتماع الدوري دون تحديد موعد",
  task_overdue: "بعد تاريخ استحقاق التكليف",
  minutes_pending: "منذ انتهاء الاجتماع دون اعتماد محضره",
  topic_stalled: "منذ دخول الموضوع خطوته الحالية دون إجراء",
  quorum_continuation: "يُسجّل فور قرار الرئيس متابعة الاجتماع بنصاب ناقص",
};

const inputClass = "min-h-11 w-20 rounded-q-control border border-q-border bg-q-surface px-2 text-center text-q-ui text-q-text outline-none focus:border-q-focus";

/** When a late item becomes a violation, and how fast it climbs the follow-up tree. */
export function OversightRulesSection() {
  const [rules, setRules] = useState<OversightRule[] | null>(null);
  const [saved, setSaved] = useState<OversightRule[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void rpc<OversightRule[]>("admin_get_oversight_rules_v2")
      .then((value) => { if (!cancelled) { setRules(value); setSaved(value); } })
      .catch((error: unknown) => { if (!cancelled) setLoadError(error instanceof Error ? error.message : "تعذر تحميل قواعد التجاوز."); });
    return () => { cancelled = true; };
  }, []);

  const update = (code: string, patch: Partial<OversightRule>) => {
    setNotice(null);
    setRules((current) => current?.map((rule) => (rule.rule_code === code ? { ...rule, ...patch } : rule)) ?? null);
  };
  const dirty = JSON.stringify(rules) !== JSON.stringify(saved);
  const invalid = rules?.some((rule) => !Number.isInteger(rule.threshold_days) || rule.threshold_days < 0 || rule.threshold_days > 365
    || !Number.isInteger(rule.escalation_days) || rule.escalation_days < 1 || rule.escalation_days > 90) ?? false;

  async function save() {
    if (!rules || saving || invalid) return;
    setSaving(true);
    setNotice(null);
    try {
      const next = await rpc<OversightRule[]>("admin_save_oversight_rules_v2", {
        p_rules: rules.map(({ rule_code, enabled, threshold_days, escalation_days, escalate_immediately, version }) =>
          ({ rule_code, enabled, threshold_days, escalation_days, escalate_immediately, version })),
      });
      setRules(next);
      setSaved(next);
      setNotice({ tone: "success", text: "حُفظت قواعد التجاوز، وتُطبَّق في الفحص القادم خلال ساعة." });
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "تعذر حفظ قواعد التجاوز." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <CollapsibleSection title="قواعد التجاوز والتصعيد" hint="متى يُعد التأخر تجاوزًا، وبعد كم يومًا يُصعَّد إلى المتابع الأعلى">
      {loadError ? <InlineMessage tone="error">{loadError}</InlineMessage> : !rules ? (
        <p role="status" className="text-q-caption text-q-text-3">يجري التحميل…</p>
      ) : (
        <div className="space-y-4">
          <p className="text-q-caption text-q-text-3">
            يصل التجاوز أولًا إلى رئيس المجلس ومقرره، ثم إلى أقرب متابع إن لم يُعالج خلال مهلة التصعيد، ثم إلى من فوقه بالمهلة نفسها.
          </p>
          <ul className="divide-y divide-q-border rounded-q-control border border-q-border">
            {rules.map((rule) => (
              <li key={rule.rule_code} className="grid gap-3 p-3 sm:grid-cols-[1fr_auto] sm:items-center">
                <label className="flex min-h-11 items-start gap-3">
                  <input type="checkbox" className="mt-1" checked={rule.enabled} onChange={(event) => update(rule.rule_code, { enabled: event.target.checked })} />
                  <span>
                    <span className="block text-q-ui font-bold text-q-text">{rule.name_ar}</span>
                    <span className="block text-q-caption text-q-text-3">{thresholdHint[rule.rule_code]}</span>
                  </span>
                </label>
                <div className="flex flex-wrap items-center gap-3 text-q-caption text-q-text-2">
                  {rule.rule_code !== "quorum_continuation" && (
                    <label className="flex items-center gap-2">
                      يُعد تجاوزًا بعد
                      <input type="number" min={0} max={365} inputMode="numeric" disabled={!rule.enabled} value={rule.threshold_days}
                        onChange={(event) => update(rule.rule_code, { threshold_days: Number(event.target.value) })} className={inputClass} aria-label={`مهلة التجاوز: ${rule.name_ar}`} />
                      يوم
                    </label>
                  )}
                  <label className="flex items-center gap-2">
                    يُصعَّد كل
                    <input type="number" min={1} max={90} inputMode="numeric" disabled={!rule.enabled} value={rule.escalation_days}
                      onChange={(event) => update(rule.rule_code, { escalation_days: Number(event.target.value) })} className={inputClass} aria-label={`مهلة التصعيد: ${rule.name_ar}`} />
                    يوم
                  </label>
                  <label className="flex min-h-11 items-center gap-2">
                    <input type="checkbox" disabled={!rule.enabled} checked={rule.escalate_immediately} onChange={(event) => update(rule.rule_code, { escalate_immediately: event.target.checked })} />
                    أبلغ أقرب متابع فورًا
                  </label>
                </div>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => void save()} disabled={!dirty || invalid} pending={saving} pendingLabel="جارٍ الحفظ…">حفظ القواعد</Button>
            {invalid && <span className="text-q-caption text-q-danger">مهلة التجاوز من 0 إلى 365 يومًا، والتصعيد من 1 إلى 90 يومًا.</span>}
            {!dirty && !invalid && !notice && <span className="text-q-caption text-q-text-3">لا تغييرات للحفظ.</span>}
            {notice && <InlineMessage tone={notice.tone}>{notice.text}</InlineMessage>}
          </div>
        </div>
      )}
    </CollapsibleSection>
  );
}
