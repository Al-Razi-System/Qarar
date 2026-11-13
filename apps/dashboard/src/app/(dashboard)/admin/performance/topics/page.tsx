import type { Metadata } from "next";
import Link from "next/link";
import { academicYearLabel, type TopicsFollowUp } from "@/features/performance/model/performance";
import { SectionNav } from "@/features/performance/ui/section-nav";
import { TopicsFollowUpView, type TopicsFilter } from "@/features/performance/ui/topics-follow-up";
import { InlineMessage } from "@/shared/ui/inline-message";
import { PageHeader } from "@/shared/ui/page-header";
import { academicYearParam, loadPerformance } from "../load";

export const metadata: Metadata = { title: "متابعة الموضوعات" };
// The rows are the signed-in person's own scope; never serve another user's cached page.
export const dynamic = "force-dynamic";

const one = (value: string | string[] | undefined) => (typeof value === "string" ? value : "");

export default async function TopicsFollowUpPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const result = await loadPerformance<TopicsFollowUp>("get_my_topics_follow_up_v2", { p_academic_year: academicYearParam(params.year) });
  const data = "data" in result ? result.data : null;
  // A figure on another dashboard may open this page already filtered.
  const governance = one(params.governance);
  const initial: Partial<TopicsFilter> = {
    councilId: /^[0-9a-f-]{36}$/.test(one(params.council)) ? one(params.council) : "",
    governance: governance === "ungoverned" || governance === "governed" ? governance : "all",
  };
  return (
    <div>
      <SectionNav current="topics" />
      <PageHeader
        title="متابعة الموضوعات"
        description={data && data.summary.total > 0
          ? `${data.summary.total} موضوعًا في مجالسك للعام الجامعي ${academicYearLabel(data.academic_year_start)}: أين يقف كل موضوع، وكم انتظر، وما تقرر فيه.`
          : "أين يقف كل موضوع في المجالس التي تقودها أو تتابعها، وكم انتظر، وما تقرر فيه."}
      />
      {data ? <TopicsFollowUpView data={data} initial={initial} /> : (
        <div className="flex flex-wrap items-center gap-3">
          <InlineMessage tone="error">تعذر تحميل متابعة الموضوعات الآن.</InlineMessage>
          <Link href="/admin/performance/topics" className="inline-flex min-h-11 items-center text-q-ui font-bold text-q-link hover:underline">إعادة المحاولة</Link>
        </div>
      )}
    </div>
  );
}
