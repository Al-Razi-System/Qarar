import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const container = process.env.DB_CONTAINER ?? "qarar-supabase-db";
const databaseUser = process.env.DB_SUPER_USER ?? "supabase_admin";
const database = process.env.POSTGRES_DB ?? "postgres";
const reportDirectory = path.join(root, ".production-reports");
const reportPath = path.join(reportDirectory, "outbox-operations.json");
const requireCron = process.env.OUTBOX_REQUIRE_CRON === "true" || process.env.QARAR_OUTBOX_REQUIRED === "true";
const requiredDelivery = process.env.QARAR_OUTBOX_REQUIRED === "true";
const maxPendingAgeSeconds = Number(process.env.OUTBOX_MAX_PENDING_AGE_SECONDS ?? "900");

if (!Number.isInteger(maxPendingAgeSeconds) || maxPendingAgeSeconds < 60 || maxPendingAgeSeconds > 86_400) {
  throw new Error("OUTBOX_MAX_PENDING_AGE_SECONDS must be an integer between 60 and 86400");
}

function psql(sql) {
  return execFileSync(
    "docker",
    [
      "exec", container, "psql", "-X", "-U", databaseUser, "-d", database,
      "-At", "-v", "ON_ERROR_STOP=1", "-c", sql,
    ],
    { cwd: root, encoding: "utf8" },
  ).trim();
}

function normalized(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

const expectedJobs = [
  {
    name: "qarar-expire-access-delegations",
    schedule: "* * * * *",
    command: "select qarar_iam.expire_access_delegations()",
  },
  {
    name: "qarar-expire-governance-exceptions",
    schedule: "* * * * *",
    command: "select qarar_governance.expire_governance_exceptions()",
  },
  {
    name: "qarar-recover-notification-outbox",
    schedule: "*/5 * * * *",
    command: "select qarar_governance.recover_stale_notification_outbox()",
  },
];

const cronInstalled = psql("select exists(select 1 from pg_extension where extname = 'pg_cron')") === "t";
const cronCatalogAvailable = psql("select to_regclass('cron.job') is not null") === "t";
let jobs = [];
if (cronCatalogAvailable) {
  const names = expectedJobs.map(({ name }) => `'${name}'`).join(", ");
  const json = psql(
    "select coalesce(json_agg(json_build_object(" +
    "'name', jobname, 'schedule', schedule, 'command', command) order by jobname), '[]'::json) " +
    `from cron.job where jobname in (${names})`,
  );
  jobs = JSON.parse(json || "[]");
}

const statsJson = psql(`
  select json_build_object(
    'pending_or_failed', count(*) filter (where status in ('pending', 'failed')),
    'dead_letter', count(*) filter (where status = 'dead_letter'),
    'stale_processing', count(*) filter (
      where status = 'processing'
        and (lease_expires_at is null or lease_expires_at <= clock_timestamp())
    ),
    'oldest_pending_at', min(created_at) filter (where status in ('pending', 'failed')),
    'oldest_pending_age_seconds', coalesce(
      floor(extract(epoch from clock_timestamp() - min(created_at) filter (where status in ('pending', 'failed'))))::integer,
      0
    )
  )
  from qarar_governance.notification_outbox
`);
const stats = JSON.parse(statsJson);

const jobFindings = expectedJobs.flatMap((expected) => {
  const actual = jobs.filter((job) => job.name === expected.name);
  if (actual.length !== 1) return [`${expected.name}: expected exactly one scheduled job, found ${actual.length}`];
  const [job] = actual;
  const failures = [];
  if (job.schedule !== expected.schedule) {
    failures.push(`${expected.name}: schedule is ${job.schedule}, expected ${expected.schedule}`);
  }
  if (normalized(job.command) !== expected.command) {
    failures.push(`${expected.name}: command does not match the reviewed maintenance command`);
  }
  return failures;
});

const failures = [];
if (requireCron && !cronInstalled) failures.push("pg_cron extension is not installed");
if (requireCron && !cronCatalogAvailable) failures.push("cron.job catalog is not available");
if (requireCron) failures.push(...jobFindings);
if (Number(stats.stale_processing) > 0) {
  failures.push(`${stats.stale_processing} notification outbox leases are stale`);
}
if (requiredDelivery && Number(stats.dead_letter) > 0) {
  failures.push(`${stats.dead_letter} notification events are in dead_letter`);
}
if (requiredDelivery && Number(stats.oldest_pending_age_seconds) > maxPendingAgeSeconds) {
  failures.push(
    `oldest pending notification is ${stats.oldest_pending_age_seconds}s old (SLO ${maxPendingAgeSeconds}s)`,
  );
}

const report = {
  generatedAt: new Date().toISOString(),
  container,
  database,
  requireCron,
  requiredDelivery,
  maxPendingAgeSeconds,
  cron: { installed: cronInstalled, catalogAvailable: cronCatalogAvailable, jobs },
  outbox: stats,
  failures,
};
fs.mkdirSync(reportDirectory, { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

if (failures.length > 0) {
  console.error(`Outbox operations preflight failed:\n- ${failures.join("\n- ")}\nReport: ${reportPath}`);
  process.exit(1);
}

console.log(
  `Outbox operations preflight passed: pending=${stats.pending_or_failed}, dead_letter=${stats.dead_letter}, stale=${stats.stale_processing}.`,
);
