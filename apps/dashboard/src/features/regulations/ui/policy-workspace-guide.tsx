import {
  BookOpenCheck,
  BrainCircuit,
  ChevronDown,
  CircleHelp,
  FileText,
  Layers3,
  Route,
  Sparkles,
} from "lucide-react";

const areas = [
  {
    icon: FileText,
    title: "المحتوى",
    purpose: "للقراءة والاستعراض السريع فقط.",
    details:
      "يعرض أبواب اللائحة وفصولها وموادها وبنودها بالنص الرسمي. استخدمه للبحث والقراءة، ثم انتقل إلى التحرير أو القواعد عند الحاجة إلى تغيير.",
    result: "فهم النص وموقع المادة دون تعديل البيانات.",
  },
  {
    icon: Layers3,
    title: "التحرير والنطاق",
    purpose: "لبناء اللائحة وتحديد أين تسري.",
    details:
      "الهيكل والمحتوى لإضافة النصوص، نطاق التطبيق لتحديد المجالس، الإصدارات لحفظ النسخ القانونية، وبيانات اللائحة لتعريف الاسم والمالك والمرجع.",
    result: "إصدار مسودة كامل له محتوى ومجالس مشمولة ومصدر معروف.",
  },
  {
    icon: BrainCircuit,
    title: "القواعد والمسارات",
    purpose: "لتحويل المادة إلى سلوك ينفذه النظام.",
    details:
      "الشرط يحدد متى تنطبق القاعدة، والمتطلب يحدد ما يجب توفيره، والمسؤولية تحدد الجهة المخولة، والنتيجة تحدد الإجراء، والمسار يحدد انتقال المعاملة بين المجالس.",
    result: "قاعدة تنفيذية قابلة للفحص مرتبطة بمادتها القانونية.",
  },
  {
    icon: Sparkles,
    title: "قواعد الاجتماعات",
    purpose: "لإعداد القيود المتكررة بطريقة مبسطة.",
    details:
      "قوالب جاهزة للنصاب والتصويت ومهلة الدعوة وتعارض المصالح والغياب والمحضر والدورية. لا تنشئ اجتماعاً؛ بل تنشئ قاعدة تُفحص أثناء الاجتماع.",
    result: "قيد اجتماع واضح مع رسالة فشل ونتيجة متوقعة.",
  },
  {
    icon: Route,
    title: "الاعتماد والنفاذ",
    purpose: "لنقل الإصدار من مسودة إلى نسخة مطبقة.",
    details:
      "فحص الجاهزية يكشف النواقص، الإرسال يجمد المسودة للمراجعة، الاعتماد يسجل الموافقة النظامية، والنفاذ يحدد متى يبدأ التطبيق الفعلي.",
    result: "نسخة معتمدة ونافذة يمكن للنظام تطبيقها على الموضوعات.",
  },
];

const scopeSettings = [
  ["المنظمة كاملة", "يشمل كل المجالس والوحدات الحالية والمستقبلية."],
  ["مجلس محدد", "يطبق الإصدار على مجلس واحد فقط."],
  ["تصنيف مجالس", "يشمل المجالس التي تؤدي الدور نفسه، مثل جميع مجالس الأقسام."],
  ["نوع وحدة تنظيمية", "يشمل الوحدات التي تحمل نوعاً تنظيمياً واحداً."],
  ["مستوى تنظيمي", "يشمل كل المجالس المصنفة ضمن مستوى قسم أو كلية أو جامعة."],
  ["وحدة والجهات التابعة", "يشمل وحدة معينة وكل ما يقع تحتها في الشجرة."],
  [
    "الأولوية",
    "لا تعني الأهمية العامة؛ تستخدم فقط لحسم التداخل بين نطاقين مطابقين.",
  ],
  [
    "بداية ونهاية السريان",
    "تقيدان هذا النطاق زمنياً بعد دخول الإصدار حيز النفاذ.",
  ],
];

