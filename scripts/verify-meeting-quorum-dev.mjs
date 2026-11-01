// Explicit DEV-only forward migration. Never targets production or rewrites a ledger entry.
import fs from "node:fs";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
const root = new URL("../", import.meta.url);
const container = "qarar-dev-supabase-db";
const versions = ["20261019020000_meeting_owned_quorum", "20261019030000_meeting_topic_context"];
const sources = versions.map(version => ({ version, source: fs.readFileSync(new URL(`supabase/migrations/${version}.sql`, root), "utf8") }));
const hash = data => crypto.createHash("sha256").update(data).digest("hex");
const query = sql => execFileSync("docker", ["exec", "-i", container, "psql", "-X", "-qAt", "-U", "supabase_admin", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }).trim();
const rows = JSON.parse(query("select json_agg(t) from (select version,checksum_sha256 from qarar_internal.applied_migrations where version<>'seed') t"));
const dir = new URL("supabase/migrations/", root);
const files = fs.readdirSync(dir).filter(file => file.endsWith(".sql"));
for (const row of rows) {
  if (!files.includes(`${row.version}.sql`) || hash(fs.readFileSync(new URL(`${row.version}.sql`, dir))) !== row.checksum_sha256) throw Error(`Migration drift: ${row.version}`);
}
const pending = files.filter(file => !rows.some(row => `${row.version}.sql` === file));
if (pending.some(file => !versions.includes(file.slice(0, -4)))) throw Error("Unreviewed pending migrations");
const mode = process.argv[2] ?? "preview";
if (!["preview", "rehearse", "apply"].includes(mode)) throw Error("Unknown mode");
const fingerprints = () => query("select json_build_object('users',(select md5(string_agg(to_jsonb(t)::text,E'\\n' order by id)) from qarar_iam.users t),'memberships',(select md5(string_agg(to_jsonb(t)::text,E'\\n' order by id)) from qarar_iam.memberships t),'councils',(select md5(string_agg(to_jsonb(t)::text,E'\\n' order by id)) from qarar_core.governance_units t),'meetings',(select md5(string_agg((to_jsonb(t)-'quorum_percentage'-'updated_at')::text,E'\\n' order by id)) from qarar_meetings.meetings t),'attendance',(select md5(string_agg(to_jsonb(t)::text,E'\\n' order by id)) from qarar_attendance.attendance_records t),'rounds',(select md5(string_agg(to_jsonb(t)::text,E'\\n' order by id)) from qarar_voting.voting_rounds t),'votes',(select md5(string_agg(to_jsonb(t)::text,E'\\n' order by id)) from qarar_voting.votes t),'decisions',(select md5(string_agg(to_jsonb(t)::text,E'\\n' order by id)) from qarar_decisions.decisions t))");
const before = fingerprints();
if (mode === "preview" || !pending.length) {
  console.log(JSON.stringify({ mode, container, verified: rows.length, pending })); process.exit(0);
}
const unwrap = sql => sql.replace(/^begin;\s*$/gmi, "").replace(/^(?:commit|rollback);\s*$/gmi, "");
const changes = sources.filter(entry => pending.includes(`${entry.version}.sql`));
const migrationSql = changes.map(entry => unwrap(entry.source)).join("\n");
if (mode === "rehearse") {
  const results = [];
  for (const file of ["108_meeting_quorum_test.sql", "110_meeting_topic_context_test.sql"]) {
    const test = fs.readFileSync(new URL(`supabase/tests/database/${file}`, root), "utf8");
    const result = query(`begin; set local check_function_bodies=off;\n${migrationSql}\n${unwrap(test)}\nrollback;`);
    if (/not ok|Looks like you failed|Looks like you planned/.test(result)) { console.error(result); throw Error(`Regression failed: ${file}`); }
    results.push({ file, assertions: (result.match(/^ok \d+/gm) ?? []).length });
  }
  if (before !== fingerprints()) throw Error("Rehearsal changed persistent data");
  console.log(JSON.stringify({ mode, container, results, rolledBack: true }));
} else {
  const backup = new URL(`backups/dev-before-meeting-quorum-${Date.now()}.dump`, root);
  fs.mkdirSync(new URL("backups/", root), { recursive: true, mode: 0o700 });
  const fd = fs.openSync(backup, "wx", 0o600);
  try { execFileSync("docker", ["exec", container, "pg_dump", "-U", "supabase_admin", "-d", "postgres", "-Fc"], { stdio: ["ignore", fd, "pipe"] }); } finally { fs.closeSync(fd); }
  const archive = fs.openSync(backup, "r");
  try { execFileSync("docker", ["exec", "-i", container, "pg_restore", "--list"], { stdio: [archive, "ignore", "pipe"] }); } finally { fs.closeSync(archive); }
  const ledgerSql = changes.map(entry => `insert into qarar_internal.applied_migrations(version,checksum_sha256) values('${entry.version}','${hash(entry.source)}');`).join("\n");
  query(`begin; set local check_function_bodies=off; select pg_advisory_xact_lock(19017,20260724);\n${migrationSql}\n${ledgerSql}\ncommit;`);
  if (before !== fingerprints()) throw Error("Existing identity, meeting, attendance, vote or decision data changed");
  console.log(JSON.stringify({ mode, container, versions: changes.map(entry => entry.version), backup: backup.pathname, preserved: true }));
}
