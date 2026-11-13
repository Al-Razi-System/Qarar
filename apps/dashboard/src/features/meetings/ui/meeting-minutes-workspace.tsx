"use client";
import { Card } from "@/shared/ui/card";
import { Dialog } from "@/shared/ui/dialog";

import { Button } from "@/shared/ui/button";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Download, FileSignature, LoaderCircle, LockKeyhole, PenLine, RotateCcw, Send, ShieldCheck, Sparkles, Undo2 } from "lucide-react";
import { InlineMessage } from "@/shared/ui/inline-message";
import type { MeetingDetail, MeetingMinutes, MinuteApproval, SignatureStrokes } from "../model/meeting";
import { decisionsMissingFromMinutes } from "../model/minutes-decisions";

export function MeetingMinutesWorkspace({ meeting, minutes, text, loading, onTextChange, onGenerate, onSave, onSubmit, onSign, onReturn }: {
  meeting: MeetingDetail; minutes: MeetingMinutes | null; text: string; loading: boolean;
  onTextChange: (value: string) => void; onGenerate: () => void; onSave: () => void; onSubmit: () => void;
  onSign: (approval: MinuteApproval, signature: SignatureStrokes) => Promise<void>;
  onReturn: (approval: MinuteApproval, reason: string) => Promise<void>;
}) {
  const [signing, setSigning] = useState<MinuteApproval | null>(null);
  const [signature, setSignature] = useState<SignatureStrokes>([]);
  const [signatureError, setSignatureError] = useState<string | null>(null);
  const [returning, setReturning] = useState<MinuteApproval | null>(null);
  const [returnReason, setReturnReason] = useState("");
  const canEdit = meeting.status === "waiting_for_minutes" && Boolean(minutes?.viewer_can_edit);
  const staleDecisions = decisionsMissingFromMinutes(text, minutes?.decisions);
  const final = minutes?.content_final ?? text;
  const approvals = minutes?.approvals ?? [];
  const approvedCount = approvals.filter((approval) => approval.approval_status === "approved").length;
  const myPendingApproval = approvals.find((approval) => approval.can_respond && approval.approval_status === "pending");
  const myApproval = approvals.find((approval) => approval.can_respond);
  const awaitingApproval = meeting.status === "waiting_for_approval";

  return <section className="overflow-hidden rounded-[1.6rem] border border-q-border bg-q-surface ">
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-q-border bg-q-surface-2 p-5 sm:p-6">
      <div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-q-control bg-q-primary text-q-on-primary"><FileSignature size={21} /></span><div><h3 className="mt-1 text-q-body font-bold text-q-text">محضر الاجتماع والمصادقات</h3>
<p className="text-q-caption font-bold text-q-text-2">الوثيقة الختامية للاجتماع</p><p className="mt-1 text-q-caption text-q-text-3">{canEdit ? "راجع نتائج البنود وأكمل صياغة المقرر قبل تثبيت النسخة النهائية." : meeting.status === "waiting_for_approval" ? "راجع النسخة النهائية ثم وقّع داخل طلب المصادقة الخاص بك." : "نسخة المحضر المعتمدة وسجل توقيعات الحاضرين."}</p></div></div>
      <div className="flex items-center gap-2"><StatusBadge status={minutes?.status ?? "draft"} />{!!approvals.length && <span className="rounded-full bg-q-surface px-3 py-1.5 text-q-caption font-bold text-q-link ">{approvedCount} / {approvals.length} توقيعات</span>}</div>
    </header>

    {loading ? <div className="grid min-h-64 place-items-center"><LoaderCircle className="animate-spin text-q-primary" size={28} /></div> : <div className="space-y-5 p-5 sm:p-6">
      {awaitingApproval && <section className={`flex flex-wrap items-center justify-between gap-4 rounded-q-control border p-4 sm:p-5 ${myPendingApproval ? "border-q-warning bg-q-surface-2" : "border-q-success bg-q-surface-2"}`}>
        <div className="flex items-center gap-3"><span className={`grid h-11 w-11 place-items-center rounded-q-control ${myPendingApproval ? "bg-q-warning-soft text-q-warning" : "bg-q-success-soft text-q-success"}`}>{myPendingApproval ? <PenLine size={20} /> : <ShieldCheck size={20} />}</span><div><p className="text-q-caption font-bold text-q-text-2">مصادقتي الشخصية</p><h4 className="mt-1 text-q-ui font-bold text-q-text">{myPendingApproval ? "المحضر بانتظار توقيعك" : "لا يوجد طلب توقيع معلق على حسابك"}</h4><p className="mt-1 text-q-caption text-q-text-2">{myPendingApproval ? "راجع النص النهائي أدناه ثم افتح مربع التوقيع لإتمام مصادقتك." : "إذا كنت قد وقعت، فقد حُفظ توقيعك وربط ببصمة هذه النسخة النهائية."}</p></div></div>
        {myPendingApproval && <Button variant="primary" type="submit" onClick={() => { setSigning(myPendingApproval); setSignature([]); setSignatureError(null); }} className="flex items-center gap-2 rounded-q-control px-5 py-3 font-bold transition "><PenLine size={15} />مراجعة المحضر والتوقيع</Button>}
      </section>}
      {canEdit ? <>
        <Card className="rounded-q-card border border-q-primary bg-q-surface-2/50 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h4 className="text-q-caption font-bold text-q-text">تجهيز المسودة من سجل الجلسة</h4><p className="mt-1 text-q-caption leading-5 text-q-text-2">يجمع الحضور المعتمد والبنود بالترتيب وملخص النتائج. هذه خطوة منظمة تمهّد لإرسال المحتوى إلى خدمة الذكاء الاصطناعي عند ربطها، ولا تدّعي توليدًا ذكيًا حاليًا.</p></div><Button variant="primary" type="submit" onClick={onGenerate} disabled={loading} className="flex items-center gap-2 rounded-q-control px-4 py-2.5 font-bold disabled:opacity-40"><Sparkles size={15} />تجهيز مسودة من بيانات الجلسة</Button></div></Card>
        <label className="block"><span className="mb-2 block text-q-caption font-bold text-q-link">نص المحضر الذي سيراجعه الحاضرون</span><textarea value={text} onChange={(event) => onTextChange(event.target.value)} placeholder="جهز المسودة من بيانات الجلسة أو اكتب المحضر هنا..." className="min-h-80 w-full resize-y rounded-q-control border border-q-border bg-q-surface p-5 text-q-caption leading-8 text-q-link outline-none focus:border-q-primary focus:ring-4 focus:ring-q-primary" /></label>
        <div className="flex flex-wrap gap-2"><Button variant="secondary" type="submit" onClick={onSave} disabled={loading || text.trim().length < 20} className="flex items-center gap-2 rounded-q-control border px-4 py-2.5 font-bold disabled:opacity-40"><PenLine size={14} />حفظ المسودة</Button><Button variant="ghost" type="submit" onClick={onSubmit} disabled={loading || !minutes?.id || text.trim().length < 20 || staleDecisions.length > 0} className="flex items-center gap-2 rounded-q-control px-5 py-2.5 font-bold disabled:opacity-40"><Send size={14} />تثبيت النسخة وإرسالها لجميع الحاضرين</Button></div>
        {staleDecisions.length > 0 && <InlineMessage tone="warning">لا يُرسل المحضر للمصادقة قبل أن يتضمن النص الحالي {staleDecisions.length === 1 ? "للقرار" : "للقرارات"} {staleDecisions.map((decision) => decision.decision_no).join("، ")}، فقد عُدِّل بعد تجهيز المسودة. أعد تجهيز المسودة من بيانات الجلسة أو ضمّن النص الحالي ثم احفظ.</InlineMessage>}
      </> : <article className="rounded-q-control border border-q-border bg-q-bg"><div className="border-b border-q-border px-5 py-4"><h4 className="text-q-caption font-bold text-q-text">النص النهائي للمحضر</h4><p className="mt-1 text-q-caption text-q-text-2">كل توقيع أدناه مرتبط ببصمة هذه النسخة تحديدًا.</p></div><div className="whitespace-pre-wrap p-5 text-q-caption leading-8 text-q-link sm:p-7">{final || "لم تُجهز نسخة المحضر بعد."}</div></article>}

      {!!approvals.length && <div><div className="mb-3 flex items-center justify-between"><h4 className="text-q-caption font-bold text-q-text">مصادقات الحاضرين</h4><span className="text-q-caption font-bold text-q-text-2">{myApproval ? "بطاقتك مميزة، ولا يمكنك التوقيع عن حاضر آخر" : "متابعة حالة توقيعات الحاضرين"}</span></div><div className="grid gap-3 md:grid-cols-2">{[...approvals].sort((a, b) => Number(Boolean(b.can_respond)) - Number(Boolean(a.can_respond))).map((approval) => <ApprovalCard key={approval.id} approval={approval} onSign={() => { setSigning(approval); setSignature([]); }} onReturn={() => { setReturning(approval); setReturnReason(""); }} />)}</div></div>}
      {minutes?.status === "approved" && <CompletionPanel meeting={meeting} minutes={minutes} />}
    </div>}

    {signing && <Dialog title="التوقيع على المحضر النهائي" onClose={() => setSigning(null)}><p className="mb-4 text-q-caption leading-6 text-q-text-2">بتوقيعك تؤكد أنك راجعت النسخة النهائية المعروضة وأن التوقيع يخص هذه النسخة فقط.</p><SignaturePad value={signature} onChange={(value) => { setSignature(value); setSignatureError(null); }} />{signatureError && <div role="alert" className="mt-3 rounded-q-control border border-q-danger bg-q-danger-soft p-3 text-q-caption font-bold leading-5 text-q-danger">{signatureError}</div>}<div className="mt-4 flex gap-2"><Button variant="success" type="submit" onClick={async () => { try { await onSign(signing, signature); setSigning(null); setSignatureError(null); } catch (error) { setSignatureError(error instanceof Error ? error.message : "تعذر حفظ التوقيع. حاول مرة أخرى."); } }} disabled={signature.length === 0 || loading} className="rounded-q-control px-5 py-2.5 font-bold disabled:opacity-40">توقيع ومصادقة</Button><Button variant="secondary" type="submit" onClick={() => { setSignature([]); setSignatureError(null); }} className="flex items-center gap-1 rounded-q-control border px-4 py-2.5 font-bold "><RotateCcw size={13} />مسح</Button></div></Dialog>}
    {returning && <Dialog title="إعادة المحضر إلى المقرر" onClose={() => setReturning(null)}><p className="mb-3 text-q-caption leading-6 text-q-text-2">ستُلغى طلبات التوقيع الحالية لأن أي تعديل ينتج نسخة نهائية جديدة.</p><textarea autoFocus value={returnReason} onChange={(event) => setReturnReason(event.target.value)} placeholder="اذكر الملاحظة المطلوب تصحيحها..." className="min-h-28 w-full rounded-q-control border border-q-border p-3 text-q-caption leading-6 outline-none focus:border-q-danger" /><div className="mt-4 flex gap-2"><Button variant="danger" type="submit" onClick={async () => { await onReturn(returning, returnReason.trim()); setReturning(null); }} disabled={returnReason.trim().length < 5 || loading} className="rounded-q-control px-5 py-2.5 font-bold disabled:opacity-40">تأكيد الإعادة</Button></div></Dialog>}
  </section>;
}

