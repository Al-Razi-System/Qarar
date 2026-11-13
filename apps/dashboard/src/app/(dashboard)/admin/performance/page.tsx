import type { Metadata } from "next";
import Link from "next/link";
import { academicYearLabel, type Overview } from "@/features/performance/model/performance";
import { OversightOverview } from "@/features/performance/ui/oversight-overview";
import { InlineMessage } from "@/shared/ui/inline-message";
import { PageHeader } from "@/shared/ui/page-header";
import { academicYearParam, loadPerformance } from "./load";

export const metadata: Metadata = { title: "المتابعة والأداء" };
// The rows are the signed-in person's own scope; never serve another user's cached page.
export const dynamic = "force-dynamic";

const action = "inline-flex min-h-11 items-center rounded-q-control border border-q-border-strong bg-q-surface px-4 text-q-ui font-semibold text-q-link hover:bg-q-surface-2";

export default async function PerformancePage({ searchParams }: { searchParams: Promise<{ year?: string | string[] }> }) {
  const year = academicYearParam((await searchParams).year);
  const result = await loadPerformance<Overview>("get_my_oversight_overview_v2", { p_academic_year: year });
  const data = "data" in result ? result.data : null;
  const summary = data?.summary;
  return (
    <div>
      <PageHeader
        title="المتابعة والأداء"
        description={summary && summary.total > 0
          ? `تقود أو تتابع ${summary.total} مجلسًا في العام الجامعي ${academicYearLabel(data.academic_year_start)}: ${summary.regular} منتظمة، ${summary.attention} تحتاج متابعة، ${summary.stalled} متعثرة.`
          : "انتظام المجالس التي تقودها أو تتابعها: ما انعقد في موعده، وما تأخر، وما لم ينعقد."}
        actions={<>
          {data?.academic_years.filter((start) => start !== data.academic_year_start).map((start) => (
            <Link key={start} href={`/admin/performance?year=${start}`} className={action}>عام {academicYearLabel(start)}</Link>
          ))}
          <Link href="/admin/violations" className={action}>التجاوزات المفتوحة</Link>
        </>}
      />
      {data ? <OversightOverview data={data} /> : (
        <div className="flex flex-wrap items-center gap-3">
          <InlineMessage tone="error">تعذر تحميل المتابعة الآن.</InlineMessage>
          <Link href="/admin/performance" className="inline-flex min-h-11 items-center text-q-ui font-bold text-q-link hover:underline">إعادة المحاولة</Link>
        </div>
      )}
    </div>
  );
}
