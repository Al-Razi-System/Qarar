// Two real PostgreSQL sessions, restricted to a disconnected throwaway container.
// Requires the migrations and local-postgres/bootstrap.sql in that container.
import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync } from "node:fs";

const container = process.env.QARAR_QUORUM_TEST_CONTAINER;
assert.match(container ?? "", /^qarar-quorum-flow-test-\d{8}$/);
assert.equal(execFileSync("docker", ["inspect", "--format", "{{.HostConfig.NetworkMode}}", container], { encoding: "utf8" }).trim(), "none");
const args = ["exec", "-i", container, "psql", "-h", "/tmp", "-U", "postgres", "-d", "postgres", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose"];
const query = sql => execFileSync("docker", [...args, "-c", sql], { encoding: "utf8", maxBuffer: 1024 * 1024 }).trim();
const fixture = readFileSync(new URL("../database/109_quorum_continuation_test.sql", import.meta.url), "utf8");
const boundary = "select is(api_v1.get_meeting_session_detail";
assert.equal(fixture.split(boundary).length > 1, true);
const setup = fixture.slice(0, fixture.indexOf(boundary)).replaceAll("b1000000", "b2000000").replaceAll("s109", "s110");
execFileSync("docker", args, { input: setup + "\ncommit;", maxBuffer: 1024 * 1024 });
const meeting = "b2000000-0000-0000-0000-000000000081";
const token = query(`select updated_at from qarar_meetings.meetings where id='${meeting}'`);
const claims = '{"sub":"b2000000-0000-0000-0000-000000000011","role":"authenticated"}';
const auth = `begin;set local role authenticated;set local request.jwt.claims='${claims}';`;
const run = promisify(execFile);
const first = run("docker", [...args, "-c", `${auth}set local application_name='qarar-quorum-first';select api_v1.apply_quorum_failure('${meeting}','continue','قرار المتابعة الأول','${token}');select pg_sleep(2);commit;`]);
// Resolve failures immediately too, so no rejected background promise goes unhandled.
const firstResult = first.then(() => true, error => { console.error(error.stderr); return false; });
let held = false;
for (let n = 0; n < 100; n++) {
  held = query("select exists(select 1 from pg_stat_activity where application_name='qarar-quorum-first' and wait_event='PgSleep')") === "t";
  if (held) break;
  await new Promise(resolve => setTimeout(resolve, 20));
}
assert.equal(held, true, "first transaction holds the meeting row after authorizing continuation");
const started = Date.now();
const second = await run("docker", [...args, "-c", `${auth}select api_v1.apply_quorum_failure('${meeting}','postpone','قرار تأجيل متزامن','${token}');commit;`]).then(() => ({ ok: true, stderr: "" }), error => ({ ok: false, stderr: error.stderr }));
assert.equal(await firstResult, true);
assert.equal(second.ok, false, "concurrent postponement cannot overwrite the first choice");
assert.match(second.stderr, /40001/);
assert.ok(Date.now() - started >= 1000, "second session actually waited for the first transaction");
assert.equal(query(`select status||':'||quorum_status||':'||(quorum_continuation->>'reason') from qarar_meetings.meetings where id='${meeting}'`), "in_progress:not_met:قرار المتابعة الأول");
console.log("PASS: two real sessions serialize continuation/postponement; stale second choice rejected; quorum remains not_met.");
