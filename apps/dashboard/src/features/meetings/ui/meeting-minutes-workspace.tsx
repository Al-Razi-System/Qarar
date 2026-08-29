"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Download, FileSignature, LoaderCircle, LockKeyhole, PenLine, RotateCcw, Send, ShieldCheck, Sparkles, Undo2 } from "lucide-react";
import type { MeetingDetail, MeetingMinutes, MinuteApproval, SignatureStrokes } from "../model/meeting";

export function MeetingMinutesWorkspace({ meeting, minutes, text, loading, onTextChange, onGenerate, onSave, onSubmit, onSign, onReturn }: {
  meeting: MeetingDetail; minutes: MeetingMinutes | null; text: string; loading: boolean;
  onTextChange: (value: string) => void; onGenerate: () => void; onSave: () => void; onSubmit: () => void;
  onSign: (approval: MinuteApproval, signature: SignatureStrokes) => Promise<void>;
  onReturn: (approval: MinuteApproval, reason: string) => Promise<void>;
}) {
  const [signing, setSigning] = useState<MinuteApproval | null>(null);
  const [signature, setSignature] = useState<SignatureStrokes>([]);
  const [returning, setReturning] = useState<MinuteApproval | null>(null);
  const [returnReason, setReturnReason] = useState("");
  const canEdit = meeting.status === "waiting_for_minutes" && Boolean(minutes?.viewer_can_edit);
  const final = minutes?.content_final ?? text;
  const approvals = minutes?.approvals ?? [];
  const approvedCount = approvals.filter((approval) => approval.approval_status === "approved").length;
  const myPendingApproval = approvals.find((approval) => approval.can_respond && approval.approval_status === "pending");
  const awaitingApproval = meeting.status === "waiting_for_approval";

  return <section className="overflow-hidden rounded-[1.6rem] border border-[#dce6ef] bg-white shadow-sm">
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[#e6edf4] bg-gradient-to-l from-[#f0f7ff] to-white p-5 sm:p-6">
      <div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-[#0877d6] text-white"><FileSignature size={21} /></span><div><p className="text-[9px] font-black text-[#f28c28]">الوثيقة الختامية للاجتماع</p><h3 className="mt-1 text-base font-black text-[#0a1b35]">محضر الاجتماع والمصادقات</h3><p className="mt-1 text-[10px] text-[#718196]">{canEdit ? "راجع نتائج البنود وأكمل صياغة المقرر قبل تثبيت النسخة النهائية." : meeting.status === "waiting_for_approval" ? "راجع النسخة النهائية ثم وقّع داخل طلب المصادقة الخاص بك." : "نسخة المحضر المعتمدة وسجل توقيعات الحاضرين."}</p></div></div>
      <div className="flex items-center gap-2"><StatusBadge status={minutes?.status ?? "draft"} />{!!approvals.length && <span className="rounded-full bg-white px-3 py-1.5 text-[9px] font-black text-[#31506d] shadow-sm">{approvedCount} / {approvals.length} توقيعات</span>}</div>
    </header>

    {loading ? <div className="grid min-h-64 place-items-center"><LoaderCircle className="animate-spin text-[#0877d6]" size={28} /></div> : <div className="space-y-5 p-5 sm:p-6">
      {awaitingApproval && <section className={`flex flex-wrap items-center justify-between gap-4 rounded-2xl border p-4 sm:p-5 ${myPendingApproval ? "border-amber-200 bg-gradient-to-l from-amber-50 to-white" : "border-emerald-200 bg-gradient-to-l from-emerald-50 to-white"}`}>
        <div className="flex items-center gap-3"><span className={`grid h-11 w-11 place-items-center rounded-xl ${myPendingApproval ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>{myPendingApproval ? <PenLine size={20} /> : <ShieldCheck size={20} />}</span><div><p className="text-[9px] font-black text-[#71869a]">مصادقتي الشخصية</p><h4 className="mt-1 text-sm font-black text-[#172d45]">{myPendingApproval ? "المحضر بانتظار توقيعك" : "لا يوجد طلب توقيع معلق على حسابك"}</h4><p className="mt-1 text-[10px] text-[#657b90]">{myPendingApproval ? "راجع النص النهائي أدناه ثم افتح مربع التوقيع لإتمام مصادقتك." : "إذا كنت قد وقعت، فقد حُفظ توقيعك وربط ببصمة هذه النسخة النهائية."}</p></div></div>
        {myPendingApproval && <button onClick={() => { setSigning(myPendingApproval); setSignature([]); }} className="flex items-center gap-2 rounded-xl bg-[#0877d6] px-5 py-3 text-[11px] font-black text-white shadow-[0_8px_22px_rgba(8,119,214,.22)] transition hover:bg-[#0668bd]"><PenLine size={15} />مراجعة المحضر والتوقيع</button>}
      </section>}
      {canEdit ? <>
        <div className="rounded-2xl border border-blue-100 bg-blue-50/50 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h4 className="text-xs font-black text-[#173652]">تجهيز المسودة من سجل الجلسة</h4><p className="mt-1 text-[10px] leading-5 text-[#587189]">يجمع الحضور المعتمد والبنود بالترتيب وملخص النتائج. هذه خطوة منظمة تمهّد لإرسال المحتوى إلى خدمة الذكاء الاصطناعي عند ربطها، ولا تدّعي توليدًا ذكيًا حاليًا.</p></div><button onClick={onGenerate} disabled={loading} className="flex items-center gap-2 rounded-xl bg-[#0877d6] px-4 py-2.5 text-[10px] font-black text-white disabled:opacity-40"><Sparkles size={15} />تجهيز مسودة من بيانات الجلسة</button></div></div>
        <label className="block"><span className="mb-2 block text-[11px] font-black text-[#243a52]">نص المحضر الذي سيراجعه الحاضرون</span><textarea value={text} onChange={(event) => onTextChange(event.target.value)} placeholder="جهز المسودة من بيانات الجلسة أو اكتب المحضر هنا..." className="min-h-80 w-full resize-y rounded-2xl border border-[#d8e4ee] bg-white p-5 text-xs leading-8 text-[#1d334a] outline-none focus:border-[#0877d6] focus:ring-4 focus:ring-blue-50" /></label>
        <div className="flex flex-wrap gap-2"><button onClick={onSave} disabled={loading || text.trim().length < 20} className="flex items-center gap-2 rounded-xl border border-blue-200 px-4 py-2.5 text-[10px] font-black text-blue-700 disabled:opacity-40"><PenLine size={14} />حفظ المسودة</button><button onClick={onSubmit} disabled={loading || !minutes?.id || text.trim().length < 20} className="flex items-center gap-2 rounded-xl bg-[#0a1b35] px-5 py-2.5 text-[10px] font-black text-white disabled:opacity-40"><Send size={14} />تثبيت النسخة وإرسالها لجميع الحاضرين</button></div>
      </> : <article className="rounded-2xl border border-[#dfe8f0] bg-[#fbfdff]"><div className="border-b border-[#e6edf4] px-5 py-4"><h4 className="text-xs font-black text-[#172d45]">النص النهائي للمحضر</h4><p className="mt-1 text-[9px] text-[#71869a]">كل توقيع أدناه مرتبط ببصمة هذه النسخة تحديدًا.</p></div><div className="whitespace-pre-wrap p-5 text-xs leading-8 text-[#24384e] sm:p-7">{final || "لم تُجهز نسخة المحضر بعد."}</div></article>}

      {!!approvals.length && <div><div className="mb-3 flex items-center justify-between"><h4 className="text-xs font-black text-[#0a1b35]">مصادقات الحاضرين</h4><span className="text-[9px] font-bold text-[#75889a]">يوقع كل حاضر من حسابه الشخصي</span></div><div className="grid gap-3 md:grid-cols-2">{approvals.map((approval) => <ApprovalCard key={approval.id} approval={approval} onSign={() => { setSigning(approval); setSignature([]); }} onReturn={() => { setReturning(approval); setReturnReason(""); }} />)}</div></div>}
      {minutes?.status === "approved" && <CompletionPanel meeting={meeting} minutes={minutes} />}
    </div>}

    {signing && <Dialog title="التوقيع على المحضر النهائي" onClose={() => setSigning(null)}><p className="mb-4 text-[10px] leading-6 text-[#667b90]">بتوقيعك تؤكد أنك راجعت النسخة النهائية المعروضة وأن التوقيع يخص هذه النسخة فقط.</p><SignaturePad value={signature} onChange={setSignature} /><div className="mt-4 flex gap-2"><button onClick={async () => { await onSign(signing, signature); setSigning(null); }} disabled={signature.length === 0 || loading} className="rounded-xl bg-emerald-600 px-5 py-2.5 text-[11px] font-black text-white disabled:opacity-40">توقيع ومصادقة</button><button onClick={() => setSignature([])} className="flex items-center gap-1 rounded-xl border border-[#d7e2ec] px-4 py-2.5 text-[10px] font-bold text-[#536a80]"><RotateCcw size={13} />مسح</button></div></Dialog>}
    {returning && <Dialog title="إعادة المحضر إلى المقرر" onClose={() => setReturning(null)}><p className="mb-3 text-[10px] leading-6 text-[#667b90]">ستُلغى طلبات التوقيع الحالية لأن أي تعديل ينتج نسخة نهائية جديدة.</p><textarea autoFocus value={returnReason} onChange={(event) => setReturnReason(event.target.value)} placeholder="اذكر الملاحظة المطلوب تصحيحها..." className="min-h-28 w-full rounded-xl border border-[#d8e4ee] p-3 text-xs leading-6 outline-none focus:border-red-400" /><div className="mt-4 flex gap-2"><button onClick={async () => { await onReturn(returning, returnReason.trim()); setReturning(null); }} disabled={returnReason.trim().length < 5 || loading} className="rounded-xl bg-red-600 px-5 py-2.5 text-[11px] font-black text-white disabled:opacity-40">تأكيد الإعادة</button></div></Dialog>}
  </section>;
}

function CompletionPanel({ meeting, minutes }: { meeting: MeetingDetail; minutes: MeetingMinutes }) {
  const pdfVersion = encodeURIComponent(minutes.final_content_hash ?? minutes.updated_at ?? meeting.updated_at ?? "latest");
  return <section className="overflow-hidden rounded-3xl border border-emerald-200 bg-gradient-to-l from-emerald-50 via-white to-[#f5fbff] shadow-[0_14px_35px_rgba(4,120,87,.08)]">
    <div className="flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6">
      <div className="flex items-center gap-4">
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-emerald-600 text-white shadow-[0_8px_22px_rgba(5,150,105,.22)]"><CheckCircle2 size={27} /></span>
        <div><p className="text-[9px] font-black text-emerald-700">اكتملت دورة الاجتماع بنجاح</p><h4 className="mt-1 text-base font-black text-[#12372f]">اعتمد المحضر وأُغلق الاجتماع</h4><p className="mt-1 max-w-2xl text-[10px] leading-6 text-[#53736b]">أصبحت هذه نسخة نهائية مقفلة. حُفظت بصمتها وتوقيعات جميع الحاضرين في سجل التدقيق ولا يمكن تعديلها بعد الإغلاق.</p></div>
      </div>
      <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white px-4 py-2 text-[10px] font-black text-emerald-700"><LockKeyhole size={14} />نسخة نهائية معتمدة</span>
    </div>
    <div className="flex flex-wrap items-center gap-2 border-t border-emerald-100 bg-white/70 p-4 sm:px-6">
      <a href={`/api/admin/meetings/${meeting.id}/minutes/pdf?v=${pdfVersion}`} download className="inline-flex items-center gap-2 rounded-xl bg-[#0877d6] px-4 py-2.5 text-[10px] font-black text-white transition hover:bg-[#0668bd]"><Download size={14} />تنزيل المحضر الرسمي PDF</a>
      <Link href="/admin/meetings" className="inline-flex items-center gap-2 rounded-xl border border-[#d7e2eb] bg-white px-4 py-2.5 text-[10px] font-black text-[#526a81] transition hover:text-[#0877d6]"><ArrowLeft size={14} />العودة إلى سجل الاجتماعات</Link>
    </div>
  </section>;
}

function ApprovalCard({ approval, onSign, onReturn }: { approval: MinuteApproval; onSign: () => void; onReturn: () => void }) {
  const approved = approval.approval_status === "approved";
  return <div className={`rounded-2xl border p-4 ${approved ? "border-emerald-200 bg-emerald-50/60" : "border-[#e0e9f1] bg-white"}`}><div className="flex items-center gap-3"><span className={`grid h-10 w-10 place-items-center rounded-xl text-sm font-black ${approved ? "bg-emerald-600 text-white" : "bg-[#eaf4fd] text-[#0877d6]"}`}>{approved ? <CheckCircle2 size={18} /> : (approval.name_ar?.trim()[0] ?? "ع")}</span><div className="min-w-0 flex-1"><h5 className="truncate text-[11px] font-black text-[#1d334b]">{approval.name_ar ?? "عضو حاضر"}</h5><p className="mt-1 text-[9px] text-[#75889a]">{approved ? `تم التوقيع ${formatDate(approval.signed_at)}` : "بانتظار التوقيع"}</p></div>{approved && <FileSignature size={18} className="text-emerald-600" />}</div>{approval.can_respond && !approved && <div className="mt-3 flex gap-2"><button onClick={onSign} className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-emerald-600 px-3 py-2 text-[10px] font-black text-white"><PenLine size={13} />فتح مربع التوقيع</button><button onClick={onReturn} className="flex items-center gap-1 rounded-xl border border-red-200 px-3 py-2 text-[10px] font-bold text-red-600"><Undo2 size={13} />إعادة</button></div>}</div>;
}

function SignaturePad({ value, onChange }: { value: SignatureStrokes; onChange: (value: SignatureStrokes) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const current = useRef<Array<[number, number]>>([]);
  const [preview, setPreview] = useState<Array<[number, number]>>([]);
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const rect = canvas.getBoundingClientRect(); const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(rect.width * ratio)); canvas.height = Math.max(1, Math.round(rect.height * ratio));
    const context = canvas.getContext("2d"); if (!context) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0); context.clearRect(0, 0, rect.width, rect.height);
    context.strokeStyle = "#0a2b55"; context.lineWidth = 2.4; context.lineCap = "round"; context.lineJoin = "round";
    [...value, preview].filter((stroke) => stroke.length > 0).forEach((stroke) => { context.beginPath(); stroke.forEach(([x, y], index) => { const px=x*rect.width, py=y*rect.height; if(index===0) context.moveTo(px,py); else context.lineTo(px,py); }); context.stroke(); });
  }, [preview, value]);
  function point(event: React.PointerEvent<HTMLCanvasElement>): [number, number] { const rect=event.currentTarget.getBoundingClientRect(); return [(event.clientX-rect.left)/rect.width,(event.clientY-rect.top)/rect.height]; }
  function finishStroke() {
    if (!drawing.current) return;
    drawing.current = false;
    if (current.current.length > 1) onChange([...value, current.current]);
    current.current = [];
    setPreview([]);
  }
  return <div><canvas ref={canvasRef} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); drawing.current=true; current.current=[point(event)]; setPreview(current.current); }} onPointerMove={(event) => { if(!drawing.current)return; current.current=[...current.current,point(event)]; setPreview(current.current); }} onPointerUp={finishStroke} onPointerCancel={finishStroke} className="h-52 w-full touch-none rounded-2xl border-2 border-dashed border-[#a9bfd2] bg-[linear-gradient(#fff,#fff),repeating-linear-gradient(0deg,transparent,transparent_27px,#edf3f8_28px)]" aria-label="مربع رسم التوقيع" /><p className="mt-2 text-center text-[9px] text-[#7b8da0]">ارسم توقيعك بالفأرة أو القلم أو اللمس داخل المربع.</p></div>;
}

function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) { return <div className="fixed inset-0 z-[70] grid place-items-center bg-[#07162d]/65 p-4 backdrop-blur-sm" role="dialog" aria-modal="true"><div className="w-full max-w-xl rounded-3xl bg-white p-6 shadow-2xl"><div className="mb-4 flex items-center justify-between"><h3 className="text-base font-black text-[#0a1b35]">{title}</h3><button onClick={onClose} className="rounded-lg border border-[#dbe4ec] px-3 py-1.5 text-xs text-[#60758a]">إغلاق</button></div>{children}</div></div>; }
function StatusBadge({ status }: { status: string }) { const value=status==="approved"?["معتمد","bg-emerald-100 text-emerald-700"]:status==="ready_for_approval"?["بانتظار توقيعات الحاضرين","bg-amber-100 text-amber-800"]:["مسودة قابلة للتحرير","bg-blue-100 text-blue-700"]; return <span className={`rounded-full px-3 py-1.5 text-[9px] font-black ${value[1]}`}>{value[0]}</span>; }
function formatDate(value?: string | null) { return value ? new Intl.DateTimeFormat("ar-SA",{dateStyle:"medium",timeStyle:"short"}).format(new Date(value)) : ""; }
