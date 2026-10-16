import type { Metadata } from "next";
import { MyTasksWorkspace } from "@/features/tasks/ui/my-tasks-workspace";
import { PageHeader } from "@/shared/ui/page-header";

export const metadata: Metadata = { title: "مهامي" };

export default function MyTasksPage() {
  return (
    <div className="mx-auto max-w-[1480px]">
      <PageHeader eyebrow="التنفيذ والمتابعة" title="مهامي" description="التكليفات التي تنفذها، وما ينتظر تحققك من إنجازه، وما تتابعه." />
      <MyTasksWorkspace />
    </div>
  );
}
