"use client";

import { Card as QCard } from "@/shared/ui/card";
import { Badge as QBadge } from "@/shared/ui/badge";

import { Button as QButton } from "@/shared/ui/button";

import { useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  ChevronLeft,
  FilePlus2,
  FileText,
  FolderTree,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { regulationsRpc, type PolicyAuthoringReferences } from "../../api/regulations-client";
import { buildPolicyContentTree, flattenPolicyContent } from "../../model/policy-content";
import {
  firstValidationMessage,
  parsePolicyCriteria,
  policyItemDescendantIds,
  policyItemDraftSchema,
} from "../../model/policy-authoring";
import type { PolicyItem, PolicyVersion } from "../../model/types";
import {
  AuthoringDialog,
  AuthoringField,
  EmptyAuthoringState,
  PrimaryAction,
  authoringInput,
  authoringTextarea,
  type AuthoringMutation,
} from "./authoring-primitives";

const itemTypeLabels: Record<string, string> = {
  chapter: "فصل",
  section: "قسم",
  article: "مادة",
  clause: "بند",
  procedure: "إجراء",
  definition: "تعريف",
};

type ItemForm = {
  code: string;
  title: string;
  type: "chapter" | "section" | "article" | "clause" | "procedure" | "definition";
  parentId: string;
  sortOrder: string;
  body: string;
  officialText: string;
  interpretationText: string;
  sourceLocator: string;
  sourcePageFrom: string;
  sourcePageTo: string;
  governanceMode: "regulation_required" | "regulated_fallback_allowed" | "custom_route_allowed";
  topicCategoryId: string;
  criteriaText: string;
  isActive: boolean;
  requiresExecutableRule: boolean;
};

function blankItemForm(version: PolicyVersion, parent?: PolicyItem): ItemForm {
  const siblings = version.items.filter((item) => (item.parent_item_id ?? null) === (parent?.id ?? null));
  return {
    code: "",
    title: "",
    type: parent?.item_type === "article" ? "clause" : parent ? "article" : "chapter",
    parentId: parent?.id ?? "",
    sortOrder: String(Math.max(0, ...siblings.map((item) => item.sort_order)) + 10),
    body: "",
    officialText: "",
    interpretationText: "",
    sourceLocator: "",
    sourcePageFrom: "",
    sourcePageTo: "",
    governanceMode: parent ? "custom_route_allowed" : "regulation_required",
    topicCategoryId: "",
    criteriaText: "{}",
    isActive: true,
    requiresExecutableRule: false,
  };
}

function formFromItem(item: PolicyItem): ItemForm {
  return {
    code: item.item_code,
    title: item.title_ar,
    type: item.item_type as ItemForm["type"],
    parentId: item.parent_item_id ?? "",
    sortOrder: String(item.sort_order),
    body: item.body_text ?? "",
    officialText: item.official_text ?? item.body_text ?? "",
    interpretationText: item.interpretation_text ?? "",
    sourceLocator: item.source_locator ?? "",
    sourcePageFrom: item.source_page_from ? String(item.source_page_from) : "",
    sourcePageTo: item.source_page_to ? String(item.source_page_to) : "",
    governanceMode: item.governance_mode as ItemForm["governanceMode"],
    topicCategoryId: item.topic_category_id ?? "",
    criteriaText: JSON.stringify(item.match_criteria ?? {}, null, 2),
    isActive: item.is_active,
    requiresExecutableRule: item.requires_executable_rule ?? false,
  };
}

export function PolicyContentEditor({
  version,
  references,
  busy,
  mutate,
  reportError,
}: {
  version?: PolicyVersion;
  references: PolicyAuthoringReferences;
  busy: boolean;
  mutate: AuthoringMutation;
  reportError: (message: string) => void;
}) {
  const [editingItem, setEditingItem] = useState<PolicyItem>();
  const [form, setForm] = useState<ItemForm>();
  const [deletingItem, setDeletingItem] = useState<PolicyItem>();
  const entries = flattenPolicyContent(buildPolicyContentTree(version?.items ?? []));
  const editable = version?.legal_status === "draft";

  function openCreate(parent?: PolicyItem) {
    if (!version || !editable) return;
    setEditingItem(undefined);
    setForm(blankItemForm(version, parent));
  }

  function openEdit(item: PolicyItem) {
    if (!editable) return;
    setEditingItem(item);
    setForm(formFromItem(item));
  }

  async function saveItem() {
    if (!version || !form) return;
    const parsed = policyItemDraftSchema.safeParse(form);
    const error = firstValidationMessage(parsed);
    if (error || !parsed.success) {
      reportError(error ?? "راجع بيانات العنصر.");
      return;
    }
    if (editingItem) {
      const descendants = policyItemDescendantIds(version.items, editingItem.id);
      if (parsed.data.parentId && descendants.has(parsed.data.parentId)) {
        reportError("لا يمكن نقل العنصر داخل أحد العناصر التابعة له.");
        return;
      }
    }
    const data = parsed.data;
    await mutate(async () => {
      let itemId = editingItem?.id;
      if (editingItem) {
        await regulationsRpc("admin_update_policy_item", {
          p_policy_item_id: editingItem.id,
          p_title_ar: data.title,
          p_title_en: null,
          p_body_text: data.body || null,
          p_sort_order: Number(data.sortOrder),
          p_governance_mode: data.governanceMode,
          p_topic_category_id: data.topicCategoryId || null,
          p_match_criteria: parsePolicyCriteria(data.criteriaText),
          p_workflow_template_version_id: editingItem.workflow_template_version_id ?? null,
          p_is_active: data.isActive,
        });
        await regulationsRpc("admin_move_policy_item", {
          p_policy_item_id: editingItem.id,
          p_parent_item_id: data.parentId || null,
          p_sort_order: Number(data.sortOrder),
        });
      } else {
        const created = await regulationsRpc<{ id: string }>("admin_add_policy_item", {
          p_policy_version_id: version.id,
          p_item_code: data.code,
          p_title_ar: data.title,
          p_title_en: null,
          p_body_text: data.body || null,
          p_sort_order: Number(data.sortOrder),
          p_parent_item_id: data.parentId || null,
          p_item_type: data.type,
          p_governance_mode: data.governanceMode,
          p_topic_category_id: data.topicCategoryId || null,
          p_match_criteria: parsePolicyCriteria(data.criteriaText),
          p_workflow_template_version_id: null,
        });
        itemId = created.id;
      }
      if (!itemId) throw new Error("لم يُرجع الخادم معرف العنصر الجديد.");
      await regulationsRpc("admin_update_policy_item_legal_text", {
        p_policy_item_id: itemId,
        p_official_text: data.officialText || data.body || null,
        p_interpretation_text: data.interpretationText || null,
        p_source_page_from: data.sourcePageFrom ? Number(data.sourcePageFrom) : null,
        p_source_page_to: data.sourcePageTo ? Number(data.sourcePageTo) : null,
        p_source_locator: data.sourceLocator || null,
        p_legal_status: editingItem?.legal_status ?? "active",
        p_amendment_note: editingItem?.amendment_note ?? null,
        p_requires_executable_rule: data.requiresExecutableRule,
        p_supersedes_item_id: editingItem?.supersedes_item_id ?? null,
      });
    }, editingItem ? "تم تحديث العنصر وموقعه في الهيكل." : "تمت إضافة العنصر إلى هيكل اللائحة.");
    setForm(undefined);
    setEditingItem(undefined);
  }

  async function removeItem() {
    if (!deletingItem) return;
    await mutate(
      () => regulationsRpc("admin_remove_policy_item", { p_policy_item_id: deletingItem.id }),
      "تم حذف العنصر من الإصدار.",
    );
    setDeletingItem(undefined);
  }

  async function moveItem(item: PolicyItem, direction: "up" | "down") {
    if (!version) return;
    const siblings = version.items
      .filter((candidate) => (candidate.parent_item_id ?? null) === (item.parent_item_id ?? null))
      .sort((left, right) => left.sort_order - right.sort_order);
    const index = siblings.findIndex((candidate) => candidate.id === item.id);
    const target = siblings[direction === "up" ? index - 1 : index + 1];
    if (!target) return;
    const nextOrder = direction === "up" ? target.sort_order : target.sort_order + 1;
    await mutate(
      () => regulationsRpc("admin_move_policy_item", {
        p_policy_item_id: item.id,
        p_parent_item_id: item.parent_item_id ?? null,
        p_sort_order: nextOrder,
      }),
      direction === "up" ? "تم رفع العنصر في الترتيب." : "تم خفض العنصر في الترتيب.",
    );
  }

  if (!version) {
    return <EmptyAuthoringState icon={<FilePlus2 size={22} />} title="اختر أو أنشئ إصداراً" description="يجب تحديد إصدار عمل قبل بناء الفصول والمواد والبنود." />;
  }

  return (
    <section className="overflow-hidden rounded-q-card border border-q-border bg-q-surface ">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-q-border bg-q-bg p-4 sm:p-5">
        <div className="flex items-start gap-3"><span className="grid h-10 w-10 place-items-center rounded-q-control bg-q-surface-2 text-q-primary"><FolderTree size={18} /></span><div><h3 className="text-q-ui font-bold text-q-text">هيكل الإصدار ومحتواه</h3><p className="mt-1 text-q-caption leading-5 text-q-text-3">ابنِ التسلسل فصل ← قسم ← مادة ← بند، ثم أضف النص الرسمي والمصدر وشروط الانطباق.</p></div></div>
        {editable ? <PrimaryAction busy={busy} onClick={() => openCreate()} title="إضافة عنصر رئيسي إلى هذا الإصدار"><Plus size={14} /> عنصر رئيسي</PrimaryAction> : <QBadge className="rounded-full bg-q-neutral-soft px-3 py-1.5 text-q-caption font-bold text-q-text-2">الإصدار للقراءة فقط</QBadge>}
      </header>

      {entries.length ? (
        <div className="divide-y divide-q-border">
          {entries.map(({ item, depth, ancestors }) => {
            const childCount = version.items.filter((candidate) => candidate.parent_item_id === item.id).length;
            const siblings = version.items.filter((candidate) => (candidate.parent_item_id ?? null) === (item.parent_item_id ?? null)).sort((left, right) => left.sort_order - right.sort_order);
            const siblingIndex = siblings.findIndex((candidate) => candidate.id === item.id);
            return (
              <article key={item.id} className="group flex flex-wrap items-start gap-3 px-3 py-3 transition hover:bg-q-bg sm:px-5" style={{ paddingInlineStart: `min(${20 + Math.min(depth, 6) * 24}px, 15%)` }}>
                <span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-q-control ${["chapter", "section"].includes(item.item_type) ? "bg-q-surface-2 text-q-primary" : item.item_type === "article" ? "bg-q-surface-2 text-q-link" : "bg-q-success-soft text-q-success"}`}>{["chapter", "section"].includes(item.item_type) ? <FolderTree size={15} /> : item.item_type === "article" ? <BookOpen size={15} /> : <FileText size={15} />}</span>
                <div className="min-w-0 flex-1 basis-48"><div className="flex flex-wrap items-center gap-2"><QBadge className="rounded-full bg-q-surface-2 px-2 py-0.5 text-q-caption font-bold text-q-text-2">{itemTypeLabels[item.item_type] ?? item.item_type}</QBadge><code dir="ltr" className="text-q-caption font-bold text-q-text-3">{item.item_code}</code>{childCount > 0 && <span className="text-q-caption font-bold text-q-primary">{childCount} تابع</span>}{!item.is_active && <QBadge className="rounded-full bg-q-danger-soft px-2 py-0.5 text-q-caption font-bold text-q-danger">غير فعال</QBadge>}</div><h4 className="mt-1.5 text-q-caption font-bold text-q-text">{item.title_ar}</h4><p className="mt-1 line-clamp-2 text-q-caption leading-5 text-q-text-3">{item.official_text || item.body_text || "لا يوجد نص مسجل."}</p>{ancestors.length > 0 && <p className="mt-1 truncate text-q-caption text-q-text-3">{ancestors.map((ancestor) => ancestor.title_ar).join(" / ")}</p>}</div>
                {editable && <QCard className="p-0 flex shrink-0 items-center gap-0.5 rounded-q-control border border-q-border bg-q-surface p-1 opacity-80 group-hover:opacity-100"><QButton variant="ghost" type="button" title="رفع العنصر في ترتيب المستوى الحالي" aria-label={`رفع ${item.title_ar}`} disabled={siblingIndex <= 0 || busy} onClick={() => void moveItem(item, "up")} className="min-w-11 grid min-h-11 min-w-11 place-items-center rounded-q-control text-q-text-2 hover:bg-q-surface-2 hover:text-q-primary disabled:opacity-25"><ArrowUp size={13} /></QButton><QButton variant="ghost" type="button" title="خفض العنصر في ترتيب المستوى الحالي" aria-label={`خفض ${item.title_ar}`} disabled={siblingIndex >= siblings.length - 1 || busy} onClick={() => void moveItem(item, "down")} className="min-w-11 grid min-h-11 min-w-11 place-items-center rounded-q-control text-q-text-2 hover:bg-q-surface-2 hover:text-q-primary disabled:opacity-25"><ArrowDown size={13} /></QButton><QButton variant="ghost" type="button" title="إضافة مادة أو بند تابع" aria-label={`إضافة عنصر تابع إلى ${item.title_ar}`} onClick={() => openCreate(item)} className="min-w-11 grid min-h-11 min-w-11 place-items-center rounded-q-control text-q-primary hover:bg-q-surface-2"><Plus size={13} /></QButton><QButton variant="ghost" type="button" title="تعديل النص والخصائص والموقع" aria-label={`تعديل ${item.title_ar}`} onClick={() => openEdit(item)} className="min-w-11 grid min-h-11 min-w-11 place-items-center rounded-q-control text-q-primary hover:bg-q-surface-2"><Pencil size={13} /></QButton><QButton variant="ghost" type="button" title={childCount ? "احذف العناصر التابعة أولاً" : "حذف العنصر نهائياً"} aria-label={`حذف ${item.title_ar}`} disabled={childCount > 0} onClick={() => setDeletingItem(item)} className="min-w-11 grid min-h-11 min-w-11 place-items-center rounded-q-control text-q-danger hover:bg-q-danger-soft disabled:cursor-not-allowed disabled:opacity-25"><Trash2 size={13} /></QButton></QCard>}
              </article>
            );
          })}
        </div>
      ) : (
        <div className="p-5"><EmptyAuthoringState icon={<FilePlus2 size={22} />} title="الإصدار بلا محتوى" description={editable ? "ابدأ بإضافة فصل رئيسي، ثم أنشئ المواد والبنود تحته." : "هذا الإصدار لا يحتوي على عناصر ولا يمكن تعديله في حالته الحالية."} action={editable ? <QButton variant="ghost" type="button" title="إضافة أول فصل أو مادة" onClick={() => openCreate()} className="min-w-11 rounded-q-control bg-q-primary px-4 py-2.5 text-q-ui font-bold text-q-on-primary">إضافة أول عنصر</QButton> : undefined} /></div>
      )}

      {form && <ItemEditorDialog form={form} setForm={setForm} editingItem={editingItem} version={version} references={references} busy={busy} onClose={() => { setForm(undefined); setEditingItem(undefined); }} onSave={() => void saveItem()} />}
      {deletingItem && <AuthoringDialog title="حذف عنصر اللائحة" description="سيُحذف العنصر من هذه المسودة فقط، ويُسجل الإجراء في سجل التدقيق." onClose={() => setDeletingItem(undefined)}><QCard className="p-0 rounded-q-control border border-q-border bg-q-danger-soft p-4 text-q-caption leading-6 text-q-danger">تأكيد حذف «{deletingItem.title_ar}»؟ لا يمكن التراجع عن هذا الإجراء.</QCard><div className="mt-5 flex justify-end gap-2"><QButton variant="ghost" type="button" title="إلغاء الحذف" onClick={() => setDeletingItem(undefined)} className="min-w-11 min-h-11 rounded-q-control border border-q-border px-4 text-q-ui font-bold text-q-text-2">إلغاء</QButton><PrimaryAction busy={busy} tone="red" onClick={() => void removeItem()} title="تأكيد حذف العنصر"><Trash2 size={14} /> حذف</PrimaryAction></div></AuthoringDialog>}
    </section>
  );
}

function ItemEditorDialog({ form, setForm, editingItem, version, references, busy, onClose, onSave }: { form: ItemForm; setForm: (form: ItemForm) => void; editingItem?: PolicyItem; version: PolicyVersion; references: PolicyAuthoringReferences; busy: boolean; onClose: () => void; onSave: () => void }) {
  const excludedParents = editingItem ? policyItemDescendantIds(version.items, editingItem.id).add(editingItem.id) : new Set<string>();
  return <AuthoringDialog wide title={editingItem ? "تعديل عنصر اللائحة" : "إضافة عنصر إلى اللائحة"} description="أدخل النص كما ورد في المصدر، وحدد موقع العنصر وشروط تطبيقه دون خلطها بالقواعد التنفيذية." onClose={onClose}><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><AuthoringField label="الرمز" required hint={editingItem ? "الرمز ثابت لحماية الإحالات." : "مثال: ART-12 أو 12.1"}><input dir="ltr" disabled={Boolean(editingItem)} className={authoringInput} value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} /></AuthoringField><div className="sm:col-span-2"><AuthoringField label="العنوان" required><input className={authoringInput} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></AuthoringField></div><AuthoringField label="النوع" required><select disabled={Boolean(editingItem)} className={authoringInput} value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value as ItemForm["type"] })}>{Object.entries(itemTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></AuthoringField><AuthoringField label="العنصر الأب" hint="اتركه فارغاً ليكون في المستوى الرئيسي."><select className={authoringInput} value={form.parentId} onChange={(event) => setForm({ ...form, parentId: event.target.value })}><option value="">مستوى رئيسي</option>{version.items.filter((item) => !excludedParents.has(item.id)).map((item) => <option key={item.id} value={item.id}>{item.item_code} · {item.title_ar}</option>)}</select></AuthoringField><AuthoringField label="الترتيب" required><input dir="ltr" type="number" min="1" className={authoringInput} value={form.sortOrder} onChange={(event) => setForm({ ...form, sortOrder: event.target.value })} /></AuthoringField><div className="sm:col-span-2 lg:col-span-3"><AuthoringField label="النص الرسمي" hint="النص الحاكم كما ورد في الوثيقة الأصلية."><textarea className={`${authoringTextarea} min-h-36`} value={form.officialText} onChange={(event) => setForm({ ...form, officialText: event.target.value, body: event.target.value })} /></AuthoringField></div><div className="sm:col-span-2"><AuthoringField label="التفسير والإرشاد"><textarea className={authoringTextarea} value={form.interpretationText} onChange={(event) => setForm({ ...form, interpretationText: event.target.value })} /></AuthoringField></div><AuthoringField label="محدد المصدر" hint="مثال: الباب الثاني / المادة 12"><input className={authoringInput} value={form.sourceLocator} onChange={(event) => setForm({ ...form, sourceLocator: event.target.value })} /></AuthoringField><AuthoringField label="من صفحة"><input dir="ltr" type="number" min="1" className={authoringInput} value={form.sourcePageFrom} onChange={(event) => setForm({ ...form, sourcePageFrom: event.target.value })} /></AuthoringField><AuthoringField label="إلى صفحة"><input dir="ltr" type="number" min="1" className={authoringInput} value={form.sourcePageTo} onChange={(event) => setForm({ ...form, sourcePageTo: event.target.value })} /></AuthoringField><AuthoringField label="طريقة التطبيق"><select className={authoringInput} value={form.governanceMode} onChange={(event) => setForm({ ...form, governanceMode: event.target.value as ItemForm["governanceMode"] })}><option value="regulation_required">مسار اللائحة إلزامي</option><option value="regulated_fallback_allowed">يسمح بمسار بديل منظم</option><option value="custom_route_allowed">يسمح بمسار مخصص</option></select></AuthoringField><AuthoringField label="فئة الموضوع"><select className={authoringInput} value={form.topicCategoryId} onChange={(event) => setForm({ ...form, topicCategoryId: event.target.value })}><option value="">جميع الفئات</option>{references.categories.map((category) => <option key={category.id} value={category.id}>{String(category.name_ar ?? category.code)}</option>)}</select></AuthoringField><div className="sm:col-span-2 lg:col-span-3"><details className="rounded-q-card border border-q-border bg-q-bg p-4"><summary className="min-h-11 content-center cursor-pointer text-q-caption font-bold text-q-text-2">شروط الانطباق المتقدمة</summary><p className="mt-2 text-q-caption leading-5 text-q-text-3">صيغة JSON اختيارية يقيّمها محرك المطابقة، مثال: {`{ "request_type": "academic_program" }`}.</p><textarea dir="ltr" className={`${authoringTextarea} mt-3 font-mono text-left`} value={form.criteriaText} onChange={(event) => setForm({ ...form, criteriaText: event.target.value })} /></details></div><label className="flex items-center gap-2 rounded-q-control border border-q-border bg-q-surface p-3 text-q-caption font-bold text-q-text-2"><input type="checkbox" checked={form.isActive} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} />العنصر فعال داخل الإصدار</label><label className="flex items-center gap-2 rounded-q-control border border-q-border bg-q-surface p-3 text-q-caption font-bold text-q-text-2"><input type="checkbox" checked={form.requiresExecutableRule} onChange={(event) => setForm({ ...form, requiresExecutableRule: event.target.checked })} />يتطلب قاعدة تنفيذية قبل المراجعة</label></div><div className="mt-6 flex items-center justify-between gap-3 border-t border-q-border pt-4"><span className="flex items-center gap-1 text-q-caption text-q-text-3"><ChevronLeft size={12} />تُدار القواعد والمسارات من المساحة المخصصة بعد حفظ العنصر.</span><PrimaryAction busy={busy} onClick={onSave} title="التحقق من جميع الحقول وحفظ العنصر">{editingItem ? <Pencil size={14} /> : <Plus size={14} />}{editingItem ? "حفظ التعديلات" : "إضافة العنصر"}</PrimaryAction></div></AuthoringDialog>;
}
