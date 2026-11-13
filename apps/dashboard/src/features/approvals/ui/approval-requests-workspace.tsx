"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { InlineMessage } from "@/shared/ui/inline-message";
import { PageHeader } from "@/shared/ui/page-header";

type RequestItem = { id: string; type?: string; target_user_id?: string; successor_user_id?: string; justification: string; requested_by_user_id: string; correlation_id?: string; created_at: string };
type Queue = { iam_changes: RequestItem[]; offboarding: RequestItem[] };

export function ApprovalRequestsWorkspace() {
  const [queue, setQueue] = useState<Queue>({ iam_changes: [], offboarding: [] });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/iam", { cache: "no-store" });
      const value = await response.json();
      if (!response.ok) throw new Error(value.message);
      setQueue(value);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "تعذر التحميل"); }
  }, []);
  useEffect(() => { queueMicrotask(() => void load()); }, [load]);

  async function decide(kind: "iam" | "offboarding", id: string, decision: "approved" | "rejected") {
    setBusy(id); setError("");
    try {
      const response = await fetch("/api/admin/iam", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operation: kind === "iam" ? "reviewIamChange" : "reviewOffboarding", payload: { p_request_id: id, p_decision: decision, p_notes: "Reviewed from approval queue" } }) });
      const value = await response.json();
      if (!response.ok) throw new Error(value.message);
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "تعذر تنفيذ القرار"); }
    finally { setBusy(""); }
  }

  const cards = [...queue.iam_changes.map((item) => ({ kind: "iam" as const, item, title: "تغيير صلاحيات حساس" })), ...queue.offboarding.map((item) => ({ kind: "offboarding" as const, item, title: "مغادرة مستخدم" }))];
  return <main className="mx-auto max-w-5xl">
    <PageHeader title="طلبات الاعتماد المزدوج" description="لا يستطيع مقدم الطلب اعتماد طلبه. التطبيق يتم داخل المعاملة بعد موافقة مسؤول آخر." />
    {error && <InlineMessage tone="error" className="mt-4">{error}</InlineMessage>}
    <div className="mt-6 space-y-4">{cards.length === 0 ? <Card className="p-8 text-center text-q-ui text-q-text-2">لا توجد طلبات معلقة.</Card> : cards.map(({ kind, item, title }) => <Card key={item.id}>
      <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-q-body font-black">{title}</h2><p className="mt-2 text-q-ui text-q-text-2">{item.justification}</p><p className="mt-2 text-q-caption text-q-text-2">الطالب: {item.requested_by_user_id}{item.target_user_id && ` · المستخدم: ${item.target_user_id}`}</p>{item.correlation_id && <p className="mt-1 font-mono text-q-caption text-q-text-2">{item.correlation_id}</p>}</div><div className="flex gap-2"><Button variant="danger" disabled={busy === item.id} onClick={() => decide(kind, item.id, "rejected")}>رفض</Button><Button disabled={busy === item.id} onClick={() => decide(kind, item.id, "approved")}>اعتماد وتطبيق</Button></div></div>
    </Card>)}</div>
  </main>;
}
