"use client";

import { useMemo, useState } from "react";
import {
  ArrowLeft, ArrowRight, BookOpenText, CalendarClock, Check, CheckCircle2,
  CirclePlus, FileCheck2, GitBranch, Info, LayoutGrid, ListFilter, Search,
  Sparkles, Tags, X,
} from "lucide-react";

type Draft = {
  classification: string;
  name: string;
  code: string;
  acceptance: "advance" | "complete" | "return_previous";
  rejection: "complete" | "return_previous" | "refer_lower";
  route: "department_faculty_university" | "department_faculty" | "single_council";
  schedule: "none" | "fixed_date" | "monthly_week" | "seasonal";
};

const initialDraft: Draft = {
  classification: "", name: "", code: "", acceptance: "advance",
  rejection: "complete", route: "department_faculty_university", schedule: "none",
};

const steps = [
  { title: "هوية الموضوع", hint: "التصنيف والاسم", icon: Tags },
  { title: "نتيجة القرار", hint: "ماذا يحدث بعدها؟", icon: GitBranch },
  { title: "مسار الحوكمة", hint: "المجالس بالترتيب", icon: GitBranch },
  { title: "التوقيت", hint: "موعد أو دورة", icon: CalendarClock },
  { title: "المراجعة", hint: "ملخص قبل الحفظ", icon: FileCheck2 },
];

const classifications = ["أكاديمي", "طلابي", "مؤسسي", "جودة", "مالي", "إداري"];

const acceptanceLabels = { advance: "التصعيد للمرحلة التالية", complete: "إنهاء الموضوع", return_previous: "إعادته للمرحلة السابقة" } as const;
const rejectionLabels = { complete: "إنهاء الموضوع بالرفض", return_previous: "إعادته للتعديل", refer_lower: "إحالته إلى مجلس أدنى" } as const;
const scheduleLabels = { none: "غير مجدول", fixed_date: "تاريخ ثابت", monthly_week: "أسبوع محدد شهرياً", seasonal: "موسمي" } as const;
const routeLabels = { department_faculty_university: "القسم ← الكلية ← الجامعة", department_faculty: "القسم ← الكلية", single_council: "مجلس واحد" } as const;
const routeNodes = {
  department_faculty_university: ["مجلس القسم", "مجلس الكلية", "مجلس الجامعة"],
  department_faculty: ["مجلس القسم", "مجلس الكلية"],
  single_council: ["المجلس المختص"],
} as const;

