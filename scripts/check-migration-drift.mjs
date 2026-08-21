import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const migrationsDirectory = path.join(root, "supabase", "migrations");
const container = process.env.DB_CONTAINER ?? "qarar-supabase-db";
const databaseUser = process.env.DB_SUPER_USER ?? "supabase_admin";
const database = process.env.POSTGRES_DB ?? "postgres";
const reportDirectory = path.join(root, ".production-reports");
const reportPath = path.join(reportDirectory, "migration-drift.json");

const sourceMigrations = new Map(
  fs.readdirSync(migrationsDirectory)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => {
      const version = name.slice(0, -".sql".length);
      const checksum = createHash("sha256")
        .update(fs.readFileSync(path.join(migrationsDirectory, name)))
        .digest("hex");
      return [version, checksum];
    }),
);

if (sourceMigrations.size === 0) {
  throw new Error("No source migrations were found.");
}

const rows = execFileSync(
  "docker",
  [
    "exec", container, "psql", "-X", "-U", databaseUser, "-d", database,
    "-At", "-F", "\t", "-v", "ON_ERROR_STOP=1", "-c",
    "select version, coalesce(checksum_sha256, '') " +
      "from qarar_internal.applied_migrations where version <> 'seed' order by version",
  ],
  { cwd: root, encoding: "utf8" },
).trim();

const appliedMigrations = new Map(
  rows ? rows.split(/\r?\n/).map((row) => {
    const [version, checksum = ""] = row.split("\t");
    return [version, checksum];
  }) : [],
);

const missingFromDatabase = [...sourceMigrations.keys()].filter(
  (version) => !appliedMigrations.has(version),
);
const missingFromSource = [...appliedMigrations.keys()].filter(
  (version) => !sourceMigrations.has(version),
);
const missingChecksums = [...appliedMigrations.entries()]
  .filter(([, checksum]) => !checksum)
  .map(([version]) => version);
const checksumMismatches = [...sourceMigrations.entries()]
  .filter(([version, checksum]) => {
    const appliedChecksum = appliedMigrations.get(version);
    return appliedChecksum && appliedChecksum !== checksum;
  })
  .map(([version]) => version);

const report = {
  generatedAt: new Date().toISOString(),
  sourceMigrationCount: sourceMigrations.size,
  appliedMigrationCount: appliedMigrations.size,
  missingFromDatabase,
  missingFromSource,
  missingChecksums,
  checksumMismatches,
};

fs.mkdirSync(reportDirectory, { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

const failures = [
  ["source migrations absent from the database ledger", missingFromDatabase],
  ["database ledger entries absent from source control", missingFromSource],
  ["applied migrations without SHA-256 checksums", missingChecksums],
  ["applied migrations whose SHA-256 differs from source", checksumMismatches],
].filter(([, versions]) => versions.length > 0);

if (failures.length > 0) {
  const details = failures
    .map(([label, versions]) => `- ${label}: ${versions.join(", ")}`)
    .join("\n");
  console.error(`Migration drift detected:\n${details}\nReport: ${reportPath}`);
  process.exit(1);
}

console.log(`Migration ledger matches ${sourceMigrations.size} source migrations.`);
