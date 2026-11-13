
import { Button } from "@/shared/ui/button";
import { BookOpen, History, Route, ShieldAlert } from "lucide-react";
import type {
  TopicGovernanceMethod,
  TopicGovernanceMethodAvailability,
} from "../model/topic-creation";

const methods = [
  {
    id: "prior" as const,
    title: "استكمال مسار سابق",
    description: "إثبات المجالس التي ناقشت الموضوع سابقًا والبدء من أول مجلس متبقٍ.",
    badge: "موضوع قائم",
    icon: History,
  },
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
        <h2 id="governance-method-title" className="mt-1 text-q-h3 font-bold text-q-text">كيف تريد أن يسير هذا الموضوع؟</h2>
<p className="text-q-caption font-bold text-q-primary">اختر طريقة المعالجة</p>
        <p className="mx-auto mt-2 max-w-2xl text-q-caption leading-6 text-q-text-3">اختر المسار اللائحي للموضوع الجديد، أو وثّق المجالس السابقة لموضوع قائم. المسارات غير القياسية لا تبدأ قبل مراجعة مستقلة.</p>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4" role="radiogroup" aria-label="اختيار طريقة الحوكمة">
        {methods.map((method) => {
          const Icon = method.icon;
          const state = availability[method.id];
          const selected = value === method.id;
          return (
            <Button variant="ghost"
              key={method.id}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={!state.available}
              onClick={() => onChange(method.id)}
              className={`group rounded-q-control border p-4 text-right transition ${
                selected
                  ? "border-q-primary bg-q-surface-2  ring-1 ring-q-primary"
                  : state.available
                    ? "border-q-border bg-q-surface hover:-translate-y-0.5 hover:border-q-primary hover:"
                    : "cursor-not-allowed border-q-border bg-q-surface-2 opacity-65"
              }`}
            >
              <span className="flex items-start justify-between gap-3">
                <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-q-control ${selected ? "bg-q-primary text-q-on-primary" : "bg-q-surface-2 text-q-link group-hover:bg-q-surface-2 group-hover:text-q-primary"}`}>
                  <Icon size={19} />
                </span>
                <span className={`rounded-full px-2.5 py-1 text-q-caption font-bold ${selected ? "bg-q-surface text-q-primary" : "bg-q-surface-2 text-q-text-3"}`}>{method.badge}</span>
              </span>
              <strong className="mt-3 block text-q-ui font-bold text-q-text">{method.title}</strong>
              <span className="mt-1 block text-q-caption leading-5 text-q-text-3">{method.description}</span>
              <span className={`mt-3 block border-t pt-3 text-q-caption font-bold leading-5 ${state.available ? "border-q-border text-q-success" : "border-q-border text-q-text-3"}`}>{state.reason}</span>
            </Button>
          );
        })}
      </div>
    </section>
  );
}
