"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  ChevronDown,
  CircleHelp,
  FileCheck2,
  BookOpenCheck,
  LayoutDashboard,
  LogOut,
  Menu,
  Search,
  Settings,
  ShieldCheck,
  Users,
} from "lucide-react";
import { Logo } from "@/shared/ui/logo";

const nav = [
  { href: "/admin", label: "لوحة المعلومات", icon: LayoutDashboard },
  { href: "/admin/users", label: "المستخدمون", icon: Users },
  { href: "/admin/permissions", label: "الأدوار والصلاحيات", icon: ShieldCheck },
  { href: "/admin/regulations", label: "اللوائح والمسارات", icon: BookOpenCheck },
  { href: "/admin/requests", label: "طلبات الاعتماد", icon: FileCheck2 },
];

const secondaryNav = [
  { href: "#", label: "إعدادات النظام", icon: Settings },
  { href: "#", label: "مركز المساعدة", icon: CircleHelp },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";

  return (
    <div className="min-h-screen bg-[#f3f6fa]">
      <aside className="fixed inset-y-0 right-0 z-30 hidden w-[248px] flex-col border-l border-[#1b2b46] bg-[#07152b] text-white lg:flex">
        <div className="flex h-[78px] items-center border-b border-white/8 px-5">
          <div className="w-full">
            <Logo inverse />
          </div>
        </div>

        <div className="px-3 py-4">
          <p className="mb-2 px-3 text-[9px] font-bold tracking-wide text-white/35">
            مساحة الإدارة
          </p>
          <nav className="space-y-1">
            {nav.map((item) => {
              const active =
                item.href === "/admin"
                  ? pathname === "/admin"
                  : item.href === "/admin/users"
                    ? pathname === item.href
                  : pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`group relative flex h-11 items-center gap-3 rounded-xl px-3 text-[12px] transition ${
                    active
                      ? "bg-[#0872df] font-bold text-white shadow-[0_8px_20px_rgba(0,102,204,.24)]"
                      : "text-white/58 hover:bg-white/6 hover:text-white"
                  }`}
                >
                  {active && <span className="absolute right-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-l-full bg-[#ff7a00]" />}
                  <span className={`grid h-8 w-8 place-items-center rounded-lg transition ${active ? "bg-white/14 text-white" : "text-white/50 group-hover:bg-white/7 group-hover:text-white"}`}>
                    <Icon size={16} />
                  </span>
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="mt-auto border-t border-white/8 p-3">
          <nav className="space-y-1">
            {secondaryNav.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className="flex h-10 items-center gap-3 rounded-xl px-3 text-[12px] text-white/52 transition hover:bg-white/6 hover:text-white"
                >
                  <span className="grid h-7 w-7 place-items-center rounded-lg text-white/45">
                    <Icon size={15} />
                  </span>
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="mt-3 flex items-center gap-2.5 rounded-xl border border-white/8 bg-white/6 p-2.5">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-[#0872df] text-xs font-black shadow-[0_8px_18px_rgba(0,102,204,.22)]">
              مم
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] font-bold">مها محمد</p>
              <p className="mt-0.5 truncate text-[9px] text-white/42">
                مدير النظام
              </p>
            </div>
            <button className="grid h-8 w-8 place-items-center rounded-lg text-white/38 transition hover:bg-white/7 hover:text-white" aria-label="تسجيل الخروج">
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>

      <div className="lg:mr-[248px]">
        <header className="sticky top-0 z-20 flex h-[78px] items-center gap-4 border-b border-[#e4ebf3] bg-white/92 px-5 backdrop-blur-xl lg:px-8">
          <button className="text-[#52647a] lg:hidden" aria-label="فتح القائمة">
            <Menu size={23} />
          </button>
          <div className="relative hidden w-full max-w-[360px] sm:block">
            <Search
              size={17}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#8b9aad]"
            />
            <input
              placeholder="بحث سريع في المنصة..."
              className="h-11 w-full rounded-xl border border-[#e3eaf2] bg-[#f8fafc] pr-10 pl-4 text-xs outline-none transition focus:border-[#9bc9f2] focus:bg-white focus:ring-4 focus:ring-[#0066cc]/5"
            />
          </div>
          <div className="mr-auto flex items-center gap-2">
            <button className="relative grid h-10 w-10 place-items-center rounded-xl border border-[#e5ebf2] text-[#52647a] hover:bg-[#f6f9fc]">
              <Bell size={18} />
              <span className="absolute left-2.5 top-2 h-2 w-2 rounded-full border-2 border-white bg-[#ff7a00]" />
            </button>
            <button className="hidden items-center gap-2 rounded-xl border border-[#e5ebf2] px-3 py-2 sm:flex">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#e7f2ff] text-[10px] font-black text-[#0066cc]">
                مم
              </span>
              <span className="text-xs font-bold text-[#23334b]">مها محمد</span>
              <ChevronDown size={14} className="text-[#8b9aad]" />
            </button>
          </div>
        </header>
        <main className="px-5 py-7 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
