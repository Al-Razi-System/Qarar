"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Ellipsis,
  Filter,
  KeyRound,
  LockKeyhole,
  Mail,
  Pencil,
  Search,
  UnlockKeyhole,
  UserRoundX,
  UsersRound,
  X,
} from "lucide-react";

export type ManagedUser = {
  id: string;
  email: string;
  full_name_ar: string;
  employee_no: string | null;
  job_title: string | null;
  status: "active" | "inactive" | "suspended";
  is_system_admin: boolean;
  roles: Array<{ role_name_ar: string; governance_unit_name_ar: string }>;
};

type UserDetails = ManagedUser & {
  full_name_en?: string | null;
  mobile?: string | null;
};
type UserAction =
  | "lock_user"
  | "unlock_user"
  | "update_user_status"
  | "resend_invitation"
  | "send_password_reset";
type OpenMenu = { user: ManagedUser; x: number; y: number } | null;

const statusLabels = { active: "نشط", inactive: "غير نشط", suspended: "معلّق" };
const actionCopy: Record<
  UserAction,
  { label: string; description: string; icon: typeof LockKeyhole; tone: string }
> = {
  lock_user: {
    label: "قفل الحساب",
    description: "سيتم تعليق الحساب وإلغاء جلساته النشطة.",
    icon: LockKeyhole,
    tone: "text-[#d96500]",
  },
  unlock_user: {
    label: "فك القفل وتفعيل الحساب",
    description: "سيتم السماح للمستخدم بتسجيل الدخول من جديد.",
    icon: UnlockKeyhole,
    tone: "text-[#16835f]",
  },
  update_user_status: {
    label: "تعطيل الحساب",
    description: "سيُعطّل الحساب وتُلغى جلساته، مع الاحتفاظ بسجل الحوكمة.",
    icon: UserRoundX,
    tone: "text-[#bd3e35]",
  },
  resend_invitation: {
    label: "إعادة إرسال الدعوة",
    description: "سيُرسل رابط دعوة جديد إلى البريد المسجل.",
    icon: Mail,
    tone: "text-[#0066cc]",
  },
  send_password_reset: {
    label: "إرسال رابط إعادة التعيين",
    description: "سيُرسل رابط آمن لإعادة ضبط كلمة المرور إلى البريد المسجل.",
    icon: KeyRound,
    tone: "text-[#0066cc]",
  },
};

async function requestJson(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message ?? "تعذر تنفيذ الطلب.");
  return data;
}

