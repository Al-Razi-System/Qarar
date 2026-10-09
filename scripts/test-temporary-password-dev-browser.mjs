// Development-only isolated tenant and identities; preserve all real data.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../apps/dashboard/package.json', import.meta.url));
const { chromium, expect: baseExpect } = require('@playwright/test');
const expect = baseExpect.configure({ timeout: 60000 });
const env = Object.fromEntries(fs.readFileSync(new URL('../supabase/docker/.env.remote-dev', import.meta.url), 'utf8').split(/\r?\n/).filter(l => l && !l.startsWith('#') && l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')]; }));
const base = 'http://127.0.0.1:55421', domain = 'https://devqarar.prideidea.com';
const org = crypto.randomUUID(), suffix = Date.now(), email = `temporary-${suffix}@example.test`, adminEmail = `admin-${email}`;
const password = crypto.randomBytes(20).toString('hex') + '!Aa', newPassword = crypto.randomBytes(20).toString('hex') + '!Aa';
let browser, adminId, userId, page;
function sql(body) { return execFileSync('docker', ['exec', 'qarar-dev-supabase-db', 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'supabase_admin', '-d', 'postgres', '-Atc', body], { encoding: 'utf8' }).trim(); }
async function api(path, body, token = env.SERVICE_ROLE_KEY, extra = {}) {
  const response = await fetch(base + path, { method: 'POST', headers: { apikey: env.ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...extra }, body: JSON.stringify(body), signal: AbortSignal.timeout(60000) });
  const data = await response.json(); if (!response.ok) throw Error(`Fixture/API failed (${path}): ${response.status}`); return data;
}
function totp(secret) {
  let bits = ''; for (const c of secret.toUpperCase().replace(/=+$/, '')) bits += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(c).toString(2).padStart(5, '0');
  const bytes = []; for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const digest = crypto.createHmac('sha1', Buffer.from(bytes)).update(counter).digest();
  return String((digest.readUInt32BE(digest[19] & 15) & 0x7fffffff) % 1000000).padStart(6, '0');
}
try {
  console.log('Stage: isolated admin setup');
  adminId = (await api('/auth/v1/admin/users', { email: adminEmail, password, email_confirm: true })).id;
  sql(`insert into qarar_core.organizations(id,code,name_ar) values('${org}','temporary-${suffix}','اختبار حساب مؤقت معزول');`);
  const typeId=crypto.randomUUID(), unitId=crypto.randomUUID(), roleA=crypto.randomUUID(), roleB=crypto.randomUUID();
  sql(`insert into qarar_core.governance_unit_types(id,organization_id,code,name_ar,is_council_type) values('${typeId}','${org}','office','إدارة',false);
insert into qarar_core.governance_units(id,organization_id,unit_type_id,code,name_ar,status) values('${unitId}','${org}','${typeId}','office','إدارة الاختبار','active');
insert into qarar_iam.roles(id,organization_id,code,name_ar,role_scope) values('${roleA}','${org}','fixture_a','دور اختبار أول','governance_unit'),('${roleB}','${org}','fixture_b','دور اختبار ثان','governance_unit');`);
  await api('/rest/v1/rpc/service_bootstrap_organization_admin', { p_auth_user_id: adminId, p_organization_code: 'temporary-' + suffix, p_email: adminEmail, p_full_name_ar: 'مدير اختبار الحساب المؤقت', p_full_name_en: null, p_employee_no: null, p_mobile: null, p_job_title: null, p_approval_reference: 'DEV-TEMP-' + suffix }, env.SERVICE_ROLE_KEY, { 'Content-Profile': 'api_v1' });
  const session = await api('/auth/v1/token?grant_type=password', { email: adminEmail, password }, env.ANON_KEY);
  const factor = await api('/auth/v1/factors', { factor_type: 'totp', friendly_name: 'Temporary account isolated test' }, session.access_token);
  const challenge = await api('/auth/v1/factors/' + factor.id + '/challenge', {}, session.access_token);
  const verified = await api('/auth/v1/factors/' + factor.id + '/verify', { challenge_id: challenge.id, code: totp(factor.totp.secret) }, session.access_token);
  browser = await chromium.launch({ headless: true });
  const adminContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await adminContext.addCookies([{ name: 'qarar_access_token', value: verified.access_token, url: domain, httpOnly: true }, { name: 'qarar_refresh_token', value: verified.refresh_token, url: domain, httpOnly: true }]);
  page = await adminContext.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
  console.log('Stage: create account from admin interface');
  await page.goto(domain + '/admin/users', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.getByRole('button', { name: 'إنشاء حساب جديد', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('الاسم الكامل بالعربية').fill('مستخدم كلمة مؤقتة');
  await dialog.getByLabel('البريد الإلكتروني المؤسسي').fill(email);
  await dialog.getByLabel('كلمة مرور مؤقتة — دون دعوة').check();
  await dialog.getByLabel('كلمة المرور المؤقتة', { exact: true }).fill(password);
  await page.screenshot({ path: '/tmp/qarar-temporary-creation-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: '/tmp/qarar-temporary-creation-mobile.png', fullPage: true });
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw Error('Creation mobile overflow');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await dialog.getByRole('button', { name: 'التالي', exact: true }).click();
  await dialog.getByRole('button', { name: 'التالي', exact: true }).click();
  await dialog.getByRole('checkbox', { name: /أؤكد/ }).check();
  const creationPromise = page.waitForResponse(r => r.url().endsWith('/api/admin/users') && r.request().method() === 'POST', { timeout: 60000 });
  await dialog.getByRole('button', { name: 'إنشاء الحساب', exact: true }).click();
  const creation = await creationPromise, receipt = await creation.json();
  userId = receipt.user_id;
  if (!creation.ok() || !receipt.account_created || receipt.invitation_sent !== false || receipt.must_change_password !== true) throw Error('Direct creation failed: ' + creation.status());
  await expect(dialog.getByRole('status').filter({ hasText: 'تم إنشاء الحساب' })).toContainText('دون دعوة');
  console.log('Stage: multiple roles without activating identity');
  const identityBeforeRoles=sql(`select status||':'||must_change_password::text||':'||is_system_admin::text from qarar_iam.users where id='${userId}';`);
  const roles=dialog.getByRole('region',{name:'أدوار المستخدم'});
  for (const role of [roleA,roleB]) {
    await roles.getByRole('button',{name:'إضافة دور',exact:true}).click();
    await roles.getByRole('combobox',{name:/^الدور/}).selectOption(role);
    await roles.getByRole('combobox',{name:/^المجلس أو جهة الدور/}).selectOption(unitId);
    await roles.getByRole('button',{name:'حفظ الدور',exact:true}).click();
    await expect(roles.locator('article')).toHaveCount(role===roleA?1:2);
  }
  const firstRole=roles.locator('article').filter({hasText:'دور اختبار أول'});
  await firstRole.getByRole('button',{name:'تعديل الدور',exact:true}).click();
  await roles.getByText('السريان وصفة الدور — اختيارية',{exact:true}).click();
  await roles.getByLabel('صفة الدور',{exact:true}).fill('صفة معدلة');
  await roles.getByRole('button',{name:'حفظ الدور',exact:true}).click();
  await expect(firstRole).toContainText('صفة معدلة');
  await firstRole.getByRole('button',{name:'تعطيل الدور',exact:true}).click();
  await expect(firstRole.getByRole('button',{name:'إعادة تفعيل الدور',exact:true})).toBeEnabled();
  await firstRole.getByRole('button',{name:'إعادة تفعيل الدور',exact:true}).click();
  await expect(firstRole.getByRole('button',{name:'تعطيل الدور',exact:true})).toBeEnabled();
  await page.screenshot({path:'/tmp/qarar-user-roles-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'/tmp/qarar-user-roles-mobile.png',fullPage:true});
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Role manager mobile overflow');
  await page.setViewportSize({width:1440,height:1000});
  if(sql(`select count(*) from qarar_iam.memberships where user_id='${userId}';`)!=='2')throw Error('Role records duplicated');
  if(sql(`select status||':'||must_change_password::text||':'||is_system_admin::text from qarar_iam.users where id='${userId}';`)!==identityBeforeRoles)throw Error('Role edits changed account state or authority');
  await roles.getByRole('button',{name:'متابعة إلى جهة العمل ونطاق التقديم',exact:true}).click();
  await dialog.getByRole('button', { name: 'حفظ جهة العمل والنطاق', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  if (sql(`select count(*) from qarar_iam.user_invitations where auth_user_id='${userId}';`) !== '0') throw Error('Direct flow created an invitation');
  const temporary = await api('/auth/v1/token?grant_type=password', { email, password }, env.ANON_KEY);
  console.log('Stage: restricted first login');
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
  await page.goto(domain + '/login', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.getByLabel('البريد الإلكتروني', { exact: true }).fill(email);
  await page.getByLabel('كلمة المرور', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'تسجيل الدخول', exact: true }).click();
  await expect(page).toHaveURL(/\/change-password$/);
  await expect(page.getByRole('heading', { name: 'كلمة مرور خاصة بك' })).toBeVisible();
  if ((await context.cookies()).some(c => c.name === 'qarar_access_token' && c.value)) throw Error('Pending account received app session');
  if ((await context.request.get(domain + '/api/account')).status() !== 401) throw Error('Pending account reached own application account');
  const denied = await api('/rest/v1/rpc/get_current_user_access_context', {}, temporary.access_token, { 'Content-Profile': 'api_v1' });
  if (denied?.organization_id || denied?.is_system_admin || denied?.permissions?.length) throw Error('Pending JWT has tenant permissions');
  await page.screenshot({ path: '/tmp/qarar-temporary-replacement-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: '/tmp/qarar-temporary-replacement-mobile.png', fullPage: true });
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw Error('Replacement mobile overflow');
  await page.getByLabel('كلمة المرور الحالية', { exact: true }).fill('IncorrectPassword42!');
  console.log('Stage: replace password and revoke temporary sessions');
  await page.getByLabel('كلمة المرور الجديدة', { exact: true }).fill(newPassword);
  await page.getByLabel('تأكيد كلمة المرور الجديدة', { exact: true }).fill(newPassword);
  await page.getByRole('button', { name: 'حفظ كلمة المرور الجديدة', exact: true }).click();
  await expect(page.locator('p[role="alert"]')).toContainText('الحالية غير صحيحة');
  await page.getByLabel('كلمة المرور الحالية', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'حفظ كلمة المرور الجديدة', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('إلغاء الجلسات');
  if ((await context.cookies()).some(c => /qarar_(temporary_access|access|refresh)_token/.test(c.name) && c.value)) throw Error('Replacement retained a session cookie');
  if (sql(`select must_change_password::text||':'||require_live_auth_session::text from qarar_iam.users where id='${userId}';`) !== 'false:true') throw Error('Password state not completed');
  const oldJwt = await api('/rest/v1/rpc/get_current_user_access_context', {}, temporary.access_token, { 'Content-Profile': 'api_v1' });
  if (oldJwt?.organization_id || oldJwt?.is_system_admin || oldJwt?.permissions?.length) throw Error('Old temporary JWT unlocked after replacement');
  await page.getByRole('link', { name: 'تسجيل الدخول بالكلمة الجديدة', exact: true }).click();
  console.log('Stage: fresh login with personal password');
  await page.getByLabel('البريد الإلكتروني', { exact: true }).fill(email);
  await page.getByLabel('كلمة المرور', { exact: true }).fill(newPassword);
  await page.getByRole('button', { name: 'تسجيل الدخول', exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
  const account = await context.request.get(domain + '/api/account'); if (!account.ok()) throw Error('Fresh login cannot access personal account');
  if((await context.request.get(domain+'/api/admin/users/'+userId+'/roles')).status()!==403)throw Error('Ordinary identity reached role management');
  const oldPassword = await fetch(base + '/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: env.ANON_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  if (oldPassword.ok) throw Error('Old temporary password accepted');
  if (sql(`select count(*) from qarar_audit.audit_logs where organization_id='${org}' and actor_user_id='${userId}' and action='iam.temporary_password.complete';`) !== '1') throw Error('Completion audit missing');
  if (errors.length) throw Error('Browser errors: ' + errors.join('; '));
  console.log(JSON.stringify({ ok: true, checks: ['real admin UI direct creation', 'two contextual roles', 'edit disable reactivate role', 'role edits preserve account gate', 'ordinary user denied role management', 'no invitation', 'pending database gate', 'replacement-only login cookie', 'wrong current password denied', 'real replacement', 'all temporary sessions revoked', 'old JWT remains blocked', 'fresh personal password login', 'old password denied', 'audit actor', 'desktop/mobile'] }));
} catch (error) {
  if (page) { await page.screenshot({ path: '/tmp/qarar-temporary-failure.png', fullPage: true }).catch(() => {}); console.error((await page.locator('body').innerText()).slice(-2000)); }
  // Playwright's matcher object may contain password input snapshots. Never
  // print that object; keep only a credential-redacted message.
  throw Error(String(error?.message ?? 'Browser check failed').replaceAll(password, '[redacted]').replaceAll(newPassword, '[redacted]'));
} finally {
  await browser?.close();
  if (!userId && adminId) userId = sql(`select id from qarar_iam.users where organization_id='${org}' and email='${email}';`);
  for (const id of [adminId, userId].filter(Boolean)) await fetch(base + '/auth/v1/admin/users/' + id, { method: 'PUT', headers: { apikey: env.ANON_KEY, Authorization: 'Bearer ' + env.SERVICE_ROLE_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ ban_duration: '876000h' }) });
}
