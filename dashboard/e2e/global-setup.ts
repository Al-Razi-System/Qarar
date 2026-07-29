import { randomUUID } from "node:crypto";
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
    method: "POST", headers,
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  if (!authResponse.ok) throw new Error(await authResponse.text());
  const user = await authResponse.json();

  const organizationId = randomUUID();
  const restHeaders = { ...headers, "Content-Profile": "public", Prefer: "return=representation" };
  const organization = await fetch(`${base}/rest/v1/organizations`, {
    method: "POST", headers: restHeaders,
    body: JSON.stringify({ id: organizationId, code: `e2e-${suffix}`, name_ar: "منظمة اختبار Playwright" }),
  });
  if (!organization.ok) throw new Error(await organization.text());
  const profile = await fetch(`${base}/rest/v1/users`, {
    method: "POST", headers: restHeaders,
    body: JSON.stringify({
      id: user.id, organization_id: organizationId, email,
      full_name_ar: "مدير اختبار اللوائح", is_system_admin: true,
    }),
  });
  if (!profile.ok) throw new Error(await profile.text());
  await saveFixture({ userId: user.id, organizationId, email, password, policyCode: `E2E_REG_${suffix}` });
}
