import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const directory = path.join(root, "data", "import-ready");
const files = (await readdir(directory)).filter((file) => file.endsWith(".binary-bundle.json"));
const failures = [];
const agendaCatalog = JSON.parse(await readFile(path.join(root, "data", "executable_agenda_items.v1.json"), "utf8"));
const expectedExecutableCodes = new Set(agendaCatalog.agendas.flatMap((agenda) => agenda.items.map((item) => item.code)));
const actualExecutableCodes = new Set();
let totalItems = 0;
let executableItems = 0;

for (const file of files) {
  const bundle = JSON.parse(await readFile(path.join(directory, file), "utf8"));
  const itemCodes = new Set(bundle.items.map((item) => item.item_code));
  const workflowCodes = new Set(bundle.workflows.map((workflow) => workflow.code));
  const routeItems = new Set(bundle.routes.map((route) => route.policy_item_code));
  totalItems += bundle.items.length;

  if (bundle.schema_version !== "qarar.policy_binary_bundle.v1") failures.push(`${file}: schema_version`);
  if (itemCodes.size !== bundle.items.length) failures.push(`${file}: duplicate item codes`);
  if (workflowCodes.size !== bundle.workflows.length) failures.push(`${file}: duplicate workflow codes`);

  for (const item of bundle.items) {
    if (item.parent_item_code && !itemCodes.has(item.parent_item_code)) failures.push(`${file}: missing parent ${item.parent_item_code}`);
    const executable = item.classification === "requires_workflow_and_meeting";
    if (executable) {
      actualExecutableCodes.add(item.item_code);
      executableItems += 1;
    }
    if (executable !== item.requires_workflow_and_meeting) failures.push(`${file}: inconsistent classification ${item.item_code}`);
    if (executable && (!item.workflow_codes.length || !routeItems.has(item.item_code))) failures.push(`${file}: executable item without route ${item.item_code}`);
    if (!executable && item.workflow_codes.length) failures.push(`${file}: display-only item has workflow ${item.item_code}`);
    for (const code of item.workflow_codes) if (!workflowCodes.has(code)) failures.push(`${file}: missing workflow ${code}`);
  }

  for (const route of bundle.routes) {
    if (!itemCodes.has(route.policy_item_code)) failures.push(`${file}: route item missing ${route.policy_item_code}`);
    for (const code of route.workflow_codes) if (!workflowCodes.has(code)) failures.push(`${file}: route workflow missing ${code}`);
  }

  for (const item of bundle.items.filter((entry) => entry.item_type === "procedure")) failures.push(`${file}: synthetic procedure retained ${item.item_code}`);
}

if (files.length !== 5) failures.push(`Expected 5 bundles, found ${files.length}`);
for (const code of expectedExecutableCodes) {
  if (!actualExecutableCodes.has(code)) failures.push(`Missing executable agenda item ${code}`);
}
for (const code of actualExecutableCodes) {
  if (!expectedExecutableCodes.has(code)) failures.push(`Unexpected executable item outside exclusive catalog ${code}`);
}
if (actualExecutableCodes.size !== 54) failures.push(`Expected exactly 54 executable items, found ${actualExecutableCodes.size}`);
if (totalItems !== 54 || executableItems !== 54) failures.push(`Only the 54 executable agenda items are allowed; found total=${totalItems}, executable=${executableItems}`);
if (failures.length) {
  process.stderr.write(`${failures.join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`Validated ${files.length} regulation bundles with no broken references.\n`);
}
