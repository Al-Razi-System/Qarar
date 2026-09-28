import { Check } from "lucide-react";

const steps = [
  { title: "بيانات الموضوع", description: "البيانات والمرفقات" },
  { title: "الحوكمة والمسار", description: "اللائحة أو المسار المخصص" },
  { title: "المراجعة والإرسال", description: "تأكيد ما سيحدث" },
  { title: "المتابعة", description: "فتح الموضوع الجديد" },
];

export function TopicCreationProgress({ currentStep }: { currentStep: number }) {
  return (
    <ol aria-label="مراحل إنشاء الموضوع" className="grid gap-2 border-b border-[#edf2f7] bg-white p-4 sm:grid-cols-2 xl:grid-cols-4">
      {steps.map((step, index) => {
        const stepNumber = index + 1;
        const done = currentStep > stepNumber;
        const active = currentStep === stepNumber;
        return (
          <li
            key={step.title}
            aria-current={active ? "step" : undefined}
            className={`flex items-center gap-3 rounded-xl px-3 py-3 ${
              done
                ? "bg-emerald-50 text-emerald-800"
                : active
                  ? "bg-[#edf6ff] text-[#0066cc] ring-1 ring-[#b8d9f5]"
                  : "bg-[#f8fafc] text-[#74849a]"
            }`}
          >
            <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl text-[11px] font-black ${
              done
                ? "bg-emerald-600 text-white"
                : active
                  ? "bg-[#0066cc] text-white"
                  : "bg-[#e9eef4] text-[#7b8ba0]"
            }`}>
              {done ? <Check size={14} /> : stepNumber}
            </span>
            <span className="min-w-0">
              <strong className="block text-xs font-black">{step.title}</strong>
              <span className="mt-0.5 block text-[10px] opacity-75">{step.description}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
