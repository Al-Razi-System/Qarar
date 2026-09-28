import { BookOpen, Route, ShieldAlert } from "lucide-react";
import type {
  TopicGovernanceMethod,
  TopicGovernanceMethodAvailability,
} from "../model/topic-creation";

const methods = [
  {
    id: "regulation" as const,
    title: "المسار اللائحي",
    description: "استخدام البند المطابق وتشغيل مسار الاعتماد المعتمد.",
    badge: "المسار الأساسي",
    icon: BookOpen,
  },
  {
    id: "custom" as const,
    title: "مسار مخصص",
    description: "صمّم مراحل معالجة مختلفة وأرسلها لاعتماد مسؤول الحوكمة.",
    badge: "يتطلب اعتماداً",
    icon: Route,
  },
  {
    id: "exception" as const,
    title: "استثناء لائحي",
    description: "طلب الخروج عن المسار الأصلي بسبب حالة موثقة ومؤقتة.",
    badge: "للمخولين فقط",
    icon: ShieldAlert,
  },
];

export function TopicGovernanceMethodSelector({
  value,
  availability,
  onChange,
}: {
  value: TopicGovernanceMethod;
  availability: TopicGovernanceMethodAvailability;
  onChange: (method: TopicGovernanceMethod) => void;
}) {
  return (
    <section aria-labelledby="governance-method-title">
      <div className="mb-5 text-center">
        <p className="text-[11px] font-black text-[#0877df]">اختر طريقة المعالجة</p>
        <h2 id="governance-method-title" className="mt-1 text-xl font-black text-[#0a1330]">كيف تريد أن يسير هذا الموضوع؟</h2>
        <p className="mx-auto mt-2 max-w-2xl text-xs leading-6 text-[#617287]">المسار اللائحي هو الخيار المقترح. المسار المخصص والاستثناء يرسلان للمراجعة ولا يبدآن تلقائيًا.</p>
      </div>

      <div className="grid gap-3 md:grid-cols-3" role="radiogroup" aria-label="اختيار طريقة الحوكمة">
        {methods.map((method) => {
          const Icon = method.icon;
          const state = availability[method.id];
          const selected = value === method.id;
          return (
            <button
              key={method.id}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={!state.available}
              onClick={() => onChange(method.id)}
              className={`group rounded-2xl border p-4 text-right transition ${
                selected
                  ? "border-[#0877df] bg-[#f0f7ff] shadow-[0_12px_30px_rgba(8,119,223,.12)] ring-1 ring-[#0877df]"
                  : state.available
                    ? "border-[#dce5ef] bg-white hover:-translate-y-0.5 hover:border-[#8ebeea] hover:shadow-md"
                    : "cursor-not-allowed border-[#e4e9ef] bg-[#f7f9fb] opacity-65"
              }`}
            >
              <span className="flex items-start justify-between gap-3">
                <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${selected ? "bg-[#0877df] text-white" : "bg-[#edf3f8] text-[#526a82] group-hover:bg-[#e5f2ff] group-hover:text-[#0877df]"}`}>
                  <Icon size={19} />
                </span>
                <span className={`rounded-full px-2.5 py-1 text-[9px] font-black ${selected ? "bg-white text-[#0877df]" : "bg-[#edf2f7] text-[#617287]"}`}>{method.badge}</span>
              </span>
              <strong className="mt-3 block text-sm font-black text-[#0a1330]">{method.title}</strong>
              <span className="mt-1 block text-[11px] leading-5 text-[#617287]">{method.description}</span>
              <span className={`mt-3 block border-t pt-3 text-[10px] font-bold leading-5 ${state.available ? "border-[#e4edf6] text-emerald-700" : "border-[#e4e9ef] text-[#7b8ba0]"}`}>{state.reason}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
