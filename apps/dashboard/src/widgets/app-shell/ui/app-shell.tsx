"use client";

import { NotificationBell } from "./notification-bell";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BookOpenCheck, ChartNoAxesColumn, Eye, TriangleAlert, Building2, Calendar, ChevronDown, ClipboardList, FileText, GitBranch, KeyRound, LayoutDashboard, ListChecks, LogOut, Menu, MessageSquareText, Search, ShieldCheck, Users, Workflow, X } from "lucide-react";
import { Logo } from "@/shared/ui/logo";
import { SelfAvatar } from "@/shared/ui/self-avatar";

const navGroups = [
  { label: "نظرة عامة", items: [{ href: "/admin", label: "لوحة التحكم", icon: LayoutDashboard }] },
  { label: "حسابي", items: [{ href: "/admin/account", label: "حسابي الشخصي", icon: Users }, { href: "/admin/tasks", label: "مهامي", icon: ListChecks }] },
  { label: "الحوكمة والمعاملات", items: [
    { href: "/admin/councils", label: "المجالس والوحدات", icon: Building2, requiredAny: ["governance.units.read"] },
    { href: "/admin/organizational-units", label: "الوحدات التنظيمية", icon: Building2, requiredAny: ["governance.units.read"] },
    { href: "/admin/regulations", label: "اللوائح والبنود", icon: BookOpenCheck, requiredAny: ["governance.policies.read"] },
    { href: "/admin/workflows", label: "مسارات الموضوعات", icon: GitBranch, requiredAny: ["governance.workflows.manage"] },
    { href: "/admin/governance-model", label: "تصنيفات الموضوعات", icon: Workflow, requiredAny: ["governance.regulations.manage"] },
    { href: "/admin/topics", label: "المعاملات والموضوعات", icon: FileText, requiredAny: ["topics.read", "topics.create"] },
    { href: "/admin/meetings", label: "الاجتماعات والقرارات", icon: Calendar, requiredAny: ["meetings.read"] },
    { href: "/admin/follow-up", label: "متابعة القرارات", icon: ClipboardList, requiredAny: ["decisions.read", "execution.tasks.read", "execution.tasks.manage"] },
    // Everyone may open these; the contracts show only councils the user leads or follows.
    { href: "/admin/performance", label: "المتابعة والأداء", icon: ChartNoAxesColumn },
    { href: "/admin/violations", label: "التجاوزات", icon: TriangleAlert },
  ]},
  { label: "الإدارة والتشغيل", items: [
    { href: "/admin/users", label: "المستخدمون", icon: Users, requiredAny: ["iam.users.read"] },
    { href: "/admin/permissions", label: "الأدوار والصلاحيات", icon: ShieldCheck, requiredAny: ["iam.roles.read", "iam.permissions.read"] },
    { href: "/admin/delegations", label: "التفويضات والإنابة", icon: KeyRound, requiredAny: ["iam.roles.assign"] },
    { href: "/admin/oversight", label: "إسناد المتابعة", icon: Eye, requiredAny: ["governance.oversight.manage"] },
    { href: "/admin/sessions", label: "مراقبة الجلسات", icon: Workflow, requiredAny: ["iam.sessions.manage", "iam.users.manage"] },
    { href: "/admin/audit", label: "سجل التدقيق", icon: ClipboardList, requiredAny: ["audit.logs.read"] },
  ]},
  { label: "إعدادات الاجتماعات", items: [
    { href: "/admin/settings/meeting-types", label: "أنواع الاجتماعات", icon: Calendar, adminOnly: true },
    { href: "/admin/settings/notifications", label: "إشعارات واتساب", icon: MessageSquareText, adminOnly: true },
  ]},
];

export type AppAccessContext = {
  user_id: string;
  full_name_ar?: string | null;
  full_name_en?: string | null;
  email?: string | null;
  job_title?: string | null;
  organization_name_ar?: string | null;
  is_system_admin?: boolean;
  permissions?: string[];
  roles?: Array<{ code?: string; name_ar?: string; membership_title?: string | null }>;
};

type NavigationProps = { pathname: string; access: AppAccessContext; onNavigate?: () => void };

function hasAdministrativeRole(access: AppAccessContext) {
  return Boolean(access.is_system_admin || access.roles?.some((role) => role.code === "governance_admin"));
}

