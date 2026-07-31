import type { Metadata } from "next";
import { TopicRegulationCreator } from "@/features/topics/ui/topic-regulation-creator";

export const metadata: Metadata = { title: "إنشاء موضوع محكوم بلائحة" };

export default function RequestsPage() {
  return <TopicRegulationCreator />;
}
