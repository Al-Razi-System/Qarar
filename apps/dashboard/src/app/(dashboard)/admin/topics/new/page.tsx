import { Card } from "@/shared/ui/card";
import { TypedTopicCreator } from "@/features/topics/ui/typed-topic-creator";
export default function NewTopicPage() {
  return <div className="mx-auto max-w-5xl space-y-6 text-q-text"><Card className="p-6 sm:p-8"><h1 className="text-q-h1 font-bold">تقديم موضوع</h1><p className="mt-2 text-q-ui text-q-text-2">اختر المجلس وتصنيف الموضوع، ثم اكتب تفاصيل طلبك. ستجد التعليمات ومسار المعالجة هنا قبل التقديم.</p></Card><TypedTopicCreator/></div>;
}
