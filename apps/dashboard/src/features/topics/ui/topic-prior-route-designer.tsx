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

  if (loading) return <div className="grid min-h-48 place-items-center rounded-2xl border border-[#dce7f1] bg-white text-sm font-bold text-[#60738a]">جارٍ تجهيز مراحل المسار النظامي…</div>;

  return (
    <section className="overflow-hidden rounded-3xl border border-[#cfe0ef] bg-white shadow-[0_14px_35px_rgba(20,55,90,.08)]">
      <header className="border-b border-[#e7eef5] bg-gradient-to-l from-[#eef7ff] to-white p-5">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#0877df] text-white">
            <History size={21} />
          </span>
          <div>
            <p className="text-[10px] font-black text-[#0877df]">استكمال موضوع قائم</p>
            <h2 className="mt-1 text-lg font-black text-[#0a1330]">ما آخر مجلس أنهى مناقشة الموضوع؟</h2>
            <p className="mt-1 max-w-3xl text-xs leading-6 text-[#60738a]">اختر آخر مرحلة نُفذت فعليًا. سيطلب النظام إثبات المراحل السابقة فقط، ثم يبدأ من أول مجلس متبقٍ بعد اعتماد المراجع.</p>
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
                <button type="button" disabled={!selectable} onClick={() => setCompletedCount(index + 1)} className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-right transition ${completed ? "border-emerald-300 bg-emerald-50" : next ? "border-[#8fc4f2] bg-[#f3f9ff]" : "border-[#e1e9f1] bg-[#fafbfd]"} ${selectable ? "hover:-translate-y-0.5 hover:shadow-sm" : "cursor-default"}`}>
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl text-xs font-black ${completed ? "bg-emerald-600 text-white" : next ? "bg-[#0877df] text-white" : "bg-[#eaf0f5] text-[#718196]"}`}>{completed ? <Check size={16} /> : step.sequence_no}</span>
                  <span className="min-w-0">
                    <strong className="block truncate text-xs text-[#0a1330]">{step.responsible_entity}</strong>
                    <span className="mt-0.5 block truncate text-[10px] text-[#687a8f]">جلسة المجلس وقرارها</span>
                    <span className={`mt-1 block text-[9px] font-black ${completed ? "text-emerald-700" : next ? "text-[#0877df]" : "text-[#8795a6]"}`}>{completed ? "سيُثبت كمجلس منجز سابقًا" : next ? "سيبدأ النظام من هذا المجلس" : "مجلس لاحق"}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>

        <div className="my-5 flex items-center gap-2 rounded-2xl border border-blue-100 bg-blue-50/70 px-4 py-3 text-[11px] leading-5 text-blue-900">
          <ShieldCheck className="shrink-0 text-[#0877df]" size={17} />
          <p>لن تُتجاوز أي مرحلة فورًا. تبقى الأدلة بانتظار مراجعة مستقلة، ويحتفظ النظام بالمسار اللائحي وسجل الاعتماد كاملًا.</p>
        </div>

        <div className="space-y-4">
          {selectableSteps.slice(0, effectiveCompletedCount).map((step, index) => {
            const item = evidence[step.group_id] ?? emptyEvidence(step);
            return (
              <article key={step.group_id} className="rounded-2xl border border-[#dce7f1] bg-[#fbfdff] p-4">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-600 text-xs font-black text-white">{index + 1}</span>
                    <div>
                      <h3 className="text-sm font-black text-[#0a1330]">{step.responsible_entity}</h3>
                      <p className="mt-0.5 text-[10px] text-[#6d7e91]">{step.title}</p>
                    </div>
                  </div>
                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-[9px] font-black text-emerald-800">مطلوب إثباتها</span>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="block">
                    <span className="mb-1.5 block text-[10px] font-black text-[#40546c]">تاريخ الاجتماع *</span>
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
                      className="h-10 w-full rounded-xl border border-[#d7e2ec] bg-white px-3 text-xs"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-[10px] font-black text-[#40546c]">رقم الاجتماع أو المرجع</span>
                    <input
                      value={item.meeting_reference}
                      onChange={(event) =>
                        update(step.group_id, {
                          meeting_reference: event.target.value,
                        })
                      }
                      placeholder="مثال: الاجتماع الخامس لعام 1448هـ"
                      className="h-10 w-full rounded-xl border border-[#d7e2ec] bg-white px-3 text-xs"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-[10px] font-black text-[#40546c]">نوع القرار *</span>
                    <select
                      value={item.decision_type}
                      onChange={(event) =>
                        update(step.group_id, {
                          decision_type: event.target.value as PriorRouteEvidenceDraft["decision_type"],
                        })
                      }
                      className="h-10 w-full rounded-xl border border-[#d7e2ec] bg-white px-3 text-xs"
                    >
                      {Object.entries(decisionLabels).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-[10px] font-black text-[#40546c]">نص القرار *</span>
                    <input
                      value={item.decision_text}
                      onChange={(event) =>
                        update(step.group_id, {
                          decision_text: event.target.value,
                        })
                      }
                      placeholder="اكتب القرار كما ورد في المحضر"
                      className="h-10 w-full rounded-xl border border-[#d7e2ec] bg-white px-3 text-xs"
                    />
                  </label>
                  <label className="block md:col-span-2">
                    <span className="mb-1.5 block text-[10px] font-black text-[#40546c]">سبب تسجيل هذا المجلس خارج النظام *</span>
                    <textarea
                      value={item.bypass_reason}
                      onChange={(event) =>
                        update(step.group_id, {
                          bypass_reason: event.target.value,
                        })
                      }
                      placeholder="مثال: نوقش الموضوع واعتمد قبل تشغيل النظام الإلكتروني."
                      className="min-h-20 w-full rounded-xl border border-[#d7e2ec] bg-white p-3 text-xs leading-6"
                    />
                  </label>
                  <div className="md:col-span-2 rounded-xl border border-dashed border-[#9fc8ec] bg-white p-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="flex items-center gap-1.5 text-[10px] font-black text-[#40546c]">
                          <FileUp size={14} /> محضر المجلس والمرفقات *
                        </p>
                        <p className="mt-1 text-[9px] text-[#7a899b]">PDF أو صورة أو DOCX — يلزم ملف واحد على الأقل.</p>
                      </div>
                      <label className="flex h-9 cursor-pointer items-center gap-2 rounded-xl bg-[#0877df] px-3 text-[10px] font-black text-white">
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
                          <span key={`${file.name}-${file.lastModified}-${fileIndex}`} className="flex items-center gap-2 rounded-lg bg-[#f0f6fb] px-2.5 py-1.5 text-[9px] font-bold text-[#40546c]">
                            <span className="max-w-44 truncate">{file.name}</span>
                            <button
                              type="button"
                              aria-label={`حذف ${file.name}`}
                              onClick={() =>
                                update(step.group_id, {
                                  files: item.files.filter((_, i) => i !== fileIndex),
                                })
                              }
                              className="text-red-600"
                            >
                              <Trash2 size={12} />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        <footer className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[#e4ebf2] pt-4">
          <div className="flex items-center gap-2">
            <CalendarCheck2 className={validationMessage ? "text-amber-600" : "text-emerald-600"} size={17} />
            <p className={`text-[11px] font-bold ${validationMessage ? "text-amber-800" : "text-emerald-700"}`}>{validationMessage || `سيبدأ المسار من «${steps[effectiveCompletedCount]?.responsible_entity ?? "أول مرحلة متبقية"}» بعد اعتماد الأدلة.`}</p>
          </div>
          <button type="button" disabled={busy || Boolean(validationMessage)} onClick={() => void onSubmit(selected)} className="flex h-11 items-center gap-2 rounded-xl bg-[#0877df] px-5 text-xs font-black text-white shadow-[0_9px_20px_rgba(8,119,223,.2)] disabled:bg-[#a9b8c8]">
            <ShieldCheck size={16} />
            {busy ? "جارٍ حفظ الأدلة…" : "إنشاء الموضوع وإرسال الإثباتات"}
          </button>
        </footer>
      </div>
    </section>
  );
}
