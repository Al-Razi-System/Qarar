import type { Metadata } from "next";
import { DecisionFollowUpWorkspace } from "@/features/tasks/ui/decision-follow-up-workspace";
import { PageHeader } from "@/shared/ui/page-header";

export const metadata: Metadata = { title: "متابعة القرارات" };

export default function DecisionFollowUpPage() {
  return (
    <div className="mx-auto max-w-[1480px]">
      <PageHeader eyebrow="التنفيذ والمتابعة" title="متابعة القرارات" description="قرارات المجالس ومهامها، والمتأخر منها، وإغلاق القرار بعد إنجاز تكاليفه." />
      <DecisionFollowUpWorkspace />
    </div>
  );
}
