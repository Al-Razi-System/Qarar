import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(root, "data");
const processedDir = path.join(dataDir, "processed");
const outputDir = path.join(dataDir, "import-ready");

const DISPLAY_ONLY = "display_only";
const REQUIRES_WORKFLOW = "requires_workflow_and_meeting";
const excludedWorkflowPattern = /direct_action|direct_execution/i;
const meetingRulePattern = /decision.*objection|objection.*decision|quorum|vote|voting|conflict|recusal|absence|agenda|notice|minutes|calendar|extraordinary|invited_expert|special_quorum|objection_window|membership_end/i;

const documentConfiguration = {
  department_councils: {
    policyCode: "alrazi_department_councils_regulation",
    policyName: "لائحة مجالس الأقسام بجامعة الرازي",
    governanceClassCode: "department_council",
    defaultWorkflowCode: "department_council_meeting_decision",
    defaultWorkflowName: "اجتماع وقرار مجلس القسم",
    councilType: "department_council",
  },
  faculty_councils: {
    policyCode: "faculty_councils_regulation",
    policyName: "لائحة مجالس الكليات بجامعة الرازي",
    governanceClassCode: "faculty_council",
    defaultWorkflowCode: "faculty_council_meeting_decision",
    defaultWorkflowName: "اجتماع وقرار مجلس الكلية",
    councilType: "faculty_council",
  },
  university_council: {
    policyCode: "university_council_regulation",
    policyName: "لائحة مجلس جامعة الرازي",
    governanceClassCode: "university_council",
    defaultWorkflowCode: "university_council_meeting_decision",
    defaultWorkflowName: "اجتماع وقرار مجلس الجامعة",
    councilType: "university_council",
  },
  graduate_studies_research_council: {
    policyCode: "graduate_studies_research_council_regulation",
    policyName: "لائحة مجلس الدراسات العليا والبحث العلمي",
    governanceClassCode: "graduate_studies_council",
    defaultWorkflowCode: "graduate_council_meeting_decision",
    defaultWorkflowName: "اجتماع وقرار مجلس الدراسات العليا والبحث العلمي",
    councilType: "graduate_studies_council",
  },
  board_of_trustees: {
    policyCode: "board_of_trustees_regulation",
    policyName: "لائحة مجلس الأمناء بجامعة الرازي",
    governanceClassCode: "board_of_trustees",
    defaultWorkflowCode: "board_of_trustees_meeting_decision",
    defaultWorkflowName: "اجتماع وقرار مجلس الأمناء",
    councilType: "board_of_trustees",
  },
};

const readJson = async (file) => JSON.parse(await readFile(file, "utf8"));
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const refCode = (value, prefix) => typeof value === "string" && value.startsWith(prefix) ? value.slice(prefix.length) : null;

function containsDirectedCycle(nodes, transitions) {
  const edges = new Map([...nodes].map((node) => [node, []]));
  for (const transition of transitions) if (transition.to) edges.get(transition.from)?.push(transition.to);
  const visiting = new Set();
  const visited = new Set();
  const visit = (node) => {
    if (visiting.has(node)) return true;
    if (visited.has(node)) return false;
    visiting.add(node);
    for (const next of edges.get(node) ?? []) if (visit(next)) return true;
    visiting.delete(node);
    visited.add(node);
    return false;
  };
  return [...nodes].some(visit);
}

