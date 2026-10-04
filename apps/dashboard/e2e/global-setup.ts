import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { dockerEnv, saveFixture } from "./fixture";

export default async function globalSetup() {
  const env = await dockerEnv();
  const base = env.SUPABASE_PUBLIC_URL || "http://127.0.0.1:54321";
  const headers = {
    apikey: env.SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
  };
  const suffix = Date.now();
  const email = `regulations-e2e-${suffix}@example.test`;
  const password = `Qarar-E2E-${suffix}!Aa`;
  const authResponse = await fetch(`${base}/auth/v1/admin/users`, {
    method: "POST",
    headers,
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  if (!authResponse.ok) throw new Error(await authResponse.text());
  const user = await authResponse.json();

  const organizationId = randomUUID();
  const restHeaders = { ...headers, "Content-Profile": "public", Prefer: "return=representation" };
  const organization = await fetch(`${base}/rest/v1/organizations`, {
    method: "POST",
    headers: restHeaders,
    body: JSON.stringify({
      id: organizationId,
      code: `e2e-${suffix}`,
      name_ar: "منظمة اختبار Playwright",
    }),
  });
  if (!organization.ok) throw new Error(await organization.text());

  const profile = await fetch(`${base}/rest/v1/users`, {
    method: "POST",
    headers: restHeaders,
    body: JSON.stringify({
      id: user.id,
      organization_id: organizationId,
      email,
      full_name_ar: "مدير اختبار اللوائح",
      is_system_admin: false,
    }),
  });
  if (!profile.ok) throw new Error(await profile.text());

  // Keep enough real identities in the isolated tenant to exercise the users
  // table beyond its first 25-row page. The first created identity is kept as
  // the deterministic search target; the later identities push it onto
  // the second page because the production search orders newest records first.
  const extraUserIds: string[] = [];
  let userPageTarget: { id: string; email: string; fullNameAr: string } | null = null;
  for (let index = 1; index <= 30; index += 1) {
    const extraEmail = `qarar-e2e-user-${suffix}-${String(index).padStart(2, "0")}@example.test`;
    const fullNameAr = index === 1
      ? "طارق النهمي التجريبي"
      : `مستخدم اختبار الواجهة ${String(index).padStart(2, "0")}`;
    const extraAuthResponse = await fetch(`${base}/auth/v1/admin/users`, {
      method: "POST",
      headers,
      body: JSON.stringify({ email: extraEmail, email_confirm: true }),
    });
    if (!extraAuthResponse.ok) throw new Error(await extraAuthResponse.text());
    const extraUser = await extraAuthResponse.json() as { id: string };
    extraUserIds.push(extraUser.id);

    const extraProfile = await fetch(`${base}/rest/v1/users`, {
      method: "POST",
      headers: restHeaders,
      body: JSON.stringify({
        id: extraUser.id,
        organization_id: organizationId,
        email: extraEmail,
        employee_no: `E2E-${suffix}-${String(index).padStart(2, "0")}`,
        full_name_ar: fullNameAr,
        status: "active",
        is_system_admin: false,
      }),
    });
    if (!extraProfile.ok) throw new Error(await extraProfile.text());
    if (index === 1) userPageTarget = { id: extraUser.id, email: extraEmail, fullNameAr };
  }

  const privilegedEmail = `iam-e2e-${suffix}@example.test`;
  const privilegedPassword = `Qarar-IAM-E2E-${suffix}!Aa`;
  const privilegedAuthResponse = await fetch(`${base}/auth/v1/admin/users`, {
    method: "POST",
    headers,
    body: JSON.stringify({ email: privilegedEmail, password: privilegedPassword, email_confirm: true }),
  });
  if (!privilegedAuthResponse.ok) throw new Error(await privilegedAuthResponse.text());
  const privilegedUser = await privilegedAuthResponse.json() as { id: string };
  extraUserIds.push(privilegedUser.id);
  const privilegedProfile = await fetch(`${base}/rest/v1/users`, {
    method: "POST",
    headers: restHeaders,
    body: JSON.stringify({
      id: privilegedUser.id,
      organization_id: organizationId,
      email: privilegedEmail,
      full_name_ar: "مدير اختبار المستخدمين",
      status: "active",
      is_system_admin: false,
    }),
  });
  if (!privilegedProfile.ok) throw new Error(await privilegedProfile.text());

  // Exercise authorization as a real tenant administrator. Marking the test
  // identity as a system administrator triggers the production MFA policy and
  // makes an ordinary password-only browser journey invalid.
  const roleId = randomUUID();
  const privilegedRoleId = randomUUID();
  const unitTypeId = randomUUID();
  const unitId = randomUUID();
  execFileSync("docker", [
    "exec", "qarar-supabase-db", "psql", "-X", "-v", "ON_ERROR_STOP=1",
    "-U", "supabase_admin", "-d", "postgres", "-c", `
      insert into qarar_core.governance_unit_types
        (id, organization_id, code, name_ar, is_council_type)
      values ('${unitTypeId}', '${organizationId}', 'e2e_council', 'مجلس اختبار الواجهة', true);

      insert into qarar_core.governance_units
        (id, organization_id, unit_type_id, code, name_ar)
      values ('${unitId}', '${organizationId}', '${unitTypeId}', 'e2e_council', 'مجلس اختبار الواجهة');

      insert into qarar_iam.roles
        (id, organization_id, code, name_ar, role_scope)
      values ('${roleId}', '${organizationId}', 'governance_admin', 'مدير الحوكمة التجريبي', 'organization');

      insert into qarar_iam.roles
        (id, organization_id, code, name_ar, role_scope)
      values ('${privilegedRoleId}', '${organizationId}', 'iam_test_admin', 'مدير اختبار الهوية', 'organization');

      insert into qarar_iam.permissions
        (organization_id, code, module, action, context_scope, name_ar, name_en,
         description, is_system_permission, is_active)
      select '${organizationId}', code, module, action, context_scope, name_ar,
             name_en, description, is_system_permission, is_active
      from qarar_iam.permissions
      where organization_id = '00000000-0000-0000-0000-000000000001'
      on conflict (organization_id, code) do nothing;

      insert into qarar_iam.permissions
        (organization_id, code, module, action, context_scope, name_ar, name_en,
         is_system_permission, is_active)
      values
        ('${organizationId}', 'iam.users.read', 'iam', 'users.read', 'organization', 'قراءة المستخدمين', 'Read users', true, true),
        ('${organizationId}', 'iam.roles.read', 'iam', 'roles.read', 'organization', 'قراءة الأدوار والصلاحيات', 'Read roles and permissions', true, true),
        ('${organizationId}', 'topics.create', 'topics', 'create', 'governance_unit', 'إنشاء موضوع', 'Create topics', true, true),
        ('${organizationId}', 'topics.read', 'topics', 'read', 'governance_unit', 'عرض الموضوعات', 'Read topics', true, true),
        ('${organizationId}', 'topics.review', 'topics', 'review', 'governance_unit', 'مراجعة الموضوعات', 'Review topics', true, true)
      on conflict (organization_id, code) do nothing;

      insert into qarar_iam.role_permissions (organization_id, role_id, permission_id)
      select '${organizationId}', '${roleId}', id
      from qarar_iam.permissions
      where organization_id = '${organizationId}'
        and code not like 'iam.%'
      on conflict (organization_id, role_id, permission_id) do nothing;

      insert into qarar_iam.role_permissions (organization_id, role_id, permission_id)
      select '${organizationId}', '${privilegedRoleId}', id
      from qarar_iam.permissions
      where organization_id = '${organizationId}'
      on conflict (organization_id, role_id, permission_id) do nothing;

      insert into qarar_iam.memberships
        (organization_id, user_id, governance_unit_id, role_id)
      values
        ('${organizationId}', '${user.id}', '${unitId}', '${roleId}'),
        ('${organizationId}', '${privilegedUser.id}', '${unitId}', '${privilegedRoleId}');
    `,
  ], { stdio: "pipe" });

  await saveFixture({
    userId: user.id,
    organizationId,
    email,
    password,
    policyCode: `e2e-reg-${suffix}`,
    unitId,
    extraUserIds,
    userPageTarget,
    privilegedEmail,
    privilegedPassword,
  });
}