function CompletionPanel({ meeting, minutes }: { meeting: MeetingDetail; minutes: MeetingMinutes }) {
  const pdfVersion = encodeURIComponent(minutes.final_content_hash ?? minutes.updated_at ?? meeting.updated_at ?? "latest");
  return <section className="overflow-hidden rounded-q-control border border-q-success bg-q-surface-2 ">
    <div className="flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6">
      <div className="flex items-center gap-4">
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-q-control bg-q-success-soft text-q-success "><CheckCircle2 size={27} /></span>
        <div><p className="text-q-caption font-bold text-q-success">اكتملت دورة الاجتماع بنجاح</p><h4 className="mt-1 text-q-body font-bold text-q-text">اعتمد المحضر وأُغلق الاجتماع</h4><p className="mt-1 max-w-2xl text-q-caption leading-6 text-q-text-2">أصبحت هذه نسخة نهائية مقفلة. حُفظت بصمتها وتوقيعات جميع الحاضرين في سجل التدقيق ولا يمكن تعديلها بعد الإغلاق.</p></div>
      </div>
      <span className="inline-flex items-center gap-2 rounded-full border border-q-success bg-q-surface px-4 py-2 text-q-caption font-bold text-q-success"><LockKeyhole size={14} />نسخة نهائية معتمدة</span>
    </div>
    <div className="flex flex-wrap items-center gap-2 border-t border-q-success bg-q-surface/70 p-4 sm:px-6">
      <a href={`/api/admin/meetings/${meeting.id}/minutes/pdf?v=${pdfVersion}`} download className="inline-flex items-center gap-2 rounded-q-control bg-q-primary px-4 py-2.5 text-q-caption font-bold text-q-on-primary transition hover:bg-q-primary"><Download size={14} />تنزيل المحضر الرسمي PDF</a>
      <Link href="/admin/meetings" className="inline-flex items-center gap-2 rounded-q-control border border-q-border bg-q-surface px-4 py-2.5 text-q-caption font-bold text-q-link transition hover:text-q-primary"><ArrowLeft size={14} />العودة إلى سجل الاجتماعات</Link>
    </div>
  </section>;
}

