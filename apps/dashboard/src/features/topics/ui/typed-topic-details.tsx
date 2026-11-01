import { Badge } from "@/shared/ui/badge";
import { InlineMessage } from "@/shared/ui/inline-message";

export type TypedTopicSnapshot = {
  topic_type_name_ar?: string;
  classification_name_ar?: string;
  authoring?: {
    required_attachment_count?: number;
    source_items?: Array<{ id?: string; source_document_name?: string; text?: string }>;
  };
  authorities?: Array<{
    source_document_name?: string;
    source_document_version?: string;
    article_number?: string;
    clause_number?: string;
    authority_text?: string;
  }>;
};

// Keep the existing workspace and its complete navigation. Only the frozen
// classification authority needs a different reader from legacy regulations.
export function TypedTopicAuthorities({ snapshot }: { snapshot?: TypedTopicSnapshot }) {
  const authorities = snapshot?.authorities?.length
    ? snapshot.authorities
    : (snapshot?.authoring?.source_items ?? []).map((item) => ({
        source_document_name: item.source_document_name,
        authority_text: item.text,
      }));

  return <div className="space-y-5 text-q-ui text-q-text">
    <div>
      <h2 className="text-q-h2 font-bold">اللائحة والبنود المرتبطة</h2>
      <p className="mt-2 text-q-text-2">الأسانيد المحفوظة مع التصنيف وقت تقديم هذا الموضوع؛ لا تتغير عند تعديل التصنيف لاحقًا.</p>
    </div>
    {authorities.length ? authorities.map((authority, index) => <article
      key={index} className="space-y-3 rounded-q-card border border-q-border p-4"
    >
      <h3 className="text-q-h3 font-bold">{authority.source_document_name ?? "سند مرتبط بالتصنيف"}</h3>
      {"article_number" in authority && authority.article_number && <Badge>{authority.article_number}</Badge>}
      <p className="whitespace-pre-wrap break-words text-q-body leading-8">{authority.authority_text}</p>
    </article>) : <InlineMessage tone="info">لا توجد أسانيد محفوظة لهذا التصنيف وقت التقديم. لا يمنع ذلك عرض مساره المحفوظ.</InlineMessage>}
  </div>;
}
