import type { Metadata } from "next";
import { DelegationsWorkspace } from "@/features/delegations/ui/delegations-workspace";
import { PageHeader } from "@/shared/ui/page-header";

export const metadata: Metadata = { title: "التفويضات والإنابة" };

export default function DelegationsPage() {
  return <div className="mx-auto max-w-[1480px]"><PageHeader eyebrow="إدارة الهوية والوصول" title="التفويضات والإنابة" description="إدارة ومتابعة التفويضات الزمنية المؤقتة لصلاحيات العضويات في المجالس واللجان." meta={<span className="inline-flex rounded-full bg-[#fff5e9] px-3 py-1.5 text-[10px] font-bold text-[#a75b13]">صلاحيات مؤقتة · تاريخ بداية ونهاية · سجل تدقيق</span>} /><DelegationsWorkspace /></div>;
}
