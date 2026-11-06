"use client";

import { useRef, useState } from "react";
import { FileText, Paperclip, Trash2 } from "lucide-react";
import type { ScheduledAgendaSuggestion } from "../model/meeting";
import { Button } from "@/shared/ui/button";
import { Dialog } from "@/shared/ui/dialog";
import { InlineMessage } from "@/shared/ui/inline-message";

type CompletedProposal = { topic_id: string; topic_no?: string; agenda_item_id: string; occurrence_id: string };
type PickedFile = { id: string; file: File };
type Props = {
  meetingId: string;
  unitId: string;
  item: ScheduledAgendaSuggestion;
  onClose: () => void;
  onCompleted: (result: CompletedProposal) => void;
};

const field = "mt-2 min-h-12 w-full rounded-q-control border border-q-border bg-q-surface px-4 py-3 text-q-ui text-q-text outline-none focus:border-q-primary focus:ring-2 focus:ring-q-primary disabled:bg-q-surface-2";

async function command(url: string, init: RequestInit) {
  const response = await fetch(url, init);
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.data) {
    const message = payload?.error?.message ?? "تعذر إتمام العملية.";
    const trace = payload?.error?.traceId ? ` رقم التتبع: ${payload.error.traceId}` : "";
    throw new Error(`${message}${trace}`);
  }
  return payload.data;
}

