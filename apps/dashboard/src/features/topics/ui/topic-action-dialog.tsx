import { AlertTriangle, Check, Clock, LoaderCircle, X } from "lucide-react";
import type { ReviewAction, TopicDetail } from "../model/topic-view";

type Props = {
  action: Exclude<ReviewAction, "approve"> | null;
  topic: TopicDetail | null;
  reason: string;
  busy: boolean;
  onReasonChange: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
};

const config = {
  reject: {
    title: "رفض الموضوع",
    description: "سيُغلق الطلب بهذه النتيجة، وسيظهر السبب لمقدم الموضوع في سجل الحالة.",
    label: "سبب الرفض",
    placeholder: "وضّح سبب الرفض بشكل محدد وقابل للفهم...",
    button: "تأكيد الرفض",
    icon: X,
    tone: "red",
  },
  return: {
    title: "طلب استكمال الموضوع",
    description: "سيعود الموضوع إلى مقدمه لاستكمال البيانات، ويختفي من قائمة المراجعة حتى إعادة إرساله.",
    label: "المعلومات المطلوب استكمالها",
    placeholder: "حدّد البيانات أو المرفقات الناقصة بوضوح...",
    button: "إرسال طلب الاستكمال",
    icon: Clock,
    tone: "amber",
  },
} as const;

export function TopicActionDialog({ action, topic, reason, busy, onReasonChange, onClose, onConfirm }: Props) {
  if (!action || !topic) return null;
  const current = config[action];
  const Icon = current.icon;
  const valid = reason.trim().length >= 5;
  const isReject = current.tone === "red";

  return <div className="fixed inset-0 z-50 grid place-items-center bg-[#061329]/60 p-4 backdrop-blur-sm" role="presentation">
    <section role="dialog" aria-modal="true" aria-labelledby="topic-action-title" className="w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-[0_28px_80px_rgba(4,20,43,.35)]">
      <header className={`flex items-start gap-4 border-b p-6 ${isReject ? "border-red-100 bg-red-50/70" : "border-amber-100 bg-amber-50/70"}`}>
        <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${isReject ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-800"}`}><Icon size={20} /></span>
        <div className="min-w-0 flex-1"><h2 id="topic-action-title" className="text-base font-black text-[#0a1330]">{current.title}</h2><p className="mt-1 text-[11px] leading-5 text-[#66788e]">{current.description}</p></div>
        <button onClick={onClose} disabled={busy} aria-label="إغلاق" className="grid h-9 w-9 place-items-center rounded-xl text-[#718196] hover:bg-white"><X size={17} /></button>
      </header>
      <div className="p-6">
        <div className="rounded-2xl border border-[#e4ecf4] bg-[#f9fbfd] px-4 py-3"><p className="text-[10px] font-bold text-[#78899d]">الموضوع</p><strong className="mt-1 block text-xs leading-6 text-[#172a43]">{topic.title_ar}</strong></div>
        <label className="mt-5 block"><span className="mb-2 block text-xs font-black text-[#34465e]">{current.label} <span className="text-red-600">*</span></span>
          <textarea autoFocus value={reason} onChange={(event) => onReasonChange(event.target.value)} rows={4} maxLength={2000} placeholder={current.placeholder} className="w-full resize-none rounded-2xl border border-[#cfdae6] bg-white p-4 text-xs leading-6 outline-none transition focus:border-[#0877df] focus:ring-4 focus:ring-[#0877df]/10" />
          <span className={`mt-1.5 block text-[10px] ${reason.length > 0 && !valid ? "text-red-600" : "text-[#7b8b9d]"}`}>الحد الأدنى 5 أحرف · {reason.length}/2000</span>
        </label>
        {!valid && reason.length > 0 && <p className="mt-3 flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-[10px] font-bold text-red-700"><AlertTriangle size={13} /> اكتب سبباً واضحاً من 5 أحرف على الأقل.</p>}
      </div>
      <footer className="flex justify-end gap-2 border-t border-[#e9eff5] bg-[#fbfcfe] px-6 py-4">
        <button onClick={onClose} disabled={busy} className="h-10 rounded-xl border border-[#d8e2ec] bg-white px-5 text-xs font-bold text-[#53667c] hover:bg-[#f6f9fc]">إلغاء</button>
        <button onClick={onConfirm} disabled={busy || !valid} className={`flex h-10 items-center gap-2 rounded-xl px-5 text-xs font-black text-white shadow-lg disabled:cursor-not-allowed disabled:opacity-45 ${isReject ? "bg-red-600 shadow-red-600/15 hover:bg-red-700" : "bg-[#c66a00] shadow-amber-700/15 hover:bg-[#a95800]"}`}>
          {busy ? <LoaderCircle className="animate-spin" size={15} /> : <Check size={15} />} {busy ? "جارٍ التنفيذ..." : current.button}
        </button>
      </footer>
    </section>
  </div>;
}
