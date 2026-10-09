export type TopicStagePolicy = { step_key: string; kind: "discussion" | "review" | "recommendation" | "approval"; approved: "advance" | "complete"; rejected: "complete" | "advance" | "return_previous" };
export type PolicyStage = { id: string; step_key?: string; name_ar: string; sequence_no: number };
export function defaultStagePolicies(stages: PolicyStage[]): TopicStagePolicy[] {
  return stages.map((stage, index) => ({ step_key: stage.step_key ?? `s${index + 1}`, kind: "discussion", approved: index === stages.length - 1 ? "complete" : "advance", rejected: "complete" }));
}
export function TopicStagePolicyEditor({ stages, value, onChange }: { stages: PolicyStage[]; value: TopicStagePolicy[]; onChange: (next: TopicStagePolicy[]) => void }) {
  return <section className="mt-6 space-y-3" aria-label="سياسة مراحل تصنيف الموضوع">
    <h3 className="text-sm font-bold text-slate-800">سياسة هذا التصنيف في كل مجلس</h3>
    <p className="text-xs leading-6 text-slate-500">هذه الإعدادات تخص هذا التصنيف فقط، ولا تغيّر المسار المشترك أو تصنيفات أخرى. الإحالة إجراء مستقل بعد المناقشة داخل الاجتماع.</p>
    {stages.map((stage, index) => {
      const policy = value[index];
      if (!policy) return null;
      const update = (change: Partial<TopicStagePolicy>) => onChange(value.map((item, i) => i === index ? { ...item, ...change } : item));
      return <article key={stage.id} className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4"><h4 className="mb-4 text-sm font-bold text-slate-800">{index + 1}. {stage.name_ar}</h4>
        <div className="grid gap-4 lg:grid-cols-3">
          <label className="text-xs font-bold text-slate-600">عمل المجلس<select aria-label={`عمل المجلس للمرحلة ${index + 1}`} value={policy.kind} onChange={event => update({ kind: event.target.value as TopicStagePolicy["kind"] })} className="mt-2 block min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal"><option value="discussion">مناقشة</option><option value="review">مراجعة</option><option value="recommendation">توصية</option><option value="approval">اعتماد</option></select></label>
          <label className="text-xs font-bold text-slate-600">عند القبول<select aria-label={`قبول الموضوع في المرحلة ${index + 1}`} value={policy.approved} onChange={event => update({ approved: event.target.value as TopicStagePolicy["approved"] })} className="mt-2 block min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal">{index < stages.length - 1 && <option value="advance">الانتقال للمجلس التالي</option>}<option value="complete">إنهاء الموضوع بالقبول</option></select></label>
          <label className="text-xs font-bold text-slate-600">عند الرفض<select aria-label={`رفض الموضوع في المرحلة ${index + 1}`} value={policy.rejected} onChange={event => update({ rejected: event.target.value as TopicStagePolicy["rejected"] })} className="mt-2 block min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal"><option value="complete">إنهاء الموضوع بالرفض</option>{index < stages.length - 1 && <option value="advance">استكمال المسار رغم الرفض</option>}{index > 0 && <option value="return_previous">إعادة للمجلس السابق للتعديل</option>}</select></label>
        </div>
        {policy.approved === "complete" && policy.rejected === "complete" && index < stages.length - 1 && <p className="mt-3 text-xs leading-6 text-amber-800">ينتهي هذا التصنيف هنا في الحالتين؛ لن تُنفّذ المراحل اللاحقة له، ويبقى ترتيب المسار متاحًا للتصنيفات الأخرى.</p>}
      </article>;
    })}
  </section>;
}
