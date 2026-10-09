"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { KeyRound, UserRound } from "lucide-react";

export type SelfAccount = { id: string; email: string; full_name_ar: string; mobile: string | null; job_title: string | null };
const input = "mt-2 h-12 w-full rounded-xl border border-[#dce5ef] bg-white px-4 text-sm text-[#23334b] outline-none focus:border-[#0066cc] focus:ring-2 focus:ring-[#e7f2ff]";
const button = "min-h-11 rounded-xl bg-[#0066cc] px-5 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50";
type Feedback = { error: boolean; text: string } | null;
function Notice({ value }: { value: Feedback }) {
  return value && <p role={value.error ? "alert" : "status"} className={`mt-4 rounded-xl border p-3 text-sm leading-7 ${value.error ? "border-red-200 bg-red-50 text-red-800" : "border-[#cfe4f8] bg-[#f1f8ff] text-[#315b80]"}`}>{value.text}</p>;
}

export function AccountWorkspace({ account }: { account: SelfAccount }) {
  const router = useRouter();
  const [name, setName] = useState(account.full_name_ar);
  const [mobile, setMobile] = useState(account.mobile ?? "");
  const [jobTitle, setJobTitle] = useState(account.job_title ?? "");
  const [profileFeedback, setProfileFeedback] = useState<Feedback>(null);
  const [passwordFeedback, setPasswordFeedback] = useState<Feedback>(null);
  const [saving, setSaving] = useState(false);
  const [changing, setChanging] = useState(false);
  const [passwordClosed, setPasswordClosed] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const profileBusy = useRef(false);
  const passwordBusy = useRef(false);

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault();
    if (profileBusy.current) return;
    if (!name.trim()) { setProfileFeedback({ error: true, text: "أدخل الاسم الكامل." }); return; }
    profileBusy.current = true; setSaving(true); setProfileFeedback(null);
    try {
      const response = await fetch("/api/account", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ full_name_ar: name.trim(), mobile, job_title: jobTitle }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.saved !== true || !result.account?.id) throw new Error(result.message ?? "تعذر حفظ البيانات الآن. حاول مرة أخرى.");
      setProfileFeedback({ error: false, text: "تم حفظ بيانات حسابك." }); router.refresh();
    } catch (error) {
      setProfileFeedback({ error: true, text: error instanceof Error && !(error instanceof TypeError) ? error.message : "تعذر الاتصال. بقيت مدخلاتك كما هي." });
    } finally { profileBusy.current = false; setSaving(false); }
  }
  async function changePassword(event: React.FormEvent) {
    event.preventDefault();
    if (passwordBusy.current || passwordClosed) return;
    if (password !== confirmation) { setPasswordFeedback({ error: true, text: "كلمتا المرور الجديدتان غير متطابقتين." }); return; }
    if (!currentPassword || password.length < 12 || password.length > 128 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
      setPasswordFeedback({ error: true, text: "أدخل كلمة المرور الحالية وجديدة تحقق متطلبات الأمان الموضحة." }); return;
    }
    passwordBusy.current = true; setChanging(true); setPasswordFeedback(null);
    try {
      const response = await fetch("/api/account/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword, password }) });
      const result = await response.json().catch(() => ({}));
      if (result.uncertain === true || (response.status >= 500 && !result.message) || (response.ok && result.changed !== true)) setPasswordClosed(true);
      if (!response.ok || result.changed !== true) throw new Error(result.message ?? "تعذر تأكيد نتيجة التغيير. جرّب تسجيل الدخول بالجديدة قبل إعادة التغيير.");
      setPasswordClosed(true); setCurrentPassword(""); setPassword(""); setConfirmation("");
      setPasswordFeedback({ error: false, text: result.message ?? "تم تغيير كلمة المرور. سجّل الدخول بالجديدة." });
    } catch (error) {
      if (error instanceof TypeError) setPasswordClosed(true);
      setPasswordFeedback({ error: true, text: error instanceof Error && !(error instanceof TypeError) ? error.message : "انقطع الاتصال. جرّب تسجيل الدخول بالجديدة قبل إعادة التغيير." });
    } finally { passwordBusy.current = false; setChanging(false); }
  }

  return <div className="mx-auto max-w-5xl space-y-6" dir="rtl">
    <header className="flex items-center gap-4 rounded-2xl border border-[#dce7f1] bg-white p-5 sm:p-7">
      <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-[#e7f2ff] text-[#0066cc]"><UserRound size={26} /></span>
      <div><h1 className="text-2xl font-black text-[#14233a]">حسابي</h1><p className="mt-1 text-sm text-[#718196]">بياناتك الشخصية وأمان الدخول، في مكان واحد.</p></div>
    </header>
    <section className="rounded-2xl border border-[#dce7f1] bg-white p-5 sm:p-7">
      <h2 className="text-lg font-bold text-[#14233a]">البيانات الشخصية</h2>
      <p className="mt-2 break-all text-sm text-[#718196]" dir="ltr">{account.email}</p>
      <form onSubmit={saveProfile} className="mt-6">
        <fieldset disabled={saving} className="grid gap-5 sm:grid-cols-2">
          <label className="text-sm font-bold text-[#23334b] sm:col-span-2">الاسم الكامل<input className={input} value={name} onChange={event => setName(event.target.value)} maxLength={200} autoComplete="name" required /></label>
          <label className="text-sm font-bold text-[#23334b]">رقم الجوال<input className={input} value={mobile} onChange={event => setMobile(event.target.value)} maxLength={40} autoComplete="tel" type="tel" /></label>
          <label className="text-sm font-bold text-[#23334b]">المسمى الوظيفي<input className={input} value={jobTitle} onChange={event => setJobTitle(event.target.value)} maxLength={200} autoComplete="organization-title" /></label>
        </fieldset>
        <Notice value={profileFeedback} />
        <div className="mt-5 flex justify-end"><button type="submit" disabled={saving} className={button}>{saving ? "جارٍ الحفظ…" : "حفظ بياناتي"}</button></div>
      </form>
    </section>
    <section className="rounded-2xl border border-[#dce7f1] bg-white p-5 sm:p-7">
      <h2 className="flex items-center gap-2 text-lg font-bold text-[#14233a]"><KeyRound size={20} className="text-[#0066cc]" />أمان الحساب</h2>
      <p className="mt-2 text-sm leading-7 text-[#718196]">بعد تغيير كلمة المرور ستحتاج إلى تسجيل الدخول مجددًا. لا تشارك كلمة المرور مع أحد.</p>
      <form onSubmit={changePassword} className="mt-6">
        <fieldset disabled={changing || passwordClosed} className="grid gap-5 sm:grid-cols-2">
          <label className="text-sm font-bold text-[#23334b] sm:col-span-2">كلمة المرور الحالية<input className={input} type="password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} autoComplete="current-password" required /></label>
          <label className="text-sm font-bold text-[#23334b]">كلمة المرور الجديدة<input className={input} type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="new-password" maxLength={128} required /></label>
          <label className="text-sm font-bold text-[#23334b]">تأكيد كلمة المرور الجديدة<input className={input} type="password" value={confirmation} onChange={event => setConfirmation(event.target.value)} autoComplete="new-password" maxLength={128} required /></label>
        </fieldset>
        <p className="mt-3 text-xs leading-6 text-[#718196]">12 إلى 128 حرفًا، تشمل حرفًا إنجليزيًا كبيرًا وصغيرًا، ورقمًا ورمزًا.</p>
        <Notice value={passwordFeedback} />
        <div className="mt-5 flex flex-wrap items-center justify-end gap-3">{passwordClosed ? <Link href="/login" className={button}>تسجيل الدخول</Link> : <button type="submit" disabled={changing} className={button}>{changing ? "جارٍ التحقق والتغيير…" : "تغيير كلمة المرور"}</button>}</div>
      </form>
    </section>
  </div>;
}
