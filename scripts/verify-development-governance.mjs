import { access, readFile } from "node:fs/promises";

const requiredFiles = [
  "AGENTS.md",
  "docs/engineering/CHANGE_SAFETY_POLICY_AR.md",
  "docs/engineering/CHANGE_IMPACT_TEMPLATE_AR.md",
  "docs/architecture/IDENTIFIER_STANDARD_AR.md",
  "docs/architecture/DOMAIN_STATE_MACHINES_AR.md",
  "docs/testing/CRITICAL_E2E_SCENARIOS_AR.md",
  "docs/testing/COMPREHENSIVE_TEST_PROGRAM_AR.md",
  "docs/testing/BASELINE_2026-10-02_AR.md",
  "docs/planning/STABILIZATION_WAVE_01_AR.md",
];

const requiredAgentRules = [
  "Non-negotiable change protocol",
  "Definition of done",
  "Database and migration rules",
  "State, permissions and identity rules",
  "UI and error rules",
  "Release safety",
];

for (const path of requiredFiles) {
  await access(path);
}

const constitution = await readFile("AGENTS.md", "utf8");
const missingRules = requiredAgentRules.filter((rule) => !constitution.includes(rule));

if (missingRules.length > 0) {
  throw new Error(`AGENTS.md is missing mandatory sections: ${missingRules.join(", ")}`);
}

console.log(`Development governance verified (${requiredFiles.length} required files).`);
