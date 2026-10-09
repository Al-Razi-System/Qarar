import { PageHeader } from "@/shared/ui/page-header";
import { TypedTopicCreator } from "@/features/topics/ui/typed-topic-creator";
export default function NewTopicPage() {
  return <div className="mx-auto max-w-5xl"><PageHeader eyebrow="المعاملات والموضوعات" title="تقديم موضوع" description="اختر المجلس، ثم أحد تصنيفاته المتاحة. يتحدد المسار ومتطلبات الموضوع تلقائيًا."/><TypedTopicCreator/></div>;
}
