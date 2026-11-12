import type { Metadata } from "next";
import { ViolationsWorkspace } from "@/features/oversight/ui/violations-workspace";
import { PageHeader } from "@/shared/ui/page-header";

export const metadata: Metadata = { title: "التجاوزات" };

export default function ViolationsPage() {
  return (
    <div className="mx-auto max-w-[1480px]">
      <PageHeader
        title="التجاوزات"
        description="ما تأخر في المجالس التي تقودها أو تتابعها: اجتماعات لم تنعقد، وتكليفات متأخرة، ومحاضر لم تُعتمد، وموضوعات متوقفة، واجتماعات بنصاب غير مكتمل. يُغلق التجاوز تلقائيًا عند معالجته."
      />
      <ViolationsWorkspace />
    </div>
  );
}
