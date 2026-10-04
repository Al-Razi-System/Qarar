import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { readFile } from "node:fs/promises"

const envUrl = new URL("../../docker/.env", import.meta.url)
const exampleEnvUrl = new URL("../../docker/.env.example", import.meta.url)
const envText = await readFile(envUrl, "utf8").catch((error) => {
  if (error?.code !== "ENOENT") throw error
  return readFile(exampleEnvUrl, "utf8")
})
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
  const schemaHeaders = path.startsWith("rpc/")
    ? { "Accept-Profile": "api_v1", "Content-Profile": "api_v1" }
    : { "Accept-Profile": "public", "Content-Profile": "public" }
  return request(`/rest/v1/${path}`, {
    method,
    headers: { ...headers, ...schemaHeaders, Prefer: method === "POST" ? "return=representation" : "return=minimal" },
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
       delete from public.attendance_events where organization_id='${created.organizationId}';
       delete from public.attendance_history where organization_id='${created.organizationId}';
       delete from public.attendance_records where organization_id='${created.organizationId}';
       delete from public.meeting_checkin_sessions where organization_id='${created.organizationId}';
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
    minute_approval_rule: "all_present_members",
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
    ["voting.cast", "voting", "cast"], ["meetings.read", "meetings", "read"],
    ["meetings.manage", "meetings", "manage"], ["agenda.manage", "agenda", "manage"],
    ["topics.read", "topics", "read"],
    ["attendance.check_in", "attendance", "check_in"],
    ["attendance.verify", "attendance", "verify"],
    ["attendance.override", "attendance", "override"],
    ["attendance.lock", "attendance", "lock"],
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
    ...["attendance.read", "attendance.check_in", "quorum.read", "voting.read", "voting.cast", "topics.read", "meetings.read"].map((code) => ({
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

  const checkinSession = await rest("rpc/create_checkin_session", "POST", {
    p_meeting_id: meeting.id, p_valid_for_minutes: 15,
  }, managerHeaders)
  assert.equal(checkinSession.response.status, 200, JSON.stringify(checkinSession.body))
  assert.ok(checkinSession.body.token.length >= 20)
  const memberClaim = await rest("rpc/self_check_in", "POST", {
    p_meeting_id: meeting.id, p_token: checkinSession.body.token, p_device_label: "HTTP member device",
  }, memberHeaders)
  assert.equal(memberClaim.response.status, 200, JSON.stringify(memberClaim.body))
  assert.equal(memberClaim.body.verification_status, "pending_verification")

  const claimedSession = await rest("rpc/get_meeting_session_detail", "POST", {
    p_meeting_id: meeting.id,
  }, managerHeaders)
  const memberAttendance = claimedSession.body.attendance.find((row) => row.user_id === member.id)
  const managerAttendance = claimedSession.body.attendance.find((row) => row.user_id === manager.id)
  assert.equal(memberAttendance.verification_status, "pending_verification")
  const verifiedMember = await rest("rpc/verify_attendance", "POST", {
    p_attendance_record_id: memberAttendance.id, p_status: "present",
    p_note: "HTTP QR claim verified", p_expected_updated_at: memberAttendance.updated_at,
  }, managerHeaders)
  assert.equal(verifiedMember.response.status, 200, JSON.stringify(verifiedMember.body))
  const verifiedManager = await rest("rpc/verify_attendance", "POST", {
    p_attendance_record_id: managerAttendance.id, p_status: "present",
    p_note: "HTTP manual chair verification", p_expected_updated_at: managerAttendance.updated_at,
  }, managerHeaders)
  assert.equal(verifiedManager.response.status, 200, JSON.stringify(verifiedManager.body))

  const session = await rest("rpc/get_meeting_session_detail", "POST", {
    p_meeting_id: meeting.id,
  }, managerHeaders)
  assert.equal(session.body.quorum.quorum_status, "met")
  assert.equal(session.body.quorum.present_members, 2)
  const locked = await rest("rpc/lock_attendance_roster", "POST", {
    p_meeting_id: meeting.id, p_expected_updated_at: session.body.meeting.updated_at,
  }, managerHeaders)
  assert.equal(locked.response.status, 200, JSON.stringify(locked.body))
  assert.equal(locked.body.attendance_locked, true)
  const lockedSession = await rest("rpc/get_meeting_session_detail", "POST", {
    p_meeting_id: meeting.id,
  }, managerHeaders)
  assert.equal(lockedSession.body.meeting.attendance_locked, true)

  const discussed = await rest("rpc/update_agenda_discussion", "POST", {
    p_agenda_item_id: agendaItem.id,
    p_status: "discussed",
    p_discussion_notes: "اكتملت مناقشة بند الاختبار وأصبح جاهزاً للتصويت.",
    p_expected_updated_at: agendaItem.updated_at,
  }, managerHeaders)
  assert.equal(discussed.response.status, 200, JSON.stringify(discussed.body))

  const round = await rest("rpc/open_voting_round", "POST", {
    p_agenda_item_id: agendaItem.id,
    p_expected_meeting_updated_at: lockedSession.body.meeting.updated_at,
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

  // The server is the final guard, not the disabled browser button: a chair
  // cannot freeze a partial result while an eligible attendee has not voted.
  const prematureClose = await rest("rpc/close_voting_round", "POST", {
    p_voting_round_id: round.body.voting_round_id, p_reason: "premature close must fail",
  }, managerHeaders)
  assert.ok(prematureClose.response.status >= 400, "partial voting round was closed")

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

  const decision = await rest("rpc/create_decision_from_voting_round", "POST", {
    p_voting_round_id: round.body.voting_round_id,
    p_decision_text: "اعتماد التوصية الواردة في بند الاختبار بعد اكتمال التصويت.",
    p_requires_approval: true,
  }, managerHeaders)
  assert.equal(decision.response.status, 200, JSON.stringify(decision.body))
  assert.match(decision.body.decision_no, /^DEC-/)

  const refreshedAgenda = await rest(`agenda_items?id=eq.${agendaItem.id}&select=updated_at`, "GET")
  assert.equal(refreshedAgenda.response.status, 200, JSON.stringify(refreshedAgenda.body))
  const finalSummary = await rest("rpc/update_agenda_discussion", "POST", {
    p_agenda_item_id: agendaItem.id,
    p_status: "discussed",
    p_discussion_notes: "اعتمد المجلس نتيجة التصويت والتوصية النهائية المثبتة في القرار.",
    p_expected_updated_at: refreshedAgenda.body[0].updated_at,
  }, managerHeaders)
  assert.equal(finalSummary.response.status, 200, JSON.stringify(finalSummary.body))

  const beforeCompletion = await rest("rpc/get_meeting_session_detail", "POST", {
    p_meeting_id: meeting.id,
  }, managerHeaders)
  const completed = await rest("rpc/complete_meeting_session", "POST", {
    p_meeting_id: meeting.id,
    p_expected_updated_at: beforeCompletion.body.meeting.updated_at,
  }, managerHeaders)
  assert.equal(completed.response.status, 200, JSON.stringify(completed.body))
  assert.equal(completed.body.status, "waiting_for_minutes")

  const generated = await rest("rpc/generate_meeting_minutes_draft", "POST", {
    p_meeting_id: meeting.id,
  }, managerHeaders)
  assert.equal(generated.response.status, 200, JSON.stringify(generated.body))
  const draft = await rest("rpc/get_meeting_minutes", "POST", {
    p_meeting_id: meeting.id,
  }, managerHeaders)
  assert.equal(draft.response.status, 200, JSON.stringify(draft.body))
  assert.ok((draft.body.content_draft ?? "").length >= 20)

  const submitted = await rest("rpc/submit_meeting_minutes", "POST", {
    p_meeting_id: meeting.id,
    p_content_final: draft.body.content_draft,
    p_expected_updated_at: draft.body.updated_at,
  }, managerHeaders)
  assert.equal(submitted.response.status, 200, JSON.stringify(submitted.body))
  assert.equal(submitted.body.approvers, 2)

  const managerMinutes = await rest("rpc/get_meeting_minutes", "POST", {
    p_meeting_id: meeting.id,
  }, managerHeaders)
  assert.equal(managerMinutes.response.status, 200, JSON.stringify(managerMinutes.body))
  const managerApproval = managerMinutes.body.approvals.find((approval) => approval.user_id === manager.id)
  const memberApproval = managerMinutes.body.approvals.find((approval) => approval.user_id === member.id)
  assert.ok(managerApproval && memberApproval, "each present identity must receive its own approval")

  const managerSigned = await rest("rpc/sign_meeting_minutes_approval", "POST", {
    p_approval_id: managerApproval.id,
    p_signature_strokes: [[[0.1, 0.2], [0.4, 0.5], [0.8, 0.3]]],
    p_expected_updated_at: managerApproval.updated_at,
  }, managerHeaders)
  assert.equal(managerSigned.response.status, 200, JSON.stringify(managerSigned.body))
  assert.equal(managerSigned.body.meeting_closed, false)

  const crossIdentitySign = await rest("rpc/sign_meeting_minutes_approval", "POST", {
    p_approval_id: memberApproval.id,
    p_signature_strokes: [[[0.2, 0.3], [0.5, 0.6]]],
    p_expected_updated_at: memberApproval.updated_at,
  }, managerHeaders)
  assert.ok(crossIdentitySign.response.status >= 400, "a user signed another attendee's approval")

  const memberSigned = await rest("rpc/sign_meeting_minutes_approval", "POST", {
    p_approval_id: memberApproval.id,
    p_signature_strokes: [[[0.2, 0.3], [0.5, 0.6], [0.7, 0.2]]],
    p_expected_updated_at: memberApproval.updated_at,
  }, memberHeaders)
  assert.equal(memberSigned.response.status, 200, JSON.stringify(memberSigned.body))
  assert.equal(memberSigned.body.meeting_closed, true)

  const finalMinutes = await rest("rpc/get_meeting_minutes", "POST", {
    p_meeting_id: meeting.id,
  }, memberHeaders)
  assert.equal(finalMinutes.response.status, 200, JSON.stringify(finalMinutes.body))
  assert.equal(finalMinutes.body.status, "approved")
  assert.equal(finalMinutes.body.approvals.filter((approval) => approval.approval_status === "approved").length, 2)

  console.log("ok - HTTP meeting session and short-lived check-in token were created")
  console.log("ok - HTTP member self check-in was independently verified and the roster was locked")
  console.log("ok - HTTP governed attendance recalculated and persisted quorum")
  console.log("ok - HTTP eligible voting, direct-write denial, and frozen result completed end to end")
  console.log("ok - partial vote closure was rejected until every eligible attendee voted")
  console.log("ok - decision, minutes generation, submission, identity-bound signatures, and meeting closure completed")
} finally {
  await cleanup()
}
