"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, BookOpenCheck, Calendar, ChevronDown, CircleHelp, ClipboardList, FileText, KeyRound, LayoutDashboard, LogOut, Menu, Search, Settings, ShieldCheck, Users, Workflow, X } from "lucide-react";
import { Logo } from "@/shared/ui/logo";

const navGroups = [
  { label: "نظرة عامة", items: [{ href: "/admin", label: "لوحة التحكم", icon: LayoutDashboard }] },
  { label: "الحوكمة والمعاملات", items: [
    { href: "/admin/regulations", label: "اللوائح ومسارات الاعتماد", icon: BookOpenCheck },
    { href: "/admin/topics", label: "المعاملات والموضوعات", icon: FileText },
    { href: "/admin/meetings", label: "الاجتماعات والقرارات", icon: Calendar },
  ]},
  { label: "الإدارة والتشغيل", items: [
    { href: "/admin/users", label: "المستخدمون", icon: Users },
    { href: "/admin/permissions", label: "الأدوار والصلاحيات", icon: ShieldCheck },
    { href: "/admin/delegations", label: "التفويضات والإنابة", icon: KeyRound },
    { href: "/admin/sessions", label: "مراقبة الجلسات", icon: Workflow },
    { href: "/admin/audit", label: "سجل التدقيق", icon: ClipboardList },
  ]},
  { label: "إعدادات الاجتماعات", items: [
    { href: "/admin/settings/meeting-types", label: "أنواع الاجتماعات", icon: Calendar },
  ]},
];

type NavigationProps = { pathname: string; onNavigate?: () => void };

