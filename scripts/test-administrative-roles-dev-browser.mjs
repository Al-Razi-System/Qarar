// DEV only: isolated tenant and identities, never existing accounts or production.
import fs from "node:fs";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(
  new URL("../apps/dashboard/package.json", import.meta.url),
);
const { chromium, expect: baseExpect } = require("@playwright/test");
const expect = baseExpect.configure({ timeout: 60000 });
const env = Object.fromEntries(
  fs
    .readFileSync(
      new URL("../supabase/docker/.env.remote-dev", import.meta.url),
      "utf8",
    )
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")];
    }),
);
const base = "http://127.0.0.1:55421",
  domain = "https://devqarar.prideidea.com";
const org = crypto.randomUUID(),
  suffix = Date.now(),
  password = crypto.randomBytes(24).toString("hex") + "!Aa";
const actors = [];
let browser, page;
const sql = (body) =>
  execFileSync(
    "docker",
    [
      "exec",
      "qarar-dev-supabase-db",
      "psql",
      "-X",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "supabase_admin",
      "-d",
      "postgres",
      "-Atc",
      body,
    ],
    { encoding: "utf8" },
  ).trim();
async function api(path, body, token = env.SERVICE_ROLE_KEY, extra = {}) {
  const response = await fetch(base + path, {
    method: "POST",
    headers: {
      apikey: env.ANON_KEY,
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
      ...extra,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });
  const data = await response.json();
  if (!response.ok)
    throw Error("Fixture API failed " + path + " " + response.status);
  return data;
}
function totp(secret) {
  let bits = "";
  for (const c of secret.toUpperCase().replace(/=+$/, ""))
    bits += "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
      .indexOf(c)
      .toString(2)
      .padStart(5, "0");
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8)
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const digest = crypto
    .createHmac("sha1", Buffer.from(bytes))
    .update(counter)
    .digest();
  return String(
    (digest.readUInt32BE(digest[19] & 15) & 0x7fffffff) % 1000000,
  ).padStart(6, "0");
}
async function identity(index, admin) {
  const email = `roles-${suffix}-${index}@example.test`,
    id = (
      await api("/auth/v1/admin/users", {
        email,
        password,
        email_confirm: true,
      })
    ).id;
  actors.push(id);
  if (index === 0)
    await api(
      "/rest/v1/rpc/service_bootstrap_organization_admin",
      {
        p_auth_user_id: id,
        p_organization_code: "roles-browser-" + suffix,
        p_email: email,
        p_full_name_ar: "مدير اختبار الأدوار",
        p_full_name_en: null,
        p_employee_no: null,
        p_mobile: null,
        p_job_title: null,
        p_approval_reference: "DEV-ROLES-" + suffix,
      },
      env.SERVICE_ROLE_KEY,
      { "Content-Profile": "api_v1" },
    );
  else
    sql(
      `insert into qarar_iam.users(id,organization_id,email,full_name_ar,status,is_system_admin) values('${id}','${org}','${email}','مستخدم اختبار الأدوار','active',${admin});`,
    );
  let session = await api(
    "/auth/v1/token?grant_type=password",
    { email, password },
    env.ANON_KEY,
  );
  if (admin) {
    const factor = await api(
      "/auth/v1/factors",
      { factor_type: "totp", friendly_name: "Isolated role verification" },
      session.access_token,
    );
    const challenge = await api(
      "/auth/v1/factors/" + factor.id + "/challenge",
      {},
      session.access_token,
    );
    session = await api(
      "/auth/v1/factors/" + factor.id + "/verify",
      { challenge_id: challenge.id, code: totp(factor.totp.secret) },
      session.access_token,
    );
  }
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  await context.addCookies([
    {
      name: "qarar_access_token",
      value: session.access_token,
      url: domain,
      httpOnly: true,
    },
    {
      name: "qarar_refresh_token",
      value: session.refresh_token,
      url: domain,
      httpOnly: true,
    },
  ]);
  return { context, id };
}
try {
  sql(
    `insert into qarar_core.organizations(id,code,name_ar) values('${org}','roles-browser-${suffix}','اختبار الأدوار المعزول');`,
  );
  // Definitions must come from system provisioning, not test-only manual seeding.
  if (sql(`select count(*) from qarar_iam.permissions where organization_id='${org}'`) !== '61') {
    throw Error('New organization did not receive the system permission catalog');
  }
  browser = await chromium.launch({ headless: true });
  const first = await identity(0, true),
    reader = await identity(2, false);
  page = await first.context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(domain + "/admin/permissions", {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  await expect(
    page.getByRole("heading", { name: "الأدوار والصلاحيات", exact: true }),
  ).toBeVisible();
  // The initial role may hydrate after the page heading; wait before mutating.
  await expect(page.getByRole("heading", {name:"رئيس المجلس",exact:true})).toBeVisible();
  await page.getByRole("button", { name: "إضافة دور", exact: true }).click();
  await page.getByLabel("اسم الدور", { exact: true }).fill("منسق الاجتماعات");
  await page.getByLabel("أين يُستخدم الدور؟").selectOption("organization");
  await expect(page.getByLabel("رمز الدور")).toHaveCount(0);
  await page
    .getByLabel("وصف المسؤوليات")
    .fill("تنسيق اجتماعات المجلس ومتابعة موضوعاته");
  await page
    .getByRole("button", { name: "حفظ بيانات الدور", exact: true })
    .click();
  await expect(
    page.getByText("تم حفظ بيانات الدور. اختر صلاحياته من القائمة.", {
      exact: true,
    }),
  ).toBeVisible();
  const role = sql(
    `select id from qarar_iam.roles where organization_id='${org}' and name_ar='منسق الاجتماعات';`,
  );
  if (
    !role ||
    sql(`select code from qarar_iam.roles where id='${role}';`).startsWith(
      "role_",
    ) !== true
  )
    throw Error("Server role key missing");
  const groupButtons=page.locator("h3 button");
  for(let i=0;i<await groupButtons.count();i++) await groupButtons.nth(i).click();
  await expect(
    page.getByRole("checkbox", { name: /عرض الاجتماعات/ }),
  ).toBeVisible();
  await expect(page.getByRole("checkbox")).toHaveCount(61);
  for(const checkbox of await page.getByRole("checkbox").all()) await checkbox.check();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "/tmp/qarar-roles-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "/tmp/qarar-roles-mobile.png",
    fullPage: true,
  });
  if (
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
  )
    throw Error("Mobile overflow");
  await page.evaluate(() =>
    document.querySelector("main")?.setAttribute("data-theme", "dark"),
  );
  await page.screenshot({
    path: "/tmp/qarar-roles-mobile-dark.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: "/tmp/qarar-roles-desktop-dark.png",
    fullPage: true,
  });
  await page.evaluate(() =>
    document.querySelector("main")?.removeAttribute("data-theme"),
  );
  await page
    .getByRole("button", { name: "مراجعة التغييرات", exact: true })
    .click();
  await page.getByLabel("سبب التغيير").fill("تمكين الاطلاع داخل مجلس العمل");
  await page
    .getByRole("button", { name: "حفظ الصلاحيات", exact: true })
    .click();
  await expect(page.getByText("تم حفظ الصلاحيات وتطبيقها مباشرة.", {exact:true})).toBeVisible();
  if (
    sql(
      `select count(*) from qarar_iam.role_permissions where role_id='${role}' and is_active;`,
    ) !== "61"
  )
    throw Error("Not all selected permissions applied directly");
  if(sql(`select count(*) from qarar_iam.iam_change_requests where organization_id='${org}'`) !== "0") throw Error("Direct save created an approval request");
  const unitA = crypto.randomUUID(),
    unitB = crypto.randomUUID(),
    type = crypto.randomUUID();
  sql(`begin;
 insert into qarar_core.governance_unit_types(id,organization_id,code,name_ar,is_council_type) values('${type}','${org}','fixture_scope','جهة اختبار',false);
 insert into qarar_core.governance_units(id,organization_id,unit_type_id,code,name_ar,status) values('${unitA}','${org}','${type}','scope_a','النطاق الأول','active'),('${unitB}','${org}','${type}','scope_b','النطاق الثاني','active');
 insert into qarar_iam.memberships(organization_id,user_id,role_id,governance_unit_id,membership_status,start_date) values('${org}','${reader.id}','${role}','${unitA}','active',current_date);
 select set_config('request.jwt.claims',jsonb_build_object('sub','${reader.id}','role','authenticated','aal','aal1')::text,true);
 do $$ begin
 if not qarar_iam.has_permission('meetings.read','${unitA}') then raise exception 'allowed scope denied'; end if;
 if qarar_iam.has_permission('meetings.read','${unitB}') or qarar_iam.has_permission('meetings.read',null) then raise exception 'scope widened'; end if;
 if not qarar_iam.has_permission('iam.permissions.manage',null) then raise exception 'organization grant missing'; end if;
 end $$;
 select set_config('request.jwt.claims',jsonb_build_object('sub','${first.id}','role','authenticated','aal','aal2')::text,true);
 update qarar_iam.memberships set start_date=current_date-2,end_date=current_date-1 where user_id='${reader.id}' and role_id='${role}';
 select set_config('request.jwt.claims',jsonb_build_object('sub','${reader.id}','role','authenticated','aal','aal1')::text,true);
 do $$ begin if qarar_iam.has_permission('meetings.read','${unitA}') then raise exception 'expired membership grants'; end if; end $$;
 rollback;`);
  const denied = await reader.context.request.post(domain + "/api/admin/iam", {
    headers: { Origin: domain },
    data: { operation: "upsertRole", payload: { p_name_ar: "دور غير مخول" } },
  });
  if (denied.status() !== 403)
    throw Error("Unprivileged role creation allowed");
  const directDenied = await reader.context.request.post(domain + "/api/admin/iam", {
    headers: {Origin:domain}, data:{operation:"saveRolePermissions",payload:{p_role_id:role,p_permission_codes:[],p_expected_permission_codes:[],p_request_id:crypto.randomUUID(),p_reason:null}}
  });
  if(directDenied.status()!==403) throw Error("Non-system administrator saved directly");
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /^منسق الاجتماعات/ }).click();
  await expect(
    page.getByRole("heading", { name: "منسق الاجتماعات", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("checkbox", { name: /عرض الاجتماعات/ }),
  ).toBeChecked();
  await expect(page.getByRole("checkbox")).toHaveCount(61);
  for(const checkbox of await page.getByRole("checkbox").all()) await checkbox.uncheck();
  await page.getByRole("button",{name:"مراجعة التغييرات",exact:true}).click();
  await expect(page.getByRole("button",{name:"حفظ الصلاحيات",exact:true})).toBeEnabled();
  await page.getByRole("button",{name:"حفظ الصلاحيات",exact:true}).click();
  await expect(page.getByText("تم حفظ الصلاحيات وتطبيقها مباشرة.",{exact:true})).toBeVisible();
  if(sql(`select count(*) from qarar_iam.role_permissions where role_id='${role}' and is_active`)!=="0") throw Error("UI revocation did not revoke all 61 grants");
  const concurrent = await Promise.all(["meetings.read","topics.read"].map(code => first.context.request.post(domain+"/api/admin/iam", {
    headers:{Origin:domain},data:{operation:"saveRolePermissions",payload:{p_role_id:role,p_permission_codes:[code],p_expected_permission_codes:[],p_request_id:crypto.randomUUID(),p_reason:null}}
  })));
  if(concurrent.map(r=>r.status()).sort().join(",")!=="200,409") throw Error("Concurrent stale save was not rejected");
  const winner=(await concurrent.find(r=>r.status()===200).json()).permission_codes;
  const clear=await first.context.request.post(domain+"/api/admin/iam",{headers:{Origin:domain},data:{operation:"saveRolePermissions",payload:{p_role_id:role,p_permission_codes:[],p_expected_permission_codes:winner,p_request_id:crypto.randomUUID(),p_reason:null}}});
  if(!clear.ok()) throw Error("Failed to clear concurrency fixture grants");
  await page.getByRole("button", { name: "تعطيل الدور", exact: true }).click();
  await page.getByLabel("سبب التعطيل").fill("اختبار سحب الدور");
  await page
    .getByRole("button", { name: "تأكيد تعطيل الدور", exact: true })
    .click();
  await expect(
    page.getByText("تم تعطيل الدور مع الاحتفاظ بسجله.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "إعادة تفعيل الدور", exact: true })
    .click();
  await page
    .getByRole("button", { name: "تأكيد إعادة التفعيل", exact: true })
    .click();
  await expect(
    page.getByText("تمت إعادة تفعيل الدور بصلاحياته السابقة.", { exact: true }),
  ).toBeVisible();
  if (errors.length) throw Error("Browser errors: " + errors.join(";"));
  console.log(
    JSON.stringify({
      ok: true,
      checks: [
        "server-generated key",
        "Arabic groups",
        "1440/390 light/dark",
        "all 61 selected and saved directly",
        "no approval request created",
        "all 61 unchecked and revoked directly",
        "direct save denied to ordinary actor",
        "parallel HTTP saves: one succeeds and one conflicts",
        "ordinary actor denied",
        "allowed scope and other/null scope denied",
        "expired membership denied",
        "disable/reactivate",
      ],
    }),
  );
} catch (error) {
  if (page) {
    await page
      .screenshot({ path: "/tmp/qarar-roles-failure.png", fullPage: true })
      .catch(() => {});
    console.error((await page.locator("body").innerText()).slice(-2200));
  }
  // Playwright request errors include session cookies in their diagnostic log.
  // Never print that log or a stack containing authentication headers.
  console.error(error instanceof Error ? error.message.split("Call log:")[0] : "Browser verification failed");
  process.exitCode = 1;
} finally {
  await browser?.close();
  for (const id of actors)
    await fetch(base + "/auth/v1/admin/users/" + id, {
      method: "PUT",
      headers: {
        apikey: env.ANON_KEY,
        Authorization: "Bearer " + env.SERVICE_ROLE_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ban_duration: "876000h" }),
    });
}