function ApprovalCard({ approval, onSign, onReturn }: { approval: MinuteApproval; onSign: () => void; onReturn: () => void }) {
  const approved = approval.approval_status === "approved";
  return <div className={`rounded-q-control border p-4 ${approval.can_respond ? "border-q-primary bg-q-surface-2/60 ring-2 ring-q-primary" : approved ? "border-q-success bg-q-surface-2/60" : "border-q-border bg-q-surface"}`}><div className="flex items-center gap-3"><span className={`grid h-10 w-10 place-items-center rounded-q-control text-q-ui font-bold ${approved ? "bg-q-success-soft text-q-success" : "bg-q-surface-2 text-q-primary"}`}>{approved ? <CheckCircle2 size={18} /> : (approval.name_ar?.trim()[0] ?? "ع")}</span><div className="min-w-0 flex-1"><h5 className="truncate text-q-caption font-bold text-q-text">{approval.name_ar ?? "عضو حاضر"}{approval.can_respond ? " · توقيعك" : ""}</h5><p className="mt-1 text-q-caption text-q-text-2">{approved ? `تم التوقيع ${formatDate(approval.signed_at)}` : "بانتظار التوقيع"}</p></div>{approved && <FileSignature size={18} className="text-q-success" />}</div>{approval.can_respond && !approved && <div className="mt-3 flex gap-2"><Button variant="success" type="submit" onClick={onSign} className="flex flex-1 items-center justify-center gap-1 rounded-q-control px-3 py-2 font-bold "><PenLine size={13} />فتح مربع توقيعي</Button><Button variant="secondary" type="submit" onClick={onReturn} className="flex items-center gap-1 rounded-q-control border px-3 py-2 font-bold "><Undo2 size={13} />إعادة</Button></div>}</div>;
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
    context.strokeStyle = getComputedStyle(canvas).getPropertyValue("--q-text").trim(); context.lineWidth = 2.4; context.lineCap = "round"; context.lineJoin = "round";
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
  return <div><canvas ref={canvasRef} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); drawing.current=true; current.current=[point(event)]; setPreview(current.current); }} onPointerMove={(event) => { if(!drawing.current)return; current.current=[...current.current,point(event)]; setPreview(current.current); }} onPointerUp={finishStroke} onPointerCancel={finishStroke} className="h-52 w-full touch-none rounded-q-control border-2 border-dashed border-q-primary bg-q-surface-2" aria-label="مربع رسم التوقيع" /><p className="mt-2 text-center text-q-caption text-q-text-2">ارسم توقيعك بالفأرة أو القلم أو اللمس داخل المربع.</p></div>;
}

function StatusBadge({ status }: { status: string }) { const value=status==="approved"?["معتمد","bg-q-success-soft text-q-success"]:status==="ready_for_approval"?["بانتظار توقيعات الحاضرين","bg-q-warning-soft text-q-warning"]:["مسودة قابلة للتحرير","bg-q-surface-2 text-q-link"]; return <span className={`rounded-full px-3 py-1.5 text-q-caption font-bold ${value[1]}`}>{value[0]}</span>; }
function formatDate(value?: string | null) { return value ? new Intl.DateTimeFormat("ar-SA-u-nu-latn",{dateStyle:"medium",timeStyle:"short"}).format(new Date(value)) : ""; }
