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
  return <section className="overflow-hidden rounded-3xl border border-[#dce7f1] bg-white shadow-[0_14px_40px_rgba(13,42,76,.06)]">
    <header className="flex items-center justify-between border-b border-[#e9f0f6] px-5 py-4">
      <div>
        <p className="text-[10px] font-black text-[#ff7a00]">مساحة العمل</p>
        <h2 className="mt-1 text-sm font-black text-[#0a1330]">{title}</h2>
      </div>
      <span className="rounded-full bg-[#edf6ff] px-3 py-1.5 text-[10px] font-black text-[#0066cc]">{total} موضوع</span>
    </header>

    {loading ? <div className="grid min-h-[360px] place-items-center"><LoaderCircle className="animate-spin text-[#0066cc]" size={28} /></div>
      : topics.length === 0 ? <div className="grid min-h-[360px] place-items-center p-8 text-center"><div>
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#edf6ff] text-[#5d91c4]"><Inbox size={25} /></span>
        <h3 className="mt-4 text-sm font-black text-[#182b45]">لا توجد موضوعات مطابقة</h3>
        <p className="mt-1 text-[11px] text-[#76879b]">غيّر البحث أو عوامل التصفية، أو أنشئ موضوعاً جديداً.</p>
      </div></div>
      : <div className="max-h-[640px] divide-y divide-[#edf2f7] overflow-y-auto">
        {topics.map((topic) => <button key={topic.id} onClick={() => onSelect(topic.id)} className={`group flex w-full items-start gap-3 px-5 py-4 text-right transition ${selectedId === topic.id ? "bg-[linear-gradient(90deg,#f3f9ff,#eaf5ff)] shadow-[inset_-3px_0_0_#0877df]" : "hover:bg-[#f9fcff]"}`}>
          <span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl transition ${selectedId === topic.id ? "bg-[#0877df] text-white" : "bg-[#eef5fb] text-[#7292b2] group-hover:bg-[#e4f1fd] group-hover:text-[#0877df]"}`}><Eye size={16} /></span>
          <span className="min-w-0 flex-1">
            <span className="mb-2 flex flex-wrap items-center gap-1.5"><TopicStatusBadge topic={topic} /><TopicPriorityBadge topic={topic} /></span>
            <strong className="block text-xs leading-6 text-[#0a1330]">{topic.title_ar}</strong>
            <span className="mt-1.5 block text-[10px] leading-5 text-[#71839a]">{topic.topic_no ?? topic.id.slice(0, 8)} · {topicCategoryName(topic)} · {topicUnitName(topic)}</span>
          </span>
        </button>)}
      </div>}
  </section>;
}

