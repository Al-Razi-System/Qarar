"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { TopicStagePolicyEditor, defaultStagePolicies, type TopicStagePolicy, type PolicyStage } from "./topic-stage-policy-editor";
import { GovernancePageHeader } from "@/shared/ui/governance-page-header";
import styles from "./topic-types-workspace.module.css";
import { TopicTypesList, type TopicTypeDetail } from "./topic-types-list";
import { initialRequirements, requirementsError, requirementsPayload, scheduleNames, type NamedOption, type Requirements } from "../model/topic-type-requirements";
import { TopicTypeScopeEditor, TopicTypeRequirementsEditor } from "./topic-type-requirements-editor";
import { TopicInstructions } from "./topic-instructions";
import {
  ArrowLeft, ArrowRight, CalendarClock, Check, CirclePlus, FileCheck2, GitBranch, Tags, X,
} from "lucide-react";

type Draft = {
  classification: string;
  classificationCode: string;
  name: string;
  acceptance: "advance" | "complete" | "return_previous";
  rejection: "complete" | "return_previous" | "refer_lower";
  workflowVersionId: string;
};

const initialDraft: Draft = {
  classification: "", classificationCode: "", name: "", acceptance: "advance",
  rejection: "complete", workflowVersionId: "",
};

const steps = [
  { title: "هوية الموضوع", hint: "التصنيف والاسم", icon: Tags },
  { title: "مسار الحوكمة", hint: "المجالس بالترتيب", icon: GitBranch },
  { title: "المتطلبات والتوقيت", hint: "السند والمرفقات والدورية", icon: CalendarClock },
  { title: "المراجعة", hint: "ملخص قبل الحفظ", icon: FileCheck2 },
];

type ClassificationOption = { id?: string; code: string; name_ar: string };
type WorkflowOption = { id: string; code: string; name_ar: string; version_no: number; layout_only?: boolean; steps: PolicyStage[] };
type AuthoringOptions = { classifications: ClassificationOption[]; workflow_versions: WorkflowOption[]; councils?: NamedOption[]; council_classes?: NamedOption[]; source_items?: NamedOption[] };

const defaultClassifications: ClassificationOption[] = [
  { code: "academic", name_ar: "أكاديمي" }, { code: "student", name_ar: "طلابي" },
  { code: "institutional", name_ar: "مؤسسي" }, { code: "quality", name_ar: "جودة" },
  { code: "financial", name_ar: "مالي" }, { code: "administrative", name_ar: "إداري" },
];

const baseAcceptanceLabels = { advance: "التصعيد للمرحلة التالية", complete: "إنهاء الموضوع", return_previous: "إعادته للمرحلة السابقة" } as const;
const baseRejectionLabels = { complete: "إنهاء الموضوع بالرفض", return_previous: "إعادته للتعديل", refer_lower: "إحالته إلى مجلس أدنى" } as const;

function Choice({ selected, title, description, onClick }: {
  selected: boolean; title: string; description: string; onClick: () => void;
}) {
  return <button type="button" onClick={onClick} aria-pressed={selected}
    className={styles.choice}>
    <span className={styles.choiceMark}>{selected && <Check size={14}/>}</span>
    <span><strong>{title}</strong><small>{description}</small></span>
  </button>;
}

const subscribeReady = () => () => {};
const clientReady = () => true;
const serverReady = () => false;