function genericMeetingWorkflow(config, meetingSettings = {}) {
  return {
    code: config.defaultWorkflowCode,
    name_ar: config.defaultWorkflowName,
    description: "مسار معياري يضمن إدراج الموضوع في جدول الأعمال، والتحقق من النصاب، والتصويت، وتوثيق القرار في المحضر.",
    version_no: 1,
    allow_cycles: false,
    activate: true,
    steps: [
      {
        code: "agenda_review",
        name_ar: "مراجعة وإدراج الموضوع في جدول الأعمال",
        sequence_no: 1,
        step_type: "review",
        responsibility: "present",
        governance_class_code: config.governanceClassCode,
        required_permission_code: null,
        is_initial: true,
        is_terminal: false,
        allowed_outcomes: ["approved"],
        entry_conditions: {
          notice_before_days: meetingSettings.notice_before_days ?? null,
          member_submission_before_days: meetingSettings.member_submission_before_days ?? null,
        },
      },
      {
        code: "council_decision",
        name_ar: "مناقشة المجلس والتصويت",
        sequence_no: 2,
        step_type: "voting",
        responsibility: "final_approve",
        governance_class_code: config.governanceClassCode,
        required_permission_code: null,
        is_initial: false,
        is_terminal: false,
        allowed_outcomes: ["approved", "rejected", "tie", "no_vote"],
        exit_conditions: {
          quorum: meetingSettings.quorum ?? null,
          approval_rule: meetingSettings.approval_rule ?? null,
          legal_review_required: meetingSettings.legal_review_required ?? false,
        },
      },
      {
        code: "minutes_confirmation",
        name_ar: "تثبيت القرار في المحضر",
        sequence_no: 3,
        step_type: "follow_up",
        responsibility: "follow_up",
        governance_class_code: config.governanceClassCode,
        required_permission_code: null,
        is_initial: false,
        is_terminal: true,
        allowed_outcomes: ["completed"],
      },
    ],
    transitions: [
      { from: "agenda_review", to: "council_decision", outcome: "approved", transition_type: "forward", conditions: {} },
      { from: "council_decision", to: "minutes_confirmation", outcome: "approved", transition_type: "forward", conditions: {} },
      { from: "council_decision", to: "minutes_confirmation", outcome: "rejected", transition_type: "forward", conditions: {} },
      { from: "council_decision", to: "minutes_confirmation", outcome: "tie", transition_type: "forward", conditions: {} },
      { from: "council_decision", to: "minutes_confirmation", outcome: "no_vote", transition_type: "forward", conditions: {} },
      { from: "minutes_confirmation", to: null, outcome: "completed", transition_type: "complete", conditions: {} },
    ],
  };
}

const councilClassByArabicStage = [
  ["مجلس القسم", "department_council"],
  ["مجلس الكلية", "faculty_council"],
  ["مجلس الدراسات العليا", "graduate_studies_council"],
  ["مجلس الجامعة", "university_council"],
  ["مجلس الأمناء", "board_of_trustees"],
];

function governanceClassForStage(stage) {
  return councilClassByArabicStage.find(([label]) => stage.startsWith(label))?.[1] ?? null;
}

function routedMeetingWorkflow(config, routeCode, stages, meetingSettings) {
  if (routeCode === "local_council_decision") return genericMeetingWorkflow(config, meetingSettings);
  const councilStages = stages
    .map((name) => ({ name, governanceClassCode: governanceClassForStage(name) }))
    .filter((stage) => stage.governanceClassCode);
  if (!councilStages.length && routeCode === "conditional_higher_referral") {
    councilStages.push({ name: "المجلس المختص ابتداءً", governanceClassCode: config.governanceClassCode });
  }
  if (!councilStages.length) throw new Error(`${routeCode}: route has no council stage`);

  const steps = [{
    code: "agenda_review",
    name_ar: "مراجعة الموضوع وإدراجه في جدول الأعمال",
    sequence_no: 1,
    step_type: "review",
    responsibility: "present",
    governance_class_code: councilStages[0].governanceClassCode,
    required_permission_code: null,
    is_initial: true,
    is_terminal: false,
    allowed_outcomes: ["approved"],
    entry_conditions: {
      notice_before_days: meetingSettings.notice_before_days ?? null,
      member_submission_before_days: meetingSettings.member_submission_before_days ?? null,
    },
  }];
  councilStages.forEach((stage, index) => steps.push({
    code: `council_${index + 1}`,
    name_ar: `مناقشة واعتماد: ${stage.name}`,
    sequence_no: index + 2,
    step_type: "voting",
    responsibility: index === councilStages.length - 1 ? "final_approve" : "initial_approve",
    governance_class_code: stage.governanceClassCode,
    required_permission_code: null,
    is_initial: false,
    is_terminal: false,
    allowed_outcomes: ["approved", "rejected", "tie", "no_vote"],
    exit_conditions: index === 0 ? {
      quorum: meetingSettings.quorum ?? null,
      approval_rule: meetingSettings.approval_rule ?? null,
      legal_review_required: meetingSettings.legal_review_required ?? false,
    } : {},
  }));
  steps.push({
    code: "minutes_confirmation",
    name_ar: "تثبيت النتيجة في المحضر وإشعار المعنيين",
    sequence_no: steps.length + 1,
    step_type: "follow_up",
    responsibility: "follow_up",
    governance_class_code: councilStages.at(-1).governanceClassCode,
    required_permission_code: null,
    is_initial: false,
    is_terminal: true,
    allowed_outcomes: ["completed"],
  });

  const transitions = [{ from: "agenda_review", to: "council_1", outcome: "approved", transition_type: "forward", conditions: {} }];
  councilStages.forEach((_, index) => {
    const current = `council_${index + 1}`;
    const next = index === councilStages.length - 1 ? "minutes_confirmation" : `council_${index + 2}`;
    transitions.push({ from: current, to: next, outcome: "approved", transition_type: "forward", conditions: {} });
    transitions.push({ from: current, to: "minutes_confirmation", outcome: "rejected", transition_type: "forward", conditions: {} });
    transitions.push({ from: current, to: "minutes_confirmation", outcome: "tie", transition_type: "forward", conditions: {} });
    transitions.push({ from: current, to: "minutes_confirmation", outcome: "no_vote", transition_type: "forward", conditions: {} });
  });
  transitions.push({ from: "minutes_confirmation", to: null, outcome: "completed", transition_type: "complete", conditions: {} });

  return {
    code: `${config.policyCode}.${routeCode}`,
    name_ar: `مسار ${stages.join(" ← ")}`,
    description: `مسار أجندة معتمد: ${stages.join(" ثم ")}. الاعتماد الخارجي يسجل كمتطلب ولا ينفذ كاجتماع داخلي.`,
    version_no: 1,
    allow_cycles: false,
    activate: true,
    steps,
    transitions,
  };
}

