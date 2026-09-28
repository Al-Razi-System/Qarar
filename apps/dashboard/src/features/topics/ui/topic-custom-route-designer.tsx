import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Check, Plus, Route, Trash2 } from "lucide-react";

export type CustomRouteStepDraft = {
  id: string;
  name_ar: string;
  step_type: "review" | "discussion" | "recommendation" | "approval" | "execution" | "follow_up";
  responsibility: "review" | "discuss" | "recommend" | "final_approve" | "execute" | "follow_up";
  governance_unit_id: string;
};

type UnitOption = { id: string; name_ar: string };

const stepTypes: Array<{
  value: CustomRouteStepDraft["step_type"];
  label: string;
  responsibility: CustomRouteStepDraft["responsibility"];
  defaultName: string;
}> = [
  { value: "review", label: "مراجعة", responsibility: "review", defaultName: "مراجعة الموضوع" },
  { value: "discussion", label: "مناقشة", responsibility: "discuss", defaultName: "مناقشة الموضوع" },
  { value: "recommendation", label: "توصية", responsibility: "recommend", defaultName: "إصدار التوصية" },
  { value: "approval", label: "اعتماد", responsibility: "final_approve", defaultName: "الاعتماد النهائي" },
  { value: "execution", label: "تنفيذ", responsibility: "execute", defaultName: "تنفيذ القرار" },
  { value: "follow_up", label: "متابعة", responsibility: "follow_up", defaultName: "متابعة التنفيذ" },
];

function newStep(unitId: string, type: CustomRouteStepDraft["step_type"] = "review"): CustomRouteStepDraft {
  const definition = stepTypes.find((item) => item.value === type) ?? stepTypes[0];
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `route-step-${Date.now()}-${Math.random()}`,
    name_ar: definition.defaultName,
    step_type: definition.value,
    responsibility: definition.responsibility,
    governance_unit_id: unitId,
  };
}

