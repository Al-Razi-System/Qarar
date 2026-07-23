import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { readFile } from "node:fs/promises"

const envText = await readFile(new URL("../../docker/.env", import.meta.url), "utf8")
const env = Object.fromEntries(envText.split(/\r?\n/).filter((line) => line && !line.startsWith("#") && line.includes("=")).map((line) => {
  const separator = line.indexOf("=")
  return [line.slice(0, separator), line.slice(separator + 1)]
}))
const baseUrl = env.SUPABASE_PUBLIC_URL || "http://localhost:54321"
const anonKey = env.ANON_KEY
const serviceKey = env.SERVICE_ROLE_KEY
assert.ok(anonKey && serviceKey, "ANON_KEY and SERVICE_ROLE_KEY are required")

const serviceHeaders = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" }
const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`
const password = `Qarar-${suffix}!Aa1`
const managerEmail = `s03-manager-${suffix}@example.test`
const memberEmail = `s03-member-${suffix}@example.test`
const created = { authUsers: [], organizationId: null }

async function request(path, options = {}, expected = null) {
  const response = await fetch(`${baseUrl}${path}`, options)
  const text = await response.text()
  let body = null
  try { body = text ? JSON.parse(text) : null } catch { body = text }
  if (expected !== null) assert.equal(response.status, expected, `${path}: ${response.status} ${text}`)
  return { response, body }
}
async function rest(path, method = "GET", body, headers = serviceHeaders) {
  return request(`/rest/v1/${path}`, {
    method,
    headers: { ...headers, Prefer: method === "POST" ? "return=representation" : "return=minimal" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}
async function createAuthUser(email) {
  const { body } = await request("/auth/v1/admin/users", {
    method: "POST", headers: serviceHeaders,
    body: JSON.stringify({ email, password, email_confirm: true }),
  }, 200)
  created.authUsers.push(body.id)
  return body
}
async function login(email) {
  const { body } = await request("/auth/v1/token?grant_type=password", {
    method: "POST", headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  }, 200)
  return { apikey: anonKey, Authorization: `Bearer ${body.access_token}`, "Content-Type": "application/json" }
}
async function cleanup() {
  if (created.organizationId) {
    assert.match(created.organizationId, /^[0-9a-f-]{36}$/)
    execFileSync("docker", [
      "exec", "qarar-supabase-db", "psql", "-X", "-v", "ON_ERROR_STOP=1",
      "-U", "supabase_admin", "-d", "postgres", "-c",
      `set session_replication_role=replica;
       delete from public.votes where organization_id='${created.organizationId}';
       delete from public.voting_eligible_members where organization_id='${created.organizationId}';
       delete from public.voting_rounds where organization_id='${created.organizationId}';
       delete from public.quorum_snapshots where organization_id='${created.organizationId}';
       delete from public.attendance_history where organization_id='${created.organizationId}';
       delete from public.attendance_records where organization_id='${created.organizationId}';
       delete from public.meeting_status_history where organization_id='${created.organizationId}';
       delete from public.agenda_items where organization_id='${created.organizationId}';
       delete from public.meetings where organization_id='${created.organizationId}';
       delete from public.topics where organization_id='${created.organizationId}';
       delete from public.memberships where organization_id='${created.organizationId}';
       delete from public.role_permissions where organization_id='${created.organizationId}';
       delete from public.permissions where organization_id='${created.organizationId}';
       delete from public.roles where organization_id='${created.organizationId}';
       delete from public.governance_units where organization_id='${created.organizationId}';
       delete from public.governance_unit_types where organization_id='${created.organizationId}';
       delete from public.users where organization_id='${created.organizationId}';
       delete from public.audit_logs where organization_id='${created.organizationId}';
       delete from public.meeting_number_counters where organization_id='${created.organizationId}';
       delete from public.organizations where id='${created.organizationId}';`,
    ], { stdio: "ignore" })
  }
  for (const id of created.authUsers) {
    await request(`/auth/v1/admin/users/${id}`, { method: "DELETE", headers: serviceHeaders })
  }
}

try {
  const manager = await createAuthUser(managerEmail)
  const member = await createAuthUser(memberEmail)
  const organization = (await rest("organizations", "POST", {
    code: `S03-${suffix}`, name_ar: "Sprint 03 HTTP",
  })).body[0]
  created.organizationId = organization.id
  const unitType = (await rest("governance_unit_types", "POST", {
    organization_id: organization.id, code: `TYPE-${suffix}`, name_ar: "Council",
  })).body[0]
  const unit = (await rest("governance_units", "POST", {
    organization_id: organization.id, unit_type_id: unitType.id,
    code: `UNIT-${suffix}`, name_ar: "Main Council", quorum_percentage: 50,
  })).body[0]
  const managerRole = (await rest("roles", "POST", {
    organization_id: organization.id, code: `MANAGER-${suffix}`, name_ar: "Manager", role_scope: "governance_unit",
  })).body[0]
  const memberRole = (await rest("roles", "POST", {
    organization_id: organization.id, code: `MEMBER-${suffix}`, name_ar: "Member", role_scope: "governance_unit",
  })).body[0]
  const permissionRows = [
    ["attendance.read", "attendance", "read"], ["attendance.manage", "attendance", "manage"],
    ["quorum.read", "quorum", "read"], ["quorum.manage", "quorum", "manage"],
    ["voting.read", "voting", "read"], ["voting.manage", "voting", "manage"],
    ["voting.cast", "voting", "cast"], ["meetings.manage", "meetings", "manage"],
  ].map(([code, module, action]) => ({
    organization_id: organization.id, code, module, action,
    context_scope: "governance_unit", name_ar: code,
  }))
  const permissions = (await rest("permissions", "POST", permissionRows)).body
  const permissionByCode = Object.fromEntries(permissions.map((permission) => [permission.code, permission.id]))
  await rest("role_permissions", "POST", [
    ...permissions.map((permission) => ({
      organization_id: organization.id, role_id: managerRole.id, permission_id: permission.id,
    })),
    ...["attendance.read", "quorum.read", "voting.read", "voting.cast"].map((code) => ({
      organization_id: organization.id, role_id: memberRole.id, permission_id: permissionByCode[code],
    })),
  ])
  await rest("users", "POST", [
    { id: manager.id, organization_id: organization.id, email: managerEmail, full_name_ar: "HTTP Manager" },
    { id: member.id, organization_id: organization.id, email: memberEmail, full_name_ar: "HTTP Member" },
  ])
  const memberships = (await rest("memberships", "POST", [
    { organization_id: organization.id, user_id: manager.id, governance_unit_id: unit.id, role_id: managerRole.id },
    { organization_id: organization.id, user_id: member.id, governance_unit_id: unit.id, role_id: memberRole.id },
  ])).body
  const topic = (await rest("topics", "POST", {
    organization_id: organization.id, topic_no: `TOP-${suffix}`, title_ar: "HTTP voting topic",
    current_unit_id: unit.id, submitted_by_user_id: manager.id, status: "approved",
  })).body[0]
  const meeting = (await rest("meetings", "POST", {
    organization_id: organization.id, meeting_no: `MTG-${suffix}`, governance_unit_id: unit.id,
    title_ar: "HTTP live meeting", scheduled_date: "2026-08-15",
    created_by_user_id: manager.id, status: "ready_to_start",
  })).body[0]
  const agendaItem = (await rest("agenda_items", "POST", {
    organization_id: organization.id, meeting_id: meeting.id, topic_id: topic.id, agenda_order: 1,
  })).body[0]

  const managerHeaders = await login(managerEmail)
  const memberHeaders = await login(memberEmail)
  const opened = await rest("rpc/open_meeting_session", "POST", {
    p_meeting_id: meeting.id, p_expected_updated_at: meeting.updated_at,
  }, managerHeaders)
  assert.equal(opened.response.status, 200, JSON.stringify(opened.body))
  assert.equal(opened.body.meeting.status, "in_progress")
  assert.equal(opened.body.attendance.length, 2)

  for (const attendance of opened.body.attendance) {
    const recorded = await rest("rpc/record_attendance", "POST", {
      p_attendance_record_id: attendance.id, p_status: "present",
      p_remarks: "HTTP check-in", p_expected_updated_at: attendance.updated_at,
    }, managerHeaders)
    assert.equal(recorded.response.status, 200, JSON.stringify(recorded.body))
  }
  const session = await rest("rpc/get_meeting_session_detail", "POST", {
    p_meeting_id: meeting.id,
  }, managerHeaders)
  assert.equal(session.body.quorum.quorum_status, "met")
  assert.equal(session.body.quorum.present_members, 2)

  const round = await rest("rpc/open_voting_round", "POST", {
    p_agenda_item_id: agendaItem.id,
    p_expected_meeting_updated_at: session.body.meeting.updated_at,
  }, managerHeaders)
  assert.equal(round.response.status, 200, JSON.stringify(round.body))
  assert.equal(round.body.eligible_voter_count, 2)
  const openVotes = await rest("rpc/get_my_open_votes", "POST", {
    p_meeting_id: meeting.id,
  }, memberHeaders)
  assert.equal(openVotes.body.length, 1)

  const directVote = await rest("votes", "POST", {
    organization_id: organization.id, meeting_id: meeting.id, topic_id: topic.id,
    user_id: member.id, membership_id: memberships.find((row) => row.user_id === member.id).id,
    vote_value: "approve", voting_round_id: round.body.voting_round_id,
  }, memberHeaders)
  assert.ok(directVote.response.status >= 400, "direct vote insert was not blocked")

  const memberVote = await rest("rpc/cast_vote", "POST", {
    p_voting_round_id: round.body.voting_round_id, p_vote_value: "approve", p_vote_note: "HTTP approve",
  }, memberHeaders)
  assert.equal(memberVote.response.status, 200, JSON.stringify(memberVote.body))
  const managerVote = await rest("rpc/cast_vote", "POST", {
    p_voting_round_id: round.body.voting_round_id, p_vote_value: "approve", p_vote_note: "HTTP approve",
  }, managerHeaders)
  assert.equal(managerVote.response.status, 200, JSON.stringify(managerVote.body))
  const closed = await rest("rpc/close_voting_round", "POST", {
    p_voting_round_id: round.body.voting_round_id, p_reason: "HTTP voting completed",
  }, managerHeaders)
  assert.equal(closed.response.status, 200, JSON.stringify(closed.body))
  assert.equal(closed.body.result, "approved")
  assert.equal(closed.body.approve_count, 2)
  const detail = await rest("rpc/get_voting_round_detail", "POST", {
    p_voting_round_id: round.body.voting_round_id,
  }, managerHeaders)
  assert.equal(detail.body.votes.length, 2)

  console.log("ok - HTTP meeting session opened with an active-member attendance snapshot")
  console.log("ok - HTTP attendance updates recalculated and persisted quorum")
  console.log("ok - HTTP eligible voting, direct-write denial, and frozen result completed end to end")
} finally {
  await cleanup()
}
