import type { Metadata } from "next";
import { SessionsWorkspace } from "@/features/sessions/ui/sessions-workspace";

export const metadata: Metadata = { title: "جلساتي والأجهزة المرتبطة" };

export default function SessionsPage() {
  return (
    <div className="mx-auto max-w-[1480px]">
      <div className="mb-7">
        <p className="mb-1.5 text-[11px] font-bold text-[#ff7a00]">
          إدارة الهوية والوصول
        </p>
        <h1 className="text-2xl font-black text-[#0a1330]">
          جلساتي والأجهزة المرتبطة
        </h1>
        <p className="mt-2 text-xs leading-6 text-[#718196]">
          راجع جلسات حسابك الفعلية وأبطل أي جهاز مشبوه أو مفقود فوراً.
        </p>
      </div>
      <SessionsWorkspace />
    </div>
  );
}
