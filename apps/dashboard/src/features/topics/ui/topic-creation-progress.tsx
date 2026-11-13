import { Check } from "lucide-react";

const steps = [
  { title: "بيانات الموضوع", description: "البيانات والمرفقات" },
  { title: "الحوكمة والمسار", description: "اللائحة أو المسار المخصص" },
  { title: "المراجعة والإرسال", description: "تأكيد ما سيحدث" },
  { title: "المتابعة", description: "فتح الموضوع الجديد" },
];

export function TopicCreationProgress({ currentStep }: { currentStep: number }) {
  return (
    <ol aria-label="مراحل إنشاء الموضوع" className="grid gap-2 border-b border-q-border bg-q-surface p-4 sm:grid-cols-2 xl:grid-cols-4">
      {steps.map((step, index) => {
        const stepNumber = index + 1;
        const done = currentStep > stepNumber;
        const active = currentStep === stepNumber;
        return (
          <li
            key={step.title}
            aria-current={active ? "step" : undefined}
            className={`flex items-center gap-3 rounded-q-control px-3 py-3 ${
              done
                ? "bg-q-success-soft text-q-success"
                : active
                  ? "bg-q-surface-2 text-q-primary ring-1 ring-q-primary"
                  : "bg-q-bg text-q-text-2"
            }`}
          >
            <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-q-control text-q-caption font-bold ${
              done
                ? "bg-q-success-soft text-q-success"
                : active
                  ? "bg-q-primary text-q-on-primary"
                  : "bg-q-surface-2 text-q-text-3"
            }`}>
              {done ? <Check size={14} /> : stepNumber}
            </span>
            <span className="min-w-0">
              <strong className="block text-q-caption font-bold">{step.title}</strong>
              <span className="mt-0.5 block text-q-caption opacity-75">{step.description}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
