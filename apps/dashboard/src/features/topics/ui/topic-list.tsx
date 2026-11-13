
import { Button } from "@/shared/ui/button";
import { Eye, Inbox, LoaderCircle } from "lucide-react";
import { topicCategoryName, topicUnitName, type Topic } from "../model/topic-view";
import { TopicPriorityBadge, TopicStatusBadge } from "./topic-status-badge";

type Props = {
  topics: Topic[];
  total: number;
  loading: boolean;
  selectedId?: string;
  title: string;
  onSelect: (topicId: string) => void;
};

export function TopicList({ topics, total, loading, selectedId, title, onSelect }: Props) {
  return <section className="overflow-hidden rounded-q-control border border-q-border bg-q-surface ">
    <header className="flex items-center justify-between border-b border-q-border px-5 py-4">
      <div>
        <h2 className="mt-1 text-q-ui font-bold text-q-text">{title}</h2>
<p className="text-q-caption font-bold text-q-text-2">مساحة العمل</p>
      </div>
      <span className="rounded-full bg-q-surface-2 px-3 py-1.5 text-q-caption font-bold text-q-primary">{total} موضوع</span>
    </header>

    {loading ? <div className="grid min-h-[360px] place-items-center"><LoaderCircle className="animate-spin text-q-primary" size={28} /></div>
      : topics.length === 0 ? <div className="grid min-h-[360px] place-items-center p-8 text-center"><div>
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-q-control bg-q-surface-2 text-q-link"><Inbox size={25} /></span>
        <h3 className="mt-4 text-q-ui font-bold text-q-text">لا توجد موضوعات مطابقة</h3>
        <p className="mt-1 text-q-caption text-q-text-2">غيّر البحث أو عوامل التصفية، أو أنشئ موضوعاً جديداً.</p>
      </div></div>
      : <div className="max-h-[640px] divide-y divide-q-border overflow-y-auto">
        {topics.map((topic) => <Button variant="ghost" type="submit" key={topic.id} onClick={() => onSelect(topic.id)} className={`group flex w-full items-start gap-3 px-5 py-4 text-right transition ${selectedId === topic.id ? "bg-q-surface-2 " : "hover:bg-q-surface-2"}`}>
          <span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-q-control transition ${selectedId === topic.id ? "bg-q-primary text-q-on-primary" : "bg-q-surface-2 text-q-link group-hover:bg-q-surface-2 group-hover:text-q-primary"}`}><Eye size={16} /></span>
          <span className="min-w-0 flex-1">
            <span className="mb-2 flex flex-wrap items-center gap-1.5"><TopicStatusBadge topic={topic} /><TopicPriorityBadge topic={topic} /></span>
            <strong className="block text-q-caption leading-6 text-q-text">{topic.title_ar}</strong>
            <span className="mt-1.5 block text-q-caption leading-5 text-q-link">{topic.topic_no ?? topic.id.slice(0, 8)} · {topicCategoryName(topic)} · {topicUnitName(topic)}</span>
          </span>
        </Button>)}
      </div>}
  </section>;
}

