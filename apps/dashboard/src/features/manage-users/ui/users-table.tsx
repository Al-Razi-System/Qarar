"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Ellipsis,
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
    tone: "text-q-accent-text",
  },
  unlock_user: {
    label: "فك القفل وتفعيل الحساب",
    description: "سيتم السماح للمستخدم بتسجيل الدخول من جديد.",
    icon: UnlockKeyhole,
    tone: "text-q-success",
  },
  update_user_status: {
    label: "تعطيل الحساب",
    description: "سيُعطّل الحساب وتُلغى جلساته، مع الاحتفاظ بسجل الحوكمة.",
    icon: UserRoundX,
    tone: "text-[var(--q-danger)]",
  },
  resend_invitation: {
    label: "إعادة إرسال الدعوة",
    description: "سيُرسل رابط دعوة جديد إلى البريد المسجل.",
    icon: Mail,
    tone: "text-q-primary",
  },
  send_password_reset: {
    label: "إرسال رابط إعادة التعيين",
    description: "سيُرسل رابط آمن لإعادة ضبط كلمة المرور إلى البريد المسجل.",
    icon: KeyRound,
    tone: "text-q-primary",
  },
};

async function requestJson<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message ?? "تعذر تنفيذ الطلب.");
  return data as T;
}

const usersPageSize = 25;
type UsersPage = { items: ManagedUser[]; total: number };

