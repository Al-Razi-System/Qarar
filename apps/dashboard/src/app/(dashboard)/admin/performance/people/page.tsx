import type { Metadata } from "next";
import Link from "next/link";
import { academicYearLabel, type PeopleFollowUp } from "@/features/performance/model/performance";
import { PeopleFollowUpView } from "@/features/performance/ui/people-follow-up";
import { SectionNav } from "@/features/performance/ui/section-nav";
import { InlineMessage } from "@/shared/ui/inline-message";
import { PageHeader } from "@/shared/ui/page-header";
import { academicYearParam, loadPerformance } from "../load";

export const metadata: Metadata = { title: "متابعة الأعضاء" };
// The rows are the signed-in person's own scope; never serve another user's cached page.
export const dynamic = "force-dynamic";

export default async function PeopleFollowUpPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const result = await loadPerformance<PeopleFollowUp>("get_my_people_follow_up_v2", { p_academic_year: academicYearParam(params.year) });
  const data = "data" in result ? result.data : null;
  const council = typeof params.council === "string" && /^[0-9a-f-]{36}$/.test(params.council) ? params.council : "";
  return (
    <div>
      <SectionNav current="people" />
      <PageHeader
        title="متابعة الأعضاء"
        description={data && data.summary.total > 0
          ? `${data.summary.total} عضوًا في مجالسك للعام الجامعي ${academicYearLabel(data.academic_year_start)}: حضورهم، ومشاركتهم في التصويت، وتوقيعهم للمحاضر، وتنفيذهم للتكليفات.`
          : "حضور أعضاء المجالس التي تقودها أو تتابعها، ومشاركتهم في التصويت، وتوقيعهم للمحاضر، وتنفيذهم للتكليفات."}
      />
      {data ? <PeopleFollowUpView data={data} initialCouncilId={council} /> : (
        <div className="flex flex-wrap items-center gap-3">
          <InlineMessage tone="error">تعذر تحميل متابعة الأعضاء الآن.</InlineMessage>
          <Link href="/admin/performance/people" className="inline-flex min-h-11 items-center text-q-ui font-bold text-q-link hover:underline">إعادة المحاولة</Link>
        </div>
      )}
    </div>
  );
}
