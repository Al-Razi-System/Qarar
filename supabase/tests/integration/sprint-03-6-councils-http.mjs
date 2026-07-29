import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { readFile } from "node:fs/promises"

const envText = await readFile(new URL("../../docker/.env", import.meta.url), "utf8")
const env = Object.fromEntries(envText.split(/\r?\n/).filter((line) =>
  line && !line.startsWith("#") && line.includes("=")
).map((line) => {
  const separator = line.indexOf("=")
  return [line.slice(0, separator), line.slice(separator + 1)]
}))
const baseUrl = env.SUPABASE_PUBLIC_URL || "http://localhost:54321"
const anonKey = env.ANON_KEY
const serviceKey = env.SERVICE_ROLE_KEY
assert.ok(anonKey && serviceKey, "ANON_KEY and SERVICE_ROLE_KEY are required")

const serviceHeaders = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  "Content-Type": "application/json",
}
const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`
const password = `Qarar-${suffix}!Aa1`
const created = { authUsers: [], organizationId: null }

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options)
  const text = await response.text()
  let body = null
  try { body = text ? JSON.parse(text) : null } catch { body = text }
  return { response, body }
}

async function createAuthUser(label) {
  const result = await request("/auth/v1/admin/users", {
    method: "POST",
    headers: serviceHeaders,
    body: JSON.stringify({
      email: `s036-${label}-${suffix}@example.test`,
      password,
      email_confirm: true,
    }),
  })
  assert.equal(result.response.status, 200, JSON.stringify(result.body))
  created.authUsers.push(result.body.id)
  return result.body
}

async function login(email) {
  const result = await request("/auth/v1/token?grant_type=password", {
    method: "POST",
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  })
  assert.equal(result.response.status, 200, JSON.stringify(result.body))
  return {
    apikey: anonKey,
    Authorization: `Bearer ${result.body.access_token}`,
    "Content-Type": "application/json",
  }
}

async function rpc(name, payload, headers, expected = 200) {
  const result = await request(`/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      ...headers,
      "Accept-Profile": "api_v1",
      "Content-Profile": "api_v1",
    },
    body: JSON.stringify(payload),
  })
  assert.equal(result.response.status, expected, `${name}: ${JSON.stringify(result.body)}`)
  return result.body
}

function sql(statement) {
  return execFileSync("docker", [
    "exec", "qarar-supabase-db", "psql", "-X", "-v", "ON_ERROR_STOP=1",
    "-U", "supabase_admin", "-d", "postgres", "-Atqc", statement,
  ], { encoding: "utf8" }).trim()
}

async function cleanup() {
  if (created.organizationId) {
    sql(`
      set session_replication_role=replica;
      do $cleanup$
      declare owned_table record;
      begin
        for owned_table in
          select n.nspname schema_name,c.relname table_name
          from pg_class c join pg_namespace n on n.oid=c.relnamespace
          join pg_attribute a on a.attrelid=c.oid
          where c.relkind in('r','p') and a.attname='organization_id'
            and n.nspname like 'qarar\\_%' escape '\\'
        loop
          execute format('delete from %I.%I where organization_id=$1',
            owned_table.schema_name,owned_table.table_name)
          using '${created.organizationId}'::uuid;
        end loop;
        delete from qarar_core.organizations where id='${created.organizationId}';
      end $cleanup$;
      set session_replication_role=origin;
    `)
  }
  for (const id of created.authUsers) {
    await request(`/auth/v1/admin/users/${id}`, { method: "DELETE", headers: serviceHeaders })
  }
}