export function TopicCustomRouteDesigner({
  units,
  initialUnitId,
  busy,
  onSubmit,
}: {
  units: UnitOption[];
  initialUnitId: string;
  busy: boolean;
  onSubmit: (value: { routeName: string; rationale: string; steps: CustomRouteStepDraft[] }) => void | Promise<void>;
}) {
  const [routeName, setRouteName] = useState("مسار معالجة الموضوع");
  const [rationale, setRationale] = useState("");
  const [steps, setSteps] = useState<CustomRouteStepDraft[]>(() => initialUnitId
    ? [newStep(initialUnitId, "review"), newStep(initialUnitId, "approval")]
    : []);

  const validationMessage = useMemo(() => {
    if (routeName.trim().length < 3) return "أدخل اسمًا واضحًا للمسار.";
    if (rationale.trim().length < 10) return "اشرح سبب الحاجة إلى المسار المخصص في 10 أحرف على الأقل.";
    if (steps.length < 2) return "أضف مرحلتين على الأقل للمسار.";
    if (steps.some((step) => step.name_ar.trim().length < 3 || !step.governance_unit_id)) return "أكمل اسم الجهة المسؤولة عن كل مرحلة.";
    return "";
  }, [rationale, routeName, steps]);

  function updateStep(id: string, patch: Partial<CustomRouteStepDraft>) {
    setSteps((current) => current.map((step) => step.id === id ? { ...step, ...patch } : step));
  }

  function changeStepType(id: string, type: CustomRouteStepDraft["step_type"]) {
    const definition = stepTypes.find((item) => item.value === type) ?? stepTypes[0];
    updateStep(id, {
      step_type: definition.value,
      responsibility: definition.responsibility,
      name_ar: definition.defaultName,
    });
  }

  function moveStep(index: number, offset: -1 | 1) {
    const destination = index + offset;
    if (destination < 0 || destination >= steps.length) return;
    setSteps((current) => {
      const next = [...current];
      [next[index], next[destination]] = [next[destination], next[index]];
      return next;
    });
  }

  return (
    <section className="rounded-2xl border border-[#cfe2f4] bg-[#f8fbff] p-4" aria-labelledby="custom-route-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black text-[#0066cc]">مصمم المسار المخصص</p>
          <h2 id="custom-route-title" className="mt-1 text-base font-black text-[#0a1330]">رتّب المراحل التي سيمر بها الموضوع</h2>
          <p className="mt-1 text-[11px] leading-5 text-[#617287]">ابدأ بمسار خطي واضح. لن يبدأ التنفيذ حتى يراجعه مسؤول الحوكمة ويعتمده.</p>
        </div>
        <span className="rounded-full bg-white px-3 py-1.5 text-[10px] font-black text-[#52647a]">{steps.length} مراحل</span>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-[11px] font-black text-[#34465e]">اسم المسار</span>
          <input className="h-11 w-full rounded-xl border border-[#dce5ef] bg-white px-3 text-xs text-[#0a1330] outline-none focus:border-[#0066cc] focus:ring-2 focus:ring-[#0066cc]/10" value={routeName} onChange={(event) => setRouteName(event.target.value)} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[11px] font-black text-[#34465e]">لماذا يحتاج الموضوع هذا المسار؟</span>
          <textarea className="min-h-20 w-full rounded-xl border border-[#dce5ef] bg-white p-3 text-xs leading-6 text-[#0a1330] outline-none focus:border-[#0066cc] focus:ring-2 focus:ring-[#0066cc]/10" value={rationale} onChange={(event) => setRationale(event.target.value)} placeholder="مثال: لا توجد لائحة نافذة تنظم هذا النوع من الموضوعات حالياً." />
        </label>
      </div>

      <ol className="mt-4 space-y-3">
        {steps.map((step, index) => (
          <li key={step.id} className="rounded-2xl border border-[#dce5ef] bg-white p-3">
            <div className="grid gap-3 lg:grid-cols-[44px_minmax(160px,.8fr)_minmax(220px,1.2fr)_minmax(220px,1fr)_auto] lg:items-end">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#0066cc] text-xs font-black text-white">{index + 1}</span>
              <label>
                <span className="mb-1.5 block text-[10px] font-black text-[#52647a]">نوع المرحلة</span>
                <select className="h-10 w-full rounded-xl border border-[#dce5ef] bg-white px-3 text-xs text-[#0a1330]" value={step.step_type} onChange={(event) => changeStepType(step.id, event.target.value as CustomRouteStepDraft["step_type"])}>
                  {stepTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                </select>
              </label>
              <label>
                <span className="mb-1.5 block text-[10px] font-black text-[#52647a]">اسم المرحلة</span>
                <input className="h-10 w-full rounded-xl border border-[#dce5ef] bg-white px-3 text-xs text-[#0a1330]" value={step.name_ar} onChange={(event) => updateStep(step.id, { name_ar: event.target.value })} />
              </label>
              <label>
                <span className="mb-1.5 block text-[10px] font-black text-[#52647a]">الجهة المسؤولة</span>
                <select className="h-10 w-full rounded-xl border border-[#dce5ef] bg-white px-3 text-xs text-[#0a1330]" value={step.governance_unit_id} onChange={(event) => updateStep(step.id, { governance_unit_id: event.target.value })}>
                  <option value="">اختر الجهة</option>
                  {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name_ar}</option>)}
                </select>
              </label>
              <div className="flex gap-1">
                <button type="button" aria-label="نقل المرحلة للأعلى" disabled={index === 0} onClick={() => moveStep(index, -1)} className="grid h-10 w-10 place-items-center rounded-xl border border-[#dce5ef] text-[#52647a] disabled:opacity-30"><ArrowUp size={15} /></button>
                <button type="button" aria-label="نقل المرحلة للأسفل" disabled={index === steps.length - 1} onClick={() => moveStep(index, 1)} className="grid h-10 w-10 place-items-center rounded-xl border border-[#dce5ef] text-[#52647a] disabled:opacity-30"><ArrowDown size={15} /></button>
                <button type="button" aria-label="حذف المرحلة" disabled={steps.length <= 2} onClick={() => setSteps((current) => current.filter((item) => item.id !== step.id))} className="grid h-10 w-10 place-items-center rounded-xl border border-red-100 text-red-600 disabled:opacity-30"><Trash2 size={15} /></button>
              </div>
            </div>
          </li>
        ))}
      </ol>

      <button type="button" disabled={steps.length >= 12 || !initialUnitId} onClick={() => setSteps((current) => [...current, newStep(initialUnitId, "review")])} className="mt-3 flex h-10 items-center gap-2 rounded-xl border border-[#9cc7ef] bg-white px-4 text-xs font-black text-[#0066cc] disabled:opacity-50">
        <Plus size={15} /> إضافة مرحلة
      </button>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[#dce5ef] pt-4">
        <p className={`text-[11px] leading-5 ${validationMessage ? "text-amber-800" : "text-emerald-700"}`}>
          {validationMessage || "المسار مكتمل مبدئياً وجاهز للإرسال إلى مسؤول الحوكمة."}
        </p>
        <button type="button" disabled={busy || Boolean(validationMessage)} onClick={() => void onSubmit({ routeName, rationale, steps })} className="flex h-11 items-center gap-2 rounded-xl bg-[#0066cc] px-5 text-xs font-black text-white shadow-[0_8px_18px_rgba(0,102,204,.18)] disabled:cursor-not-allowed disabled:bg-[#a8b8c9]">
          {busy ? <Route className="animate-pulse" size={16} /> : <Check size={16} />}
          {busy ? "جارٍ حفظ المسار…" : "إنشاء الموضوع وإرسال المسار للاعتماد"}
        </button>
      </div>
    </section>
  );
}
