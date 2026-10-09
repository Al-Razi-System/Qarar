"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronLeft, Info, LockKeyhole, Mail, User } from "lucide-react";
import { FormField } from "@/shared/ui/form-field";
import { UserSubmissionScope } from "./user-submission-scope";
import { UserRoles } from "./user-roles";

export type RoleOption = {
  id: string;
  code: string;
  name_ar: string;
  role_scope: string;
};

export type UnitOption = {
  id: string;
  code: string;
  name_ar: string;
};

const steps = ["بيانات الحساب", "عضوية اختيارية", "تأكيد الإنشاء"];

const initialForm = {
  full_name_ar: "",
  email: "",
  employee_no: "",
  mobile: "",
  job_title: "",
  role_id: "",
  governance_unit_id: "",
  membership_title: "",
};

export function CreateUserForm({
  roles,
  units,
  canManageSubmissionScopes = false,
  onComplete,
}: {
  roles: RoleOption[];
  units: UnitOption[];
  canManageSubmissionScopes?: boolean;
  onComplete?: () => void;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [creationMode, setCreationMode] = useState<"invitation" | "temporary_password">("invitation");
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [form, setForm] = useState(initialForm);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdUserId, setCreatedUserId] = useState<string | null>(null);
  const [rolesCompleted, setRolesCompleted] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const busy = useRef(false);
  function finish() {
    onComplete?.();
    router.refresh();
  }

  const selectedRole = useMemo(
    () => roles.find((role) => role.id === form.role_id),
    [form.role_id, roles],
  );
  const selectedUnit = useMemo(
    () => units.find((unit) => unit.id === form.governance_unit_id),
    [form.governance_unit_id, units],
  );

  function update(field: keyof typeof initialForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setError("");
  }

  function goNext() {
    if (step === 0 && creationMode === "temporary_password" && (temporaryPassword.length < 12 || temporaryPassword.length > 128 || !/[A-Z]/.test(temporaryPassword) || !/[a-z]/.test(temporaryPassword) || !/\d/.test(temporaryPassword) || !/[^A-Za-z0-9]/.test(temporaryPassword))) {
      setError("كلمة المرور المؤقتة من 12 إلى 128 حرفًا وتشمل حرفًا كبيرًا وصغيرًا ورقمًا ورمزًا.");
      return;
    }
    if (
      step === 0 &&
      (!form.full_name_ar || !form.email)
    ) {
      setError("أكمل الاسم العربي والبريد المؤسسي.");
      return;
    }
    if (step === 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      setError("أدخل بريدًا إلكترونيًا صحيحًا.");
      return;
    }
    if (
      step === 1 &&
      Boolean(form.role_id) !== Boolean(form.governance_unit_id)
    ) {
      setError("يجب اختيار الدور والمجلس معًا أو تركهما معًا.");
      return;
    }
    setStep((current) => Math.min(2, current + 1));
  }

  async function submit() {
    if (busy.current || createdUserId || uncertain) return;
    if (!confirmed) {
      setError("يجب تأكيد صلاحية إنشاء الحساب قبل المتابعة.");
      return;
    }

    busy.current = true;
    setIsSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creation_mode: creationMode,
          ...(creationMode === "temporary_password" ? { temporary_password: temporaryPassword } : {}),
          email: form.email,
          full_name_ar: form.full_name_ar,
          employee_no: form.employee_no || null,
          mobile: form.mobile || null,
          job_title: form.job_title || null,
          role_id: form.role_id || null,
          governance_unit_id: form.governance_unit_id || null,
          membership_title: form.membership_title || null,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        if (response.status >= 500) {
          setUncertain(true);
          setError("لم نستطع تأكيد اكتمال الإنشاء. تحقق من قائمة المستخدمين قبل إنشاء الحساب مرة أخرى؛ قد تكون الهوية أُنشئت ولم تُرسل الدعوة.");
        } else setError(result.message ?? "تعذر إنشاء الحساب؛ راجع البيانات والمحاولة.");
        return;
      }
      const creationConfirmed = creationMode === "temporary_password" ? result.invitation_sent === false && result.must_change_password === true : result.invitation_sent === true;
      if (result.account_created !== true || !creationConfirmed || typeof result.user_id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(result.user_id)) {
        setUncertain(true);
        setError("لم نستطع تأكيد نتيجة الإنشاء. تحقق من قائمة المستخدمين قبل إعادة المحاولة.");
        return;
      }
      setCreatedUserId(result.user_id);
      setTemporaryPassword("");
      if (!canManageSubmissionScopes) finish();
    } catch {
      setUncertain(true);
      setError("انقطع الاتصال قبل تأكيد الإنشاء. تحقق من قائمة المستخدمين قبل إنشاء الحساب مرة أخرى.");
    } finally {
      busy.current = false;
      setIsSubmitting(false);
    }
  }

  if (createdUserId && canManageSubmissionScopes) return <div>
    <p role="status" className="mb-5 rounded-xl border border-[#cfe4f8] bg-[#f1f8ff] p-4 text-sm leading-7 text-[#315b80]">
      {creationMode === "temporary_password" ? "تم إنشاء الحساب دون دعوة. سيُلزم المستخدم بتغيير كلمة المرور عند أول دخول." : "تم إنشاء الحساب وإرسال دعوة التفعيل."} أكمل الأدوار الاختيارية ثم جهة العمل ونطاق التقديم للحساب نفسه أدناه.
      إذا أغلقت النافذة، يمكنك الاستكمال من عمليات المستخدم؛ لا حاجة لإعادة إنشاء الحساب.
    </p>
    {rolesCompleted ? <UserSubmissionScope userId={createdUserId} onSaved={finish} /> : <UserRoles userId={createdUserId} onContinue={() => setRolesCompleted(true)} />}
  </div>;

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_300px]">
      <section className="rounded-2xl border border-[#e2e9f1] bg-white p-5 shadow-[0_3px_16px_rgba(24,48,80,.035)] sm:p-7">
        <div className="mb-8 flex items-center">
          {steps.map((label, index) => (
            <div key={label} className="flex flex-1 items-center last:flex-none">
              <div className="flex items-center gap-2.5">
                <span className={`grid h-8 w-8 place-items-center rounded-full text-xs font-black ${
                  index <= step ? "bg-[#0066cc] text-white" : "bg-[#edf2f7] text-[#8a99ac]"
                }`}>
                  {index < step ? <Check size={14} /> : index + 1}
                </span>
                <span className={`hidden text-[11px] font-bold sm:block ${
                  index <= step ? "text-[#16243b]" : "text-[#94a1b2]"
                }`}>
                  {label}
                </span>
              </div>
              {index < steps.length - 1 && (
                <span className={`mx-3 h-px flex-1 ${index < step ? "bg-[#0066cc]" : "bg-[#dfe7ef]"}`} />
              )}
            </div>
          ))}
        </div>

        {step === 0 && (
          <div>
            <h2 className="text-base font-black text-[#14233a]">بيانات المستخدم</h2>
            <p className="mt-1.5 text-xs text-[#7b8b9e]">أدخل البيانات الرسمية كما تظهر في السجل المؤسسي.</p>
            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              <FormField label="الاسم الكامل بالعربية" value={form.full_name_ar} onChange={(e) => update("full_name_ar", e.target.value)} icon={<User size={17} />} required />
              <FormField label="البريد الإلكتروني المؤسسي" type="email" value={form.email} onChange={(e) => update("email", e.target.value)} icon={<Mail size={17} />} required />
              <details className="sm:col-span-2 rounded-xl border border-[#e2e9f1] p-4"><summary className="cursor-pointer text-sm font-bold text-[#22324b]">بيانات إضافية — اختيارية</summary><div className="mt-4 grid gap-5 sm:grid-cols-2">
              <FormField label="الرقم الوظيفي" value={form.employee_no} onChange={(e) => update("employee_no", e.target.value)} />
              <FormField label="رقم الجوال" value={form.mobile} onChange={(e) => update("mobile", e.target.value)} />
              <FormField label="المسمى الوظيفي" value={form.job_title} onChange={(e) => update("job_title", e.target.value)} />
              </div></details>
              {canManageSubmissionScopes && <fieldset className="sm:col-span-2 rounded-xl border border-[#dce5ef] p-4">
                <legend className="px-2 text-sm font-bold text-[#22324b]">طريقة الدخول الأول</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm ${creationMode === "invitation" ? "border-[#0066cc] bg-[#f1f8ff]" : "border-[#e2e9f1]"}`}><input type="radio" name="creation-mode" checked={creationMode === "invitation"} onChange={() => { setCreationMode("invitation"); setTemporaryPassword(""); setError(""); }} className="accent-[#0066cc]" />دعوة لتعيين كلمة المرور</label>
                  <label className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm ${creationMode === "temporary_password" ? "border-[#0066cc] bg-[#f1f8ff]" : "border-[#e2e9f1]"}`}><input type="radio" name="creation-mode" checked={creationMode === "temporary_password"} onChange={() => { setCreationMode("temporary_password"); setError(""); }} className="accent-[#0066cc]" />كلمة مرور مؤقتة — دون دعوة</label>
                </div>
                {creationMode === "temporary_password" && <div className="mt-4"><FormField label="كلمة المرور المؤقتة" type="password" autoComplete="new-password" value={temporaryPassword} onChange={event => { setTemporaryPassword(event.target.value); setError(""); }} maxLength={128} required /><p className="mt-2 text-xs leading-6 text-[#52647a]">12 حرفًا على الأقل، تشمل حرفًا كبيرًا وصغيرًا ورقمًا ورمزًا. شاركها عبر قناة آمنة؛ لا تُعرض بعد الإنشاء. يلزم تغييرها قبل استخدام النظام، وصلاحيتها سبعة أيام.</p></div>}
              </fieldset>}
              <div className="sm:col-span-2 flex gap-3 rounded-xl border border-[#cfe4f8] bg-[#f1f8ff] p-4 text-xs leading-6 text-[#315b80]"><LockKeyhole size={18} className="mt-0.5 shrink-0 text-[#0066cc]"/>{creationMode === "temporary_password" ? "يمكن الدخول مباشرة لاستبدال الكلمة المؤقتة فقط، دون إرسال دعوة. بعد الاستبدال يسجل المستخدم الدخول بالكلمة الجديدة." : "سيُرسل للمستخدم رابط تفعيل موقّع وأحادي الاستخدام لتعيين كلمة مروره بنفسه."}</div>
            </div>
          </div>
        )}

        {step === 1 && (
          <div>
            <h2 className="text-base font-black text-[#14233a]">العضوية الأولية — اختيارية</h2>
            <p className="mt-1.5 text-xs leading-6 text-[#7b8b9e]">يمكن إنشاء الحساب دون عضوية.{canManageSubmissionScopes ? " في الخطوة التالية بعد الإنشاء ستحدد جهة العمل ونطاق التقديم، وهما مستقلان عن العضوية." : " ضبط جهة العمل ونطاق التقديم متاح لمدير النظام بعد الإنشاء."}</p>
            <details className="mt-5 rounded-xl border border-[#e2e9f1] p-4"><summary className="cursor-pointer text-sm font-bold text-[#22324b]">إضافة دور وعضوية للمجلس</summary>
            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              <label>
                <span className="mb-2 block text-[13px] font-bold text-[#22324b]">الدور</span>
                <select value={form.role_id} onChange={(e) => update("role_id", e.target.value)} className="h-12 w-full rounded-xl border border-[#dce5ef] bg-white px-3.5 text-sm outline-none focus:border-[#0066cc]">
                  <option value="">بدون دور أولي</option>
                  {roles.map((role) => <option key={role.id} value={role.id}>{role.name_ar}</option>)}
                </select>
              </label>
              <label>
                <span className="mb-2 block text-[13px] font-bold text-[#22324b]">المجلس أو الوحدة</span>
                <select value={form.governance_unit_id} onChange={(e) => update("governance_unit_id", e.target.value)} className="h-12 w-full rounded-xl border border-[#dce5ef] bg-white px-3.5 text-sm outline-none focus:border-[#0066cc]">
                  <option value="">بدون نطاق أولي</option>
                  {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name_ar}</option>)}
                </select>
              </label>
              <FormField label="صفة العضوية" value={form.membership_title} onChange={(e) => update("membership_title", e.target.value)} />
            </div>
            </details>
            <div className="mt-6 flex gap-3 rounded-xl border border-[#cfe4f8] bg-[#f1f8ff] p-4 text-xs leading-6 text-[#315b80]">
              <Info size={18} className="mt-0.5 shrink-0 text-[#0066cc]" />
              تم تحميل {roles.length} أدوار و{units.length} مجالس ووحدات من قاعدة البيانات.
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <h2 className="text-base font-black text-[#14233a]">مراجعة إنشاء الحساب</h2>
            <p className="mt-1.5 text-xs text-[#7b8b9e]">تحقق من البيانات قبل تنفيذ عملية الإنشاء المحكومة.</p>
            <div className="mt-6 divide-y divide-[#edf1f5] rounded-xl border border-[#e1e8f0]">
              {[
                ["الاسم", form.full_name_ar],
                ["البريد", form.email],
                ["طريقة الدخول", creationMode === "temporary_password" ? "كلمة مرور مؤقتة — تغيير إلزامي" : "دعوة تفعيل"],
                ["الرقم الوظيفي", form.employee_no || "—"],
                ["الدور الأولي", selectedRole?.name_ar ?? "بدون دور أولي"],
                ["نطاق العضوية", selectedUnit?.name_ar ?? "بدون نطاق أولي"],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between px-4 py-3.5 text-xs">
                  <span className="text-[#7d8c9f]">{label}</span>
                  <strong className="text-[#1a2940]">{value}</strong>
                </div>
              ))}
            </div>
            <label className="mt-5 flex items-start gap-2.5 text-xs leading-6 text-[#52647a]">
              <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-1 h-4 w-4 accent-[#0066cc]" />
              أؤكد أن إنشاء الحساب ومنح الدور يقعان ضمن صلاحيتي الإدارية ونطاق المنظمة.
            </label>
          </div>
        )}

        {error && <p role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">{error}{uncertain && <Link href="/admin/users" onClick={finish} className="mt-3 block font-bold underline">فتح قائمة المستخدمين للتحقق والاستكمال</Link>}</p>}

        <div className="mt-8 flex items-center justify-between border-t border-[#edf1f5] pt-5">
          <button type="button" onClick={() => setStep((value) => Math.max(0, value - 1))} disabled={step === 0 || isSubmitting || uncertain} className="h-11 rounded-xl border border-[#dce5ef] px-5 text-xs font-bold text-[#52647a] disabled:opacity-35">السابق</button>
          <button type="button" onClick={step === 2 ? submit : goNext} disabled={isSubmitting || uncertain || !!createdUserId} className="flex h-11 items-center gap-2 rounded-xl bg-[#0066cc] px-6 text-xs font-bold text-white disabled:opacity-60">
            {isSubmitting ? "جارٍ الإنشاء..." : step === 2 ? "إنشاء الحساب" : "التالي"}
            {step < 2 && <ChevronLeft size={16} />}
          </button>
        </div>
      </section>

      <aside className="space-y-4">
        <div className="rounded-2xl bg-gradient-to-br from-[#0a1330] to-[#0066cc] p-5 text-white">
          <LockKeyhole size={24} className="text-[#ff8a19]" />
          <h3 className="mt-4 text-sm font-black">إنشاء آمن ومحكوم</h3>
          <p className="mt-2 text-[11px] leading-6 text-white/65">
            {creationMode === "temporary_password" ? "الحساب جاهز للدخول بكلمة مؤقتة، لكن بيانات النظام وعملياته محمية حتى يستبدلها المستخدم. الصلاحيات تُضبط مستقلًا عن طريقة الدخول." : "تنشئ العملية هوية غير مفعلة وملف قرار، ثم ترسل رابطًا موقّعًا محدود الصلاحية. لا يصبح الحساب نشطًا قبل إكمال التفعيل."}
          </p>
        </div>
      </aside>
    </div>
  );
}