export function UsersTable({
  users,
  total,
}: {
  users: ManagedUser[];
  total: number;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null);
  const [pending, setPending] = useState<{
    user: ManagedUser;
    action: UserAction;
  } | null>(null);
  const [editing, setEditing] = useState<UserDetails | null>(null);
  const [loadingEdit, setLoadingEdit] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [offboardingSuccessor, setOffboardingSuccessor] = useState("");
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    const close = () => setOpenMenu(null);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, []);

  const filtered = useMemo(
    () =>
      users.filter((user) =>
        `${user.full_name_ar} ${user.email} ${user.employee_no ?? ""}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [query, users],
  );

  function openActions(user: ManagedUser, element: HTMLButtonElement) {
    const rect = element.getBoundingClientRect();
    setOpenMenu({
      user,
      x: Math.max(12, rect.left - 238),
      y: Math.min(window.innerHeight - 330, rect.bottom + 8),
    });
  }

  async function startEditing(user: ManagedUser) {
    setOpenMenu(null);
    setLoadingEdit(true);
    setMessage(null);
    try {
      setEditing(await requestJson(`/api/admin/users/${user.id}`));
    } catch (error) {
      setMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "تعذر تحميل بيانات المستخدم.",
      });
    } finally {
      setLoadingEdit(false);
    }
  }

  async function runAction() {
    if (!pending) return;
    setIsSubmitting(true);
    setMessage(null);
    try {
      await requestJson(`/api/admin/users/${pending.user.id}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: pending.action,
          reason:
            pending.action === "update_user_status"
              ? "مغادرة مستخدم من لوحة الإدارة"
              : undefined,
          status:
            pending.action === "update_user_status" ? "inactive" : undefined,
          successor_user_id:
            pending.action === "update_user_status"
              ? offboardingSuccessor || null
              : undefined,
        }),
      });
      setPending(null);
      setOffboardingSuccessor("");
      setMessage({
        type: "success",
        text:
          pending.action === "update_user_status"
            ? "أُرسل طلب المغادرة لاعتماد مسؤول آخر."
            : "تم تنفيذ العملية بنجاح.",
      });
      router.refresh();
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "تعذر تنفيذ العملية.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    setIsSubmitting(true);
    setMessage(null);
    const formData = new FormData(event.currentTarget);
    try {
      await requestJson(`/api/admin/users/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(formData)),
      });
      setEditing(null);
      setMessage({ type: "success", text: "تم حفظ بيانات المستخدم بنجاح." });
      router.refresh();
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "تعذر حفظ البيانات.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      {message && (
        <div
          className={`mb-4 rounded-xl border px-4 py-3 text-xs ${message.type === "success" ? "border-[#bfe9d9] bg-[#ecfaf4] text-[#167957]" : "border-red-200 bg-red-50 text-red-700"}`}
        >
          {message.text}
        </div>
      )}
      <div className="rounded-2xl border border-[#e2e9f1] bg-white shadow-[0_3px_16px_rgba(24,48,80,.035)]">
        <div className="flex flex-col gap-3 border-b border-[#edf1f5] p-4 sm:flex-row sm:items-center">
          <div className="relative w-full max-w-[380px]">
            <Search
              size={16}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#8796a9]"
            />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="ابحث بالاسم، البريد أو الرقم الوظيفي..."
              className="h-11 w-full rounded-xl border border-[#dfe7ef] bg-[#fafcfe] pr-10 pl-4 text-xs outline-none focus:border-[#9bc9f2] focus:bg-white"
            />
          </div>
          <button
            type="button"
            className="flex h-11 items-center justify-center gap-2 rounded-xl border border-[#dfe7ef] bg-white px-4 text-xs font-bold text-[#52647a] hover:bg-[#f8fafc]"
          >
            <Filter size={15} /> تصفية
          </button>
          <p className="text-xs text-[#7a8b9e] sm:mr-auto">
            إجمالي المستخدمين:{" "}
            <strong className="text-[#0a1330]">{total}</strong>
          </p>
        </div>
        {filtered.length === 0 ? (
          <div className="grid min-h-[300px] place-items-center p-8 text-center">
            <div>
              <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#edf5fd] text-[#0066cc]">
                <UsersRound size={24} />
              </span>
              <h2 className="mt-4 text-sm font-black text-[#1c2b42]">
                لا توجد بيانات مستخدمين
              </h2>
              <p className="mt-2 text-xs text-[#7c8da0]">
                لم تُرجع قاعدة البيانات مستخدمين مطابقين.
              </p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] border-collapse text-right">
              <thead>
                <tr className="bg-[#f8fafc] text-[11px] font-bold text-[#78899d]">
                  <th className="px-5 py-3.5">المستخدم</th>
                  <th className="px-3 py-3.5">الدور</th>
                  <th className="px-3 py-3.5">النطاق</th>
                  <th className="px-3 py-3.5">الحالة</th>
                  <th className="px-5 py-3.5">المسمى الوظيفي</th>
                  <th className="w-14 px-3 py-3.5" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((user) => {
                  const initials = user.full_name_ar
                    .split(" ")
                    .slice(0, 2)
                    .map((part) => part[0])
                    .join("");
                  const firstRole = user.roles[0];
                  return (
                    <tr
                      key={user.id}
                      className="border-t border-[#eef2f6] text-xs hover:bg-[#fbfdff]"
                    >
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#e7f2ff] text-[11px] font-black text-[#0066cc]">
                            {initials}
                          </span>
                          <span>
                            <strong className="block text-[#16243b]">
                              {user.full_name_ar}
                            </strong>
                            <span className="mt-1 block text-[10px] text-[#8493a6]">
                              {user.email}
                            </span>
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-4 text-[#33445d]">
                        {user.is_system_admin
                          ? "مدير النظام"
                          : (firstRole?.role_name_ar ?? "—")}
                      </td>
                      <td className="px-3 py-4 text-[#63758a]">
                        {firstRole?.governance_unit_name_ar ?? "—"}
                      </td>
                      <td className="px-3 py-4">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold ${user.status === "active" ? "bg-[#e9f8f1] text-[#16835f]" : user.status === "suspended" ? "bg-[#fff2e8] text-[#d96500]" : "bg-[#eef1f5] text-[#6d7b8e]"}`}
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-current" />
                          {statusLabels[user.status]}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-[#6e7f92]">
                        {user.job_title ?? "—"}
                      </td>
                      <td className="px-3 py-4">
                        <button
                          type="button"
                          onClick={(event) =>
                            openActions(user, event.currentTarget)
                          }
                          className="grid h-8 w-8 place-items-center rounded-lg text-[#8493a6] hover:bg-[#edf4fb] hover:text-[#0066cc]"
                          aria-label={`عمليات ${user.full_name_ar}`}
                        >
                          <Ellipsis size={18} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {openMenu && (
        <>
          <button
            type="button"
            aria-label="إغلاق قائمة العمليات"
            onClick={() => setOpenMenu(null)}
            className="fixed inset-0 z-30 cursor-default"
          />
          <div
            className="fixed z-40 w-60 rounded-2xl border border-[#dfe7ef] bg-white p-2 shadow-[0_18px_45px_rgba(10,19,48,.2)]"
            style={{ left: openMenu.x, top: openMenu.y }}
          >
            <div className="border-b border-[#edf1f5] px-3 py-2">
              <p className="text-[10px] font-black text-[#64768b]">
                إجراءات الحساب
              </p>
              <p className="mt-0.5 truncate text-[10px] text-[#8b99aa]">
                {openMenu.user.full_name_ar}
              </p>
            </div>
            <button
              type="button"
              onClick={() => startEditing(openMenu.user)}
              className="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-right text-[11px] font-bold text-[#0066cc] hover:bg-[#edf6ff]"
            >
              <Pencil size={16} />
              تعديل بيانات المستخدم
            </button>
            {(
              (openMenu.user.status === "active"
                ? ["lock_user", "update_user_status"]
                : ["unlock_user"]) as UserAction[]
            ).map((action) => {
              const config = actionCopy[action];
              const Icon = config.icon;
              return (
                <button
                  key={action}
                  type="button"
                  onClick={() => {
                    setOpenMenu(null);
                    setPending({ user: openMenu.user, action });
                  }}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-right text-[11px] font-bold hover:bg-[#f5f8fc] ${config.tone}`}
                >
                  <Icon size={16} />
                  {config.label}
                </button>
              );
            })}
            <div className="my-1 border-t border-[#edf1f5]" />
            {(["resend_invitation", "send_password_reset"] as UserAction[]).map(
              (action) => {
                const config = actionCopy[action];
                const Icon = config.icon;
                return (
                  <button
                    key={action}
                    type="button"
                    onClick={() => {
                      setOpenMenu(null);
                      setPending({ user: openMenu.user, action });
                    }}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-right text-[11px] font-bold hover:bg-[#f5f8fc] ${config.tone}`}
                  >
                    <Icon size={16} />
                    {config.label}
                  </button>
                );
              },
            )}
          </div>
        </>
      )}
      {loadingEdit && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-[#081630]/55 p-4 backdrop-blur-sm">
          <div className="rounded-2xl bg-white px-6 py-5 text-sm font-bold text-[#0a1330] shadow-2xl">
            جارٍ تحميل بيانات المستخدم…
          </div>
        </div>
      )}
      {editing && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-[#081630]/55 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-user-title"
        >
          <form
            onSubmit={saveProfile}
            className="w-full max-w-2xl overflow-hidden rounded-3xl bg-white shadow-2xl"
          >
            <div className="flex items-start justify-between border-b border-[#e7edf3] px-6 py-5">
              <div>
                <p className="text-[11px] font-bold text-[#ff7a00]">
                  إدارة الهوية والوصول
                </p>
                <h2
                  id="edit-user-title"
                  className="mt-1 text-lg font-black text-[#0a1330]"
                >
                  تعديل بيانات المستخدم
                </h2>
                <p className="mt-1 text-xs text-[#718196]">
                  يتم حفظ التعديل في سجل الحوكمة.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="grid h-9 w-9 place-items-center rounded-xl text-[#73849a] hover:bg-[#edf4fb]"
                aria-label="إغلاق"
              >
                <X size={20} />
              </button>
            </div>
            <div className="grid gap-4 p-6 sm:grid-cols-2">
              <label className="sm:col-span-2">
                <span className="mb-1.5 block text-xs font-bold text-[#3d4f66]">
                  الاسم بالعربية *
                </span>
                <input
                  required
                  name="full_name_ar"
                  defaultValue={editing.full_name_ar}
                  className="h-11 w-full rounded-xl border border-[#dbe5ef] px-3 text-sm outline-none focus:border-[#0066cc]"
                />
              </label>
              <label>
                <span className="mb-1.5 block text-xs font-bold text-[#3d4f66]">
                  الاسم بالإنجليزية
                </span>
                <input
                  name="full_name_en"
                  defaultValue={editing.full_name_en ?? ""}
                  className="h-11 w-full rounded-xl border border-[#dbe5ef] px-3 text-sm outline-none focus:border-[#0066cc]"
                />
              </label>
              <label>
                <span className="mb-1.5 block text-xs font-bold text-[#3d4f66]">
                  الرقم الوظيفي
                </span>
                <input
                  name="employee_no"
                  defaultValue={editing.employee_no ?? ""}
                  className="h-11 w-full rounded-xl border border-[#dbe5ef] px-3 text-sm outline-none focus:border-[#0066cc]"
                />
              </label>
              <label>
                <span className="mb-1.5 block text-xs font-bold text-[#3d4f66]">
                  رقم الجوال
                </span>
                <input
                  dir="ltr"
                  name="mobile"
                  defaultValue={editing.mobile ?? ""}
                  className="h-11 w-full rounded-xl border border-[#dbe5ef] px-3 text-sm outline-none focus:border-[#0066cc]"
                />
              </label>
              <label>
                <span className="mb-1.5 block text-xs font-bold text-[#3d4f66]">
                  المسمى الوظيفي
                </span>
                <input
                  name="job_title"
                  defaultValue={editing.job_title ?? ""}
                  className="h-11 w-full rounded-xl border border-[#dbe5ef] px-3 text-sm outline-none focus:border-[#0066cc]"
                />
              </label>
              <label className="sm:col-span-2">
                <span className="mb-1.5 block text-xs font-bold text-[#3d4f66]">
                  البريد الإلكتروني
                </span>
                <input
                  disabled
                  value={editing.email}
                  className="h-11 w-full cursor-not-allowed rounded-xl border border-[#e4e9ef] bg-[#f6f8fb] px-3 text-sm text-[#718196]"
                />
                <span className="mt-1 block text-[10px] text-[#8b99aa]">
                  يتم تغيير البريد من خلال إجراء هوية مستقل حفاظًا على أمان
                  الحساب.
                </span>
              </label>
            </div>
            <div className="flex justify-end gap-3 border-t border-[#e7edf3] bg-[#fbfcfe] px-6 py-4">
              <button
                type="button"
                onClick={() => setEditing(null)}
                disabled={isSubmitting}
                className="h-10 rounded-xl border border-[#dbe5ef] px-4 text-xs font-bold text-[#52647a]"
              >
                إلغاء
              </button>
              <button
                disabled={isSubmitting}
                className="h-10 rounded-xl bg-[#0066cc] px-5 text-xs font-bold text-white shadow-[0_8px_20px_rgba(0,102,204,.18)] disabled:opacity-60"
              >
                {isSubmitting ? "جارٍ الحفظ…" : "حفظ التعديلات"}
              </button>
            </div>
          </form>
        </div>
      )}
      {pending &&
        (() => {
          const config = actionCopy[pending.action];
          const Icon = config.icon;
          return (
            <div
              className="fixed inset-0 z-50 grid place-items-center bg-[#081630]/55 p-4 backdrop-blur-sm"
              role="dialog"
              aria-modal="true"
            >
              <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
                <div className="flex items-start justify-between">
                  <span
                    className={`grid h-11 w-11 place-items-center rounded-xl bg-[#edf5fd] ${config.tone}`}
                  >
                    <Icon size={21} />
                  </span>
                  <button
                    type="button"
                    onClick={() => setPending(null)}
                    className="text-[#8493a6] hover:text-[#0a1330]"
                    aria-label="إلغاء"
                  >
                    <X size={20} />
                  </button>
                </div>
                <h2 className="mt-5 text-base font-black text-[#15243b]">
                  {config.label}
                </h2>
                <p className="mt-2 text-xs leading-6 text-[#718196]">
                  {config.description}
                </p>
                <p className="mt-3 rounded-lg bg-[#f6f9fc] px-3 py-2 text-[11px] font-bold text-[#44566d]">
                  {pending.user.full_name_ar}
                </p>
                {pending.action === "update_user_status" && (
                  <label className="mt-4 block text-xs font-bold text-[#44566d]">
                    خليفة المهام المفتوحة
                    <select
                      value={offboardingSuccessor}
                      onChange={(event) => setOffboardingSuccessor(event.target.value)}
                      className="mt-2 h-11 w-full rounded-xl border border-[#dfe7ef] bg-white px-3 text-xs"
                    >
                      <option value="">لا يوجد — إذا لم توجد مهام مفتوحة</option>
                      {users
                        .filter((user) => user.id !== pending.user.id && user.status === "active")
                        .map((user) => <option key={user.id} value={user.id}>{user.full_name_ar}</option>)}
                    </select>
                  </label>
                )}
                <div className="mt-6 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setPending(null)}
                    disabled={isSubmitting}
                    className="h-10 rounded-xl border border-[#dfe7ef] px-4 text-xs font-bold text-[#52647a]"
                  >
                    إلغاء
                  </button>
                  <button
                    type="button"
                    onClick={runAction}
                    disabled={isSubmitting}
                    className="h-10 rounded-xl bg-[#0066cc] px-4 text-xs font-bold text-white disabled:opacity-60"
                  >
                    {isSubmitting ? "جارٍ التنفيذ..." : "تأكيد العملية"}
                  </button>
                </div>
              </div>
            </div>
          );
        })()}
    </>
  );
}