function Navigation({ pathname, onNavigate }: NavigationProps) {
  const active = (href: string) => href === "/admin" ? pathname === href : pathname.startsWith(href);
  return <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-5">
    {navGroups.map((group) => <div key={group.label} className="mb-6">
      <p className="mb-2 px-3 text-[11px] font-bold tracking-wide text-[#91a0b2]">{group.label}</p>
      <nav aria-label={group.label} className="space-y-1">
        {group.items.map((item) => { const Icon = item.icon; return <Link key={item.href} href={item.href} onClick={onNavigate} aria-current={active(item.href) ? "page" : undefined} className={`group relative flex min-h-11 items-center gap-3 rounded-xl px-3 text-[13px] transition ${active(item.href) ? "bg-[#0872df] font-bold text-white shadow-[0_8px_20px_rgba(0,102,204,.20)]" : "text-[#52647a] hover:bg-[#f1f6fb] hover:text-[#17283f]"}`}>
          {active(item.href) && <span className="absolute right-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-l-full bg-[#ff8a1f]" />}
          <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${active(item.href) ? "bg-white/15 text-white" : "bg-[#f2f6fa] text-[#718399] group-hover:bg-white group-hover:text-[#0066cc]"}`}><Icon size={16} /></span><span>{item.label}</span>
        </Link>; })}
      </nav>
    </div>)}
  </div>;
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

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

  return <div dir="rtl" className="min-h-screen bg-[#f4f7fb] text-[#14233a]">
    {mobileNavigationOpen && <button type="button" aria-label="إغلاق القائمة" onClick={() => setMobileNavigationOpen(false)} className="fixed inset-0 z-40 bg-[#071b39]/45 backdrop-blur-sm lg:hidden" />}
    <aside className={`fixed inset-y-0 right-0 z-50 flex w-[min(86vw,320px)] flex-col border-l border-[#dbe5ef] bg-white text-[#17283f] shadow-[-8px_0_30px_rgba(15,42,72,.12)] transition-transform duration-200 lg:hidden ${mobileNavigationOpen ? "translate-x-0" : "translate-x-full"}`}>
      <div className="flex h-[72px] items-center justify-between border-b border-[#e8eef4] px-5"><Logo /><button type="button" onClick={() => setMobileNavigationOpen(false)} aria-label="إغلاق القائمة" className="grid h-10 w-10 place-items-center rounded-xl text-[#52647a] hover:bg-[#f2f6fa]"><X size={20} /></button></div>
      <Navigation pathname={pathname} onNavigate={() => setMobileNavigationOpen(false)} />
      <div className="border-t border-[#e8eef4] bg-[#fbfcfe] p-4"><button type="button" onClick={() => void logout()} disabled={loggingOut} className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-[#dce6ef] bg-white text-xs font-bold text-[#52647a] hover:text-[#0066cc] disabled:opacity-60"><LogOut size={15} />{loggingOut ? "جارٍ تسجيل الخروج…" : "تسجيل الخروج"}</button></div>
    </aside>

    <aside className="fixed inset-y-0 right-0 z-30 hidden w-[272px] flex-col border-l border-[#dbe5ef] bg-white text-[#17283f] shadow-[-8px_0_30px_rgba(15,42,72,.04)] lg:flex">
      <div className="flex h-[82px] items-center border-b border-[#e8eef4] px-6"><Logo /></div>
      <Navigation pathname={pathname} />
      <div className="mt-auto border-t border-[#e8eef4] bg-[#fbfcfe] p-4"><div className="mb-3 flex items-center gap-2 rounded-xl px-2 text-[11px] text-[#6f8095]"><Settings size={15} /> إعدادات النظام <CircleHelp className="mr-auto" size={15} /></div><div className="flex items-center gap-2.5 rounded-xl border border-[#dce6ef] bg-white p-2.5 shadow-sm"><div className="grid h-9 w-9 place-items-center rounded-xl bg-[#0872df] text-xs font-black text-white">مم</div><div className="min-w-0 flex-1"><p className="truncate text-[11px] font-bold text-[#22344c]">الحساب الحالي</p><p className="mt-0.5 truncate text-[10px] text-[#8998aa]">جلسة إدارية</p></div><button type="button" onClick={() => void logout()} disabled={loggingOut} aria-label="تسجيل الخروج" className="grid h-8 w-8 place-items-center rounded-lg text-[#8191a4] hover:bg-[#f1f6fb] hover:text-[#0066cc] disabled:opacity-60"><LogOut size={15} /></button></div></div>
    </aside>
    <div className="lg:mr-[272px]">
      <header className="sticky top-0 z-20 flex h-[72px] items-center gap-3 border-b border-[#e1e9f2] bg-white/95 px-4 backdrop-blur-xl sm:px-5 lg:h-[82px] lg:px-8"><button type="button" onClick={() => setMobileNavigationOpen(true)} className="grid h-10 w-10 place-items-center rounded-xl text-[#52647a] hover:bg-[#f2f6fa] lg:hidden" aria-label="فتح القائمة"><Menu size={23} /></button><form onSubmit={submitSearch} className="relative hidden w-full max-w-[420px] sm:block"><Search size={17} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#8b9aad]" /><input value={search} onChange={(event) => setSearch(event.target.value)} aria-label="بحث في الموضوعات" placeholder="ابحث في الموضوعات…" className="h-11 w-full rounded-xl border border-[#e3eaf2] bg-[#f8fafc] pr-10 pl-4 text-xs outline-none focus:border-[#9bc9f2] focus:bg-white focus:ring-4 focus:ring-[#0066cc]/5" /></form><div className="mr-auto flex items-center gap-2">
        <div className="relative"><button type="button" onClick={() => { setNotificationsOpen((open) => !open); setProfileOpen(false); }} aria-expanded={notificationsOpen} aria-label="الإشعارات" className="relative grid h-10 w-10 place-items-center rounded-xl border border-[#e5ebf2] text-[#52647a] hover:bg-[#f6f9fc]"><Bell size={18} /><span className="absolute left-2.5 top-2 h-2 w-2 rounded-full border-2 border-white bg-[#ff7a00]" /></button>{notificationsOpen && <div role="status" className="absolute left-0 top-12 z-30 w-72 rounded-2xl border border-[#dce7f1] bg-white p-4 text-right shadow-xl"><strong className="text-xs text-[#0a1330]">الإشعارات</strong><p className="mt-2 text-[11px] leading-5 text-[#617287]">لا توجد إشعارات جديدة الآن. ستظهر هنا تنبيهات المهام والمسارات المطلوبة منك.</p></div>}</div>
        <div className="relative"><button type="button" onClick={() => { setProfileOpen((open) => !open); setNotificationsOpen(false); }} aria-expanded={profileOpen} className="hidden items-center gap-2 rounded-xl border border-[#e5ebf2] px-3 py-2 sm:flex"><span className="grid h-7 w-7 place-items-center rounded-lg bg-[#e7f2ff] text-[10px] font-black text-[#0066cc]">مم</span><span className="text-xs font-bold text-[#23334b]">الحساب الحالي</span><ChevronDown size={14} className="text-[#8b9aad]" /></button>{profileOpen && <div className="absolute left-0 top-12 z-30 w-52 rounded-2xl border border-[#dce7f1] bg-white p-2 shadow-xl"><p className="px-3 py-2 text-[10px] text-[#718196]">يمكنك إدارة بيانات الحساب من صفحة المستخدمين.</p><button type="button" onClick={() => void logout()} disabled={loggingOut} className="flex h-9 w-full items-center gap-2 rounded-xl px-3 text-right text-[11px] font-bold text-[#52647a] hover:bg-[#f2f6fa] hover:text-[#0066cc]"><LogOut size={15} />{loggingOut ? "جارٍ الخروج…" : "تسجيل الخروج"}</button></div>}</div>
      </div></header>
      <main className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
    </div>
  </div>;
}
