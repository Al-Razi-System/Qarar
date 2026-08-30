import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

const baseUrl = process.env.QARAR_BASE_URL ?? "http://localhost:3000";
const email = process.env.QARAR_ADMIN_EMAIL;
const password = process.env.QARAR_ADMIN_PASSWORD;
const sourcePath =
  process.env.QARAR_REGULATION_PDF ??
  "D:\\العرض الفني والمالي للمعهد\\التسويق بالذكاء الاصطناعي\\اليوم الخامس\\لائحة مجلس الجامعة.pdf";
const contentPath = new URL(
  "../docs/regulations/university-council-regulation-content-ar.md",
  import.meta.url,
);

if (!email || !password) {
  throw new Error("Set QARAR_ADMIN_EMAIL and QARAR_ADMIN_PASSWORD before running the importer.");
}

const login = await fetch(`${baseUrl}/api/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, password }),
});
if (!login.ok) throw new Error(`Login failed (${login.status}).`);
const cookies = login.headers
  .getSetCookie()
  .map((value) => value.split(";", 1)[0])
  .join("; ");

async function rpc(contract, params = {}) {
  const response = await fetch(`${baseUrl}/api/admin/regulations`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookies },
    body: JSON.stringify({ contract, params }),
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`${contract}: ${payload.error?.message ?? response.statusText}`);
  }
  return payload.data;
}

function parseDocument(markdown) {
  const lines = markdown.split(/\r?\n/);
  const chapters = [];
  const articles = [];
  let chapter = null;
  let article = null;

  const flushArticle = () => {
    if (!article) return;
    article.body = article.lines.join("\n").trim();
    delete article.lines;
    articles.push(article);
    article = null;
  };

  for (const line of lines) {
    const chapterMatch = line.match(/^## (الفصل .+?):\s*(.+)$/);
    if (chapterMatch) {
      flushArticle();
      chapter = {
        ordinal: chapters.length + 1,
        title: `${chapterMatch[1]}: ${chapterMatch[2]}`,
      };
      chapters.push(chapter);
      continue;
    }
    const articleMatch = line.match(/^### المادة \((\d+)\):\s*(.+)$/);
    if (articleMatch) {
      flushArticle();
      article = {
        number: Number(articleMatch[1]),
        title: articleMatch[2].trim(),
        chapterOrdinal: chapter?.ordinal ?? 1,
        lines: [],
      };
      continue;
    }
    if (article && !line.startsWith("---")) article.lines.push(line);
  }
  flushArticle();
  return { chapters, articles };
}

function sourcePage(articleNumber) {
  if (articleNumber <= 3) return 1;
  if (articleNumber <= 7) return 2;
  if (articleNumber <= 13) return 3;
  if (articleNumber === 14) return 4;
  if (articleNumber === 15) return 6;
  if (articleNumber <= 20) return 8;
  if (articleNumber <= 24) return 9;
  return 10;
}

function action(code, label, actionType, options = {}) {
  const actionTypeMap = {
    block: "return",
    record: "execute",
    notify: "execute",
    route: "refer",
    complete: "execute",
    calculate: "execute",
    schedule: "execute",
    apply: "execute",
  };
  return {
    code,
    label_ar: label,
    action_type: actionTypeMap[actionType] ?? actionType,
    is_terminal: options.terminal ?? false,
    requires_reason: options.reason ?? false,
    result_payload: options.payload ?? {},
  };
}

function condition(code, fieldPath, operator, expectedValue, failureMessage, failureAction = "block") {
  const failureActionMap = {
    notify: "warn",
    wait: "warn",
    ignore: "warn",
    return: "return_for_completion",
  };
  return {
    code,
    field_path: fieldPath,
    operator,
    expected_value: expectedValue,
    failure_action: failureActionMap[failureAction] ?? failureAction,
    failure_message_ar: failureMessage,
  };
}

function requirement(code, name, requirementType, timing = "before_submission") {
  const requirementTypeMap = {
    record: "data",
    signature: "approval",
    statement: "declaration",
    schedule: "data",
  };
  const timingMap = { before_approval: "before_decision" };
  return {
    code,
    name_ar: name,
    requirement_type: requirementTypeMap[requirementType] ?? requirementType,
    is_mandatory: true,
    timing: timingMap[timing] ?? timing,
    validation_spec: {},
  };
}

const rulesByArticle = new Map([
  [
    7,
    [
      {
        code: "council-membership-composition",
        name_ar: "التحقق من اكتمال تشكيل مجلس الجامعة",
        description: "لا يعتمد تشكيل المجلس قبل تسجيل الرئيس والأعضاء والصفات النظامية المحددة.",
        rule_type: "eligibility",
        conditions: [condition("members_recorded", "council.members_count", "gte", 8, "تشكيل المجلس غير مكتمل.")],
        requirements: [requirement("formation_decision", "قرار تشكيل مجلس الجامعة", "document")],
        actions: [action("return_incomplete", "إعادة لاستكمال بيانات التشكيل", "return", { reason: true })],
      },
    ],
  ],
  [
    17,
    [
      {
        code: "conflict-of-interest-disclosure",
        name_ar: "الإفصاح عن تعارض المصالح والامتناع عن التصويت",
        description: "يلزم العضو بالإفصاح والانسحاب من المداولة والامتناع عن التصويت عند تعارض المصالح.",
        rule_type: "prohibition",
        conditions: [condition("conflict_declared", "member.has_conflict", "eq", false, "يوجد تعارض مصالح غير معالج.")],
        requirements: [requirement("conflict_disclosure", "إقرار الإفصاح عن تعارض المصالح", "declaration", "before_review")],
        actions: [action("exclude_vote", "استبعاد صوت العضو المتعارض", "block"), action("record_disclosure", "إثبات الإفصاح في المحضر", "record")],
      },
    ],
  ],
  [
    19,
    [
      {
        code: "repeated-absence-review",
        name_ar: "معالجة الغياب عن ثلاثة اجتماعات متتالية",
        description: "ينشئ تنبيهًا لرئيس المجلس عند بلوغ العضو ثلاثة غيابات متتالية دون عذر.",
        rule_type: "requirement",
        conditions: [condition("absence_limit", "member.consecutive_unexcused_absences", "lt", 3, "بلغ العضو حد الغياب الذي يستوجب الاستبدال.", "notify")],
        requirements: [],
        actions: [action("notify_chair", "إشعار رئيس المجلس", "notify"), action("start_replacement", "بدء إجراء استبدال العضو", "route", { reason: true })],
      },
    ],
  ],
  [
    20,
    [
      {
        code: "meeting-minutes-required",
        name_ar: "إلزام محضر الاجتماع والتوقيعات",
        description: "يشترط توثيق الحضور والغياب والموضوعات والقرارات وتوقيع الرئيس والمقرر.",
        rule_type: "requirement",
        conditions: [],
        requirements: [requirement("meeting_minutes", "محضر الاجتماع", "document", "before_approval"), requirement("chair_signature", "توقيع رئيس المجلس", "signature", "before_approval"), requirement("rapporteur_signature", "توقيع مقرر المجلس", "signature", "before_approval")],
        actions: [action("return_minutes", "إعادة المحضر للاستكمال", "return", { reason: true })],
      },
      {
        code: "agenda-two-day-notice",
        name_ar: "توزيع جدول الأعمال قبل الاجتماع بيومين",
        description: "يتحقق من إرسال جدول الأعمال للأعضاء قبل موعد الاجتماع بيومين على الأقل.",
        rule_type: "deadline",
        conditions: [condition("notice_days", "meeting.agenda_notice_days", "gte", 2, "يجب توزيع جدول الأعمال قبل الاجتماع بيومين على الأقل.")],
        requirements: [requirement("agenda_delivery", "إثبات إرسال جدول الأعمال", "evidence", "before_review")],
        actions: [action("block_meeting", "منع اعتماد الدعوة", "block")],
      },
    ],
  ],
  [
    21,
    [
      {
        code: "monthly-meeting-frequency",
        name_ar: "دورية الاجتماع الشهرية",
        description: "يتحقق من عقد اجتماع واحد على الأقل كل شهر.",
        rule_type: "deadline",
        conditions: [condition("monthly_frequency", "meeting.days_since_previous", "lte", 31, "لم يعقد المجلس اجتماعه الدوري خلال شهر.", "notify")],
        requirements: [],
        actions: [action("notify_rapporteur", "تنبيه مقرر المجلس", "notify")],
      },
      {
        code: "two-thirds-quorum",
        name_ar: "نصاب حضور ثلثي الأعضاء",
        description: "لا يبدأ الاجتماع قبل حضور ثلثي أعضاء المجلس.",
        rule_type: "eligibility",
        conditions: [condition("quorum_ratio", "meeting.attendance_ratio", "gte", 0.6667, "لم يكتمل نصاب ثلثي الأعضاء.")],
        requirements: [requirement("attendance_register", "سجل الحضور المعتمد", "record", "before_review")],
        actions: [action("block_start", "منع بدء الاجتماع", "block")],
      },
      {
        code: "two-thirds-vote",
        name_ar: "اعتماد القرار بأغلبية ثلثي الحاضرين",
        description: "لا يعتمد القرار ما لم يحصل على ثلثي أصوات الأعضاء الحاضرين.",
        rule_type: "calculation",
        conditions: [condition("vote_ratio", "vote.approval_ratio", "gte", 0.6667, "لم يحصل القرار على أغلبية الثلثين.")],
        requirements: [requirement("vote_result", "نتيجة التصويت المجمدة", "record", "before_approval")],
        actions: [action("approve", "اعتماد القرار", "approve", { terminal: true }), action("reject", "عدم اعتماد القرار", "reject", { terminal: true, reason: true })],
      },
      {
        code: "higher-objection-window",
        name_ar: "مهلة اعتراض الرئيس الأعلى خمسة عشر يومًا",
        description: "تعد القرارات نافذة إذا لم يرد اعتراض خلال خمسة عشر يومًا من الإبلاغ.",
        rule_type: "deadline",
        conditions: [condition("objection_window", "decision.days_since_notification", "gte", 15, "ما زالت مهلة الاعتراض النظامية قائمة.", "wait")],
        requirements: [requirement("notification_proof", "إثبات إبلاغ الرئيس الأعلى", "evidence", "after_decision")],
        actions: [action("mark_effective", "إثبات نفاذ القرار", "complete", { terminal: true }), action("return_objection", "إعادة القرار مع أسباب الاعتراض", "return", { reason: true })],
      },
    ],
  ],
  [
    22,
    [
      {
        code: "extraordinary-meeting-request",
        name_ar: "طلب الاجتماع الاستثنائي وتسبيب الدعوة",
        description: "يقبل الاجتماع الاستثنائي بطلب الرئيس أو ثلث الأعضاء مع مبررات، وتوجه الدعوة قبل يومين.",
        rule_type: "eligibility",
        conditions: [condition("requester_authorized", "meeting.requester_members_ratio", "gte", 0.3334, "الطلب لا يحقق نسبة ثلث الأعضاء ولا يصدر عن الرئيس."), condition("notice_days", "meeting.notice_days", "gte", 2, "يجب توجيه الدعوة قبل يومين.")],
        requirements: [requirement("request_reasons", "مبررات الاجتماع الاستثنائي", "statement", "before_submission")],
        actions: [action("accept_request", "قبول طلب الاجتماع", "approve"), action("return_request", "إعادة الطلب للاستكمال", "return", { reason: true })],
      },
    ],
  ],
  [
    24,
    [
      {
        code: "absolute-majority-quorum",
        name_ar: "نصاب الأغلبية المطلقة والتصويت",
        description: "يتحقق من الأغلبية المطلقة، ويطبق حد الثلثين عند الاجتماع المعاد، ويرجح جانب الرئيس عند التعادل.",
        rule_type: "calculation",
        conditions: [condition("absolute_majority", "meeting.present_members", "gt", "meeting.total_members/2", "لم تكتمل الأغلبية المطلقة.")],
        requirements: [requirement("attendance_record", "كشف الحضور النهائي", "record", "before_review")],
        actions: [action("allow_vote", "فتح التصويت", "approve"), action("chair_tie_break", "ترجيح الجانب الذي منه الرئيس عند التعادل", "calculate")],
      },
    ],
  ],
  [
    25,
    [
      {
        code: "delegation-majority-approval",
        name_ar: "اعتماد تفويض الصلاحيات بأغلبية الأعضاء",
        description: "لا ينفذ التفويض قبل موافقة أغلبية الأعضاء وتوثيق شروط ممارسته.",
        rule_type: "requirement",
        conditions: [condition("majority_approval", "vote.approval_ratio", "gt", 0.5, "لم يحصل التفويض على موافقة الأغلبية.")],
        requirements: [requirement("delegation_terms", "وثيقة شروط ممارسة التفويض", "document", "before_approval")],
        actions: [action("activate_delegation", "تفعيل التفويض", "approve", { terminal: true }), action("reject_delegation", "رفض التفويض", "reject", { terminal: true, reason: true })],
      },
    ],
  ],
  [
    26,
    [
      {
        code: "monthly-council-calendar",
        name_ar: "الجدول الشهري لاجتماعات المجالس",
        description: "يربط كل مجلس بالأسبوع الشهري المحدد في اللائحة.",
        rule_type: "requirement",
        conditions: [],
        requirements: [requirement("annual_calendar", "التقويم السنوي لاجتماعات المجالس", "schedule", "before_submission")],
        actions: [action("schedule_meeting", "جدولة الاجتماع في أسبوعه النظامي", "schedule")],
      },
    ],
  ],
  [
    27,
    [
      {
        code: "expert-non-voting-attendance",
        name_ar: "دعوة الخبراء دون حق التصويت",
        description: "يسمح بدعوة أهل الخبرة مع منع احتسابهم ضمن النصاب أو التصويت.",
        rule_type: "prohibition",
        conditions: [condition("expert_vote", "attendee.is_voting_member", "eq", false, "الخبير المدعو لا يملك حق التصويت.")],
        requirements: [requirement("expert_invitation", "دعوة الخبير وسبب حضوره", "document", "before_review")],
        actions: [action("exclude_from_quorum", "استبعاد الخبير من النصاب والتصويت", "calculate")],
      },
    ],
  ],
  [
    28,
    [
      {
        code: "regulation-effective-date",
        name_ar: "نفاذ اللائحة من تاريخ صدورها",
        description: "يبدأ تطبيق اللائحة على المعاملات والاجتماعات من تاريخ صدورها.",
        rule_type: "informational",
        conditions: [condition("effective_date", "event.date", "gte", "policy.approval_date", "الواقعة سابقة لتاريخ نفاذ اللائحة.", "ignore")],
        requirements: [],
        actions: [action("apply_regulation", "تطبيق أحكام اللائحة", "apply")],
      },
    ],
  ],
]);

const markdown = await readFile(contentPath, "utf8");
const { chapters, articles } = parseDocument(markdown);
if (chapters.length < 5 || articles.length < 28) {
  throw new Error(`Document parsing is incomplete: ${chapters.length} chapters, ${articles.length} articles.`);
}

const chapterItems = chapters.map((chapter) => ({
  item_code: `CH-${String(chapter.ordinal).padStart(2, "0")}`,
  item_type: "chapter",
  title_ar: chapter.title,
  body_text: chapter.title,
  sort_order: chapter.ordinal * 1000,
  governance_mode: "custom_route_allowed",
  match_criteria: {},
}));
const articleItems = articles.map((article) => ({
  item_code: `ART-${String(article.number).padStart(2, "0")}`,
  item_type: "article",
  title_ar: `المادة (${article.number}): ${article.title}`,
  body_text: article.body,
  sort_order: article.chapterOrdinal * 1000 + article.number * 10,
  governance_mode: "custom_route_allowed",
  match_criteria: {},
}));

const bundle = {
  schema_version: "qarar.policy_import.v3",
  policy: {
    code: "university-council-complete-regulation",
    name_ar: "لائحة مجلس الجامعة المتكاملة",
    name_en: "Complete University Council Regulation",
    policy_type: "regulation",
    description: "النموذج التشريعي والتنفيذي الكامل للائحة مجلس الجامعة، متضمنًا النصوص الرسمية وقواعد الاجتماعات والنصاب والتصويت والحوكمة.",
    status: "active",
  },
  version: {
    version_no: 1,
    version_label: "2018.1-complete",
    change_summary: "إدخال متكامل من المصدر الرسمي مع الهيكل التشريعي والقواعد التنفيذية.",
    items: [...chapterItems, ...articleItems],
    scopes: [{ scope_type: "organization", priority: 100, include_descendants: false }],
  },
  workflows: [],
};

const imported = await rpc("admin_import_policy_bundle", {
  p_bundle: bundle,
  p_client_request_id: randomUUID(),
});
const detail = await rpc("admin_get_policy_detail", { p_policy_id: imported.policy_id });
const version = detail.versions.find((candidate) => candidate.id === imported.version_id) ?? detail.versions[0];
const items = new Map(version.items.map((item) => [item.item_code, item]));

for (const article of articles) {
  const item = items.get(`ART-${String(article.number).padStart(2, "0")}`);
  const parent = items.get(`CH-${String(article.chapterOrdinal).padStart(2, "0")}`);
  await rpc("admin_move_policy_item", {
    p_policy_item_id: item.id,
    p_parent_item_id: parent.id,
    p_sort_order: article.number * 10,
  });
  await rpc("admin_update_policy_item_legal_text", {
    p_policy_item_id: item.id,
    p_official_text: article.body,
    p_interpretation_text: `تطبق المادة (${article.number}) ضمن نطاق مجلس الجامعة والجهات التابعة وفق الإجراءات والقواعد التنفيذية المرتبطة بها.`,
    p_source_page_from: sourcePage(article.number),
    p_source_page_to: sourcePage(article.number),
    p_source_locator: `الفصل ${article.chapterOrdinal} / المادة ${article.number}`,
    p_legal_status: "active",
    p_amendment_note: null,
    p_requires_executable_rule: rulesByArticle.has(article.number),
    p_supersedes_item_id: null,
  });
}

const pdf = await readFile(sourcePath);
const sourceHash = createHash("sha256").update(pdf).digest("hex");
await rpc("admin_update_policy_version_legal_metadata", {
  p_policy_version_id: version.id,
  p_issuing_authority: "رئيس جامعة الرازي",
  p_approval_authority: "رئيس جامعة الرازي",
  p_approval_decision_number: "1/2018",
  p_approval_date: "2018-01-01",
  p_issue_reason: "initial",
  p_supersedes_version_id: null,
  p_source_document_hash: sourceHash,
});

for (const [articleNumber, definitions] of rulesByArticle) {
  const item = items.get(`ART-${String(articleNumber).padStart(2, "0")}`);
  for (const [index, definition] of definitions.entries()) {
    await rpc("admin_save_policy_rule", {
      p_policy_item_id: item.id,
      p_rule: {
        ...definition,
        status: "active",
        priority: 200 - index,
        applies_when: { event: "topic_or_meeting_processing" },
        effect_payload: {},
        requires_workflow: false,
        authorities: [],
        workflow_bindings: [],
      },
    });
  }
}

const firstArticle = items.get("ART-01");
await rpc("admin_save_policy_reference", {
  p_policy_reference_id: null,
  p_source_policy_item_id: firstArticle.id,
  p_target_policy_id: null,
  p_target_policy_version_id: null,
  p_target_policy_item_id: null,
  p_external_reference: "القانون رقم (13) لسنة 2005م بشأن الجامعات والمعاهد العليا والكليات الأهلية ولائحته التنفيذية",
  p_reference_type: "based_on",
  p_citation_text: "قرار إصدار لائحة المجالس بالجامعة لسنة 2018م",
  p_notes: "مرجع الإصدار والاختصاص النظامي.",
});

const form = new FormData();
form.set("file", new Blob([pdf], { type: "application/pdf" }), "لائحة مجلس الجامعة.pdf");
form.set("policyId", imported.policy_id);
form.set("target", "version");
form.set("versionId", version.id);
form.set("description", "النسخة المصدر المعتمدة التي بُني عليها النص التشريعي والقواعد التنفيذية.");
const upload = await fetch(`${baseUrl}/api/admin/regulations/upload`, {
  method: "POST",
  headers: { Cookie: cookies },
  body: form,
});
if (!upload.ok) {
  const payload = await upload.json();
  throw new Error(`Source upload failed: ${payload.error?.message ?? upload.statusText}`);
}

const readiness = await rpc("admin_validate_policy_version_readiness", {
  p_policy_version_id: version.id,
});
console.log(
  JSON.stringify(
    {
      policy_id: imported.policy_id,
      version_id: version.id,
      chapters: chapters.length,
      articles: articles.length,
      rules: [...rulesByArticle.values()].reduce((count, rows) => count + rows.length, 0),
      readiness,
      url: `${baseUrl}/admin/regulations/${imported.policy_id}`,
    },
    null,
    2,
  ),
);
