
import { Card } from "@/shared/ui/card";

import { Button } from "@/shared/ui/button";
import { useMemo, useState } from "react";
import { CalendarCheck2, Check, FileUp, History, Paperclip, ShieldCheck, Trash2 } from "lucide-react";

export type PriorRouteStep = {
  group_id: string;
  template_step_id: string;
  template_step_ids: string[];
  sequence_no: number;
  title: string;
  step_type: string;
  responsibility: string;
  responsible_unit_id: string | null;
  responsible_entity: string;
  is_terminal: boolean;
  covered_steps: string[];
};

export type PriorRouteEvidenceDraft = {
  template_step_id: string;
  template_step_ids: string[];
  meeting_date: string;
  meeting_reference: string;
  decision_type: "approved" | "recommended" | "referred" | "completed";
  decision_text: string;
  bypass_reason: string;
  files: File[];
};

const decisionLabels: Record<PriorRouteEvidenceDraft["decision_type"], string> = {
  approved: "موافقة / اعتماد",
  recommended: "توصية بالموافقة",
  referred: "إحالة للمجلس التالي",
  completed: "استكمال الإجراء",
};

function emptyEvidence(step: PriorRouteStep): PriorRouteEvidenceDraft {
  return {
    template_step_id: step.template_step_id,
    template_step_ids: step.template_step_ids,
    meeting_date: "",
    meeting_reference: "",
    decision_type: "approved",
    decision_text: "",
    bypass_reason: "",
    files: [],
  };
}

