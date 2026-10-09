"use client";
import { useRef, useState } from "react";
import styles from "./topic-types-list.module.css";
export type TypeActions = Partial<Record<"begin_edit" | "submit" | "approve" | "activate" | "enable" | "disable" | "request_changes", boolean>>;
const labels: Record<keyof TypeActions, string> = { begin_edit: "تعديل التصنيف المنشور", submit: "إرسال للاعتماد", approve: "اعتماد التصنيف", activate: "تنشيط التصنيف", enable: "إعادة إتاحة التصنيف", disable: "تعطيل التصنيف", request_changes: "طلب تعديل" };
export function TopicTypeActions({ bundleId, lockVersion, actions, reasons, onChanged }: {
  bundleId: string; lockVersion: number; actions: TypeActions; reasons: string[];
  onChanged: (result: { bundle_id: string }) => void | Promise<void>;
}) {
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(null);
  const comment = "";
  const busy = useRef(false);
  const key = useRef<{ action: string; comment: string; id: string } | null>(null);
  async function act(action: keyof TypeActions) {
    if (busy.current || !actions[action]) return;
    if (["approve", "request_changes"].includes(action) && comment.trim().length < 3) {
      setNotice({ error: true, text: "اكتب ملاحظة الاعتماد أو التعديل من ثلاثة أحرف على الأقل." }); return;
    }
    busy.current = true; setPending(true); setNotice(null);
    if (key.current?.action !== action || key.current?.comment !== comment) key.current = { action, comment, id: crypto.randomUUID() };
    try {
      const response = await fetch("/api/admin/governance-model", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, bundleId, expectedLockVersion: lockVersion, clientRequestId: key.current.id, comment: comment.trim() || null }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(`${payload?.error?.message || "تعذر إتمام العملية."}${payload?.error?.traceId ? ` رقم التتبع: ${payload.error.traceId}` : ""}`);
      if (!payload?.data?.bundle_id) throw new Error("تعذر التحقق من نتيجة العملية؛ حدّث التصنيف للتحقق.");
      setNotice({ error: false, text: "تم تنفيذ العملية بنجاح." });
      await onChanged(payload.data);
      key.current = null;
    } catch (error) { setNotice({ error: true, text: error instanceof Error ? error.message : "تعذر إتمام العملية." }); }
    finally { busy.current = false; setPending(false); }
  }
  const visible = (["begin_edit", "activate", "enable", "disable"] as (keyof TypeActions)[]).filter(action => actions[action] || (action === "activate" && reasons.length > 0 && !actions.begin_edit && !actions.disable && !actions.enable));
  return <section className={styles.actionPanel} aria-label="إجراءات التصنيف">
    <h3>إجراءات التصنيف</h3>
    <div className={styles.actionButtons}>{visible.map(action => <button type="button" key={action} disabled={pending || !actions[action]} onClick={() => void act(action)}>{labels[action]}</button>)}</div>
    {pending && <p role="status">جارٍ تنفيذ العملية…</p>}
    {notice && <p role={notice.error ? "alert" : "status"}>{notice.text}</p>}
    {reasons.length > 0 && <ul>{reasons.map((reason, index) => <li key={index}>{reason}</li>)}</ul>}
    {(actions.disable || actions.enable) && <p>التعطيل يمنع تقديم موضوعات جديدة؛ لا يوقف الموضوعات والقرارات الجارية.</p>}
    {actions.begin_edit && <p>عدّل الإعدادات ثم نشّط التعديل بنفسك؛ تبقى الموضوعات السابقة محفوظة.</p>}
  </section>;
}
