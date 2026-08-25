"use client";

import { useState } from "react";
import { Building2, FileBadge, Save, UserRound } from "lucide-react";
import { regulationsRpc, type PolicyAuthoringReferences } from "../../api/regulations-client";
import { firstValidationMessage, policyIdentitySchema } from "../../model/policy-authoring";
import type { Policy } from "../../model/types";
import {
  AuthoringField,
  PrimaryAction,
  authoringInput,
  authoringTextarea,
  type AuthoringMutation,
} from "./authoring-primitives";

export function PolicyIdentityPanel({
  policy,
  references,
  busy,
  mutate,
  reportError,
}: {
  policy: Policy;
  references: PolicyAuthoringReferences;
  busy: boolean;
  mutate: AuthoringMutation;
  reportError: (message: string) => void;
}) {
  const [form, setForm] = useState({
    name_ar: policy.name_ar,
    name_en: policy.name_en ?? "",
    description: policy.description ?? "",
    owner_user_id: policy.owner_user_id ?? "",
    owner_governance_unit_id: policy.owner_governance_unit_id ?? "",
    legal_reference: policy.legal_reference ?? "",
    decision_number: policy.decision_number ?? "",
    status: policy.status as "active" | "inactive" | "archived",
  });

  async function save() {
    const parsed = policyIdentitySchema.safeParse(form);
    const error = firstValidationMessage(parsed);
    if (error || !parsed.success) {
      reportError(error ?? "راجع بيانات اللائحة.");
      return;
    }
    await mutate(
      () =>
        regulationsRpc("admin_update_policy", {
          p_policy_id: policy.id,
          p_name_ar: parsed.data.name_ar,
          p_name_en: parsed.data.name_en || null,
          p_description: parsed.data.description || null,
          p_owner_user_id: parsed.data.owner_user_id || null,
          p_status: parsed.data.status,
          p_owner_governance_unit_id: parsed.data.owner_governance_unit_id || null,
          p_legal_reference: parsed.data.legal_reference || null,
          p_decision_number: parsed.data.decision_number || null,
        }),
      "تم حفظ بيانات اللائحة الأساسية.",
    );
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
      <section className="rounded-2xl border border-[#dce7f1] bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-5 flex items-start gap-3 border-b border-[#ebf0f5] pb-4">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#eaf4ff] text-[#0872df]"><FileBadge size={18} /></span>
          <div><h3 className="text-sm font-black text-[#1b3049]">هوية اللائحة وملكيتها</h3><p className="mt-1 text-[9px] leading-5 text-[#718398]">هذه البيانات تعرّف السجل الرئيسي، ولا تغير نصوص الإصدارات المنشورة.</p></div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <AuthoringField label="الاسم بالعربية" required><input className={authoringInput} value={form.name_ar} onChange={(event) => setForm({ ...form, name_ar: event.target.value })} /></AuthoringField>
          <AuthoringField label="الاسم بالإنجليزية"><input dir="ltr" className={authoringInput} value={form.name_en} onChange={(event) => setForm({ ...form, name_en: event.target.value })} /></AuthoringField>
          <div className="sm:col-span-2"><AuthoringField label="الوصف" hint="اشرح مجال اللائحة والغرض منها بلغة مختصرة."><textarea className={authoringTextarea} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></AuthoringField></div>
          <AuthoringField label="مالك اللائحة"><select className={authoringInput} value={form.owner_user_id} onChange={(event) => setForm({ ...form, owner_user_id: event.target.value })}><option value="">غير محدد</option>{references.users.map((user) => <option key={user.id} value={user.id}>{String(user.name_ar ?? user.code)}</option>)}</select></AuthoringField>
          <AuthoringField label="الجهة المالكة"><select className={authoringInput} value={form.owner_governance_unit_id} onChange={(event) => setForm({ ...form, owner_governance_unit_id: event.target.value })}><option value="">غير محددة</option>{references.units.map((unit) => <option key={unit.id} value={unit.id}>{String(unit.name_ar ?? unit.code)}</option>)}</select></AuthoringField>
          <AuthoringField label="المرجع النظامي"><input className={authoringInput} value={form.legal_reference} onChange={(event) => setForm({ ...form, legal_reference: event.target.value })} /></AuthoringField>
          <AuthoringField label="رقم قرار الإصدار"><input dir="ltr" className={authoringInput} value={form.decision_number} onChange={(event) => setForm({ ...form, decision_number: event.target.value })} /></AuthoringField>
          <AuthoringField label="حالة سجل اللائحة" hint="الأرشفة توقف الاستخدام الجديد ولا تحذف الإصدارات."><select className={authoringInput} value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as typeof form.status })}><option value="active">نشطة</option><option value="inactive">غير نشطة</option><option value="archived">مؤرشفة</option></select></AuthoringField>
        </div>
        <div className="mt-6 flex justify-end"><PrimaryAction busy={busy} onClick={() => void save()} title="التحقق من البيانات وحفظ هوية اللائحة"><Save size={14} /> حفظ البيانات</PrimaryAction></div>
      </section>
      <aside className="space-y-3">
        <InfoCard icon={<FileBadge size={16} />} label="رمز اللائحة" value={policy.code} />
        <InfoCard icon={<UserRound size={16} />} label="المالك الحالي" value={String(references.users.find((user) => user.id === form.owner_user_id)?.name_ar ?? "غير محدد")} />
        <InfoCard icon={<Building2 size={16} />} label="الجهة المالكة" value={String(references.units.find((unit) => unit.id === form.owner_governance_unit_id)?.name_ar ?? "غير محددة")} />
        <div className="rounded-2xl border border-[#f0ddc9] bg-[#fff9f3] p-4 text-[9px] leading-6 text-[#76533a]">رمز اللائحة ثابت بعد الإنشاء لأنه يُستخدم في التكاملات وسجل التدقيق. أنشئ لائحة جديدة إذا كان المطلوب كياناً نظامياً مختلفاً.</div>
      </aside>
    </div>
  );
}

function InfoCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="rounded-2xl border border-[#dfe8f1] bg-white p-4 shadow-sm"><span className="flex items-center gap-2 text-[9px] font-black text-[#718399]">{icon}{label}</span><strong dir={label === "رمز اللائحة" ? "ltr" : undefined} className="mt-2 block break-words text-[11px] leading-5 text-[#223950]">{value}</strong></div>;
}
