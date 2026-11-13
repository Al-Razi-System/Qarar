import { Button as QButton } from "@/shared/ui/button";
import { useState } from "react";
import { InstructionEditor } from "@/shared/ui/instruction-editor";
import { type NamedOption, type Requirements, type ScopeKind, type ScheduleKind, scheduleNames, seasonText } from "../model/topic-type-requirements";
import styles from "./topic-types-workspace.module.css";

type Props = { value: Requirements; onChange: (next: Requirements) => void };
function SelectionList({ title, options, selected, onChange, empty }: {
  title: string; options: NamedOption[]; selected: string[]; onChange: (ids: string[]) => void; empty: string;
}) {
  const [search, setSearch] = useState("");
  const visible = options.filter(item => `${item.name_ar} ${item.document_name ?? ""} ${item.reference_number ?? ""}`.includes(search.trim()));
  return <fieldset className={styles.selectionList}><legend>{title}<span>{selected.length} محدد</span></legend>
    {options.length > 5 && <input aria-label={`بحث في ${title}`} placeholder="ابحث بالاسم…" value={search} onChange={event => setSearch(event.target.value)}/>}
    <div>{visible.map(item => <label key={item.id}><input type="checkbox" checked={selected.includes(item.id)} onChange={event => onChange(event.target.checked ? [...selected, item.id] : selected.filter(id => id !== item.id))}/><span><strong>{item.name_ar}</strong>{item.document_name && <small>{item.document_name}</small>}</span></label>)}</div>
    {!visible.length && <p>{options.length ? "لا توجد نتائج مطابقة." : empty}</p>}
  </fieldset>;
}
export function TopicTypeScopeEditor({ value, onChange, councils, classes, loading }: Props & { councils: NamedOption[]; classes: NamedOption[]; loading: boolean }) {
  return <section className={styles.settingsSection} aria-label="إعداد نطاق التصنيف">
    <h3>أين يُتاح هذا التصنيف؟</h3><p>يختار مقدم الموضوع المجلس أولًا، ثم يرى التصنيفات المتاحة له ضمن بداية مساراتها.</p>
    <label className={styles.control}>نطاق إتاحة التصنيف<select aria-label="نطاق إتاحة التصنيف" value={value.scopeKind} onChange={event => onChange({ ...value, scopeKind: event.target.value as ScopeKind, scopeIds: [] })}>
      <option value="route">كل مجلس تنطبق عليه بداية المسار</option><option value="councils">مجالس محددة</option><option value="classes">مستويات مجالس محددة</option>
    </select></label>
    {value.scopeKind !== "route" && (loading ? <p role="status">جارٍ تحميل المجالس…</p> : <SelectionList title={value.scopeKind === "councils" ? "المجالس المتاحة" : "مستويات المجالس"} options={value.scopeKind === "councils" ? councils : classes} selected={value.scopeIds} onChange={scopeIds => onChange({ ...value, scopeIds })} empty="لا توجد خيارات متاحة. أكمل إعداد المجالس أولًا."/>)}
  </section>;
}
export function TopicTypeRequirementsEditor({ value, onChange, sourceItems, loading, error, onRetry }: Props & { sourceItems: NamedOption[]; loading: boolean; error: string; onRetry: () => void }) {
  const update = <K extends keyof Requirements>(key: K, next: Requirements[K]) => onChange({ ...value, [key]: next });
  const updateSeasonalDate = (index: number, key: "month" | "day" | "toMonth" | "toDay", next: number) => update("seasonalDates", value.seasonalDates.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: next } : item));
  const setSeasonEnd = (index: number, hasEnd: boolean) => update("seasonalDates", value.seasonalDates.map((item, itemIndex) => {
    if (itemIndex !== index) return item;
    if (!hasEnd) return { month: item.month, day: item.day };
    return { ...item, toMonth: item.month, toDay: new Date(Date.UTC(2024, item.month, 0)).getUTCDate() };
  }));
  return <div className={styles.requirements}>
    <section className={styles.settingsSection}><h3>أسانيد التصنيف</h3><p>اختر بنود الاختصاص التي يستند إليها هذا النوع. يمكن استخدام البند نفسه لأكثر من تصنيف؛ لن تتغير نصوص اللوائح.</p>
      {loading ? <p role="status">جارٍ تحميل البنود النافذة…</p> : error ? <div role="alert" className={styles.error}>{error}<QButton variant="ghost" type="button" onClick={onRetry} className={styles.secondary}>إعادة تحميل الخيارات</QButton></div> : <SelectionList title="بنود الاختصاص النافذة" options={sourceItems} selected={value.sourceItemIds} onChange={ids => update("sourceItemIds", ids)} empty="لا توجد بنود نشطة منشورة. أضف بندًا ونشّطه من اللوائح والبنود؛ يمكنك حفظ التصنيف كمسودة الآن."/>}
    </section>
    <section className={styles.settingsSection}><h3>متطلبات التقديم</h3>
      <label className={styles.toggle}><input type="checkbox" checked={value.requiredAttachmentCount !== 0} onChange={event => update("requiredAttachmentCount", event.target.checked ? 1 : 0)}/><span><strong>يتطلب مرفقات</strong><small>العدد الأدنى المطلوب لاستكمال الموضوع، وليس حدًا أقصى.</small></span></label>
      {value.requiredAttachmentCount !== 0 && <label className={styles.control}>الحد الأدنى للمرفقات<input type="number" min={1} max={50} value={Number.isNaN(value.requiredAttachmentCount) ? "" : value.requiredAttachmentCount} onChange={event => update("requiredAttachmentCount", event.target.value === "" || Number(event.target.value) === 0 ? Number.NaN : Number(event.target.value))}/></label>}
    </section>
    <details className={styles.settingsSection}>
      <summary className="min-h-11 content-center">التعليمات <small>اختياري</small></summary>
      <p>إرشادات تساعد على إعداد الموضوع ومناقشته؛ لا تُضيف شروطًا إلزامية.</p>
      <InstructionEditor label="تعليمات التقديم" value={value.submissionInstructions} onChange={next => update("submissionInstructions", next)} hint="تظهر لمقدم الموضوع عند اختيار هذا التصنيف."/>
      <InstructionEditor label="تعليمات المناقشة" value={value.discussionInstructions} onChange={next => update("discussionInstructions", next)} hint="تظهر للمجلس عند فتح الموضوع في الجلسة الحية."/>
    </details>
    <section className={styles.settingsSection}><h3>متى يُناقش الموضوع؟</h3><p>التوقيت يخص الموضوع، ويُنسّق لاحقًا مع خطة اجتماعات المجلس.</p>
      <label className={styles.control}>توقيت الموضوع<select aria-label="توقيت الموضوع" value={value.scheduleKind} onChange={event => onChange({ ...value, scheduleKind: event.target.value as ScheduleKind, automaticAgenda: event.target.value === "none" ? false : value.automaticAgenda })}>{Object.entries(scheduleNames).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      {value.scheduleKind === "fixed_date" && <label className={styles.control}>تاريخ مناقشة الموضوع<input type="date" value={value.date} onChange={event => update("date", event.target.value)}/></label>}
      {value.scheduleKind === "monthly_week" && <label className={styles.control}>الأسبوع الشهري<select aria-label="الأسبوع الشهري" value={value.week} onChange={event => update("week", Number(event.target.value))}>{["الأول · من 1 إلى 7", "الثاني · من 8 إلى 14", "الثالث · من 15 إلى 21", "الرابع · من 22 إلى نهاية الشهر"].map((name, index) => <option key={name} value={index + 1}>{name}</option>)}</select></label>}
      {value.scheduleKind === "seasonal" && <div>
        {value.seasonalDates.map((item, index) => <div className={styles.seasonItem} key={index}>
          <div className={styles.controlGrid}>
          <label className={styles.control}>شهر الموعد {index + 1}<input aria-label={`شهر الموعد الموسمي ${index + 1}`} type="number" min={1} max={12} value={item.month} onChange={event => updateSeasonalDate(index, "month", Number(event.target.value))}/></label>
          <label className={styles.control}>يوم الموعد {index + 1}<input aria-label={`يوم الموعد الموسمي ${index + 1}`} type="number" min={1} max={31} value={item.day} onChange={event => updateSeasonalDate(index, "day", Number(event.target.value))}/></label>
          </div>
          <label className={styles.toggle}><input type="checkbox" checked={item.toMonth != null} onChange={event => setSeasonEnd(index, event.target.checked)}/><span><strong>فترة وليست يومًا واحدًا</strong><small>يبقى الموضوع مستحقًا حتى نهاية الفترة ولا يتأخر قبلها.</small></span></label>
          {item.toMonth != null && <div className={styles.controlGrid}>
            <label className={styles.control}>شهر نهاية الفترة {index + 1}<input aria-label={`شهر نهاية الفترة الموسمية ${index + 1}`} type="number" min={1} max={12} value={item.toMonth} onChange={event => updateSeasonalDate(index, "toMonth", Number(event.target.value))}/></label>
            <label className={styles.control}>يوم نهاية الفترة {index + 1}<input aria-label={`يوم نهاية الفترة الموسمية ${index + 1}`} type="number" min={1} max={31} value={item.toDay} onChange={event => updateSeasonalDate(index, "toDay", Number(event.target.value))}/></label>
          </div>}
          {value.seasonalDates.length > 1 && <QButton variant="ghost" type="button" className={styles.secondary} onClick={() => update("seasonalDates", value.seasonalDates.filter((_, itemIndex) => itemIndex !== index))}>حذف الموعد</QButton>}
        </div>)}
        {value.seasonalDates.length < 24 && <QButton variant="ghost" type="button" className={styles.secondary} onClick={() => update("seasonalDates", [...value.seasonalDates, { month: 1, day: 1 }])}>إضافة موعد موسمي</QButton>}
      </div>}
      {(value.scheduleKind === "monthly_week" || value.scheduleKind === "seasonal") && <div className={styles.controlGrid}><label className={styles.control}>بداية الدورية<input type="date" value={value.startsOn} onChange={event => update("startsOn", event.target.value)}/></label><label className={styles.control}>نهاية الدورية <small>اختياري</small><input type="date" min={value.startsOn} value={value.endsOn} onChange={event => update("endsOn", event.target.value)}/></label></div>}
      {value.scheduleKind !== "none" && <p className={styles.settingsHint}>{value.scheduleKind === "monthly_week" ? `كل شهر في الأسبوع ${["الأول", "الثاني", "الثالث", "الرابع"][value.week - 1]}` : value.scheduleKind === "seasonal" ? `كل سنة في ${seasonText(value.seasonalDates)}` : value.date || "حدد التاريخ"}{value.endsOn && value.scheduleKind !== "fixed_date" ? `، حتى ${value.endsOn}` : ""}. يحفظ الموعد دون إنشاء اجتماعات تلقائيًا.</p>}
      {value.scheduleKind !== "none" && <label className={styles.toggle}><input type="checkbox" checked={value.automaticAgenda} onChange={event => update("automaticAgenda", event.target.checked)}/><span><strong>يضاف مباشرة إلى مقترحات جدول الأعمال</strong><small>يظهر التصنيف النافذ كمقترح لاجتماع المجلس المطابق خلال الموعد المحدد، دون طلب تقديم. المقترح منفصل عن جدول الأعمال المعتمد.</small></span></label>}
    </section>
  </div>;
}