export function UsersTable({
  users,
  total,
  canManageSubmissionScopes = false,
}: {
  users: ManagedUser[];
  total: number;
  canManageSubmissionScopes?: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [displayedUsers, setDisplayedUsers] = useState(users);
  const [displayedTotal, setDisplayedTotal] = useState(total);
  const [page, setPage] = useState(0);
  const [loadingPage, setLoadingPage] = useState(false);
  const serverPageSignatureRef = useRef(JSON.stringify({ users, total }));
  const previousQueryRef = useRef(query);
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

  useEffect(() => {
    const nextSignature = JSON.stringify({ users, total });
    if (serverPageSignatureRef.current === nextSignature) return;
    serverPageSignatureRef.current = nextSignature;
    setDisplayedUsers(users);
    setDisplayedTotal(total);
    setPage(0);
  }, [users, total]);

  async function loadUsers(nextPage: number, nextQuery: string, signal?: AbortSignal) {
    setLoadingPage(true);
    setMessage(null);
    try {
      const params = new URLSearchParams({ offset: String(nextPage * usersPageSize) });
      if (nextQuery.trim()) params.set("query", nextQuery.trim());
      const result = await requestJson<UsersPage>(`/api/admin/users?${params.toString()}`, { signal });
      setDisplayedUsers(result.items);
      setDisplayedTotal(result.total);
      setPage(nextPage);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setMessage({
        type: "error",
        text:
          error instanceof Error && !(error instanceof TypeError)
            ? error.message
            : "تعذر تحميل المستخدمين حالياً.",
      });
    } finally {
      if (!signal?.aborted) setLoadingPage(false);
    }
  }

  useEffect(() => {
    if (previousQueryRef.current === query) return;
    previousQueryRef.current = query;
    const controller = new AbortController();
    const timer = window.setTimeout(() => void loadUsers(0, query, controller.signal), 300);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

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
          role={message.type === "error" ? "alert" : "status"}
          className={`mb-4 rounded-q-control border px-4 py-3 text-q-caption ${message.type === "success" ? "border-[var(--q-success-soft)] bg-q-success-soft text-q-success" : "border-q-danger bg-q-danger-soft text-q-danger"}`}
        >
          {message.text}
        </div>
      )}
      <div className="rounded-q-card border border-q-border bg-q-surface shadow-sm">
        <div className="flex flex-col gap-3 border-b border-[var(--q-surface-2)] p-4 sm:flex-row sm:items-center">
          <div className="relative w-full max-w-[380px]">
            <Search
              size={16}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-q-text-2"
            />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="ابحث بالاسم، البريد أو الرقم الوظيفي..."
              className="h-11 w-full rounded-q-control border border-q-border bg-q-bg pr-10 pl-4 text-q-caption outline-none focus:border-[var(--q-primary-soft)] focus:bg-q-surface"
            />
          </div>
          <p className="text-q-caption text-q-text-2 sm:mr-auto">
            إجمالي المستخدمين:{" "}
            <strong className="text-q-text">{displayedTotal}</strong>
          </p>
        </div>
        {loadingPage && <div role="status" className="border-b border-[var(--q-surface-2)] bg-q-bg px-4 py-2 text-q-caption font-bold text-q-primary">جارٍ تحميل المستخدمين…</div>}
        {displayedUsers.length === 0 ? (
          <div className="grid min-h-[300px] place-items-center p-8 text-center">
            <div>
              <span className="mx-auto grid h-14 w-14 place-items-center rounded-q-card bg-q-surface-2 text-q-primary">
                <UsersRound size={24} />
              </span>
              <h2 className="mt-4 text-q-ui font-black text-q-text">
                لا توجد بيانات مستخدمين
              </h2>
              <p className="mt-2 text-q-caption text-q-text-2">
                لم تُرجع قاعدة البيانات مستخدمين مطابقين.
              </p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] border-collapse text-right">
              <thead>
                <tr className="bg-q-bg text-q-caption font-bold text-q-text-2">
                  <th className="px-5 py-3.5">المستخدم</th>
                  <th className="px-3 py-3.5">الدور</th>
                  <th className="px-3 py-3.5">النطاق</th>
                  <th className="px-3 py-3.5">الحالة</th>
                  <th className="px-5 py-3.5">المسمى الوظيفي</th>
                  <th className="w-14 px-3 py-3.5" />
                </tr>
              </thead>
              <tbody>
                {displayedUsers.map((user) => {
                  const initials = user.full_name_ar
                    .split(" ")
                    .slice(0, 2)
                    .map((part) => part[0])
                    .join("");
                  const firstRole = user.roles[0];
                  return (
                    <tr
                      key={user.id}
                      className="border-t border-q-border text-q-caption hover:bg-q-bg"
                    >
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <span className="grid h-9 w-9 place-items-center rounded-q-control bg-q-surface-2 text-q-caption font-black text-q-primary">
                            {initials}
                          </span>
                          <span>
                            <strong className="block text-q-text">
                              {user.full_name_ar}
                            </strong>
                            <span className="mt-1 block text-q-caption text-q-text-2">
                              {user.email}
                            </span>
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-4 text-q-text">
                        {user.is_system_admin
                          ? "مدير النظام"
                          : (firstRole?.role_name_ar ?? "—")}
                      </td>
                      <td className="px-3 py-4 text-q-text-2">
                        {firstRole?.governance_unit_name_ar ?? "—"}
                      </td>
                      <td className="px-3 py-4">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-q-caption font-bold ${user.status === "active" ? "bg-q-success-soft text-q-success" : user.status === "suspended" ? "bg-q-warning-soft text-q-accent-text" : "bg-q-neutral-soft text-q-text-2"}`}
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-current" />
                          {statusLabels[user.status]}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-q-text-2">
                        {user.job_title ?? "—"}
                      </td>
                      <td className="px-3 py-4">
                        <button
                          type="button"
                          onClick={(event) =>
                            openActions(user, event.currentTarget)
                          }
                          className="grid h-8 w-8 place-items-center rounded-q-control text-q-text-2 hover:bg-q-surface-2 hover:text-q-primary"
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
        {displayedTotal > usersPageSize && (
          <nav aria-label="ترقيم صفحات المستخدمين" className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--q-surface-2)] px-4 py-3">
            <p className="text-q-caption text-q-text-3">الصفحة <strong className="text-q-text">{page + 1}</strong> من {Math.max(1, Math.ceil(displayedTotal / usersPageSize))}</p>
            <div className="flex gap-2">
              <button type="button" aria-label="الصفحة السابقة" disabled={loadingPage || page === 0} onClick={() => void loadUsers(page - 1, query)} className="h-9 rounded-q-control border border-q-border px-4 text-q-caption font-bold text-q-text-2 disabled:cursor-not-allowed disabled:opacity-40">السابق</button>
              <button type="button" aria-label="الصفحة التالية" disabled={loadingPage || (page + 1) * usersPageSize >= displayedTotal} onClick={() => void loadUsers(page + 1, query)} className="h-9 rounded-q-control bg-q-primary px-4 text-q-caption font-bold text-q-on-primary disabled:cursor-not-allowed disabled:bg-[var(--q-text-2)]">التالي</button>
            </div>
          </nav>
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
            className="fixed z-40 w-60 rounded-q-card border border-q-border bg-q-surface p-2 shadow-sm"
            style={{ left: openMenu.x, top: openMenu.y }}
          >
            <div className="border-b border-[var(--q-surface-2)] px-3 py-2">
              <p className="text-q-caption font-black text-q-text-2">
                إجراءات الحساب
              </p>
              <p className="mt-0.5 truncate text-q-caption text-q-text-2">
                {openMenu.user.full_name_ar}
              </p>
            </div>
            <button
              type="button"
              onClick={() => startEditing(openMenu.user)}
              className="mt-1 flex w-full items-center gap-3 rounded-q-control px-3 py-2.5 text-right text-q-caption font-bold text-q-primary hover:bg-q-surface-2"
            >
              <Pencil size={16} />
              تعديل بيانات المستخدم
            </button>
            {canManageSubmissionScopes && <Link
              href={`/admin/users/${openMenu.user.id}/roles`}
              className="flex w-full items-center gap-3 rounded-q-control px-3 py-2.5 text-right text-q-caption font-bold text-q-primary hover:bg-q-surface-2"
            ><UsersRound size={16} />إدارة أدوار المستخدم</Link>}
            {canManageSubmissionScopes && <Link
              href={`/admin/users/${openMenu.user.id}/submission-scope`}
              className="flex w-full items-center gap-3 rounded-q-control px-3 py-2.5 text-right text-q-caption font-bold text-q-primary hover:bg-q-surface-2"
            ><UsersRound size={16} />جهة العمل وصلاحيات التقديم</Link>}
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
                  className={`flex w-full items-center gap-3 rounded-q-control px-3 py-2.5 text-right text-q-caption font-bold hover:bg-q-bg ${config.tone}`}
                >
                  <Icon size={16} />
                  {config.label}
                </button>
              );
            })}
            <div className="my-1 border-t border-[var(--q-surface-2)]" />
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
                    className={`flex w-full items-center gap-3 rounded-q-control px-3 py-2.5 text-right text-q-caption font-bold hover:bg-q-bg ${config.tone}`}
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
        <div className="fixed inset-0 z-50 grid place-items-center bg-[var(--q-text)]/55 p-4 backdrop-blur-sm">
          <div className="rounded-q-card bg-q-surface px-6 py-5 text-q-ui font-bold text-q-text shadow-2xl">
            جارٍ تحميل بيانات المستخدم…
          </div>
        </div>
      )}
      {editing && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-[var(--q-text)]/55 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-user-title"
        >
          <form
            onSubmit={saveProfile}
            className="w-full max-w-2xl overflow-hidden rounded-q-dialog bg-q-surface shadow-2xl"
          >
            <div className="flex items-start justify-between border-b border-q-border px-6 py-5">
              <div>
                <p className="text-q-caption font-bold text-q-accent-text">
                  إدارة الهوية والوصول
                </p>
                <h2
                  id="edit-user-title"
                  className="mt-1 text-lg font-black text-q-text"
                >
                  تعديل بيانات المستخدم
                </h2>
                <p className="mt-1 text-q-caption text-q-text-3">
                  يتم حفظ التعديل في سجل الحوكمة.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="grid h-9 w-9 place-items-center rounded-q-control text-q-text-2 hover:bg-q-surface-2"
                aria-label="إغلاق"
              >
                <X size={20} />
              </button>
            </div>
            <div className="grid gap-4 p-6 sm:grid-cols-2">
              <label className="sm:col-span-2">
                <span className="mb-1.5 block text-q-caption font-bold text-q-text-2">
                  الاسم بالعربية *
                </span>
                <input
                  required
                  name="full_name_ar"
                  defaultValue={editing.full_name_ar}
                  className="h-11 w-full rounded-q-control border border-q-border px-3 text-q-ui outline-none focus:border-q-primary"
                />
              </label>
              <label>
                <span className="mb-1.5 block text-q-caption font-bold text-q-text-2">
                  الاسم بالإنجليزية
                </span>
                <input
                  name="full_name_en"
                  defaultValue={editing.full_name_en ?? ""}
                  className="h-11 w-full rounded-q-control border border-q-border px-3 text-q-ui outline-none focus:border-q-primary"
                />
              </label>
              <label>
                <span className="mb-1.5 block text-q-caption font-bold text-q-text-2">
                  الرقم الوظيفي
                </span>
                <input
                  name="employee_no"
                  defaultValue={editing.employee_no ?? ""}
                  className="h-11 w-full rounded-q-control border border-q-border px-3 text-q-ui outline-none focus:border-q-primary"
                />
              </label>
              <label>
                <span className="mb-1.5 block text-q-caption font-bold text-q-text-2">
                  رقم الجوال
                </span>
                <input
                  dir="ltr"
                  name="mobile"
                  defaultValue={editing.mobile ?? ""}
                  className="h-11 w-full rounded-q-control border border-q-border px-3 text-q-ui outline-none focus:border-q-primary"
                />
              </label>
              <label>
                <span className="mb-1.5 block text-q-caption font-bold text-q-text-2">
                  المسمى الوظيفي
                </span>
                <input
                  name="job_title"
                  defaultValue={editing.job_title ?? ""}
                  className="h-11 w-full rounded-q-control border border-q-border px-3 text-q-ui outline-none focus:border-q-primary"
                />
              </label>
              <label className="sm:col-span-2">
                <span className="mb-1.5 block text-q-caption font-bold text-q-text-2">
                  البريد الإلكتروني
                </span>
                <input
                  disabled
                  value={editing.email}
                  className="h-11 w-full cursor-not-allowed rounded-q-control border border-q-border bg-q-bg px-3 text-q-ui text-q-text-3"
                />
                <span className="mt-1 block text-q-caption text-q-text-2">
                  يتم تغيير البريد من خلال إجراء هوية مستقل حفاظًا على أمان
                  الحساب.
                </span>
              </label>
            </div>
            <div className="flex justify-end gap-3 border-t border-q-border bg-q-bg px-6 py-4">
              <button
                type="button"
                onClick={() => setEditing(null)}
                disabled={isSubmitting}
                className="h-11 rounded-q-control border border-q-border px-4 text-q-caption font-bold text-q-text-2"
              >
                إلغاء
              </button>
              <button
                disabled={isSubmitting}
                className="h-11 rounded-q-control bg-q-primary px-5 text-q-caption font-bold text-q-on-primary shadow-sm disabled:opacity-60"
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
              className="fixed inset-0 z-50 grid place-items-center bg-[var(--q-text)]/55 p-4 backdrop-blur-sm"
              role="dialog"
              aria-modal="true"
            >
              <div className="w-full max-w-md rounded-q-card bg-q-surface p-6 shadow-2xl">
                <div className="flex items-start justify-between">
                  <span
                    className={`grid h-11 w-11 place-items-center rounded-q-control bg-q-surface-2 ${config.tone}`}
                  >
                    <Icon size={21} />
                  </span>
                  <button
                    type="button"
                    onClick={() => setPending(null)}
                    className="text-q-text-2 hover:text-q-text"
                    aria-label="إلغاء"
                  >
                    <X size={20} />
                  </button>
                </div>
                <h2 className="mt-5 text-q-body font-black text-q-text">
                  {config.label}
                </h2>
                <p className="mt-2 text-q-caption leading-6 text-q-text-3">
                  {config.description}
                </p>
                <p className="mt-3 rounded-q-control bg-q-bg px-3 py-2 text-q-caption font-bold text-q-text-2">
                  {pending.user.full_name_ar}
                </p>
                {pending.action === "update_user_status" && (
                  <label className="mt-4 block text-q-caption font-bold text-q-text-2">
                    خليفة المهام المفتوحة
                    <select
                      value={offboardingSuccessor}
                      onChange={(event) => setOffboardingSuccessor(event.target.value)}
                      className="mt-2 h-11 w-full rounded-q-control border border-q-border bg-q-surface px-3 text-q-caption"
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
                    className="h-11 rounded-q-control border border-q-border px-4 text-q-caption font-bold text-q-text-2"
                  >
                    إلغاء
                  </button>
                  <button
                    type="button"
                    onClick={runAction}
                    disabled={isSubmitting}
                    className="h-11 rounded-q-control bg-q-primary px-4 text-q-caption font-bold text-q-on-primary disabled:opacity-60"
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