function appendExecutableAgenda(bundleParts, config, agendaCatalog) {
  const agenda = agendaCatalog.agendas.find((entry) => entry.council_type === config.councilType);
  if (!agenda) throw new Error(`${config.councilType}: executable agenda is missing`);
  const meetingSettings = agendaCatalog.meeting_settings[config.councilType] ?? {};
  const maxSort = Math.max(0, ...bundleParts.items.map((item) => item.sort_order ?? 0));

  const workflowByCode = new Map();
  agenda.items.forEach((agendaItem, index) => {
    if (!agendaItem.topic_category_code) {
      throw new Error(`${agendaItem.code}: topic_category_code is required`);
    }
    const workflowCodes = agendaItem.route_options.map((routeCode) => {
      const stages = agendaCatalog.route_templates[routeCode];
      if (!stages) throw new Error(`${agendaItem.code}: unknown route ${routeCode}`);
      const workflow = routedMeetingWorkflow(config, routeCode, stages, meetingSettings);
      workflowByCode.set(workflow.code, workflow);
      return workflow.code;
    });
    bundleParts.items.push({
      item_code: agendaItem.code,
      parent_item_code: null,
      item_type: "clause",
      title_ar: agendaItem.title_ar,
      title_en: null,
      body_text: agendaItem.title_ar,
      official_text: null,
      source_item_key: null,
      printed_article_number: null,
      printed_article_occurrence: null,
      source_page_from: null,
      source_page_to: null,
      source_locator: agendaItem.source_refs.join("؛ "),
      classification: REQUIRES_WORKFLOW,
      requires_workflow_and_meeting: true,
      topic_category_code: agendaItem.topic_category_code,
      workflow_codes: workflowCodes,
      sort_order: maxSort + 10 + index * 10,
      // Council applicability comes from the policy scope, while the topic
      // category selects the executable item. Source metadata is not a runtime
      // condition and remains in source_locator above.
      match_criteria: {},
    });
    bundleParts.routes.push({
      policy_item_code: agendaItem.code,
      workflow_codes: workflowCodes,
      topic_category_codes: workflowCodes.map(() => agendaItem.topic_category_code),
      reason_ar: "بند مدرج صراحة في قائمة الأجندة التنفيذية الحصرية المعتمدة.",
    });
  });
  bundleParts.workflows.push(...workflowByCode.values());
}

