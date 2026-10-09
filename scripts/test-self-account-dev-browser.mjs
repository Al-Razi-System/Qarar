// Isolated tenant and Auth identity on development only. No production writes.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../apps/dashboard/package.json', import.meta.url));
const { chromium, expect: baseExpect } = require('@playwright/test');
const expect = baseExpect.configure({ timeout: 60000 });
const env = Object.fromEntries(fs.readFileSync(new URL('../supabase/docker/.env.remote-dev', import.meta.url), 'utf8').split(/\r?\n/).filter(l => l && !l.startsWith('#') && l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')]; }));
const base = 'http://127.0.0.1:55421', domain = 'https://devqarar.prideidea.com';
const org = crypto.randomUUID(), suffix = Date.now();
const email = `self-account-${suffix}@example.test`, password = crypto.randomBytes(24).toString('hex') + '!Aa', newPassword = crypto.randomBytes(24).toString('hex') + '!Aa';
let browser, userId, page;
function sql(body) { return execFileSync('docker', ['exec', 'qarar-dev-supabase-db', 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'supabase_admin', '-d', 'postgres', '-Atc', body], { encoding: 'utf8' }).trim(); }
async function auth(path, body, token = env.SERVICE_ROLE_KEY) {
  const response = await fetch(base + path, { method: 'POST', headers: { apikey: env.ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(60000) });
  const data = await response.json(); if (!response.ok) throw Error('Auth fixture failed: ' + response.status); return data;
}
try {
  userId = (await auth('/auth/v1/admin/users', { email, password, email_confirm: true })).id;
  sql(`insert into qarar_core.organizations(id,code,name_ar) values('${org}','self-account-${suffix}','اختبار حساب شخصي معزول'); insert into qarar_iam.users(id,organization_id,email,full_name_ar,status) values('${userId}','${org}','${email}','مستخدم الحساب التجريبي','active');`);
  const session = await auth('/auth/v1/token?grant_type=password', { email, password }, env.ANON_KEY);
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addCookies([{ name: 'qarar_access_token', value: session.access_token, url: domain, httpOnly: true }, { name: 'qarar_refresh_token', value: session.refresh_token, url: domain, httpOnly: true }]);
  page = await context.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(domain + '/admin/account', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await expect(page.getByRole('heading', { name: 'حسابي', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'حسابي الشخصي', exact: true })).toBeVisible();
  await page.getByLabel('الاسم الكامل', { exact: true }).fill('الاسم الشخصي المعدل');
  await page.route('**/api/account', route => route.request().method() === 'PATCH' ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'تعذر الحفظ التجريبي.' }) }) : route.continue());
  await page.getByRole('button', { name: 'حفظ بياناتي' }).click();
  await expect(page.locator('p[role="alert"]')).toContainText('تعذر الحفظ');
  await expect(page.getByLabel('الاسم الكامل', { exact: true })).toHaveValue('الاسم الشخصي المعدل');
  await page.unroute('**/api/account');
  await page.getByRole('button', { name: 'حفظ بياناتي' }).click();
  await expect(page.getByRole('status')).toContainText('تم حفظ');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByLabel('الاسم الكامل', { exact: true })).toHaveValue('الاسم الشخصي المعدل');
  if (sql(`select count(*) from qarar_audit.audit_logs where organization_id='${org}' and actor_user_id='${userId}' and action='iam.self.profile_update';`) !== '1') throw Error('Profile audit missing');
  await page.screenshot({ path: '/tmp/qarar-self-account-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: '/tmp/qarar-self-account-mobile.png', fullPage: true });
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw Error('Mobile overflow');
  await page.getByLabel('كلمة المرور الحالية', { exact: true }).fill('IncorrectPassword!12');
  await page.getByLabel('كلمة المرور الجديدة', { exact: true }).fill(newPassword);
  await page.getByLabel('تأكيد كلمة المرور الجديدة', { exact: true }).fill(newPassword);
  await page.getByRole('button', { name: 'تغيير كلمة المرور', exact: true }).click();
  await expect(page.locator('p[role="alert"]')).toContainText('الحالية غير صحيحة');
  await page.getByLabel('كلمة المرور الحالية', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'تغيير كلمة المرور', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('تم تغيير كلمة المرور');
  if ((await context.cookies()).some(c => c.name === 'qarar_access_token' && c.value)) throw Error('Password change retained browser cookie');
  await auth('/auth/v1/token?grant_type=password', { email, password: newPassword }, env.ANON_KEY);
  const old = await fetch(base + '/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: env.ANON_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  if (old.ok) throw Error('Old password still works');
  if (errors.length) throw Error('Browser errors: ' + errors.join('; '));
  console.log(JSON.stringify({ ok: true, checks: ['ordinary user without administrative role', 'navigation', 'profile failure retains input', 'real save and reload', 'profile audit actor', 'desktop/mobile', 'wrong current password rejected', 'actual password change', 'browser logout', 'new password works and old denied'] }));
} catch (error) {
  if (page) { await page.screenshot({ path: '/tmp/qarar-self-account-failure.png', fullPage: true }).catch(() => {}); console.error((await page.locator('body').innerText()).slice(-2200)); }
  throw error;
} finally {
  await browser?.close();
  if (userId) await fetch(base + '/auth/v1/admin/users/' + userId, { method: 'PUT', headers: { apikey: env.ANON_KEY, Authorization: 'Bearer ' + env.SERVICE_ROLE_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ ban_duration: '876000h' }) });
}
