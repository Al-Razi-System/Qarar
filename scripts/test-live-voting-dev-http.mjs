// Scoped additive DEV fixtures, never an E2E reset. Credentials stay in memory.
import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { randomUUID, randomBytes } from "node:crypto";
if (process.env.QARAR_CONFIRM_DEV_VOTING_FIXTURES !== "new-test-organization-only") throw Error("Explicit DEV fixture confirmation required");
const root = new URL("../", import.meta.url);
const app = "https://devqarar.prideidea.com";
const gateway = "http://127.0.0.1:55421";
const container = "qarar-dev-supabase-db";
const env = Object.fromEntries(fs.readFileSync(new URL("supabase/docker/.env.remote-dev", root), "utf8").split(/\r?\n/).filter(line => /^[A-Za-z_][A-Za-z0-9_]*=/.test(line)).map(line => { const i = line.indexOf("="); return [line.slice(0, i), line.slice(i + 1).replace(/^"|"$/g, "")]; }));
assert.ok(env.ANON_KEY && env.SERVICE_ROLE_KEY);
const sql = text => execFileSync("docker", ["exec", "-i", container, "psql", "-X", "-qAt", "-U", "supabase_admin", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], { input: text, encoding: "utf8", maxBuffer: 4 * 1024 * 1024 }).trim();
const id = { org: randomUUID(), type: randomUUID(), unit: randomUUID(), topic: randomUUID(), meeting: randomUUID(), agenda: randomUUID() };
const actors = []; const streams = [];
const password = `Qa-${randomBytes(24).toString("base64url")}!Aa1`;
let provisioned = false;
async function auth(path, body, admin = true, method = "POST") {
  const key = admin ? env.SERVICE_ROLE_KEY : env.ANON_KEY;
  const response = await fetch(`${gateway}/auth/v1/${path}`, { method, signal: AbortSignal.timeout(20000), headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!response.ok) throw Error(`Auth ${path.split("/")[0]} failed: ${response.status}`);
  return response.json();
}
async function rpc(actor, contract, params = {}) {
  const response = await fetch(`${app}/api/admin/meetings`, { method: "POST", signal: AbortSignal.timeout(25000), headers: { Cookie: `qarar_access_token=${actor.token}`, Origin: app, "Content-Type": "application/json" }, body: JSON.stringify({ contract, params }) });
  const body = await response.json();
  if (!response.ok) throw Error(`Meeting ${contract} failed: ${response.status} ${body.error?.code ?? ""} ${body.error?.message ?? ""}`);
  return body.data;
}
async function waitFor(check, label) {
  const until = Date.now() + 18000;
  while (!check()) { if (Date.now() > until) throw Error(`Timed out: ${label}`); await new Promise(resolve => setTimeout(resolve, 100)); }
}
async function listen(actor) {
  const controller = new AbortController();
  const response = await fetch(`${app}/api/admin/meetings/${id.meeting}/voting/live`, { signal: controller.signal, headers: { Cookie: `qarar_access_token=${actor.token}` } });
  assert.equal(response.status, 200, `SSE status for ${actor.role}`);
  assert.match(response.headers.get("content-type"), /text\/event-stream/);
  assert.match(response.headers.get("cache-control"), /no-store/);
  const state = { controller, latest: null, terminal: false, error: null, pump: null };
  streams.push(state);
  state.pump = (async () => {
    const reader = response.body.getReader(); const decoder = new TextDecoder(); let pending = "";
    try {
      for (;;) {
        const { value, done } = await reader.read(); if (done) break;
        pending += decoder.decode(value, { stream: true });
        while (pending.includes("\n\n")) {
          const end = pending.indexOf("\n\n"); const frame = pending.slice(0, end); pending = pending.slice(end + 2);
          const data = frame.split("\n").find(line => line.startsWith("data: ")); if (!data) continue;
          const parsed = JSON.parse(data.slice(6));
          if (frame.includes("event: voting-error")) { state.terminal = parsed.terminal; state.error = parsed.message; }
          else if (frame.includes("event: voting")) {
            assert.ok(!JSON.stringify(parsed).includes("SECRET_QA_NOTE"));
            for (const round of parsed.rounds.filter(row => row.status === "open")) {
              assert.equal(Object.hasOwn(round, "approve_count"), false);
              assert.equal(Object.hasOwn(round, "chair_vote"), false);
              for (const person of round.participation ?? []) assert.deepEqual(Object.keys(person).sort(), ["full_name_ar", "has_voted", "user_id"]);
            }
            state.latest = parsed;
          }
        }
      }
    } catch (error) { if (!controller.signal.aborted) state.error = error.message; }
    finally { reader.releaseLock(); }
  })();
  return state;
}
try {
  for (const role of ["council_chair", "council_rapporteur", "council_member"]) {
    const email = `qa-voting-${role}-${randomUUID()}@example.test`;
    const user = await auth("admin/users", { email, password, email_confirm: true });
    assert.match(user.id, /^[0-9a-f-]{36}$/);
    actors.push({ id: user.id, email, role, token: null });
  }
  const chair = actors[0];
  sql(`begin;
    insert into public.organizations(id,code,name_ar) values('${id.org}','qa-vote-${id.org}','اختبار قناة التصويت المؤقت');
    insert into qarar_iam.users(id,organization_id,email,full_name_ar,require_live_auth_session) values
    ${actors.map((actor, index) => `('${actor.id}','${id.org}','${actor.email}','اختبار التصويت ${index + 1}',true)`).join(",")};
    insert into public.governance_unit_types(id,organization_id,code,name_ar) values('${id.type}','${id.org}','qa_council','مجلس اختبار');
    insert into public.governance_units(id,organization_id,unit_type_id,code,name_ar,quorum_percentage) values('${id.unit}','${id.org}','${id.type}','qa_council','مجلس اختبار التزامن',51);
    insert into public.roles(organization_id,code,name_ar,role_scope) values
      ('${id.org}','council_member','عضو اختبار','governance_unit') on conflict(organization_id,code) do nothing;
    insert into public.permissions(organization_id,code,module,action,context_scope,name_ar)
      select '${id.org}',v,split_part(v,'.',1),split_part(v,'.',2),'governance_unit',v from unnest(array['meetings.read','meetings.manage','agenda.manage','attendance.read','attendance.manage','attendance.verify','attendance.override','attendance.lock','quorum.read','quorum.manage','voting.read','voting.manage','voting.cast','topics.read']) v on conflict do nothing;
    insert into public.role_permissions(organization_id,role_id,permission_id)
      select '${id.org}',r.id,p.id from public.roles r join public.permissions p on p.organization_id=r.organization_id
      where r.organization_id='${id.org}' and r.code in ('council_chair','council_rapporteur','council_member')
        and p.code in ('meetings.read','meetings.manage','agenda.manage','attendance.read','attendance.manage','attendance.verify','attendance.override','attendance.lock','quorum.read','quorum.manage','voting.read','voting.manage','voting.cast','topics.read')
        and (r.code='council_chair' or p.code in ('meetings.read','attendance.read','quorum.read','voting.read','voting.cast')) on conflict do nothing;
    insert into public.memberships(organization_id,user_id,governance_unit_id,role_id)
      ${actors.map(actor => `select '${id.org}'::uuid,'${actor.id}'::uuid,'${id.unit}'::uuid,id from public.roles where organization_id='${id.org}' and code='${actor.role}'`).join(" union all ")};
    insert into public.topics(id,organization_id,topic_no,title_ar,description,current_unit_id,submitted_by_user_id,status)
      values('${id.topic}','${id.org}','TOP-QA-${id.topic}','موضوع اختبار التزامن','وصف اختبار منفصل','${id.unit}','${chair.id}','approved');
    insert into public.meetings(id,organization_id,meeting_no,governance_unit_id,title_ar,scheduled_date,created_by_user_id,status)
      values('${id.meeting}','${id.org}','MTG-QA-${id.meeting}','${id.unit}','اجتماع اختبار القناة',current_date,'${chair.id}','ready_to_start');
    insert into public.agenda_items(id,organization_id,meeting_id,topic_id,agenda_order) values('${id.agenda}','${id.org}','${id.meeting}','${id.topic}',1);
    commit;`);
  provisioned = true;
  for (const actor of actors) actor.token = (await auth("token?grant_type=password", { email: actor.email, password }, false)).access_token;
  let detail = await rpc(chair, "get_meeting_detail", { p_meeting_id: id.meeting });
  await rpc(chair, "open_meeting_session", { p_meeting_id: id.meeting, p_expected_updated_at: detail.updated_at });
  let session = await rpc(chair, "get_meeting_session_detail", { p_meeting_id: id.meeting });
  for (const record of session.attendance) await rpc(chair, "verify_attendance", { p_attendance_record_id: record.id, p_status: "present", p_note: "تحقق اختبار مستقل عبر HTTP", p_expected_updated_at: record.updated_at });
  session = await rpc(chair, "get_meeting_session_detail", { p_meeting_id: id.meeting });
  await rpc(chair, "lock_attendance_roster", { p_meeting_id: id.meeting, p_expected_updated_at: session.meeting.updated_at });
  for (const status of ["under_discussion", "discussed"]) {
    detail = await rpc(chair, "get_meeting_detail", { p_meeting_id: id.meeting });
    await rpc(chair, "update_agenda_discussion", { p_agenda_item_id: id.agenda, p_status: status, p_discussion_notes: "ملخص اختبار مستقل", p_expected_updated_at: detail.agenda_items[0].updated_at });
  }
  session = await rpc(chair, "get_meeting_session_detail", { p_meeting_id: id.meeting });
  const round = await rpc(chair, "open_voting_round", { p_agenda_item_id: id.agenda, p_expected_meeting_updated_at: session.meeting.updated_at });
  for (const actor of actors) await listen(actor);
  await waitFor(() => streams.every(stream => stream.latest?.rounds.some(row => row.id === round.voting_round_id && row.votes_cast_count === 0)), "initial three snapshots");
  const started = Date.now();
  for (let index = 0; index < actors.length; index++) {
    assert.equal((await rpc(actors[index], "cast_vote", { p_voting_round_id: round.voting_round_id, p_vote_value: ["approve", "reject", "abstain"][index], p_vote_note: "SECRET_QA_NOTE" })).accepted, true);
    await waitFor(() => streams.every(stream => stream.latest?.rounds.some(row => row.id === round.voting_round_id && row.votes_cast_count === index + 1 && row.participation.filter(person => person.has_voted).length === index + 1)), "participation sync");
  }
  sql(`begin; update qarar_iam.role_permissions set is_active=false where organization_id='${id.org}' and role_id in(select id from qarar_iam.roles where organization_id='${id.org}' and code='council_member'); commit;`);
  await waitFor(() => streams[2].terminal === true, "permission withdrawal terminates channel");
  console.log(JSON.stringify({ ok: true, organizationId: id.org, accounts: 3, synchronizedVotes: 3, optionsPrivate: true, revokedChannelStopped: true, elapsedMs: Date.now() - started }));
} finally {
  streams.forEach(stream => stream.controller.abort());
  await Promise.allSettled(streams.map(stream => stream.pump));
  if (provisioned) sql(`update qarar_iam.users set status='inactive' where organization_id='${id.org}' and id in (${actors.map(actor => `'${actor.id}'`).join(",")});`);
  for (const actor of actors) await auth(`admin/users/${actor.id}`, { ban_duration: "876000h" }, true, "PUT").catch(() => { console.error("Fixture Auth ban needs review"); process.exitCode = 1; });
}
