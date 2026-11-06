import type { Metadata } from "next";
import { MyTasksWorkspace } from "@/features/tasks/ui/my-tasks-workspace";
import { PageHeader } from "@/shared/ui/page-header";

export const metadata: Metadata = { title: "مهامي" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function MyTasksPage({ searchParams }: { searchParams: Promise<{ task?: string | string[] }> }) {
  const requested = (await searchParams).task;
  const taskId = typeof requested === "string" && UUID.test(requested) ? requested : null;
  return (
    <div className="mx-auto max-w-[1480px]">
      <PageHeader eyebrow="التنفيذ والمتابعة" title="مهامي" description="التكليفات التي تنفذها، وما ينتظر تحققك من إنجازه، وما تتابعه." />
      <MyTasksWorkspace initialTaskId={taskId} />
    </div>
  );
}
