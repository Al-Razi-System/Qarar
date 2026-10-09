// Explicitly isolated remote-development UI smoke test. Never targets production.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../apps/dashboard/package.json', import.meta.url));
const { chromium, expect } = require('@playwright/test');
const env = Object.fromEntries(fs.readFileSync(new URL('../supabase/docker/.env.remote-dev', import.meta.url), 'utf8')
  .split(/\r?\n/).filter(l => l && !l.startsWith('#') && l.includes('='))
  .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')]; }));
const base = 'http://127.0.0.1:55421';
const domain = 'https://devqarar.prideidea.com';
const db = 'qarar-dev-supabase-db';
const suffix = Date.now();
const org = crypto.randomUUID();
const email = `oru-browser-${suffix}@example.test`;
const password = crypto.randomBytes(24).toString('hex') + '!Aa';
let userId, browser;
async function api(path, body, key = env.SERVICE_ROLE_KEY, extra = {}) {
  const response = await fetch(base + path, {
    method: 'POST', headers: { apikey: env.ANON_KEY, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...extra },
    body: JSON.stringify(body), signal: AbortSignal.timeout(30000),
  });
  const data = await response.json();
  if (!response.ok) throw Error(`${path}: ${response.status} ${data.message || data.msg || data.error_description || ''}`);
  return data;
}
function totp(secret) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of secret.toUpperCase().replace(/=+$/, '')) bits += alphabet.indexOf(c).toString(2).padStart(5, '0');
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const digest = crypto.createHmac('sha1', Buffer.from(bytes)).update(counter).digest();
  return String((digest.readUInt32BE(digest[19] & 15) & 0x7fffffff) % 1000000).padStart(6, '0');
}
try {
  // No existing tenant, identity, password, MFA factor, or role is modified.
  const user = await api('/auth/v1/admin/users', { email, password, email_confirm: true });
  userId = user.id;
  execFileSync('docker', ['exec', db, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'supabase_admin', '-d', 'postgres', '-c',
    `insert into qarar_core.organizations(id,code,name_ar) values ('${org}','oru-browser-${suffix}','مؤسسة اختبار الوحدات المعزولة');`], { stdio: 'pipe' });
  await api('/rest/v1/rpc/service_bootstrap_organization_admin', {
    p_auth_user_id: userId, p_organization_code: `oru-browser-${suffix}`, p_email: email,
    p_full_name_ar: 'مدير اختبار الوحدات', p_full_name_en: null, p_employee_no: null,
    p_mobile: null, p_job_title: null, p_approval_reference: `DEV-ORU-TEST-${suffix}`,
  }, env.SERVICE_ROLE_KEY, { 'Content-Profile': 'api_v1' });
  const session = await api('/auth/v1/token?grant_type=password', { email, password }, env.ANON_KEY);
  const factor = await api('/auth/v1/factors', { factor_type: 'totp', friendly_name: 'Isolated browser test' }, session.access_token);
  const challenge = await api(`/auth/v1/factors/${factor.id}/challenge`, {}, session.access_token);
  const verified = await api(`/auth/v1/factors/${factor.id}/verify`, { challenge_id: challenge.id, code: totp(factor.totp.secret) }, session.access_token);
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1365, height: 900 } });
  await context.addCookies([
    { name: 'qarar_access_token', value: verified.access_token, url: domain, httpOnly: true, sameSite: 'Lax' },
    { name: 'qarar_refresh_token', value: verified.refresh_token, url: domain, httpOnly: true, sameSite: 'Lax' },
  ]);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('response', r => { if (r.status() >= 500) errors.push(`${r.status()} ${r.url()}`); });
  await page.goto(domain + '/admin/organizational-units');
  await page.getByRole('heading', { name: 'الوحدات التنظيمية', exact: true }).waitFor();
  await page.getByRole('button', { name: 'إضافة وحدة', exact: true }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('اسم الوحدة').fill('كلية اختبار المتصفح');
  await dialog.getByLabel('نوع الوحدة').selectOption({ label: '＋ إضافة نوع جديد…' });
  await dialog.getByLabel('اسم النوع الجديد').fill('كلية');
  await dialog.getByRole('button', { name: 'حفظ النوع', exact: true }).click();
  await dialog.getByRole('status').filter({ hasText: 'تم اختياره' }).waitFor();
  await expect(dialog.getByLabel('اسم الوحدة')).toHaveValue('كلية اختبار المتصفح');
  if (await dialog.locator('form').count() !== 1) throw Error('Nested forms in dialog');
  await dialog.getByLabel('نوع الوحدة').selectOption({ label: 'كلية' });
  await dialog.getByRole('button', { name: 'إضافة الوحدة', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  await page.getByRole('heading', { name: 'كلية اختبار المتصفح', exact: true }).waitFor();
  const reference = await page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'كلية اختبار المتصفح', exact: true }) }).locator('p[dir="ltr"]').innerText();
  await page.getByRole('textbox', { name: 'البحث عن وحدة تنظيمية' }).fill(reference);
  await page.getByRole('button', { name: 'بحث', exact: true }).click();
  await expect(page.getByRole('button', { name: 'بحث', exact: true })).toBeEnabled();
  await expect(page.getByRole('article')).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'كلية اختبار المتصفح', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'إضافة وحدة', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('اسم الوحدة').fill('كلية اختبار المتصفح');
  await dialog.getByLabel('نوع الوحدة').selectOption({ label: 'كلية' });
  await dialog.getByRole('button', { name: 'إضافة الوحدة', exact: true }).click();
  await dialog.getByRole('alert').waitFor();
  await expect(dialog.getByLabel('اسم الوحدة')).toHaveValue('كلية اختبار المتصفح');
  await dialog.getByRole('button', { name: 'إغلاق', exact: true }).click();
  const meetingTypeId = crypto.randomUUID();
  sql(`insert into qarar_meetings.meeting_types(id,organization_id,code,name_ar) values ('${meetingTypeId}','${org}','browser-timing','اجتماع اختبار التوقيت');`);
  await page.goto(domain + '/admin/councils');
  await page.getByRole('button', { name: 'إنشاء مجلس', exact: true }).click();
  dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('المجلس الأب')).toHaveCount(0);
  await dialog.getByLabel('اسم المجلس').fill('مجلس اختبار المتصفح');
  const types = await dialog.getByLabel('نوع المجلس').locator('option').allTextContents();
  await dialog.getByLabel('نوع المجلس').selectOption({ label: types[1] });
  await dialog.getByLabel('الوحدة التنظيمية').selectOption({ label: 'كلية اختبار المتصفح' });
  await dialog.getByLabel('إنشاء خطة اجتماعات لهذا المجلس').check();
  await dialog.getByLabel('موعد أول اجتماع').fill('2026-11-01');
  await expect(dialog.locator('input[type="time"]')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'إنشاء المجلس', exact: true }).click();
  try { await dialog.waitFor({ state: 'hidden' }); }
  catch (error) { if (await dialog.getByRole('alert').count()) throw Error('Council creation: ' + await dialog.getByRole('alert').innerText()); throw error; }
  if (sql(`select count(*) from qarar_meetings.council_meeting_plans_v2 where organization_id='${org}' and created_by_user_id='${userId}' and start_time is null and end_time is null;`) !== '1') throw Error('Council plan missing authenticated actor or fabricated times');
  if (sql(`select count(*) from qarar_meetings.meetings where organization_id='${org}' and source_plan_id is not null and status='draft' and scheduled_date='2026-11-01' and start_time is null and end_time is null;`) !== '1') throw Error('First plan meeting must be a single untimed draft');
  await page.goto(domain + '/admin/meetings');
  await expect(page.getByText('اجتماع مجلس اختبار المتصفح', { exact: true }).first()).toBeVisible();
  console.log('PASS first plan meeting: draft visible in meetings UI before council activation.');
  await page.goto(domain + '/admin/organizational-units');
  console.log('PASS desktop: AAL2 session, type/unit creation, inline error, council and plan atomic creation with actor, no parent input or fabricated times.');
  await page.goto(domain + '/admin/organizational-units');
  await page.getByRole('button', { name: 'تعديل', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('اسم الوحدة').fill('كلية اختبار معدلة');
  await dialog.getByRole('button', { name: 'حفظ التعديلات', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  await page.getByRole('heading', { name: 'كلية اختبار معدلة', exact: true }).waitFor();
  await expect(page.getByRole('article').locator('p[dir="ltr"]')).toHaveText(reference);
  await page.getByRole('button', { name: 'تعطيل', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'تأكيد التعطيل', exact: true }).click();
  await page.getByRole('dialog').getByRole('status').waitFor();
  await page.getByRole('dialog').getByRole('button', { name: 'تم', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: 'إعادة تفعيل', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'تأكيد إعادة التفعيل', exact: true }).click();
  await page.getByRole('dialog').getByRole('status').waitFor();
  await page.getByRole('dialog').getByRole('button', { name: 'تم', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: 'تعطيل', exact: true }).waitFor();
  await page.getByRole('button', { name: 'حذف', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('السجل والعلاقات السابقة');
  await page.getByRole('dialog').getByRole('button', { name: 'تأكيد الحذف المنطقي', exact: true }).click();
  await page.getByRole('dialog').getByRole('status').waitFor();
  await page.getByRole('dialog').getByRole('button', { name: 'تم', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await expect(page.getByRole('article')).toHaveCount(0);
  console.log('PASS unit lifecycle: edit with unchanged reference, deactivate, reactivate, logical deletion of council-linked unit.');
  // Prepare only this throwaway tenant's council leadership/type. Council
  // activation itself is outside this timing slice; meeting creation is via UI.
  const topicId = crypto.randomUUID();
  function sql(statement) {
    return execFileSync('docker', ['exec', db, 'psql', '-X', '-At', '-v', 'ON_ERROR_STOP=1', '-U', 'supabase_admin', '-d', 'postgres', '-c', statement], { encoding: 'utf8' }).trim();
  }
  const councilId = sql(`select id from qarar_core.governance_units where organization_id='${org}' and name_ar='مجلس اختبار المتصفح';`);
  if (!/^[0-9a-f-]{36}$/.test(councilId)) throw Error('Missing isolated council');
  sql(`update qarar_core.governance_units set status='active',activated_at=now(),allow_dual_leadership=true,minimum_active_members=1 where id='${councilId}' and organization_id='${org}';
    insert into qarar_iam.memberships(organization_id,user_id,governance_unit_id,role_id,start_date,membership_status)
      select '${org}','${userId}','${councilId}',id,current_date,'active' from qarar_iam.roles where organization_id='${org}' and code in ('council_chair','council_rapporteur');`);
  await page.goto(domain + '/admin/meetings');
  await page.getByRole('button', { name: 'إنشاء اجتماع', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'إنشاء اجتماع جديد', exact: true });
  await dialog.locator('select[name="governance_unit_id"]').selectOption(councilId);
  await dialog.locator('select[name="meeting_type_id"]').selectOption(meetingTypeId);
  await dialog.locator('input[name="title_ar"]').fill('اختبار موعد الدعوات');
  await dialog.locator('input[name="scheduled_date"]').fill('2026-11-01');
  await expect(dialog.locator('input[type="time"]')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'إنشاء الاجتماع', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  const meetingId = sql(`select id from qarar_meetings.meetings where organization_id='${org}' and title_ar='اختبار موعد الدعوات';`);
  if (!/^[0-9a-f-]{36}$/.test(meetingId)) throw Error('Meeting creation did not persist');
  if (sql(`select start_time is null and end_time is null from qarar_meetings.meetings where id='${meetingId}' and organization_id='${org}';`) !== 't') throw Error('Creation fabricated meeting times');
  sql(`insert into qarar_topics.topics(id,organization_id,topic_no,title_ar,current_unit_id,submitted_by_user_id,status)
    values ('${topicId}','${org}','TOP-BROWSER-TIMING','موضوع اختبار الدعوات','${councilId}','${userId}','approved');
    insert into qarar_meetings.agenda_items(organization_id,meeting_id,topic_id,agenda_order) values ('${org}','${meetingId}','${topicId}',1);`);
  await page.reload();
  await page.getByRole('button', { name: /اختبار موعد الدعوات/ }).click();
  await page.getByRole('button', { name: 'جدولة', exact: true }).click();
  await page.getByRole('button', { name: 'تجهيز الدعوات', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('وقت البداية').fill('09:00');
  await dialog.getByLabel('وقت النهاية').fill('11:00');
  await dialog.getByRole('button', { name: 'حفظ الوقت وتجهيز الدعوات', exact: true }).click();
  await dialog.getByRole('status').waitFor();
  await expect(dialog.getByRole('status')).toContainText('لا يعني ذلك تأكيد وصولها');
  if (sql(`select start_time='09:00'::time and end_time='11:00'::time from qarar_meetings.meetings where id='${meetingId}' and organization_id='${org}';`) !== 't') throw Error('Invitation timing not persisted');
  await dialog.getByRole('button', { name: 'تم', exact: true }).click();
  console.log('PASS meeting UI: create without times, schedule, capture planned times inside invitation dialog, atomic persistence and in-dialog success.');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(domain + '/admin/organizational-units');
  await page.getByRole('button', { name: 'إضافة وحدة', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.waitFor();
  await dialog.getByLabel('اسم الوحدة').fill('قسم اختبار الهاتف');
  await dialog.getByLabel('نوع الوحدة').selectOption({ label: '＋ إضافة نوع جديد…' });
  await dialog.getByLabel('اسم النوع الجديد').fill('قسم');
  await dialog.getByLabel('اسم النوع الجديد').press('Enter');
  await dialog.getByRole('status').filter({ hasText: 'تم اختياره' }).waitFor();
  await expect(dialog.getByLabel('اسم الوحدة')).toHaveValue('قسم اختبار الهاتف');
  if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)) throw Error('Mobile horizontal overflow');
  await dialog.getByRole('button', { name: 'إضافة الوحدة', exact: true }).scrollIntoViewIfNeeded();
  console.log('PASS mobile 390px: no horizontal overflow; dialog action accessible.');
  await dialog.getByRole('button', { name: 'إغلاق', exact: true }).click();
  await page.goto(domain + '/admin/councils');
  await page.getByRole('button', { name: 'إنشاء مجلس', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('اسم المجلس').fill('مجلس اختبار رفض الحفظ');
  await dialog.getByLabel('نوع المجلس').selectOption({ index: 1 });
  await dialog.getByRole('button', { name: /^الإعدادات المتقدمة/ }).click();
  const retries = [];
  await page.route('**/api/admin/councils', async route => {
    const body = route.request().postDataJSON();
    if (body.contract !== 'admin_create_council_v2') return route.continue();
    retries.push(body.params);
    await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: { message: 'تعذر حفظ المجلس في اختبار تحمّل الأخطاء' } }) });
  });
  for (let attempt = 0; attempt < 2; attempt++) {
    await dialog.getByRole('button', { name: 'إنشاء المجلس', exact: true }).click();
    await expect(dialog.getByRole('alert')).toBeVisible();
    const bounds = await dialog.getByRole('alert').boundingBox();
    if (!bounds || bounds.y < 0 || bounds.y + bounds.height > 844) throw Error('Save error hidden outside mobile viewport');
  }
  if (retries.length !== 2 || retries[0].p_client_request_id !== retries[1].p_client_request_id || retries.some(r => r.p_parent_council_id !== null)) throw Error('Unsafe creation retry or parent payload');
  await expect(dialog.getByLabel('اسم المجلس')).toHaveValue('مجلس اختبار رفض الحفظ');
  await page.unroute('**/api/admin/councils');
  console.log('PASS council mobile failure: error visible beside save, inputs retained, retry keeps request identity, no parent payload.');
  if (errors.length) throw Error(errors.join('\n'));
  console.log('PASS no runtime errors or server 5xx.');
} finally {
  if (browser) await browser.close();
  if (userId) {
    // Keep isolated evidence and audit records, but disable the throwaway identity.
    const response = await fetch(base + '/auth/v1/admin/users/' + userId, {
      method: 'PUT', headers: { apikey: env.ANON_KEY, Authorization: `Bearer ${env.SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ban_duration: '87600h' }), signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw Error('Could not disable isolated test identity');
    console.log('Isolated test identity disabled.');
  }
}