export function ScheduledAgendaProposalDialog({ meetingId, unitId, item, onClose, onCompleted }: Props) {
  const [title, setTitle] = useState(item.title_ar);
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const receipt = useRef<{ input: string; requestId: string } | null>(null);
  const busy = useRef(false);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const required = item.required_attachment_count ?? 0;
  const ready = title.trim().length >= 5 && description.trim().length >= 10 && files.length >= required;

  function pickFiles(list: FileList | null) {
    if (!list) return;
    const picked = Array.from(list);
    if (files.length + picked.length > 30 || picked.some((file) => file.size < 1 || file.size > 25 * 1024 * 1024 || !/\.(pdf|png|jpe?g|docx)$/i.test(file.name))) {
      setError("اختر ملفات PDF أو PNG أو JPEG أو DOCX لا تتجاوز 25 ميجابايت؛ الحد الأقصى 30 ملفًا.");
      return;
    }
    setError("");
    setFiles((current) => [...current, ...picked.map((file) => ({ id: crypto.randomUUID(), file }))]);
  }

  async function submit() {
    if (busy.current || !ready || !item.occurrence_id) return;
    busy.current = true;
    setPending(true);
    setError("");
    const input = JSON.stringify({
      title: title.trim(),
      description: description.trim(),
      unitId,
      versionId: item.topic_type_version_id,
      evidence: [],
    });
    let submissionFiles = files;
    let submission = receipt.current;
    if (!submission || submission.input !== input) {
      if (submission) {
        submissionFiles = files.map(({ file }) => ({ id: crypto.randomUUID(), file }));
        setFiles(submissionFiles);
      }
      submission = { input, requestId: crypto.randomUUID() };
      receipt.current = submission;
    }
    const requestId = submission.requestId;
    try {
      setProgress("جارٍ تثبيت بيانات الموضوع قبل رفع الملفات…");
      const prepared = await command("/api/admin/typed-topics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...JSON.parse(input), requestId, action: "prepare" }),
      });
      for (const [index, picked] of submissionFiles.entries()) {
        if (prepared.files?.some((saved: { id: string }) => saved.id === picked.id)) continue;
        setProgress(`جارٍ رفع المرفق ${index + 1} من ${submissionFiles.length}…`);
        const form = new FormData();
        form.set("file", picked.file);
        form.set("submissionId", requestId);
        form.set("fileId", picked.id);
        form.set("input", input);
        await command("/api/admin/typed-topics/files", { method: "POST", body: form });
      }
      setProgress("اكتملت المرفقات؛ جارٍ إنشاء الموضوع وإدراجه في جدول الأعمال…");
      const result = await command("/api/admin/typed-topics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "submit_scheduled",
          requestId,
          meetingId,
          occurrenceId: item.occurrence_id,
        }),
      });
      onCompleted(result as CompletedProposal);
    } catch (reason) {
      setError(reason instanceof Error && !(reason instanceof TypeError)
        ? reason.message
        : "انقطع الاتصال. احتفظنا بالمدخلات؛ أعد المحاولة للتحقق من الطلب نفسه.");
    } finally {
      busy.current = false;
      setPending(false);
      setProgress("");
    }
  }

  return <Dialog
    title="استكمال المقترح الدوري"
    description={`${item.title_ar}${item.reference_number ? ` · ${item.reference_number}` : ""}`}
    size="lg"
    scrollContent
    closeDisabled={pending}
    onClose={onClose}
    footer={<>
      <Button variant="secondary" disabled={pending} onClick={onClose}>إلغاء</Button>
      <Button pending={pending} pendingLabel="جارٍ إنشاء الموضوع وإدراجه…" disabled={!ready} onClick={() => void submit()}>إنشاء الموضوع وإدراجه</Button>
    </>}
  >
    <InlineMessage tone="info">هذا الاستحقاق ليس بندًا بعد. أكمل بياناته ومرفقاته، ثم ينشئه النظام ويدرجه في جدول الأعمال في عملية واحدة.</InlineMessage>

    <section className="rounded-q-card border border-q-border bg-q-surface-2 p-4" aria-label="متطلبات التصنيف">
      <div className="flex items-start gap-3"><FileText className="mt-0.5 shrink-0 text-q-link" size={20}/><div><h3 className="text-q-ui font-bold">متطلبات الإدراج</h3><p className="mt-1 text-q-caption leading-6 text-q-text-2">{required ? `${required} مرفقات على الأقل قبل الإدراج.` : "لا توجد مرفقات إلزامية لهذا التصنيف."} الملفات المسموحة PDF وPNG وJPEG وDOCX، حتى 25 ميجابايت للملف.</p></div></div>
    </section>

    <label className="text-q-ui font-bold">عنوان الموضوع<input className={field} value={title} minLength={5} maxLength={300} disabled={pending} onChange={(event) => setTitle(event.target.value)}/></label>
    <label className="text-q-ui font-bold">تفاصيل الموضوع<textarea className={field} value={description} minLength={10} maxLength={10000} rows={5} disabled={pending} onChange={(event) => setDescription(event.target.value)} placeholder="اكتب المعلومات التي يحتاجها المجلس لمناقشة الموضوع واتخاذ القرار"/></label>

    <section className="rounded-q-card border border-q-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-q-ui font-bold">المرفقات</h3><p className="mt-1 text-q-caption text-q-text-2">تم اختيار {files.length} من الحد الأدنى {required}.</p></div><Button variant="secondary" disabled={pending} onClick={() => fileInput.current?.click()}><Paperclip size={17}/>اختيار ملفات</Button></div>
      <input ref={fileInput} aria-label="مرفقات الموضوع" type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.docx" disabled={pending} className="sr-only" onChange={(event) => { pickFiles(event.target.files); event.target.value = ""; }}/>
      {files.length > 0 && <ul className="mt-4 space-y-2">{files.map(({ id, file }) => <li key={id} className="flex min-w-0 items-center justify-between gap-3 rounded-q-control bg-q-surface-2 p-3"><span className="min-w-0 break-all text-q-caption text-q-text">{file.name}</span><button type="button" disabled={pending} onClick={() => setFiles((current) => current.filter((entry) => entry.id !== id))} aria-label={`إزالة ${file.name}`} className="grid h-11 w-11 shrink-0 place-items-center rounded-q-control text-q-danger hover:bg-q-danger-soft disabled:text-q-text-3"><Trash2 size={17}/></button></li>)}</ul>}
    </section>

    {!ready && <InlineMessage tone="warning">أكمل عنوانًا واضحًا ووصفًا من 10 أحرف على الأقل{required > files.length ? `، وارفع ${required - files.length} من المرفقات المطلوبة` : ""} قبل الإدراج.</InlineMessage>}
    {progress && <p role="status" className="text-q-ui text-q-text-2">{progress}</p>}
    {error && <InlineMessage tone="error">{error}</InlineMessage>}
  </Dialog>;
}
