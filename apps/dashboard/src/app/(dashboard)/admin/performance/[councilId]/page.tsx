import type { Metadata } from "next";
import Link from "next/link";
import { academicYearLabel, type Activity, type CouncilPerformance } from "@/features/performance/model/performance";
import { CouncilPerformanceView } from "@/features/performance/ui/council-performance";
import { InlineMessage } from "@/shared/ui/inline-message";
import { PageHeader } from "@/shared/ui/page-header";
import { academicYearParam, loadPerformance } from "../load";

export const metadata: Metadata = { title: "أداء المجلس" };
export const dynamic = "force-dynamic";

const failureText = {
  denied: "هذا المجلس خارج المجالس التي تقودها أو تتابعها.",
  missing: "لم نجد هذا المجلس.",
  error: "تعذر تحميل أداء المجلس الآن.",
} as const;

export default async function CouncilPerformancePage({ params, searchParams }: {
  params: Promise<{ councilId: string }>;
  searchParams: Promise<{ year?: string | string[] }>;
}) {
  const { councilId } = await params;
  const year = academicYearParam((await searchParams).year);
  const body = { p_council_id: councilId, p_academic_year: year };
  const [result, details] = await Promise.all([
    loadPerformance<CouncilPerformance>("get_council_performance_v2", body),
    loadPerformance<Activity>("get_council_activity_v2", body),
  ]);
  const back = <Link href="/admin/performance" className="inline-flex min-h-11 items-center text-q-ui font-semibold text-q-link hover:underline">المتابعة والأداء</Link>;

  if (!("data" in result)) {
    return (
      <div>
        <nav aria-label="المسار" className="mb-1">{back}</nav>
        <PageHeader title="أداء المجلس" description="انتظام المجلس ومؤشراته في العام الجامعي." />
        <div className="flex flex-wrap items-center gap-3">
          <InlineMessage tone="error">{failureText[result.failure]}</InlineMessage>
          {result.failure === "error" && <Link href={`/admin/performance/${councilId}`} className="inline-flex min-h-11 items-center text-q-ui font-bold text-q-link hover:underline">إعادة المحاولة</Link>}
        </div>
      </div>
    );
  }

  const { council, academic_year_start: start } = result.data;
  return (
    <div>
      <nav aria-label="المسار" className="mb-1 flex flex-wrap items-center gap-2 text-q-caption text-q-text-3">
        {back}{council.parent_name_ar && <><span aria-hidden="true">/</span><span>{council.parent_name_ar}</span></>}
      </nav>
      <PageHeader title={council.name_ar} description={`أداء المجلس في العام الجامعي ${academicYearLabel(start)}.`} />
      <CouncilPerformanceView data={result.data} activity={"data" in details ? details.data : null} />
    </div>
  );
}