export function TopicTypesWorkspace() {
  const ready = useSyncExternalStore(subscribeReady, clientReady, serverReady);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<{ id: string; lockVersion: number } | null>(null);
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(initialDraft);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [options, setOptions] = useState<AuthoringOptions>({ classifications: [], workflow_versions: [] });
  const [optionsState, setOptionsState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [optionsAttempt, setOptionsAttempt] = useState(0);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [saveMessage, setSaveMessage] = useState("");
  const [savedReference, setSavedReference] = useState("");
  const [lastSavedId, setLastSavedId] = useState<string | null>(null);
  const requestId = useRef<string | null>(null);
  const [stagePolicies, setStagePolicies] = useState<TopicStagePolicy[]>([]);
  const [requirements, setRequirements] = useState<Requirements>(initialRequirements);
  const scopeLabel = requirements.scopeKind === "route" ? "حسب بداية المسار" : (requirements.scopeKind === "councils" ? options.councils : options.council_classes)?.filter(item => requirements.scopeIds.includes(item.id)).map(item => item.name_ar).join("، ") || "لم يُحدد بعد";
  function updateRequirements(value: Requirements) { requestId.current = null; setRequirements(value); setErrors(current => ({ ...current, requirements: "" })); }
  function retryOptions() { setSaveMessage(""); setOptionsState("loading"); setOptionsAttempt(value => value + 1); }

  const classificationOptions = useMemo(() => {
    const byCode = new Map(defaultClassifications.map((item) => [item.code, item]));
    options.classifications.forEach((item) => byCode.set(item.code, item));
    return [...byCode.values()];
  }, [options.classifications]);
  const selectedWorkflow = options.workflow_versions.find((item) => item.id === draft.workflowVersionId);
  const saveBlocker = draft.name.trim().length < 3 ? "اكتب اسمًا من ثلاثة أحرف على الأقل." : !draft.classification ? "اختر مجال الموضوع." : !selectedWorkflow ? "انتظر تحميل المسار أو اختر مسارًا متاحًا." : requirementsError(requirements);
  const acceptanceLabels = selectedWorkflow?.layout_only ? { advance: "حسب سياسة كل مجلس أدناه", complete: "حسب سياسة كل مجلس أدناه", return_previous: "حسب سياسة كل مجلس أدناه" } : baseAcceptanceLabels;
  const rejectionLabels = selectedWorkflow?.layout_only ? { complete: "حسب سياسة كل مجلس أدناه", return_previous: "حسب سياسة كل مجلس أدناه", refer_lower: "حسب سياسة كل مجلس أدناه" } : baseRejectionLabels;

  useEffect(() => {
    if (!creating) return;
    const controller = new AbortController();
    fetch("/api/admin/governance-model", { cache: "no-store", signal: controller.signal })
      .then(async response => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error?.message ?? "تعذر تحميل خيارات الإعداد.");
        setOptions(payload.data as AuthoringOptions);
        setOptionsState("ready");
      }).catch(error => {
        if ((error as Error).name === "AbortError") return;
        setOptionsState("error");
        setSaveMessage(error instanceof Error ? error.message : "تعذر تحميل خيارات الإعداد.");
      });
    return () => controller.abort();
  }, [creating, optionsAttempt]);

  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    requestId.current = null;
    if (key === "workflowVersionId") {
      const route = options.workflow_versions.find(item => item.id === value);
      setStagePolicies(route?.layout_only ? defaultStagePolicies(route.steps) : []);
    }
    setDraft(current => ({ ...current, [key]: value }));
    setErrors(current => ({ ...current, [key]: "" }));
  }
  function beginCreating() { setOptionsState("loading"); setCreating(true); }
  function beginEditing(detail: TopicTypeDetail) {
    const config = detail.schedule?.rule_config ?? {};
    setEditing({ id: detail.bundle.id, lockVersion: detail.bundle.lock_version });
    setDraft({ name: detail.topic_type.name_ar, classification: detail.classification.name_ar,
      classificationCode: detail.classification.code, acceptance: detail.version.acceptance_finality,
      rejection: detail.version.rejection_finality,
      workflowVersionId: detail.workflow_binding.source_layout_version_id || detail.workflow_binding.workflow_template_version_id });
    setStagePolicies(detail.workflow_binding.stage_policies ?? []);
    setRequirements({ ...initialRequirements, scopeKind: detail.authoring?.scope_kind ?? "route",
      scopeIds: detail.authoring?.scope_ids ?? [], sourceItemIds: detail.authoring?.source_items?.map(item => item.id) ?? [],
      requiredAttachmentCount: detail.authoring?.required_attachment_count ?? 0,
      submissionInstructions: detail.authoring?.submission_instructions ?? "",
      discussionInstructions: detail.authoring?.discussion_instructions ?? "",
      automaticAgenda: detail.authoring?.submission_mode === "automatic_agenda",
      scheduleKind: detail.schedule?.rule_type ?? "none", date: String(config.date ?? ""),
      startsOn: String(config.starts_on ?? ""), endsOn: String(config.ends_on ?? ""),
      week: Number(config.week ?? 1), month: Number(config.month ?? 1), day: Number(config.day ?? 1) });
    beginCreating();
  }
  function next() {
    if (step === 0) {
      const validation: Record<string, string> = {};
      if (!draft.classification) validation.classification = "اختر تصنيف الموضوع حتى يستطيع النظام تحديد القواعد المناسبة.";
      if (draft.name.trim().length < 3) validation.name = "اكتب اسماً واضحاً من 3 أحرف على الأقل.";
      if (requirements.scopeKind !== "route" && !requirements.scopeIds.length) validation.requirements = "اختر مجلسًا أو مستوى مجالس واحدًا على الأقل للنطاق.";
      if (Object.keys(validation).length) { setErrors(validation); return; }
    }
    if (step === 1 && !draft.workflowVersionId) {
      setErrors({ workflowVersionId: "اختر مسار حوكمة فعّالاً قبل المتابعة." }); return;
    }
    if (step === 2 && requirementsError(requirements)) { setErrors({ requirements: requirementsError(requirements)! }); return; }
    setStep(value => Math.min(steps.length - 1, value + 1));
  }
  const saving = useRef(false);
  async function save() {
    if (saving.current || saveState === "success" || !selectedWorkflow) return;
    if (draft.name.trim().length < 3 || !draft.classification) { setErrors({ name: "أكمل مجال الموضوع واكتب اسمًا من ثلاثة أحرف على الأقل." }); setStep(0); return; }
    const invalid = requirementsError(requirements);
    if (invalid) { setErrors({ requirements: invalid }); setStep(2); return; }
    saving.current = true;
    setSaveState("saving"); setSaveMessage("");
    requestId.current ??= crypto.randomUUID();
    try {
      const response = await fetch("/api/admin/governance-model", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bundleId: editing?.id ?? null, expectedLockVersion: editing?.lockVersion ?? null, clientRequestId: requestId.current,
          bundle: {
            classification: { code: draft.classificationCode, name_ar: draft.classification },
            topic_type: { name_ar: draft.name.trim() },
            version: { is_governed: true, acceptance_finality: draft.acceptance, rejection_finality: draft.rejection },
            workflow: { workflow_template_version_id: draft.workflowVersionId,
              ...(selectedWorkflow.layout_only ? { stage_policies: stagePolicies } : {}) },
            ...requirementsPayload(requirements),
          } }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(`${payload?.error?.message ?? "تعذر حفظ المسودة."}${payload?.error?.traceId ? ` رقم التتبع: ${payload.error.traceId}` : ""}`);
      const reference = payload?.data?.reference_numbers?.topic_type;
      if (!payload?.data?.bundle_id || typeof reference !== "string" || !/^TYP-\d{4}-\d+$/.test(reference)) {
        throw new Error("تعذر التحقق من نتيجة الحفظ. أعد المحاولة بالمحتوى نفسه.");
      }
      setSavedReference(reference); setSaveMessage("حُفظت المسودة كاملة بنجاح.");
      setLastSavedId(payload.data.bundle_id);
      setSaveState("success"); requestId.current = null;
    } catch (error) {
      setSaveMessage(error instanceof Error ? error.message : "تعذر حفظ المسودة."); setSaveState("error");
    } finally { saving.current = false; }
  }
  function close() {
    setCreating(false); setStep(0); setDraft(initialDraft); setErrors({});
    setEditing(null);
    setSaveState("idle"); setSaveMessage(""); setSavedReference("");
    setStagePolicies([]); requestId.current = null;
    setRequirements(initialRequirements);
  }

  return <section className={styles.workspace} dir="rtl">
    <GovernancePageHeader current="types" id="topic-types-title" title={creating ? "إعداد تصنيف موضوع" : "تصنيفات الموضوعات"}
      description="حدّد هوية الموضوع ومساره وسياسة القرار، ليستخدمها مقدّم الموضوع دون إعدادات تقنية."
      actions={creating ? <button type="button" disabled={saveState === "saving"} onClick={close}><X size={17}/>إغلاق المسودة</button> : <button type="button" disabled={!ready} onClick={beginCreating}><CirclePlus size={18}/>إنشاء نوع موضوع</button>} />
    {!creating ? <TopicTypesList onEdit={beginEditing} initialBundleId={lastSavedId}/> : <>
      <nav className={styles.progress} aria-label="خطوات إعداد نوع الموضوع">
        <p className={styles.mobileProgress}>الخطوة {step + 1} من {steps.length} · {steps[step].title}</p>
        <ol>{steps.map((item,index)=><li key={item.title}><button type="button" aria-current={index===step?"step":undefined} disabled={(!editing&&index>step)||saveState==="saving"||saveState==="success"} onClick={()=>setStep(index)}><span>{index<step?<Check size={16}/>:index+1}</span><div><strong>{item.title}</strong><small>{item.hint}</small></div></button></li>)}</ol>
      </nav>
      <div className={styles.layout}>
        <div className={styles.panel}>
          <fieldset className={styles.fields} disabled={saveState==="saving"||saveState==="success"}>
          {step===0 && <div>
            <div className={styles.panelTitle}><span>01 / الهوية</span><h2>ما نوع الموضوع؟</h2><p>اختر مجاله واكتب اسمًا واضحًا يعبّر عن الإجراء المطلوب.</p></div>
            <fieldset className={styles.classifications}><legend>مجال الموضوع</legend><div>{classificationOptions.map(item=><button key={item.code} type="button" onClick={()=>{update("classification",item.name_ar);update("classificationCode",item.code)}} aria-pressed={draft.classificationCode===item.code}>{item.name_ar}{draft.classificationCode===item.code&&<Check size={16}/>}</button>)}</div>{errors.classification&&<p role="alert" className={styles.errorText}>{errors.classification}</p>}</fieldset>
            <label className={styles.nameField}>اسم نوع الموضوع<input maxLength={300} value={draft.name} onChange={event=>update("name",event.target.value)} placeholder="مثال: اعتماد برنامج أكاديمي" aria-invalid={Boolean(errors.name)}/>{errors.name&&<span role="alert" className={styles.errorText}>{errors.name}</span>}<small>مثال آخر: إقرار خطة الاختبارات أو اعتماد نتائج الفصل الدراسي.</small></label>
            <TopicTypeScopeEditor value={requirements} onChange={updateRequirements} councils={options.councils ?? []} classes={options.council_classes ?? []} loading={optionsState === "loading"}/>
            {errors.requirements && <p role="alert" className={styles.errorText}>{errors.requirements}</p>}
          </div>}
          {step===1 && <div>
            <div className={styles.panelTitle}><span>02 / الرحلة</span><h2>ما مسار الحوكمة؟</h2><p>اختر ترتيب المجالس، ثم حدّد عمل كل مجلس ونتيجة القرار لهذا التصنيف.</p></div>
            {optionsState==="loading"&&<p role="status" className={styles.notice}>جارٍ تحميل المسارات المتاحة…</p>}
            {optionsState==="error"&&<div role="alert" className={styles.error}>{saveMessage}<button type="button" className={styles.secondary} onClick={()=>{setSaveMessage("");setOptionsState("loading");setOptionsAttempt(value=>value+1)}}>إعادة المحاولة</button></div>}
            {optionsState==="ready"&&options.workflow_versions.length===0&&<p role="alert" className={styles.notice}>لا يوجد مسار متاح. أنشئ مسارًا ونشّطه أولًا من «مسارات الموضوعات».</p>}
            <div className={styles.choices}>{options.workflow_versions.map(item=><Choice key={item.id} selected={draft.workflowVersionId===item.id} title={item.name_ar} description={item.steps.length+" مراحل"} onClick={()=>update("workflowVersionId",item.id)}/>)}</div>
            {errors.workflowVersionId&&<p role="alert" className={styles.errorText}>{errors.workflowVersionId}</p>}
            {selectedWorkflow&&<div className={styles.routePreview} aria-label="معاينة مسار الحوكمة"><span>المجالس بالترتيب</span><ol>{selectedWorkflow.steps.map((node,index)=><li key={node.id}><b>{index+1}</b>{node.name_ar}</li>)}</ol></div>}
            {selectedWorkflow?.layout_only&&<TopicStagePolicyEditor stages={selectedWorkflow.steps} value={stagePolicies} onChange={value=>{requestId.current=null;setStagePolicies(value)}}/>}
            {selectedWorkflow&&!selectedWorkflow.layout_only&&<p className={styles.notice}>هذا مسار سابق بسياساته المحفوظة. اختر مسار ترتيب جديدًا لتحديد سياسة مستقلة لهذا التصنيف.</p>}
          </div>}
          {step===2 && <div>
            <div className={styles.panelTitle}><span>03 / متطلبات الموضوع</span><h2>ما الذي يحتاجه هذا التصنيف؟</h2><p>اربط السند، وأضف المتطلبات والتوقيت عند الحاجة فقط.</p></div>
            <TopicTypeRequirementsEditor value={requirements} onChange={updateRequirements} sourceItems={options.source_items ?? []} loading={optionsState === "loading"} error={optionsState === "error" ? saveMessage : ""} onRetry={retryOptions}/>
            {errors.requirements && <p role="alert" className={styles.errorText}>{errors.requirements}</p>}
          </div>}
          {step===3 && <div>
            <div className={styles.panelTitle}><span>04 / الملخص</span><h2>راجع الإعداد قبل الحفظ</h2><p>احفظ الإعدادات ثم نشّط التصنيف بنفسك من تفاصيله، دون إرسال لاعتماد حساب آخر.</p></div>
            <dl className={styles.review}>{[["المجال",draft.classification],["نوع الموضوع",draft.name],["النطاق",scopeLabel],["المسار",selectedWorkflow?.name_ar??"—"],["الأسانيد",`${requirements.sourceItemIds.length} بند`],["المرفقات",requirements.requiredAttachmentCount ? `${requirements.requiredAttachmentCount} على الأقل` : "غير مطلوبة"],["التوقيت",scheduleNames[requirements.scheduleKind]],["جدول الأعمال",requirements.automaticAgenda ? "إدراج تلقائي · إعداد محفوظ، التشغيل لاحقًا" : "طلب تقديم من المستخدم"]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
            <TopicInstructions title="تعليمات التقديم" text={requirements.submissionInstructions}/>
            <TopicInstructions title="تعليمات المناقشة" text={requirements.discussionInstructions}/>
            {selectedWorkflow?.layout_only&&<fieldset disabled><TopicStagePolicyEditor stages={selectedWorkflow.steps} value={stagePolicies} onChange={()=>{}}/></fieldset>}
          </div>}
          </fieldset>
          {saveState!=="idle"&&<div role={saveState==="error"?"alert":"status"} className={saveState==="error"?styles.error:styles.success}><strong>{saveState==="saving"?"جارٍ حفظ المسودة…":saveState==="success"?"تم الحفظ":"تعذر الحفظ"}</strong><p>{saveMessage}</p>{savedReference&&<bdi>{savedReference}</bdi>}</div>}
          {saveState==="success"&&<div className={styles.savedActions}><p>المرفقات المطلوبة: {requirements.requiredAttachmentCount || "لا توجد"}{requirements.requiredAttachmentCount ? " على الأقل" : ""}. يمكنك الآن تنشيط التصنيف بنفسك.</p><button type="button" className={styles.primary} onClick={close}>عرض التصنيف وتنشيطه<ArrowLeft size={17}/></button></div>}
          {editing&&step<3&&saveState!=="success"&&<div className={styles.quickSave}><button type="button" className={styles.primary} onClick={save} disabled={saveState==="saving"||Boolean(saveBlocker)}>حفظ التعديلات<FileCheck2 size={17}/></button><small>{saveBlocker || "احفظ التغيير قبل العودة؛ ثم نشّطه ليُستخدم في الموضوعات الجديدة."}</small></div>}
          <footer className={styles.footer}><button type="button" className={styles.secondary} disabled={step===0||saveState==="saving"||saveState==="success"} onClick={()=>setStep(value=>Math.max(0,value-1))}><ArrowRight size={17}/>السابق</button>{step<steps.length-1?<button type="button" className={styles.primary} onClick={next}>التالي<ArrowLeft size={17}/></button>:<button type="button" className={styles.primary} onClick={save} disabled={saveState==="saving"||saveState==="success"||!selectedWorkflow}><FileCheck2 size={17}/>{saveState==="saving"?"جارٍ الحفظ…":saveState==="success"?"تم الحفظ":"حفظ المسودة"}</button>}</footer>
        </div>
        <aside className={styles.summary} aria-label="ملخص التصنيف"><div className={styles.summaryHeading}><Tags size={18}/><h2>ملخص التصنيف</h2><span>مسودة</span></div><h3>{draft.name||"اسم نوع الموضوع"}</h3><p>{draft.classification||"اختر مجال الموضوع"}</p><dl>{[["النطاق",scopeLabel],["المسار",selectedWorkflow?.name_ar||"لم يُحدد بعد"],["عند القبول",selectedWorkflow?.layout_only?"حسب سياسة كل مجلس":acceptanceLabels[draft.acceptance]],["عند الرفض",selectedWorkflow?.layout_only?"حسب سياسة كل مجلس":rejectionLabels[draft.rejection]],["التوقيت",scheduleNames[requirements.scheduleKind]]].map(([key,value])=><div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl>{savedReference&&<div className={styles.summaryReference}><small>مرجع نوع الموضوع</small><bdi>{savedReference}</bdi></div>}</aside>
      </div>
    </>}
  </section>;
}