const ruleSettings = [
  ["متى تنطبق؟", "سياق التشغيل، مثل نوع الموضوع أو حالة الاجتماع."],
  ["الشروط", "قيم يجب تحققها؛ مثال: نسبة الحضور أكبر من أو تساوي 50%."],
  ["المتطلبات", "وثيقة أو بيان إلزامي وتوقيت تقديمه."],
  ["المسؤوليات والصلاحيات", "المجلس أو التصنيف المخول بالفعل المطلوب."],
  [
    "النتائج والإجراءات",
    "ما يفعله النظام عند النجاح أو الفشل: منع، تنبيه، اعتماد أو إحالة.",
  ],
  ["المسار الأساسي", "تسلسل انتقال الموضوع بين المجالس."],
  ["مسار الاعتراض", "المسار المستخدم عند تسجيل اعتراض."],
  ["المسار البديل", "مسار احتياطي عند تعذر المسار الأساسي وفق شروط موثقة."],
  [
    "العلاقات القانونية",
    "استناد أو تعديل أو إلغاء بين النصوص، وليست انتقالاً للموضوع.",
  ],
  ["فحص الجاهزية", "اختبار آلي للنواقص فقط؛ لا يمثل اعتماداً بشرياً."],
  ["مقارنة الإصدارات", "تظهر المواد المضافة والمعدلة والملغاة بين نسختين."],
];

export function PolicyWorkspaceGuide() {
  return (
    <details className="group overflow-hidden rounded-q-card border border-q-border bg-q-surface ">
      <summary className="min-h-11 content-center flex cursor-pointer list-none items-center justify-between gap-3 bg-q-surface px-4 py-3 text-q-text">
        <span className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-q-control bg-q-primary text-q-on-primary">
            <CircleHelp size={16} />
          </span>
          <span>
            <strong className="block text-q-caption font-bold">
              شرح جميع التبويبات والإعدادات
            </strong>
            <small className="mt-0.5 block text-q-caption text-q-text-3">
              افتح هذا الدليل لمعرفة وظيفة كل قسم والنتيجة التي ينتجها.
            </small>
          </span>
        </span>
        <ChevronDown size={16} className="transition group-open:rotate-180" />
      </summary>
      <div className="space-y-5 border-t border-q-border p-4">
        <section>
          <h3 className="flex items-center gap-2 text-q-caption font-bold text-q-text">
            <BookOpenCheck size={15} className="text-q-primary" />
            التبويبات الرئيسية
          </h3>
          <div className="mt-3 grid gap-3 lg:grid-cols-5">
            {areas.map(({ icon: Icon, title, purpose, details, result }) => (
              <article
                key={title}
                className="rounded-q-card border border-q-border bg-q-bg p-3"
              >
                <span className="grid h-8 w-8 place-items-center rounded-q-control bg-q-surface-2 text-q-primary">
                  <Icon size={15} />
                </span>
                <h4 className="mt-2 text-q-caption font-bold text-q-text">
                  {title}
                </h4>
                <p className="mt-1 text-q-caption font-bold text-q-link">
                  {purpose}
                </p>
                <p className="mt-2 text-q-caption leading-5 text-q-text-2">
                  {details}
                </p>
                <p className="mt-2 border-t border-q-border pt-2 text-q-caption font-bold text-q-text-2">
                  {result}
                </p>
              </article>
            ))}
          </div>
        </section>
        <div className="grid gap-4 lg:grid-cols-2">
          <GuideTable title="إعدادات نطاق التطبيق" rows={scopeSettings} />
          <GuideTable title="إعدادات القواعد والمسارات" rows={ruleSettings} />
        </div>
        <p className="rounded-q-control border border-q-border bg-q-warning-soft px-4 py-3 text-q-caption leading-6 text-q-warning">
          <strong>الترتيب المقترح:</strong> بيانات اللائحة ← إصدار مسودة ←
          الهيكل والمحتوى ← نطاق التطبيق ← القواعد والمسارات ← قواعد الاجتماعات
          ← فحص الجاهزية ← المراجعة والاعتماد ← النفاذ.
        </p>
      </div>
    </details>
  );
}

function GuideTable({ title, rows }: { title: string; rows: string[][] }) {
  return (
    <section className="overflow-hidden rounded-q-card border border-q-border">
      <h3 className="bg-q-surface px-4 py-3 text-q-caption font-bold text-q-text-2">
        {title}
      </h3>
      <dl className="divide-y divide-q-border">
        {rows.map(([term, description]) => (
          <div
            key={term}
            className="grid gap-1 px-4 py-2.5 sm:grid-cols-[130px_1fr]"
          >
            <dt className="text-q-caption font-bold text-q-primary">{term}</dt>
            <dd className="text-q-caption leading-5 text-q-text-2">
              {description}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
