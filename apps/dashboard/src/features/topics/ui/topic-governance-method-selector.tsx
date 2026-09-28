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
    description: "اختيار مسار مناسب للموضوع عندما لا توجد لائحة قابلة للتطبيق.",
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
    <section className="rounded-2xl border border-[#d9e4ef] bg-white p-4 shadow-sm" aria-labelledby="governance-method-title">
      <div className="mb-4">
        <p className="text-[10px] font-black text-[#ff7a00]">طريقة حوكمة الموضوع</p>
        <h2 id="governance-method-title" className="mt-1 text-base font-black text-[#0a1330]">كيف سيُعالج هذا الموضوع؟</h2>
        <p className="mt-1 text-[11px] leading-5 text-[#617287]">يعرض النظام الخيارات المسموح بها فقط، مع توضيح سبب عدم إتاحة أي خيار آخر.</p>
      </div>

      <div className="grid gap-3 lg:grid-cols-3" role="radiogroup" aria-label="اختيار طريقة الحوكمة">
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
              className={`min-h-40 rounded-2xl border p-4 text-right transition ${
                selected
                  ? "border-[#0066cc] bg-[#edf6ff] shadow-[0_10px_24px_rgba(0,102,204,.10)] ring-1 ring-[#0066cc]"
                  : state.available
                    ? "border-[#dce5ef] bg-white hover:border-[#8ebeea] hover:bg-[#fbfdff]"
                    : "cursor-not-allowed border-[#e4e9ef] bg-[#f7f9fb] opacity-65"
              }`}
            >
              <span className="flex items-start justify-between gap-3">
                <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${selected ? "bg-[#0066cc] text-white" : "bg-[#edf3f8] text-[#526a82]"}`}>
                  <Icon size={19} />
                </span>
                <span className={`rounded-full px-2.5 py-1 text-[9px] font-black ${selected ? "bg-white text-[#0066cc]" : "bg-[#edf2f7] text-[#617287]"}`}>{method.badge}</span>
              </span>
              <strong className="mt-3 block text-sm font-black text-[#0a1330]">{method.title}</strong>
              <span className="mt-1 block text-[11px] leading-5 text-[#617287]">{method.description}</span>
              <span className={`mt-3 block text-[10px] font-bold leading-5 ${state.available ? "text-emerald-700" : "text-[#7b8ba0]"}`}>{state.reason}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
