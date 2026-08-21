"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronLeft, Info, LockKeyhole, Mail, User } from "lucide-react";
import { FormField } from "@/shared/ui/form-field";

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

const steps = ["البيانات الأساسية", "الدور والنطاق", "المراجعة"];

const initialForm = {
  full_name_ar: "",
  full_name_en: "",
  email: "",
  employee_no: "",
  mobile: "",
  job_title: "",
  role_id: "",
  governance_unit_id: "",
  membership_title: "",
  start_date: "",
};

export function CreateUserForm({
  roles,
  units,
}: {
  roles: RoleOption[];
  units: UnitOption[];
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(initialForm);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

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
    if (!confirmed) {
      setError("يجب تأكيد صلاحية إنشاء الحساب قبل المتابعة.");
      return;
    }

    setIsSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.email,
          full_name_ar: form.full_name_ar,
          full_name_en: form.full_name_en || null,
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
        setError(result.message ?? "تعذر إنشاء الحساب.");
        return;
      }
      router.push("/admin/users");
      router.refresh();
    } catch {
      setError("تعذر الاتصال بخدمة إنشاء الحساب.");
    } finally {
      setIsSubmitting(false);
    }
  }

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
              <FormField label="الاسم الكامل بالإنجليزية" value={form.full_name_en} onChange={(e) => update("full_name_en", e.target.value)} dir="ltr" />
              <FormField label="البريد الإلكتروني المؤسسي" type="email" value={form.email} onChange={(e) => update("email", e.target.value)} icon={<Mail size={17} />} required />
              <FormField label="الرقم الوظيفي" value={form.employee_no} onChange={(e) => update("employee_no", e.target.value)} />
              <FormField label="رقم الجوال" value={form.mobile} onChange={(e) => update("mobile", e.target.value)} />
              <FormField label="المسمى الوظيفي" value={form.job_title} onChange={(e) => update("job_title", e.target.value)} />
              <div className="sm:col-span-2 flex gap-3 rounded-xl border border-[#cfe4f8] bg-[#f1f8ff] p-4 text-xs leading-6 text-[#315b80]"><Mail size={18} className="mt-0.5 shrink-0 text-[#0066cc]"/>سيُرسل للمستخدم رابط تفعيل موقّع وأحادي الاستخدام لتعيين كلمة مروره بنفسه. لا ينشئ المدير كلمة مرور مؤقتة.</div>
            </div>
          </div>
        )}

        {step === 1 && (
          <div>
            <h2 className="text-base font-black text-[#14233a]">الدور والنطاق الأولي</h2>
            <p className="mt-1.5 text-xs text-[#7b8b9e]">الدور والمجلس مرتبطان ويجب تحديدهما معًا أو تركهما معًا.</p>
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
              <FormField label="تاريخ بدء العضوية" type="date" value={form.start_date} onChange={(e) => update("start_date", e.target.value)} />
            </div>
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

        {error && <p role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">{error}</p>}

        <div className="mt-8 flex items-center justify-between border-t border-[#edf1f5] pt-5">
          <button type="button" onClick={() => setStep((value) => Math.max(0, value - 1))} disabled={step === 0} className="h-11 rounded-xl border border-[#dce5ef] px-5 text-xs font-bold text-[#52647a] disabled:opacity-35">السابق</button>
          <button type="button" onClick={step === 2 ? submit : goNext} disabled={isSubmitting} className="flex h-11 items-center gap-2 rounded-xl bg-[#0066cc] px-6 text-xs font-bold text-white disabled:opacity-60">
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
            تنشئ العملية هوية غير مفعلة وملف قرار، ثم ترسل رابطًا موقّعًا محدود الصلاحية. لا يصبح الحساب نشطًا قبل إكمال التفعيل.
          </p>
        </div>
      </aside>
    </div>
  );
}
