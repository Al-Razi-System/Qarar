#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(root, "data", "import-ready");
const apply = process.argv.includes("--apply");
const exportV4 = process.argv.includes("--export-v4");
const confirmed = process.argv.includes("--confirm-local-import");
const runtimeRoot = process.env.QARAR_RUNTIME_ROOT
  ? path.resolve(process.env.QARAR_RUNTIME_ROOT)
  : existsSync(path.resolve(root, "..", "Qarar-core01", "supabase", "docker", ".env"))
    ? path.resolve(root, "..", "Qarar-core01")
    : root;
const envPath = path.join(runtimeRoot, "supabase", "docker", ".env");

function loadEnv(file) {
  const values = {};
  for (const line of file.split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) values[match[1].trim()] = match[2].trim();
  }
  return values;
}

function deterministicUuid(content) {
  const bytes = Buffer.from(createHash("sha256").update(content).digest().subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function authorityAction(responsibility) {
  return {
    present: "verify",
    prepare: "verify",
    review: "verify",
    recommend: "recommend",
    initial_approve: "approve",
    approve: "approve",
    final_approve: "final_approve",
    execute: "execute",
    follow_up: "follow_up",
    record: "follow_up",
  }[responsibility] ?? "verify";
}

function classifyRule(code) {
  if (/quorum|vote|voting|calendar/.test(code)) return "calculation";
  if (/notice|objection|absence/.test(code)) return "deadline";
  if (/conflict|recusal/.test(code)) return "prohibition";
  if (/agenda|minutes|extraordinary|invited_expert/.test(code)) return "requirement";
  return "routing";
}

function normalizeForV4(bundle, ownerUserId, classIds) {
  const workflowByCode = new Map(bundle.workflows.map((workflow) => [workflow.code, workflow]));
  const routeByItem = new Map(bundle.routes.map((route) => [route.policy_item_code, route]));
  const targetClassId = classIds.get(bundle.scopes[0].governance_class_code);
  if (bundle.scopes[0].scope_type === "governance_class" && !targetClassId) {
    throw new Error(`${bundle.policy.code}: governance class is missing: ${bundle.scopes[0].governance_class_code}`);
  }

  const items = bundle.items.map((item) => {
    const route = routeByItem.get(item.item_code);
    return {
      item_code: item.item_code,
      parent_item_code: item.parent_item_code,
      item_type: item.item_type,
      title_ar: item.title_ar,
      title_en: item.title_en,
      body_text: item.body_text,
      official_text: item.official_text,
      source_page_from: item.source_page_from,
      source_page_to: item.source_page_to,
      source_locator: item.source_locator,
      legal_status: "active",
      requires_executable_rule: item.requires_workflow_and_meeting,
      sort_order: item.sort_order,
      governance_mode: item.requires_workflow_and_meeting ? "regulation_required" : "custom_route_allowed",
      topic_category_code: route?.topic_category_codes?.[0] ?? null,
      // Only runtime predicates belong here. Legal/source metadata is already
      // preserved by the item fields and must not become a topic requirement.
      match_criteria: item.match_criteria ?? {},
      workflow_code: item.workflow_codes[0] ?? null,
    };
  });

  const rules = bundle.routes.flatMap((route) => route.workflow_codes.map((workflowCode, index) => {
    const workflow = workflowByCode.get(workflowCode);
    if (!workflow) throw new Error(`${bundle.policy.code}: unresolved workflow ${workflowCode}`);
    const categoryCode = route.topic_category_codes[index] ?? route.topic_category_codes[0] ?? null;
    return {
      policy_item_code: route.policy_item_code,
      code: `route.${index + 1}.${workflowCode}`,
      name_ar: `مسار واجتماع: ${workflow.name_ar}`,
      description: route.reason_ar,
      rule_type: "routing",
      status: "active",
      priority: 500 - index,
      applies_when: categoryCode ? { topic_category_code: categoryCode } : {},
      effect_payload: {
        legal_classification: "requires_workflow_and_meeting",
        source: "binary_regulation_bundle",
      },
      requires_workflow: true,
      authorities: workflow.steps.map((step, stepIndex) => ({
        governance_class_code: step.governance_class_code,
        governance_unit_id: step.governance_unit_id,
        responsibility: step.responsibility,
        authority_action: authorityAction(step.responsibility),
        required_permission_code: step.required_permission_code,
        is_final: step.is_terminal || stepIndex === workflow.steps.length - 1,
      })),
      workflow_bindings: [{
        workflow_code: workflowCode,
        binding_type: "primary",
        selection_conditions: categoryCode ? { topic_category_code: categoryCode } : {},
        priority: 500 - index,
      }],
    };
  }));

  for (const operational of bundle.operational_rules) {
    const workflow = workflowByCode.get(operational.workflow_code);
    if (!workflow) throw new Error(`${bundle.policy.code}: operational rule has missing workflow ${operational.workflow_code}`);
    rules.push({
      policy_item_code: operational.policy_item_code,
      code: `op.${operational.code}`,
      name_ar: `قاعدة اجتماع: ${operational.code.replaceAll("_", " ")}`,
      description: operational.release_1_enforcement ?? "قاعدة تشغيلية مستخلصة من النص النظامي.",
      rule_type: classifyRule(operational.code),
      status: "active",
      priority: 300,
      applies_when: {},
      effect_payload: {
        parameters: operational.parameters,
        release_1_enforcement: operational.release_1_enforcement,
        release_2_enforcement: operational.release_2_enforcement,
        legal_classification: "requires_workflow_and_meeting",
      },
      requires_workflow: true,
      authorities: workflow.steps.map((step, stepIndex) => ({
        governance_class_code: step.governance_class_code,
        governance_unit_id: step.governance_unit_id,
        responsibility: step.responsibility,
        authority_action: authorityAction(step.responsibility),
        required_permission_code: step.required_permission_code,
        is_final: step.is_terminal || stepIndex === workflow.steps.length - 1,
      })),
      workflow_bindings: [{ workflow_code: operational.workflow_code, binding_type: "primary", priority: 300 }],
    });
  }

  return {
    schema_version: "qarar.policy_import.v4",
    policy: { ...bundle.policy, owner_user_id: ownerUserId },
    workflows: bundle.workflows,
    rules,
    version: {
      ...bundle.version,
      source_document_hash: bundle.source_document.pdf_sha256,
      items,
      scopes: bundle.scopes.map((scope) => ({
        scope_type: scope.scope_type,
        target_id: scope.scope_type === "governance_class" ? targetClassId : null,
        governance_level: scope.governance_level,
        include_descendants: scope.include_descendants,
        priority: scope.priority,
        valid_from: null,
        valid_to: null,
      })),
    },
  };
}

const files = (await readdir(dataDir)).filter((file) => file.endsWith(".binary-bundle.json")).sort();
if (files.length !== 5) throw new Error(`Expected 5 binary regulation bundles, found ${files.length}`);
const bundles = await Promise.all(files.map(async (file) => JSON.parse(await readFile(path.join(dataDir, file), "utf8"))));

if (!apply) {
  const fakeClassIds = new Map(bundles.map((bundle) => {
    const code = bundle.scopes[0].governance_class_code;
    return [code, deterministicUuid(`preflight-class:${code}`)];
  }));
  const normalized = bundles.map((bundle) => normalizeForV4(
    bundle,
    "00000000-0000-0000-0000-000000000001",
    fakeClassIds,
  ));
  for (const bundle of normalized) {
    const workflowCodes = new Set(bundle.workflows.map((workflow) => workflow.code));
    const itemCodes = new Set(bundle.version.items.map((item) => item.item_code));
    for (const item of bundle.version.items) {
      if (item.workflow_code && !workflowCodes.has(item.workflow_code)) throw new Error(`Missing workflow ${item.workflow_code}`);
    }
    for (const rule of bundle.rules) {
      if (!itemCodes.has(rule.policy_item_code)) throw new Error(`Missing rule item ${rule.policy_item_code}`);
      for (const binding of rule.workflow_bindings ?? []) {
        if (!workflowCodes.has(binding.workflow_code)) throw new Error(`Missing rule workflow ${binding.workflow_code}`);
      }
    }
  }
  if (exportV4) {
    const stagingDir = path.join(root, "data", "staging-v4");
    await rm(stagingDir, { recursive: true, force: true });
    await mkdir(stagingDir, { recursive: true });
    for (const [index, bundle] of normalized.entries()) {
      await writeFile(
        path.join(stagingDir, `${bundles[index].source_document.code}.policy-import-v4.json`),
        `${JSON.stringify(bundle, null, 2)}\n`,
        "utf8",
      );
    }
    process.stdout.write(`V4_STAGING_EXPORTED directory=${stagingDir}\n`);
  }
  process.stdout.write(`PREFLIGHT_OK bundles=${normalized.length} items=${normalized.reduce((sum, bundle) => sum + bundle.version.items.length, 0)} rules=${normalized.reduce((sum, bundle) => sum + bundle.rules.length, 0)}\n`);
  process.stdout.write("No database changes were made. Use --apply --confirm-local-import after a verified database backup.\n");
  process.exit(0);
}
if (!confirmed) throw new Error("Refusing database writes without --confirm-local-import");
if (!existsSync(envPath)) throw new Error(`Runtime environment file is missing: ${envPath}`);
const password = process.env.QARAR_IMPORT_ADMIN_PASSWORD;
if (!password) throw new Error("QARAR_IMPORT_ADMIN_PASSWORD is required for database import");

const env = loadEnv(await readFile(envPath, "utf8"));
const apiUrl = env.SUPABASE_PUBLIC_URL;
const anonKey = env.ANON_KEY;
const email = process.env.QARAR_IMPORT_ADMIN_EMAIL ?? "system.admin@demo.qarar.local";
if (!apiUrl || !anonKey) throw new Error("SUPABASE_PUBLIC_URL and ANON_KEY are missing");

const authResponse = await fetch(`${apiUrl}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { apikey: anonKey, "Content-Type": "application/json" },
  body: JSON.stringify({ email, password }),
});
if (!authResponse.ok) throw new Error(`Administrator login failed (HTTP ${authResponse.status})`);
const auth = await authResponse.json();
const headers = {
  apikey: anonKey,
  Authorization: `Bearer ${auth.access_token}`,
  "Content-Type": "application/json",
  "Accept-Profile": "api_v1",
  "Content-Profile": "api_v1",
};
const rpc = async (contract, params = {}) => {
  const response = await fetch(`${apiUrl}/rest/v1/rpc/${contract}`, { method: "POST", headers, body: JSON.stringify(params) });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(`${contract} failed (HTTP ${response.status}): ${text}`);
  return payload;
};

const [classesResponse, policiesResponse] = await Promise.all([
  rpc("admin_list_governance_unit_classes", { p_query: null, p_is_active: true, p_limit: 200, p_offset: 0 }),
  rpc("admin_search_policies", { p_query: null, p_status: null, p_limit: 100, p_offset: 0 }),
]);
const classIds = new Map((classesResponse.items ?? []).map((item) => [item.code, item.id]));
const existingCodes = new Set((policiesResponse.items ?? []).map((item) => item.code));
const conflicts = bundles.map((bundle) => bundle.policy.code).filter((code) => existingCodes.has(code));
if (conflicts.length) {
  throw new Error(`Clean replacement is required before import; existing policy codes: ${conflicts.join(", ")}`);
}

for (const bundle of bundles) {
  const normalized = normalizeForV4(bundle, auth.user.id, classIds);
  const result = await rpc("admin_import_policy_bundle_v4", {
    p_bundle: normalized,
    p_client_request_id: deterministicUuid(bundle.content_sha256),
  });
  process.stdout.write(`IMPORTED ${bundle.policy.code} items=${result.items_count} rules=${result.rules_count} workflows=${result.workflows_count}\n`);
}
