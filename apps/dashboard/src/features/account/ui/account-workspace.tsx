"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { KeyRound, UserRound } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { InlineMessage } from "@/shared/ui/inline-message";
import { AvatarPanel } from "./avatar-panel";

export type SelfAccount = { id: string; email: string; full_name_ar: string; mobile: string | null; job_title: string | null; avatar_revision?:number;has_avatar?:boolean };
const input = "mt-2 h-12 w-full rounded-q-control border border-q-border bg-q-surface px-4 text-q-ui text-q-text outline-none focus:border-q-primary focus:ring-2 focus:ring-q-primary";
const button = "inline-flex min-h-11 items-center rounded-q-control bg-q-primary px-5 py-3 text-q-ui font-bold text-q-on-primary";
type Feedback = { error: boolean; text: string } | null;
function Notice({ value }: { value: Feedback }) {
  return value && <InlineMessage tone={value.error?"error":"success"} className="mt-4">{value.text}</InlineMessage>;
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
    <Card className="flex items-center gap-4 p-6 sm:p-8">
      <span className="grid h-14 w-14 shrink-0 place-items-center rounded-q-card bg-q-surface-2 text-q-primary"><UserRound size={26} /></span>
      <div><h1 className="text-q-h1 font-bold">حسابي</h1><p className="mt-2 text-q-ui text-q-text-2">بياناتك الشخصية وأمان الدخول، في مكان واحد.</p></div>
    </Card>
    <AvatarPanel name={name} initialRevision={account.avatar_revision} initialHasImage={account.has_avatar} />
    <Card className="p-6 sm:p-8">
      <h2 className="text-q-h3 font-bold">البيانات الشخصية</h2>
      <p className="mt-2 break-all text-q-ui text-q-text-2" dir="ltr">{account.email}</p>
      <form onSubmit={saveProfile} className="mt-6">
        <fieldset disabled={saving} className="grid min-w-0 gap-4 sm:grid-cols-2">
          <label className="text-q-ui font-bold sm:col-span-2">الاسم الكامل<input className={input} value={name} onChange={event => setName(event.target.value)} maxLength={200} autoComplete="name" required /></label>
          <label className="text-q-ui font-bold">رقم الجوال<input className={input} value={mobile} onChange={event => setMobile(event.target.value)} maxLength={40} autoComplete="tel" type="tel" /></label>
          <label className="text-q-ui font-bold">المسمى الوظيفي<input className={input} value={jobTitle} onChange={event => setJobTitle(event.target.value)} maxLength={200} autoComplete="organization-title" /></label>
        </fieldset>
        <Notice value={profileFeedback} />
        <div className="mt-4 flex justify-end"><Button type="submit" pending={saving} pendingLabel="جارٍ الحفظ…">حفظ بياناتي</Button></div>
      </form>
    </Card>
    <Card className="p-6 sm:p-8">
      <h2 className="flex items-center gap-2 text-q-h3 font-bold"><KeyRound size={20} className="text-q-primary" />أمان الحساب</h2>
      <p className="mt-2 text-q-ui leading-7 text-q-text-2">بعد تغيير كلمة المرور ستحتاج إلى تسجيل الدخول مجددًا. لا تشارك كلمة المرور مع أحد.</p>
      <form onSubmit={changePassword} className="mt-6">
        <fieldset disabled={changing || passwordClosed} className="grid min-w-0 gap-4 sm:grid-cols-2">
          <label className="text-q-ui font-bold sm:col-span-2">كلمة المرور الحالية<input className={input} type="password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} autoComplete="current-password" required /></label>
          <label className="text-q-ui font-bold">كلمة المرور الجديدة<input className={input} type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="new-password" maxLength={128} required /></label>
          <label className="text-q-ui font-bold">تأكيد كلمة المرور الجديدة<input className={input} type="password" value={confirmation} onChange={event => setConfirmation(event.target.value)} autoComplete="new-password" maxLength={128} required /></label>
        </fieldset>
        <p className="mt-3 text-q-caption leading-6 text-q-text-2">12 إلى 128 حرفًا، تشمل حرفًا إنجليزيًا كبيرًا وصغيرًا، ورقمًا ورمزًا.</p>
        <Notice value={passwordFeedback} />
        <div className="mt-4 flex flex-wrap items-center justify-end gap-3">{passwordClosed ? <Link href="/login" className={button}>تسجيل الدخول</Link> : <Button type="submit" pending={changing} pendingLabel="جارٍ التحقق والتغيير…">تغيير كلمة المرور</Button>}</div>
      </form>
    </Card>
  </div>;
}