function normalizeWorkflow(workflow) {
  const create = workflow.create?.payload ?? {};
  const stepCodes = new Map((workflow.steps ?? []).map((step) => [step.local_id, step.payload.p_step_code]));
  const transitions = (workflow.transitions ?? []).map(({ payload }) => {
    const to = payload.p_to_step_id ? stepCodes.get(refCode(payload.p_to_step_id, "$step:")) : null;
    return {
      from: stepCodes.get(refCode(payload.p_from_step_id, "$step:")),
      to,
      outcome: payload.p_outcome_code,
      transition_type: !to && payload.p_transition_type === "forward" && payload.p_outcome_code === "approved"
        ? "complete"
        : payload.p_transition_type,
      conditions: payload.p_conditions ?? {},
    };
  });
  return {
    code: workflow.local_id ?? create.p_code,
    name_ar: create.p_name_ar,
    name_en: create.p_name_en ?? null,
    description: create.p_description ?? null,
    version_no: 1,
    allow_cycles: containsDirectedCycle(new Set(stepCodes.values()), transitions),
    activate: Boolean(workflow.activate),
    steps: (workflow.steps ?? []).map(({ payload }) => ({
      code: payload.p_step_code,
      name_ar: payload.p_name_ar,
      sequence_no: payload.p_sequence_no,
      step_type: payload.p_step_type,
      responsibility: payload.p_responsibility,
      governance_unit_id: payload.p_governance_unit_id ?? null,
      governance_class_code: refCode(payload.p_governance_class_id, "$class:"),
      required_permission_code: payload.p_required_permission_code ?? null,
      is_initial: Boolean(payload.p_is_initial),
      is_terminal: Boolean(payload.p_is_terminal),
      entry_conditions: payload.p_entry_conditions ?? {},
      exit_conditions: payload.p_exit_conditions ?? {},
      allowed_outcomes: payload.p_allowed_outcomes ?? [],
    })),
    transitions,
  };
}

function operationalSourceItems(rule) {
  if (Array.isArray(rule.source_items)) return rule.source_items;
  const single = refCode(rule.source_item_ref, "$item:");
  return single ? [single] : [];
}

function articleAncestors(items) {
  const byCode = new Map(items.map((item) => [item.payload.p_item_code, item]));
  const result = new Map();
  for (const item of items) {
    let current = item;
    while (current) {
      if (current.payload.p_item_type === "article") {
        result.set(item.payload.p_item_code, current.payload.p_item_code);
        break;
      }
      current = byCode.get(refCode(current.payload.p_parent_item_id, "$item:"));
    }
  }
  return result;
}

function sourceArticleMap(items, sourceArticles) {
  // Some legacy bundles incorrectly typed an approval preamble as an article.
  // Only identifiers that represent numbered legal articles participate in source mapping.
  const articleItems = items.filter((item) =>
    item.payload.p_item_type === "article" && /(?:^|\.)art\d+(?:\.|$)/i.test(item.payload.p_item_code),
  );
  if (articleItems.length !== sourceArticles.length) {
    throw new Error(`Article count mismatch: legacy=${articleItems.length}, source=${sourceArticles.length}`);
  }
  return new Map(articleItems.map((item, index) => [item.payload.p_item_code, sourceArticles[index]]));
}

function buildLegacyBundle(document, source, legacy, agendaCatalog) {
  const config = documentConfiguration[document.code];
  const routes = [];
  const parts = { items: [], workflows: [], routes };
  appendExecutableAgenda(parts, config, agendaCatalog);
  return assembleBundle(document, config, source, parts.items, parts.workflows, parts.routes, [], legacy);
}

function correctedBoardArticles(source) {
  const articles = structuredClone(source.articles);
  articles[3].official_text = articles[3].official_text.replace("إذا شعر مركز", "إذا شغر مركز");
  articles[8].official_text = `${articles[8].official_text}\n${articles[9].official_text}`.trim();
  const minutesStart = articles[10].official_text.search(/أ\s*[-–]\s*يحرر/);
  if (minutesStart < 0) throw new Error("Board article 11 boundary could not be identified");
  const articleTen = articles[10].official_text.slice(0, minutesStart).trim();
  const articleEleven = articles[10].official_text.slice(minutesStart).trim();
  articles[9].official_text = articleTen;
  articles[10].official_text = articleEleven;
  return articles;
}

