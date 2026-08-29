import Link from "next/link";
import { ArrowLeft, BookOpenCheck, CalendarDays, ClipboardCheck, FileText, Gavel, ShieldCheck, Users, Workflow } from "lucide-react";
import { PageHeader } from "@/shared/ui/page-header";

const metrics = [
  { label: "المعاملات قيد المراجعة", value: "12", hint: "تحتاج إجراء", tone: "blue", href: "/admin/topics", icon: FileText },
  { label: "الاجتماعات القادمة", value: "5", hint: "خلال هذا الشهر", tone: "violet", href: "/admin/meetings", icon: CalendarDays },
  { label: "اللوائح النافذة", value: "4", hint: "إصدارات فعالة", tone: "emerald", href: "/admin/regulations", icon: BookOpenCheck },
  { label: "طلبات الاعتماد", value: "8", hint: "بانتظار المراجعة", tone: "orange", href: "/admin/topics", icon: ClipboardCheck },
] as const;

const actions = [
  { href: "/admin/topics", title: "إنشاء معاملة", description: "ابدأ موضوعًا جديدًا واربطه بالمرجع النظامي.", icon: FileText },
  { href: "/admin/regulations", title: "إدارة اللوائح", description: "أنشئ إصدارًا أو تابع جاهزية الاعتماد.", icon: BookOpenCheck },
  { href: "/admin/meetings", title: "إعداد اجتماع", description: "أنشئ اجتماعًا وجهز جدول الأعمال والتصويت.", icon: CalendarDays },
  { href: "/admin/permissions", title: "مراجعة الصلاحيات", description: "تحقق من الأدوار ونطاقات الوصول.", icon: ShieldCheck },
];

const statusClass = { blue: "bg-[#edf6ff] text-[#0066cc]", violet: "bg-[#f1efff] text-[#6355c7]", emerald: "bg-[#eaf9f2] text-[#16835f]", orange: "bg-[#fff4e8] text-[#b86416]" };

export default function AdminDashboardPage() {
  return <div className="mx-auto max-w-[1480px]">
    <PageHeader eyebrow="مركز القيادة" title="لوحة التحكم" description="نظرة موحدة على أعمال الحوكمة والمعاملات والاجتماعات، مع الوصول السريع إلى الإجراءات التي تحتاجها الآن." actions={<Link href="/admin/topics" className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#0066cc] px-4 text-xs font-black text-white shadow-[0_8px_18px_rgba(0,102,204,.18)] hover:bg-[#005bb8]">إنشاء معاملة <ArrowLeft size={15} /></Link>} />

    <section aria-label="مؤشرات العمل" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {metrics.map((metric) => { const Icon = metric.icon; return <Link key={metric.label} href={metric.href} className="group rounded-2xl border border-[#dbe6f1] bg-white p-5 shadow-[0_8px_24px_rgba(15,42,72,.04)] transition hover:-translate-y-0.5 hover:border-[#9cc7ef] hover:shadow-lg"><div className="flex items-start justify-between"><span className={`grid h-10 w-10 place-items-center rounded-xl ${statusClass[metric.tone]}`}><Icon size={19} /></span><ArrowLeft size={16} className="text-[#9aa9b9] transition group-hover:-translate-x-1 group-hover:text-[#0066cc]" /></div><strong className="mt-5 block text-3xl font-black text-[#0a1330]">{metric.value}</strong><span className="mt-1 block text-xs font-bold text-[#344861]">{metric.label}</span><span className="mt-2 block text-[10px] text-[#8493a6]">{metric.hint}</span></Link>; })}
    </section>

    <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,.65fr)]">
      <section className="rounded-2xl border border-[#dbe6f1] bg-white p-5 shadow-[0_8px_24px_rgba(15,42,72,.04)]"><div className="flex items-start justify-between gap-3"><div><h2 className="text-sm font-black text-[#14233a]">مساحة العمل</h2><p className="mt-1 text-[10px] text-[#8493a6]">ابدأ من الإجراء الأقرب إلى مهمتك الحالية.</p></div><Workflow className="text-[#8aaed0]" size={22} /></div><div className="mt-5 grid gap-3 sm:grid-cols-2">{actions.map((action) => { const Icon = action.icon; return <Link key={action.href} href={action.href} className="group flex gap-3 rounded-xl border border-[#e2eaf2] p-4 transition hover:border-[#9cc7ef] hover:bg-[#f8fbff]"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#edf6ff] text-[#0066cc]"><Icon size={17} /></span><span><strong className="block text-[11px] font-black text-[#253750]">{action.title}</strong><span className="mt-1 block text-[10px] leading-5 text-[#7a8b9e]">{action.description}</span></span></Link>; })}</div></section>
      <section className="rounded-2xl border border-[#dbe6f1] bg-[#0a1830] p-5 text-white shadow-[0_12px_30px_rgba(10,24,48,.12)]"><div className="flex items-start justify-between"><div><p className="text-[10px] font-bold text-[#8ebce8]">دورة الحوكمة</p><h2 className="mt-2 text-lg font-black">من الطلب إلى القرار</h2></div><Gavel className="text-[#ff9a4a]" size={23} /></div><div className="mt-6 space-y-4">{["المعاملات والموضوعات", "المراجعة والإحالة", "الاجتماعات والتصويت", "القرارات والتنفيذ"].map((step, index) => <div key={step} className="flex items-center gap-3"><span className="grid h-7 w-7 place-items-center rounded-full border border-white/20 bg-white/10 text-[10px] font-black">{index + 1}</span><span className="text-[11px] font-bold text-white/85">{step}</span>{index < 3 && <span className="mr-auto h-px w-5 bg-white/15" />}</div>)}</div><Link href="/admin/topics" className="mt-7 flex items-center justify-between rounded-xl bg-white/10 px-3 py-2.5 text-[10px] font-bold text-white/80 hover:bg-white/15">عرض المعاملات <ArrowLeft size={14} /></Link></section>
    </div>

    <section className="mt-6 grid gap-4 sm:grid-cols-3"><Link href="/admin/users" className="flex items-center gap-3 rounded-2xl border border-[#dbe6f1] bg-white p-4 hover:border-[#9cc7ef]"><Users className="text-[#0066cc]" size={20} /><span><strong className="block text-xs">المستخدمون والعضويات</strong><span className="text-[10px] text-[#8493a6]">إدارة الحسابات والأدوار</span></span></Link><Link href="/admin/regulations" className="flex items-center gap-3 rounded-2xl border border-[#dbe6f1] bg-white p-4 hover:border-[#9cc7ef]"><BookOpenCheck className="text-[#16835f]" size={20} /><span><strong className="block text-xs">دليل اللوائح</strong><span className="text-[10px] text-[#8493a6]">الإصدارات والنفاذ</span></span></Link><Link href="/admin/audit" className="flex items-center gap-3 rounded-2xl border border-[#dbe6f1] bg-white p-4 hover:border-[#9cc7ef]"><ClipboardCheck className="text-[#b86416]" size={20} /><span><strong className="block text-xs">سجل التدقيق</strong><span className="text-[10px] text-[#8493a6]">تتبع العمليات والتغييرات</span></span></Link></section>
  </div>;
}