function Choice({ selected, title, description, onClick }: {
  selected: boolean; title: string; description: string; onClick: () => void;
}) {
  return <button type="button" onClick={onClick} aria-pressed={selected}
    className={`flex min-h-24 w-full items-start gap-3 rounded-2xl border p-4 text-right transition ${selected ? "border-[#0872df] bg-[#eef7ff] shadow-[0_0_0_3px_rgba(8,114,223,.08)]" : "border-[#dce6f0] bg-white hover:border-[#a9cbea] hover:bg-[#fbfdff]"}`}>
    <span className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border ${selected ? "border-[#0872df] bg-[#0872df] text-white" : "border-[#cbd8e5] text-transparent"}`}><Check size={14}/></span>
    <span><strong className="block text-sm text-[#172a42]">{title}</strong><span className="mt-1 block text-xs leading-5 text-[#718198]">{description}</span></span>
  </button>;
}

export function TopicTypesWorkspace() {
  const [creating, setCreating] = useState(false);
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(initialDraft);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const readiness = useMemo(() => [draft.classification, draft.name.trim(), draft.code.trim()].filter(Boolean).length, [draft]);

  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: "" }));
  }

  function next() {
    if (step === 0) {
      const nextErrors: Record<string, string> = {};
      if (!draft.classification) nextErrors.classification = "اختر تصنيف الموضوع حتى يستطيع النظام تحديد القواعد المناسبة.";
      if (draft.name.trim().length < 3) nextErrors.name = "اكتب اسماً واضحاً من 3 أحرف على الأقل.";
      if (!/^[a-z][a-z0-9_.-]{2,}$/.test(draft.code)) nextErrors.code = "استخدم رمزاً إنجليزياً مثل academic.program دون مسافات.";
      if (Object.keys(nextErrors).length) { setErrors(nextErrors); return; }
    }
    setStep((current) => Math.min(current + 1, steps.length - 1));
  }

  function close() {
    setCreating(false); setStep(0); setDraft(initialDraft); setErrors({});
  }

  if (!creating) return <section className="space-y-6" aria-labelledby="topic-types-title">
    <header className="overflow-hidden rounded-[28px] border border-[#d8e5f1] bg-[linear-gradient(135deg,#082b5c_0%,#075fb8_58%,#1594ea_100%)] text-white shadow-[0_18px_48px_rgba(7,67,130,.18)]">
      <div className="relative p-6 sm:p-8"><div className="absolute -left-20 -top-24 h-64 w-64 rounded-full border border-white/10"/><div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div><span className="inline-flex items-center gap-2 rounded-full bg-white/12 px-3 py-1.5 text-xs font-bold text-white/90"><Sparkles size={14}/> مركز إعداد الحوكمة</span><h1 id="topic-types-title" className="mt-4 text-2xl font-black sm:text-3xl">أنواع الموضوعات ومساراتها</h1><p className="mt-3 max-w-2xl text-sm leading-7 text-blue-50/85">أنشئ نوع الموضوع مرة واحدة، وحدد ما يحدث بعد القرار وتوقيته. يتولى النظام لاحقاً تطبيق المسار الصحيح تلقائياً.</p></div>
        <button type="button" onClick={() => setCreating(true)} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-white px-5 text-sm font-black text-[#075fb8] shadow-lg transition hover:-translate-y-0.5"><CirclePlus size={19}/> إنشاء نوع موضوع</button>
      </div></div>
    </header>
    <div className="grid gap-4 sm:grid-cols-3">
      {[{value:"0",label:"أنواع فعالة",hint:"ستظهر بعد ربط البيانات",icon:CheckCircle2},{value:"0",label:"مسودات",hint:"لا توجد مسودات بعد",icon:BookOpenText},{value:"—",label:"جاهزية النموذج",hint:"API داخلي قيد الاختبار",icon:GitBranch}].map((item) => <article key={item.label} className="rounded-2xl border border-[#dce6f0] bg-white p-5 shadow-[0_8px_24px_rgba(15,42,72,.04)]"><div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#edf6ff] text-[#0872df]"><item.icon size={20}/></span><div><strong className="text-2xl font-black text-[#10243e]">{item.value}</strong><p className="text-xs font-bold text-[#40546d]">{item.label}</p></div></div><p className="mt-3 text-[11px] text-[#8594a7]">{item.hint}</p></article>)}
    </div>
    <section className="rounded-[24px] border border-[#dce6f0] bg-white shadow-[0_8px_28px_rgba(15,42,72,.04)]">
      <div className="flex flex-col gap-3 border-b border-[#e8eef4] p-4 sm:flex-row sm:items-center"><div className="relative flex-1"><Search className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8797aa]" size={17}/><input aria-label="البحث في أنواع الموضوعات" placeholder="ابحث بالاسم أو التصنيف…" className="h-11 w-full rounded-xl border border-[#dce6f0] bg-[#f8fafc] pr-10 pl-3 text-xs outline-none focus:border-[#0872df] focus:ring-4 focus:ring-[#0872df]/8"/></div><button type="button" className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[#dce6f0] px-4 text-xs font-bold text-[#52647a]"><ListFilter size={16}/> تصفية</button></div>
      <div className="grid min-h-64 place-items-center p-8 text-center"><span className="grid h-16 w-16 place-items-center rounded-3xl bg-[#edf6ff] text-[#0872df]"><LayoutGrid size={28}/></span><h2 className="mt-4 text-lg font-black text-[#172a42]">ابدأ بأول نوع موضوع</h2><p className="mt-2 max-w-md text-xs leading-6 text-[#718198]">لن تحتاج لإدخال معرفات تقنية. اختر التصنيف والنتائج والتوقيت، وسيولّد النظام المراجع تلقائياً.</p><button type="button" onClick={() => setCreating(true)} className="mt-5 inline-flex h-11 items-center gap-2 rounded-xl bg-[#0872df] px-5 text-xs font-black text-white"><CirclePlus size={16}/> إنشاء نوع موضوع</button></div>
    </section>
  </section>;

  return <section className="mx-auto max-w-[1320px]" aria-labelledby="editor-title">
    <header className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="text-xs font-black text-[#f17822]">مسودة جديدة</p><h1 id="editor-title" className="mt-1 text-2xl font-black text-[#10243e]">إعداد نوع موضوع</h1><p className="mt-1 text-xs text-[#718198]">خمس خطوات قصيرة، ويمكنك مراجعة النتيجة أثناء الإدخال.</p></div><button type="button" onClick={close} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-[#dce6f0] bg-white px-4 text-xs font-bold text-[#52647a] sm:w-auto"><X size={16}/> إغلاق المسودة</button></header>
    <nav aria-label="خطوات إعداد نوع الموضوع" className="mb-5">
      <div className="rounded-2xl border border-[#dce6f0] bg-white p-4 shadow-sm sm:hidden"><div className="flex items-center justify-between gap-3"><div className="min-w-0"><p className="text-[11px] font-bold text-[#718198]">الخطوة {step + 1} من {steps.length}</p><p className="mt-1 truncate text-sm font-black text-[#172a42]">{steps[step].title}</p></div><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#edf6ff] font-black text-[#0872df]">{step + 1}</span></div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#e8eef4]"><div className="h-full rounded-full bg-[#0872df] transition-[width]" style={{ width: `${((step + 1) / steps.length) * 100}%` }}/></div></div>
      <ol className="hidden gap-2 rounded-2xl border border-[#dce6f0] bg-white p-2 shadow-sm sm:grid sm:grid-cols-5">{steps.map((item,index) => {const Icon=item.icon;const active=index===step;const complete=index<step;return <li key={item.title} className="min-w-0"><button type="button" onClick={() => index < step && setStep(index)} disabled={index>step} aria-current={active?"step":undefined} className={`flex min-h-16 w-full items-center gap-2 rounded-xl px-2 text-right ${active?"bg-[#0872df] text-white":complete?"bg-[#eef8f4] text-[#13795b]":"text-[#8998aa]"}`}><span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${active?"bg-white/15":complete?"bg-white":"bg-[#f3f6f9]"}`}>{complete?<Check size={16}/>:<Icon size={16}/>}</span><span className="min-w-0"><strong className="block truncate text-[11px]">{index+1}. {item.title}</strong><span className={`mt-1 hidden truncate text-[9px] lg:block ${active?"text-white/70":"text-[#91a0b2]"}`}>{item.hint}</span></span></button></li>})}</ol>
    </nav>
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="rounded-[24px] border border-[#dce6f0] bg-white p-5 shadow-[0_10px_32px_rgba(15,42,72,.05)] sm:p-7">
        {step===0 && <div><h2 className="text-lg font-black text-[#172a42]">ما نوع الموضوع؟</h2><p className="mt-1 text-xs leading-6 text-[#718198]">هذه المعلومات هي ما يراه مقدم الموضوع. المعرف المرجعي ينشئه النظام تلقائياً.</p><fieldset className="mt-6"><legend className="text-sm font-bold text-[#22344c]">التصنيف</legend><div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">{classifications.map((value)=><button key={value} type="button" onClick={()=>update("classification",value)} aria-pressed={draft.classification===value} className={`min-h-11 rounded-xl border px-3 text-xs font-bold ${draft.classification===value?"border-[#0872df] bg-[#edf6ff] text-[#0872df]":"border-[#dce6f0] text-[#52647a] hover:bg-[#f8fafc]"}`}>{value}</button>)}</div>{errors.classification&&<p role="alert" className="mt-2 text-xs font-bold text-red-600">{errors.classification}</p>}</fieldset><div className="mt-6 grid gap-5 sm:grid-cols-2"><label className="block"><span className="mb-2 block text-sm font-bold">اسم نوع الموضوع</span><input value={draft.name} onChange={(e)=>update("name",e.target.value)} placeholder="مثال: اعتماد برنامج أكاديمي" className={`h-12 w-full rounded-xl border px-4 text-sm outline-none focus:ring-4 focus:ring-[#0872df]/8 ${errors.name?"border-red-400":"border-[#dce6f0] focus:border-[#0872df]"}`}/>{errors.name&&<span role="alert" className="mt-2 block text-xs font-bold text-red-600">{errors.name}</span>}</label><label className="block"><span className="mb-2 block text-sm font-bold">الرمز الداخلي</span><input dir="ltr" value={draft.code} onChange={(e)=>update("code",e.target.value.toLowerCase())} placeholder="academic.program" className={`h-12 w-full rounded-xl border px-4 text-left font-mono text-sm outline-none focus:ring-4 focus:ring-[#0872df]/8 ${errors.code?"border-red-400":"border-[#dce6f0] focus:border-[#0872df]"}`}/><span className={`mt-2 block text-[11px] ${errors.code?"font-bold text-red-600":"text-[#8292a5]"}`}>{errors.code||"للاستخدام الداخلي فقط، ولن يطلب من المستخدم."}</span></label></div></div>}
        {step===1 && <div><h2 className="text-lg font-black text-[#172a42]">ماذا يحدث بعد القرار؟</h2><p className="mt-1 text-xs leading-6 text-[#718198]">اختر السلوك الوظيفي؛ سنربط المجالس الفعلية في خطوة المسار لاحقاً.</p><div className="mt-6 grid gap-6 lg:grid-cols-2"><fieldset><legend className="mb-3 text-sm font-black">عند القبول</legend><div className="space-y-2"><Choice selected={draft.acceptance==="advance"} title="التصعيد للمرحلة التالية" description="ينتقل الموضوع إلى المجلس التالي في المسار." onClick={()=>update("acceptance","advance")}/><Choice selected={draft.acceptance==="complete"} title="إنهاء الموضوع" description="يعتبر القرار نهائياً ولا توجد مرحلة لاحقة." onClick={()=>update("acceptance","complete")}/><Choice selected={draft.acceptance==="return_previous"} title="إعادته للمرحلة السابقة" description="يرجع للتعديل أو الاستكمال قبل عرضه مجدداً." onClick={()=>update("acceptance","return_previous")}/></div></fieldset><fieldset><legend className="mb-3 text-sm font-black">عند الرفض</legend><div className="space-y-2"><Choice selected={draft.rejection==="complete"} title="إنهاء الموضوع بالرفض" description="يغلق المسار ويثبت سبب الرفض." onClick={()=>update("rejection","complete")}/><Choice selected={draft.rejection==="return_previous"} title="إعادته للتعديل" description="يعود للجهة السابقة لمعالجة الملاحظات." onClick={()=>update("rejection","return_previous")}/><Choice selected={draft.rejection==="refer_lower"} title="إحالته إلى مجلس أدنى" description="ينشئ حركة عكسية محكومة لنفس الموضوع." onClick={()=>update("rejection","refer_lower")}/></div></fieldset></div></div>}
        {step===2 && <div><h2 className="text-lg font-black text-[#172a42]">ما مسار الحوكمة؟</h2><p className="mt-1 text-xs leading-6 text-[#718198]">اختر المسار الافتراضي لهذا التصنيف. سيبقى المسار مرتبطاً بالموضوع نفسه.</p><fieldset className="mt-6"><legend className="sr-only">اختيار مسار الحوكمة</legend><div className="grid gap-3 lg:grid-cols-3">{([{value:"department_faculty_university",title:"مسار جامعي كامل",description:"من القسم إلى الكلية ثم الجامعة."},{value:"department_faculty",title:"قسم ثم كلية",description:"تنتهي الموافقة على مستوى الكلية."},{value:"single_council",title:"مجلس مختص واحد",description:"قرار نهائي داخل مجلس واحد."}] as const).map((item)=><Choice key={item.value} selected={draft.route===item.value} title={item.title} description={item.description} onClick={()=>update("route",item.value)}/>)}</div></fieldset><div className="mt-6 rounded-2xl border border-[#dce6f0] bg-[#f8fbfe] p-4" aria-label="معاينة مسار الحوكمة"><p className="mb-4 text-xs font-black text-[#40546d]">ترتيب الانتقال</p><ol className="flex flex-col gap-2 sm:flex-row sm:items-stretch">{routeNodes[draft.route].map((node,index,nodes)=><li key={node} className="flex min-w-0 flex-1 flex-col sm:flex-row sm:items-center"><div className="flex min-h-16 flex-1 items-center gap-3 rounded-xl border border-[#cfe0ef] bg-white p-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#0872df] text-xs font-black text-white">{index+1}</span><strong className="text-xs text-[#172a42]">{node}</strong></div>{index<nodes.length-1&&<ArrowLeft aria-hidden="true" className="my-1 self-center rotate-90 text-[#7b9ab7] sm:mx-1 sm:my-0 sm:rotate-0" size={18}/>}</li>)}</ol></div></div>}
        {step===3 && <div><h2 className="text-lg font-black text-[#172a42]">هل للموضوع موعد محدد؟</h2><p className="mt-1 text-xs leading-6 text-[#718198]">اختر السياسة الأقرب. تظهر تفاصيلها فقط عند الحاجة.</p><div className="mt-6 grid gap-3 sm:grid-cols-2">{([{value:"none",title:"غير مجدول",description:"يمكن إنشاؤه في أي وقت."},{value:"fixed_date",title:"تاريخ ثابت",description:"يناقش في تاريخ محدد."},{value:"monthly_week",title:"أسبوع محدد شهرياً",description:"مثل الأسبوع الأول من كل شهر."},{value:"seasonal",title:"موسمي",description:"مثل خطة الاختبارات أو اعتماد النتائج."}] as const).map((item)=><Choice key={item.value} selected={draft.schedule===item.value} title={item.title} description={item.description} onClick={()=>update("schedule",item.value)}/>)}</div>{draft.schedule!=="none"&&<div className="mt-5 flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-6 text-amber-900"><Info className="mt-0.5 shrink-0" size={18}/><p>ستظهر حقول المدة والتكرار والتأجيل هنا بعد ربط عقد الجدولة بالواجهة. لن يسمح النظام بالحفظ قبل اكتمالها.</p></div>}</div>}
        {step===4 && <div><h2 className="text-lg font-black text-[#172a42]">راجع الإعداد قبل الحفظ</h2><p className="mt-1 text-xs leading-6 text-[#718198]">المعرفات والحالة ينشئها النظام؛ لن تُطلب منك.</p><dl className="mt-6 divide-y divide-[#e8eef4] rounded-2xl border border-[#dce6f0]">{[["التصنيف",draft.classification],["نوع الموضوع",draft.name],["الرمز الداخلي",draft.code],["نتيجة القبول",acceptanceLabels[draft.acceptance]],["نتيجة الرفض",rejectionLabels[draft.rejection]],["مسار الحوكمة",routeLabels[draft.route]],["التوقيت",scheduleLabels[draft.schedule]]].map(([label,value])=><div key={label} className="grid gap-1 p-4 sm:grid-cols-[180px_1fr]"><dt className="text-xs font-bold text-[#718198]">{label}</dt><dd className="break-words text-sm font-black text-[#172a42]">{value||"—"}</dd></div>)}</dl><div role="status" className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-xs leading-6 text-blue-900"><strong className="block">المعاينة غير متصلة بالحفظ بعد</strong>سيُفعّل زر الحفظ فقط بعد فتح API الداخلي للواجهة واختبار الصلاحيات على staging.</div></div>}
        <div className="sticky bottom-2 z-10 mt-8 grid grid-cols-2 gap-3 rounded-2xl border border-[#e8eef4] bg-white/95 p-3 shadow-[0_8px_24px_rgba(15,42,72,.10)] backdrop-blur sm:static sm:flex sm:items-center sm:justify-between sm:border-x-0 sm:border-b-0 sm:bg-transparent sm:px-0 sm:pb-0 sm:pt-5 sm:shadow-none"><button type="button" onClick={()=>setStep((current)=>Math.max(0,current-1))} disabled={step===0} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[#dce6f0] px-4 text-xs font-bold text-[#52647a] disabled:opacity-40"><ArrowRight size={16}/> السابق</button>{step<steps.length-1?<button type="button" onClick={next} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#0872df] px-5 text-xs font-black text-white shadow-md">التالي <ArrowLeft size={16}/></button>:<button type="button" disabled title="يتطلب فتح API V2 واختبار الصلاحيات" className="inline-flex h-11 cursor-not-allowed items-center justify-center gap-2 rounded-xl bg-[#aebac8] px-3 text-xs font-black text-white"><FileCheck2 size={16}/> حفظ المسودة</button>}</div>
      </div>
      <aside className="h-fit min-w-0 rounded-[24px] border border-[#dce6f0] bg-[#102f57] p-5 text-white shadow-[0_12px_36px_rgba(15,47,87,.16)] xl:sticky xl:top-28"><div className="flex items-center justify-between"><span className="text-xs font-black text-blue-100">معاينة مباشرة</span><span className="rounded-full bg-white/10 px-2.5 py-1 text-[10px]">مسودة</span></div><h2 className="mt-5 break-words text-xl font-black">{draft.name||"اسم نوع الموضوع"}</h2><p className="mt-2 break-words text-xs text-blue-100/75">{draft.classification||"اختر التصنيف"} · {draft.code||"internal.code"}</p><div className="mt-6 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-[#50d6aa] transition-all" style={{width:`${(readiness/3)*100}%`}}/></div><p className="mt-2 text-[10px] text-blue-100/70">اكتمال البيانات الأساسية {Math.round((readiness/3)*100)}%</p><div className="mt-6 grid gap-3 text-xs sm:grid-cols-2 xl:grid-cols-1"><div className="rounded-2xl bg-white/8 p-4"><span className="text-blue-100/65">عند القبول</span><strong className="mt-1 block">{acceptanceLabels[draft.acceptance]}</strong></div><div className="rounded-2xl bg-white/8 p-4"><span className="text-blue-100/65">عند الرفض</span><strong className="mt-1 block">{rejectionLabels[draft.rejection]}</strong></div><div className="rounded-2xl bg-white/8 p-4"><span className="text-blue-100/65">مسار الحوكمة</span><strong className="mt-1 block">{routeLabels[draft.route]}</strong></div><div className="rounded-2xl bg-white/8 p-4"><span className="text-blue-100/65">سياسة التوقيت</span><strong className="mt-1 block">{scheduleLabels[draft.schedule]}</strong></div></div><div className="mt-6 flex items-start gap-2 rounded-2xl border border-white/10 bg-white/5 p-3 text-[10px] leading-5 text-blue-50/75"><Info className="mt-0.5 shrink-0" size={14}/>سيظهر السند النظامي هنا بعد ربط البيانات المعتمدة.</div></aside>
    </div>
  </section>;
}