try {
  const admin = await createAuthUser("admin")
  const chair = await createAuthUser("chair")
  const rapporteur = await createAuthUser("rapporteur")
  const member = await createAuthUser("member")
  const organizationId = crypto.randomUUID()
  const typeId = crypto.randomUUID()
  const classId = crypto.randomUUID()
  created.organizationId = organizationId

  sql(`
    insert into qarar_core.organizations(id,code,name_ar)
    values('${organizationId}','s036-${suffix.replaceAll("-", "")}','اختبار HTTP للمجالس');
    insert into qarar_iam.users(id,organization_id,email,full_name_ar,is_system_admin)values
    ('${admin.id}','${organizationId}','${admin.email}','مدير المجالس',true),
    ('${chair.id}','${organizationId}','${chair.email}','الرئيس',false),
    ('${rapporteur.id}','${organizationId}','${rapporteur.email}','المقرر',false),
    ('${member.id}','${organizationId}','${member.email}','العضو',false);
    insert into qarar_core.governance_unit_types(
      id,organization_id,code,name_ar,is_council_type,is_system)
    values('${typeId}','${organizationId}','council','مجلس',true,true);
    insert into qarar_governance.governance_unit_classes(
      id,organization_id,code,name_ar,governance_level)
    values('${classId}','${organizationId}','department','إداري','department');
    insert into qarar_iam.roles(organization_id,code,name_ar,role_scope,is_active)
    values('${organizationId}','council_member','عضو مجلس','governance_unit',true);
  `)
  assert.equal(sql(`select count(*) from qarar_core.governance_unit_types
    where organization_id='${organizationId}' and code='general_council'
      and is_council_type and is_system and is_active`), "1")

  const headers = await login(admin.email)
  const council = await rpc("admin_create_council", {
    p_code: `council_${Date.now()}`,
    p_name_ar: "مجلس اختبار التكامل",
    p_name_en: "Integration Council",
    p_description: "HTTP contract coverage",
    p_unit_type_id: typeId,
    p_parent_unit_id: null,
    p_governance_class_id: classId,
    p_minimum_active_members: 1,
    p_allow_dual_leadership: false,
    p_client_request_id: crypto.randomUUID(),
  }, headers)
  assert.equal(council.status, "inactive")

  const invalid = await rpc("admin_create_council", {
    p_code: "Invalid-Code",
    p_name_ar: "رمز غير صالح",
    p_name_en: null,
    p_description: null,
    p_unit_type_id: typeId,
    p_parent_unit_id: null,
    p_governance_class_id: classId,
    p_minimum_active_members: 1,
    p_allow_dual_leadership: false,
    p_client_request_id: crypto.randomUUID(),
  }, headers, 400)
  assert.equal(invalid.code, "22023")

  const memberRoleId = sql(`select id from qarar_iam.roles
    where organization_id='${organizationId}' and code='council_member'`)
  for (const user of [chair, rapporteur, member]) {
    await rpc("admin_add_council_member", {
      p_council_id: council.id,
      p_user_id: user.id,
      p_role_id: memberRoleId,
      p_membership_title: "عضو",
      p_start_date: new Date().toISOString().slice(0, 10),
      p_end_date: null,
    }, headers)
  }

  let detail = await rpc("admin_get_council_detail", { p_council_id: council.id }, headers)
  await rpc("admin_assign_council_leadership", {
    p_council_id: council.id,
    p_chair_user_id: chair.id,
    p_rapporteur_user_id: rapporteur.id,
    p_effective_date: new Date().toISOString().slice(0, 10),
    p_reason: "تكليف الرئيس والمقرر",
    p_expected_updated_at: detail.updated_at,
  }, headers)

  const readiness = await rpc("admin_validate_council_administrative_readiness",
    { p_council_id: council.id }, headers)
  assert.equal(readiness.administratively_ready, true)
  const activated = await rpc("admin_activate_council", {
    p_council_id: council.id,
    p_reason: "اكتمال البيانات الإدارية",
    p_expected_updated_at: detail.updated_at,
  }, headers)
  assert.equal(activated.status, "active")
  await rpc("admin_activate_council", {
    p_council_id: council.id,
    p_reason: "تكرار غير صالح",
    p_expected_updated_at: activated.updated_at,
  }, headers, 400)

  const available = await rpc("get_available_councils", {
    p_query: null,
    p_unit_type_id: null,
    p_governance_class_id: null,
    p_parent_unit_id: null,
    p_limit: 10,
    p_offset: 0,
  }, headers)
  assert.ok(available.items.some((item) => item.id === council.id))
  assert.ok(available.total >= 1)
  assert.equal(available.limit, 10)
  assert.equal(available.offset, 0)

  const deactivated = await rpc("admin_deactivate_council", {
    p_council_id: council.id,
    p_reason: "تعطيل إداري",
    p_expected_updated_at: activated.updated_at,
  }, headers)
  assert.equal(deactivated.status, "inactive")
  const archived = await rpc("admin_archive_council", {
    p_council_id: council.id,
    p_reason: "إنهاء المجلس",
    p_expected_updated_at: deactivated.updated_at,
  }, headers)
  assert.equal(archived.status, "archived")

  console.log("Sprint 03.6 council HTTP contracts passed")
} finally {
  await cleanup()
}