function buildBoardBundle(document, source, agendaCatalog) {
  const config = documentConfiguration[document.code];
  const routes = [];
  const parts = { items: [], workflows: [], routes };
  appendExecutableAgenda(parts, config, agendaCatalog);
  return assembleBundle(document, config, source, parts.items, parts.workflows, parts.routes, [], null);
}

function assembleBundle(document, config, source, items, workflows, routes, operationalRules, legacy) {
  const executableCount = items.filter((item) => item.requires_workflow_and_meeting).length;
  const scope = {
    scope_type: config.scopeType ?? "governance_class",
    governance_class_code: config.governanceClassCode,
    governance_level: config.governanceLevel ?? null,
    include_descendants: false,
    priority: 100,
  };
  const bundle = {
    schema_version: "qarar.policy_binary_bundle.v1",
    generated_at: new Date().toISOString(),
    classification_model: {
      type: "binary",
      values: [DISPLAY_ONLY, REQUIRES_WORKFLOW],
      default: DISPLAY_ONLY,
    },
    source_document: document,
    source_status: source.status,
    policy: {
      code: config.policyCode,
      name_ar: config.policyName,
      name_en: legacy?.policy?.payload?.p_name_en ?? null,
      policy_type: "regulation",
      description: `بنود الأجندة التنفيذية المعتمدة لـ${document.title_ar}.`,
      status: "active",
    },
    version: {
      version_no: 1,
      version_label: "بنود الأجندة التنفيذية",
      change_summary: "قائمة البنود التنفيذية التي تتطلب مساراً واجتماعاً فقط.",
      legal_status: "draft_pending_formal_approval",
    },
    scopes: [scope],
    items,
    workflows,
    routes,
    operational_rules: operationalRules,
    source_issues: source.issues ?? [],
    validation_summary: {
      item_count: items.length,
      display_only_count: items.length - executableCount,
      requires_workflow_and_meeting_count: executableCount,
      workflow_count: workflows.length,
      route_count: routes.length,
      operational_rule_count: operationalRules.length,
      excluded_procedure_items: (legacy?.policy_items ?? []).filter((item) => item.payload?.p_item_type === "procedure").length,
    },
  };
  bundle.content_sha256 = sha256(JSON.stringify({ ...bundle, generated_at: undefined, content_sha256: undefined }));
  return bundle;
}

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });
const registry = await readJson(path.join(dataDir, "regulation_source_registry.json"));
const agendaCatalog = await readJson(path.join(dataDir, "executable_agenda_items.v1.json"));
const outputIndex = [];

for (const document of registry.documents) {
  const source = await readJson(path.join(processedDir, `${document.code}.source.json`));
  const bundle = document.legacy_bundle_file
    ? buildLegacyBundle(document, source, await readJson(path.join(dataDir, document.legacy_bundle_file)), agendaCatalog)
    : buildBoardBundle(document, source, agendaCatalog);
  const outputFile = `${document.code}.binary-bundle.json`;
  await writeFile(path.join(outputDir, outputFile), `${JSON.stringify(bundle, null, 2)}\n`, "utf8");
  outputIndex.push({
    code: document.code,
    title_ar: document.title_ar,
    file: outputFile,
    content_sha256: bundle.content_sha256,
    ...bundle.validation_summary,
  });
}

const index = {
  schema_version: "qarar.policy_binary_bundle_index.v1",
  generated_at: new Date().toISOString(),
  classification_model: registry.classification_model,
  ready_for_database_import: true,
  bundles: outputIndex,
  totals: outputIndex.reduce((totals, bundle) => {
    for (const key of ["item_count", "display_only_count", "requires_workflow_and_meeting_count", "workflow_count", "route_count", "operational_rule_count", "excluded_procedure_items"]) {
      totals[key] += bundle[key];
    }
    return totals;
  }, { item_count: 0, display_only_count: 0, requires_workflow_and_meeting_count: 0, workflow_count: 0, route_count: 0, operational_rule_count: 0, excluded_procedure_items: 0 }),
};
await writeFile(path.join(outputDir, "index.json"), `${JSON.stringify(index, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify(index, null, 2)}\n`);
