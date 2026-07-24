import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const docsDirectory = join(root, "supabase/docs/api");
const referencePath = join(docsDirectory, "12-contract-reference.md");
const responseContractsPath = join(docsDirectory, "14-json-response-contracts.md");
const writeMode = process.argv.includes("--write");

const query = String.raw`
select concat_ws(
  E'\t',
  r.contract_name,
  r.module_code,
  r.audience,
  pg_get_function_identity_arguments(p.oid),
  pg_get_function_result(p.oid)
)
from qarar_architecture.api_contract_registry r
join pg_namespace n on n.nspname = 'api_v1'
join pg_proc p on p.pronamespace = n.oid and p.proname = r.contract_name
order by r.module_code, r.contract_name;
`;

const output = execFileSync(
  "docker",
  [
    "exec",
    "qarar-supabase-db",
    "psql",
    "-U",
    "postgres",
    "-d",
    "postgres",
    "-At",
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    query,
  ],
  { cwd: root, encoding: "utf8" },
).trim();

const contracts = output.split(/\r?\n/).filter(Boolean).map((line) => {
  const [name, module, audience, argumentsList, result] = line.split("\t");
  return { name, module, audience, argumentsList, result };
});

if (contracts.length === 0) {
  throw new Error("The api_v1 contract registry returned no contracts.");
}

const escapeCell = (value) => value.replaceAll("|", "\\|").replace(/\s+/g, " ").trim();
const rows = contracts.map(({ name, module, audience, argumentsList, result }) =>
  `| \`${escapeCell(name)}\` | \`${escapeCell(module)}\` | \`${escapeCell(audience)}\` | ` +
  `\`${escapeCell(argumentsList) || "-"}\` | \`${escapeCell(result)}\` |`
);

const reference = `# Exact api_v1 Contract Reference

This file is generated from the live \`qarar_architecture.api_contract_registry\` and PostgreSQL
function metadata. Run \`npm run docs:api-contracts\` after an intentional contract change.

- \`authenticated\` contracts may be called by signed-in clients, subject to their runtime permission
  and organization checks.
- \`service_role\` contracts are internal Edge Function contracts. Flutter and browser clients must
  never call them or receive the service-role key.
- The detailed workflow documents remain authoritative for payload semantics, permissions, state
  transitions, and error handling.

| Contract | Module | Audience | Identity arguments | Result |
|---|---|---|---|---|
${rows.join("\n")}
`;

if (writeMode) {
  writeFileSync(referencePath, reference, "utf8");
  console.log(`Wrote ${contracts.length} contracts to ${referencePath}`);
} else {
  const committed = readFileSync(referencePath, "utf8").replaceAll("\r\n", "\n");
  if (committed !== reference) {
    throw new Error(
      "API contract reference differs from the runtime registry. " +
      "Run `npm run docs:api-contracts` and review the generated diff.",
    );
  }
}

const markdownFiles = readdirSync(docsDirectory)
  .filter((name) => name.endsWith(".md"))
  .map((name) => ({ name, content: readFileSync(join(docsDirectory, name), "utf8") }));

const errors = [];
const operationalDocumentation = markdownFiles
  .filter(({ name }) => !["12-contract-reference.md"].includes(name))
  .map(({ content }) => content)
  .join("\n");
const responseContractsDocumentation = readFileSync(responseContractsPath, "utf8");
const directTablePath = /\/rest\/v1\/(?!rpc\/)[a-z][a-z0-9_]*/g;
const mojibake = /(?:ط§|ط£|ط¹|ظ…|ظ„|ظٹ|ط±|Ã|â|�)/g;

for (const { name, content } of markdownFiles) {
  const directPaths = [...content.matchAll(directTablePath)].map((match) => match[0]);
  if (directPaths.length > 0) {
    errors.push(`${name}: unsupported direct PostgREST paths: ${[...new Set(directPaths)].join(", ")}`);
  }
  if (mojibake.test(content)) {
    errors.push(`${name}: contains likely mojibake text`);
  }
  mojibake.lastIndex = 0;
}

for (const contract of contracts.filter(({ audience }) => audience === "authenticated")) {
  if (!operationalDocumentation.includes(contract.name)) {
    errors.push(
      `${contract.name}: authenticated contract is missing from operational frontend documentation`,
    );
  }
}

for (const contract of contracts.filter(
  ({ audience, result }) => audience === "authenticated" && result === "jsonb",
)) {
  if (!responseContractsDocumentation.includes(`\`${contract.name}\``)) {
    errors.push(`${contract.name}: jsonb response contract is missing from the response catalog`);
  }
}

if (errors.length > 0) {
  throw new Error(`API documentation validation failed:\n- ${errors.join("\n- ")}`);
}

console.log(`API documentation matches ${contracts.length} registered contracts.`);
