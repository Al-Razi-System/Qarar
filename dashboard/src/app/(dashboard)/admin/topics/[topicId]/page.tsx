import type { Metadata } from "next";
import { TopicDetailsWorkspace } from "@/features/topics/ui/topic-details-workspace";

export const metadata: Metadata = { title: "تفاصيل الموضوع" };

export default async function TopicDetailsPage({ params }: { params: Promise<{ topicId: string }> }) {
  const { topicId } = await params;
  return <div className="mx-auto max-w-[1480px]"><TopicDetailsWorkspace topicId={topicId} /></div>;
}