function canOpenItem(access: AppAccessContext, item: { href: string; requiredAny?: string[]; adminOnly?: boolean }) {
  if (access.is_system_admin) return true;
  if (item.adminOnly) return hasAdministrativeRole(access);
  return !item.requiredAny?.length || item.requiredAny.some((permission) => access.permissions?.includes(permission));
}

function Navigation({ pathname, access, onNavigate }: NavigationProps) {
  const active = (href: string) => href === "/admin" ? pathname === href : pathname.startsWith(href);
  return <div className="thin-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-4">
    {navGroups.map((group) => ({ ...group, items: group.items.filter((item) => canOpenItem(access, item)) })).filter((group) => group.items.length).map((group) => <div key={group.label} className="mb-5">
      <p className="mb-1 px-3 text-q-caption font-semibold text-q-text-3">{group.label}</p>
      <nav aria-label={group.label} className="space-y-0.5">
        {group.items.map((item) => { const Icon = item.icon; const current = active(item.href); return <Link key={item.href} href={item.href} onClick={onNavigate} aria-current={current ? "page" : undefined} className={`flex min-h-11 items-center gap-3 rounded-q-control px-3 text-q-ui transition-colors ${current ? "bg-q-surface font-semibold text-q-link" : "text-q-text-2 hover:bg-q-surface/60 hover:text-q-text"}`}>
          <Icon size={18} aria-hidden="true" className="shrink-0" /><span className="min-w-0 flex-1 truncate">{item.label}</span>{current && <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-q-accent" />}
        </Link>; })}
      </nav>
    </div>)}
  </div>;
}

export function AppShell({ children, access }: { children: ReactNode; access: AppAccessContext }) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const displayName = access.full_name_ar?.trim() || access.full_name_en?.trim() || access.email || "المستخدم الحالي";
  const primaryRole = [...(access.roles ?? [])].sort((left, right) => {
    const priority: Record<string, number> = { governance_admin: 0, council_chair: 1, council_rapporteur: 2, council_member: 3 };
    return (priority[left.code ?? ""] ?? 99) - (priority[right.code ?? ""] ?? 99);
  })[0];
  const roleLabel = access.is_system_admin
    ? "مسؤول النظام"
    : primaryRole?.membership_title
      || primaryRole?.name_ar
      || access.job_title
      || "مستخدم النظام";
  const currentItem = navGroups.flatMap((group) => group.items).find((item) =>
    item.href === "/admin" ? pathname === item.href : pathname.startsWith(item.href),
  );
  const canAccessCurrentPath = !currentItem || canOpenItem(access, currentItem);

  useEffect(() => {
    if (!canAccessCurrentPath) router.replace("/admin");
  }, [canAccessCurrentPath, router]);

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = search.trim();
    window.location.assign(query ? `/admin/topics?query=${encodeURIComponent(query)}` : "/admin/topics");
  }

  async function logout() {
    setLoggingOut(true);
    try { await fetch("/api/auth/logout", { method: "POST" }); }
    finally { router.replace("/login"); router.refresh(); }
  }

  if (!canAccessCurrentPath) {
    return <div dir="rtl" className="grid min-h-screen place-items-center bg-q-bg text-q-ui font-bold text-q-text-2">جارٍ توجيهك إلى مساحة العمل المتاحة لحسابك…</div>;
  }

  const iconButton = "grid h-11 w-11 place-items-center rounded-q-control";
  const menuItem = "flex min-h-11 w-full items-center gap-2 rounded-q-control px-3 text-right text-q-ui text-q-text hover:bg-q-surface-2 disabled:opacity-60";
  const organization = access.organization_name_ar?.trim();

  return <div dir="rtl" className="min-h-screen bg-q-bg text-q-text">
    {mobileNavigationOpen && <button type="button" aria-label="إغلاق القائمة" onClick={() => setMobileNavigationOpen(false)} className="fixed inset-0 z-40 bg-q-scrim lg:hidden" />}
    <aside className={`fixed inset-y-0 right-0 z-50 flex w-[min(86vw,320px)] flex-col bg-q-rail text-q-text shadow-xl transition-transform duration-200 lg:hidden ${mobileNavigationOpen ? "translate-x-0" : "translate-x-full"}`}>
      <div className="flex h-16 items-center justify-between px-4"><Logo /><button type="button" onClick={() => setMobileNavigationOpen(false)} aria-label="إغلاق القائمة" className={`${iconButton} text-q-text-2 hover:bg-q-surface`}><X size={20} aria-hidden="true" /></button></div>
      <Navigation pathname={pathname} access={access} onNavigate={() => setMobileNavigationOpen(false)} />
      <div className="border-t border-q-rail-border p-3"><button type="button" onClick={() => void logout()} disabled={loggingOut} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-q-control border border-q-rail-border bg-q-surface text-q-ui font-semibold text-q-text-2 hover:text-q-text disabled:opacity-60"><LogOut size={18} aria-hidden="true" />{loggingOut ? "جارٍ تسجيل الخروج…" : "تسجيل الخروج"}</button></div>
    </aside>

    <aside className="fixed inset-y-0 right-0 z-30 hidden w-64 flex-col border-l border-q-rail-border bg-q-rail text-q-text lg:flex">
      <div className="flex h-16 items-center px-5"><Logo /></div>
      <Navigation pathname={pathname} access={access} />
      {organization && <p className="truncate border-t border-q-rail-border px-5 py-3 text-q-caption text-q-text-2">{organization}</p>}
    </aside>
    <div className="lg:mr-64">
      <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-q-border bg-q-surface px-4 sm:px-6 lg:px-8">
        <button type="button" onClick={() => setMobileNavigationOpen(true)} className={`${iconButton} text-q-text-2 hover:bg-q-surface-2 lg:hidden`} aria-label="فتح القائمة"><Menu size={22} aria-hidden="true" /></button>
        <form onSubmit={submitSearch} className="relative hidden w-full max-w-md sm:block"><Search size={18} aria-hidden="true" className="absolute right-3 top-1/2 -translate-y-1/2 text-q-text-3" /><input value={search} onChange={(event) => setSearch(event.target.value)} aria-label="بحث في الموضوعات" placeholder="ابحث في الموضوعات…" className="h-11 w-full rounded-q-control border border-q-border bg-q-bg pr-10 pl-4 text-q-ui text-q-text outline-none placeholder:text-q-text-3 focus:border-q-primary focus:bg-q-surface" /></form>
        <div className="mr-auto flex items-center gap-2">
          <NotificationBell open={notificationsOpen} onOpenChange={(open) => { setNotificationsOpen(open); if (open) setProfileOpen(false); }} />
          <div className="relative">
            <button type="button" onClick={() => { setProfileOpen((open) => !open); setNotificationsOpen(false); }} aria-expanded={profileOpen} aria-label={`قائمة الحساب: ${displayName}`} className="flex min-h-11 items-center gap-2 rounded-q-control px-1 hover:bg-q-surface-2 sm:px-2"><SelfAvatar key={access.user_id} name={displayName} /><span className="hidden min-w-0 text-right sm:block"><span className="block max-w-44 truncate text-q-ui font-bold text-q-text">{displayName}</span><span className="block max-w-44 truncate text-q-caption text-q-text-3">{roleLabel}</span></span><ChevronDown size={16} aria-hidden="true" className="hidden text-q-text-3 sm:block" /></button>
            {profileOpen && <div className="absolute left-0 top-14 z-30 w-64 rounded-q-card border border-q-border bg-q-surface p-2 shadow-xl">
              <div className="border-b border-q-border px-3 pb-2"><p className="truncate text-q-ui font-bold text-q-text">{displayName}</p><p className="truncate text-q-caption text-q-text-3">{access.email}</p><p className="text-q-caption font-bold text-q-link">{roleLabel}</p></div>
              <Link href="/admin/account" onClick={() => setProfileOpen(false)} className={`${menuItem} mt-1`}><Users size={18} aria-hidden="true" />حسابي الشخصي</Link>
              <button type="button" onClick={() => void logout()} disabled={loggingOut} className={menuItem}><LogOut size={18} aria-hidden="true" />{loggingOut ? "جارٍ الخروج…" : "تسجيل الخروج"}</button>
            </div>}
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8">{children}</main>
    </div>
  </div>;
}