export function TopicPriorRouteDesigner({ steps, loading, busy, onSubmit }: { steps: PriorRouteStep[]; loading: boolean; busy: boolean; onSubmit: (evidence: PriorRouteEvidenceDraft[]) => void | Promise<void> }) {
  const selectableSteps = steps.slice(0, -1);
  const [completedCount, setCompletedCount] = useState(1);
  const [evidence, setEvidence] = useState<Record<string, PriorRouteEvidenceDraft>>({});
  const effectiveCompletedCount = Math.max(1, Math.min(completedCount, Math.max(1, selectableSteps.length)));
  const selected = selectableSteps.slice(0, effectiveCompletedCount).map((step) => evidence[step.group_id] ?? emptyEvidence(step));
  const validationMessage = useMemo(() => {
    if (!selectableSteps.length) return "لا يحتوي المسار على مرحلة سابقة قابلة للتوثيق.";
    const incomplete = selected.find((item) => !item.meeting_date || item.decision_text.trim().length < 3 || item.bypass_reason.trim().length < 10 || item.files.length === 0);
    if (!incomplete) return "";
    if (!incomplete.meeting_date) return "حدد تاريخ الاجتماع لكل مجلس سابق.";
    if (incomplete.decision_text.trim().length < 3) return "دوّن القرار الصادر في كل مجلس.";
    if (incomplete.bypass_reason.trim().length < 10) return "اشرح سبب تسجيل المرحلة خارج النظام.";
    return "ارفع محضرًا أو دليلاً واحدًا على الأقل لكل مجلس سابق.";
  }, [selectableSteps.length, selected]);

  function update(stepId: string, patch: Partial<PriorRouteEvidenceDraft>) {
    const step = steps.find((candidate) => candidate.group_id === stepId);
    if (!step) return;
    setEvidence((current) => ({
      ...current,
      [stepId]: {
        ...emptyEvidence(step),
        ...current[stepId],
        ...patch,
      },
    }));
  }

  if (loading) return <Card className="grid min-h-48 place-items-center rounded-q-card border border-q-border bg-q-surface text-q-ui font-bold text-q-link">جارٍ تجهيز مراحل المسار النظامي…</Card>;

  return (
    <section className="overflow-hidden rounded-q-control border border-q-border bg-q-surface ">
      <header className="border-b border-q-border bg-q-surface-2 p-5">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-q-control bg-q-primary text-q-on-primary">
            <History size={21} />
          </span>
          <div>
            <h2 className="mt-1 text-q-h3 font-bold text-q-text">ما آخر مجلس أنهى مناقشة الموضوع؟</h2>
<p className="text-q-caption font-bold text-q-primary">استكمال موضوع قائم</p>
            <p className="mt-1 max-w-3xl text-q-caption leading-6 text-q-text-2">اختر آخر مرحلة نُفذت فعليًا. سيطلب النظام إثبات المراحل السابقة فقط، ثم يبدأ من أول مجلس متبقٍ بعد اعتماد المراجع.</p>
          </div>
        </div>
      </header>

      <div className="p-5">
        <ol className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {steps.map((step, index) => {
            const completed = index < effectiveCompletedCount;
            const next = index === effectiveCompletedCount;
            const selectable = index < selectableSteps.length;
            return (
              <li key={step.group_id}>
                <Button variant="ghost" type="button" disabled={!selectable} onClick={() => setCompletedCount(index + 1)} className={`flex w-full items-center gap-3 rounded-q-control border p-3 text-right transition ${completed ? "border-q-success bg-q-surface-2" : next ? "border-q-primary bg-q-surface-2" : "border-q-border bg-q-surface-2"} ${selectable ? "hover:-translate-y-0.5 hover:" : "cursor-default"}`}>
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-q-control text-q-caption font-bold ${completed ? "bg-q-success-soft text-q-success" : next ? "bg-q-primary text-q-on-primary" : "bg-q-surface-2 text-q-text-3"}`}>{completed ? <Check size={16} /> : step.sequence_no}</span>
                  <span className="min-w-0">
                    <strong className="block truncate text-q-caption text-q-text">{step.responsible_entity}</strong>
                    <span className="mt-0.5 block truncate text-q-caption text-q-text-2">جلسة المجلس وقرارها</span>
                    <span className={`mt-1 block text-q-caption font-bold ${completed ? "text-q-success" : next ? "text-q-primary" : "text-q-text-2"}`}>{completed ? "سيُثبت كمجلس منجز سابقًا" : next ? "سيبدأ النظام من هذا المجلس" : "مجلس لاحق"}</span>
                  </span>
                </Button>
              </li>
            );
          })}
        </ol>

        <Card className="my-5 flex items-center gap-2 rounded-q-card border border-q-primary bg-q-surface-2 px-4 py-3 text-q-caption leading-5 text-q-link">
          <ShieldCheck className="shrink-0 text-q-primary" size={17} />
          <p>لن تُتجاوز أي مرحلة فورًا. تبقى الأدلة بانتظار مراجعة مستقلة، ويحتفظ النظام بالمسار اللائحي وسجل الاعتماد كاملًا.</p>
        </Card>

        <div className="space-y-4">
          {selectableSteps.slice(0, effectiveCompletedCount).map((step, index) => {
            const item = evidence[step.group_id] ?? emptyEvidence(step);
            return (
              <article key={step.group_id} className="rounded-q-control border border-q-border bg-q-bg p-4">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="grid h-9 w-9 place-items-center rounded-q-control bg-q-success-soft text-q-caption font-bold text-q-on-primary">{index + 1}</span>
                    <div>
                      <h3 className="text-q-ui font-bold text-q-text">{step.responsible_entity}</h3>
                      <p className="mt-0.5 text-q-caption text-q-text-2">{step.title}</p>
                    </div>
                  </div>
                  <span className="rounded-full bg-q-success-soft px-3 py-1 text-q-caption font-bold text-q-success">مطلوب إثباتها</span>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="block">
                    <span className="mb-1.5 block text-q-caption font-bold text-q-link">تاريخ الاجتماع *</span>
                    <input
                      aria-label={`تاريخ اجتماع ${step.responsible_entity}`}
                      type="date"
                      max={new Date().toISOString().slice(0, 10)}
                      value={item.meeting_date}
                      onChange={(event) =>
                        update(step.group_id, {
                          meeting_date: event.target.value,
                        })
                      }
                      className="h-11 w-full rounded-q-control border border-q-border bg-q-surface px-3 text-q-caption"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-q-caption font-bold text-q-link">رقم الاجتماع أو المرجع</span>
                    <input
                      value={item.meeting_reference}
                      onChange={(event) =>
                        update(step.group_id, {
                          meeting_reference: event.target.value,
                        })
                      }
                      placeholder="مثال: الاجتماع الخامس لعام 1448هـ"
                      className="h-11 w-full rounded-q-control border border-q-border bg-q-surface px-3 text-q-caption"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-q-caption font-bold text-q-link">نوع القرار *</span>
                    <select
                      value={item.decision_type}
                      onChange={(event) =>
                        update(step.group_id, {
                          decision_type: event.target.value as PriorRouteEvidenceDraft["decision_type"],
                        })
                      }
                      className="h-11 w-full rounded-q-control border border-q-border bg-q-surface px-3 text-q-caption"
                    >
                      {Object.entries(decisionLabels).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-q-caption font-bold text-q-link">نص القرار *</span>
                    <input
                      value={item.decision_text}
                      onChange={(event) =>
                        update(step.group_id, {
                          decision_text: event.target.value,
                        })
                      }
                      placeholder="اكتب القرار كما ورد في المحضر"
                      className="h-11 w-full rounded-q-control border border-q-border bg-q-surface px-3 text-q-caption"
                    />
                  </label>
                  <label className="block md:col-span-2">
                    <span className="mb-1.5 block text-q-caption font-bold text-q-link">سبب تسجيل هذا المجلس خارج النظام *</span>
                    <textarea
                      value={item.bypass_reason}
                      onChange={(event) =>
                        update(step.group_id, {
                          bypass_reason: event.target.value,
                        })
                      }
                      placeholder="مثال: نوقش الموضوع واعتمد قبل تشغيل النظام الإلكتروني."
                      className="min-h-20 w-full rounded-q-control border border-q-border bg-q-surface p-3 text-q-caption leading-6"
                    />
                  </label>
                  <Card className="md:col-span-2 rounded-q-card border border-dashed border-q-primary bg-q-surface p-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="flex items-center gap-1.5 text-q-caption font-bold text-q-text-2">
                          <FileUp size={14} /> محضر المجلس والمرفقات *
                        </p>
                        <p className="mt-1 text-q-caption text-q-text-2">PDF أو صورة أو DOCX — يلزم ملف واحد على الأقل.</p>
                      </div>
                      <label className="flex h-9 cursor-pointer items-center gap-2 rounded-q-control bg-q-primary px-3 text-q-caption font-bold text-q-on-primary">
                        <Paperclip size={14} /> اختيار ملفات
                        <input
                          aria-label={`مرفقات ${step.responsible_entity}`}
                          className="hidden"
                          type="file"
                          multiple
                          accept="application/pdf,image/png,image/jpeg,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                          onChange={(event) => {
                            const files = Array.from(event.currentTarget.files ?? []);
                            update(step.group_id, {
                              files: [...item.files, ...files],
                            });
                            event.currentTarget.value = "";
                          }}
                        />
                      </label>
                    </div>
                    {item.files.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {item.files.map((file, fileIndex) => (
                          <span key={`${file.name}-${file.lastModified}-${fileIndex}`} className="flex items-center gap-2 rounded-q-control bg-q-surface-2 px-2.5 py-1.5 text-q-caption font-bold text-q-link">
                            <span className="max-w-44 truncate">{file.name}</span>
                            <Button variant="ghost"
                              type="button"
                              aria-label={`حذف ${file.name}`}
                              onClick={() =>
                                update(step.group_id, {
                                  files: item.files.filter((_, i) => i !== fileIndex),
                                })
                              }
                              className=""
                            >
                              <Trash2 size={12} />
                            </Button>
                          </span>
                        ))}
                      </div>
                    )}
                  </Card>
                </div>
              </article>
            );
          })}
        </div>

        <footer className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-q-border pt-4">
          <div className="flex items-center gap-2">
            <CalendarCheck2 className={validationMessage ? "text-q-warning" : "text-q-success"} size={17} />
            <p className={`text-q-caption font-bold ${validationMessage ? "text-q-warning" : "text-q-success"}`}>{validationMessage || `سيبدأ المسار من «${steps[effectiveCompletedCount]?.responsible_entity ?? "أول مرحلة متبقية"}» بعد اعتماد الأدلة.`}</p>
          </div>
          <Button variant="primary" type="button" disabled={busy || Boolean(validationMessage)} onClick={() => void onSubmit(selected)} className="flex h-11 items-center gap-2 rounded-q-control px-5 font-bold ">
            <ShieldCheck size={16} />
            {busy ? "جارٍ حفظ الأدلة…" : "إنشاء الموضوع وإرسال الإثباتات"}
          </Button>
        </footer>
      </div>
    </section>
  );
}
