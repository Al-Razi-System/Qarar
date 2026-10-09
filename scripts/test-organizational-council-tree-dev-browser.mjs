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

  const root = crypto.randomUUID(), faculty = crypto.randomUUID(), department = crypto.randomUUID(), empty = crypto.randomUUID();
  const type = crypto.randomUUID(), councilType = crypto.randomUUID();
  const council = crypto.randomUUID(), sibling = crypto.randomUUID(), institution = crypto.randomUUID();
  function sql(statement) {
    return execFileSync('docker', ['exec', db, 'psql', '-X', '-At', '-v', 'ON_ERROR_STOP=1', '-U', 'supabase_admin', '-d', 'postgres', '-c', statement], { encoding: 'utf8' }).trim();
  }
  sql(`insert into qarar_core.governance_unit_types(id,organization_id,code,name_ar,is_council_type) values
    ('${type}','${org}','tree-unit','وحدة تنظيمية',false), ('${councilType}','${org}','tree-council','مجلس',true);
    insert into qarar_core.governance_units(id,organization_id,unit_type_id,code,name_ar,status) values
    ('${root}','${org}','${type}','tree-root','رئاسة الجامعة','active'),
    ('${empty}','${org}','${type}','tree-empty','عمادة شؤون الطلاب','active');
    insert into qarar_core.governance_units(id,organization_id,unit_type_id,code,name_ar,status,parent_unit_id) values
    ('${faculty}','${org}','${type}','tree-faculty','كلية الحاسوب','active','${root}'),
    ('${department}','${org}','${type}','tree-dept','قسم الذكاء الاصطناعي','active','${faculty}');
    insert into qarar_core.governance_units(id,organization_id,unit_type_id,code,name_ar,status,scope_unit_id) values
    ('${council}','${org}','${councilType}','cnl_2026_000001','مجلس قسم الذكاء الاصطناعي','inactive','${department}'),
    ('${sibling}','${org}','${councilType}','cnl_2026_000002','لجنة جودة الذكاء الاصطناعي','inactive','${department}'),
    ('${institution}','${org}','${councilType}','cnl_2026_000003','مجلس الأمناء','inactive',null);`);
  await page.goto(domain + '/admin/councils');
  const hierarchy = page.locator('div[aria-label="الهيكل التنظيمي والمجالس"]');
  await expect(hierarchy.getByText('رئاسة الجامعة', {exact:true})).toBeVisible();
  await expect(hierarchy.getByText('كلية الحاسوب', {exact:true})).toBeVisible();
  await expect(hierarchy.getByText('قسم الذكاء الاصطناعي', {exact:true})).toBeVisible();
  await expect(hierarchy.getByText('عمادة شؤون الطلاب', {exact:true})).toHaveCount(0);
  await expect(hierarchy.getByRole('region', {name:'على مستوى المؤسسة'}).getByRole('button',{name:'مجلس الأمناء',exact:true})).toBeVisible();
  await hierarchy.getByRole('button',{name:'مجلس قسم الذكاء الاصطناعي',exact:true}).click();
  await expect(hierarchy.getByRole('button',{name:'مجلس قسم الذكاء الاصطناعي',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(page.getByRole('button',{name:'الأعضاء (0)',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'تعديل',exact:true})).toBeVisible();
  await hierarchy.getByRole('button',{name:'مجلس قسم الذكاء الاصطناعي',exact:true}).click();
  await expect(page.getByRole('button',{name:'تعديل',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'الأعضاء (0)',exact:true}).click();
  await expect(page.getByRole('button',{name:'إضافة عضو',exact:true})).toBeVisible();
  await hierarchy.getByRole('button',{name:'طي رئاسة الجامعة',exact:true}).click();
  await expect(hierarchy.getByText('كلية الحاسوب',{exact:true})).toHaveCount(0);
  await page.getByRole('textbox',{name:'البحث في الهيكل'}).fill('مجلس قسم الذكاء');
  await expect(hierarchy.getByText('كلية الحاسوب',{exact:true})).toBeVisible();
  await expect(hierarchy.getByRole('button',{name:'مجلس قسم الذكاء الاصطناعي',exact:true})).toBeVisible();
  await expect(hierarchy.getByRole('button',{name:'لجنة جودة الذكاء الاصطناعي',exact:true})).toHaveCount(0);
  await page.getByRole('textbox',{name:'البحث في الهيكل'}).fill('');
  await page.getByRole('textbox',{name:'البحث في الهيكل'}).fill('عمادة شؤون الطلاب');
  await expect(hierarchy.getByText('عمادة شؤون الطلاب',{exact:true})).toHaveCount(0);
  await expect(hierarchy.getByRole('status')).toContainText('لا توجد مجالس مطابقة للبحث');
  await page.getByRole('textbox',{name:'البحث في الهيكل'}).fill('');
  await hierarchy.getByRole('button',{name:'فرد الكل',exact:true}).click();
  await page.screenshot({path:'/tmp/qarar-organizational-tree-desktop.png',fullPage:true});
  console.log('PASS desktop organizational ancestry, sibling councils, institutional group, selection/details, collapse and ancestor-preserving search.');
  await page.route('**/api/admin/councils', async route => {
    if (route.request().postDataJSON().contract !== 'admin_get_council_organizational_tree_v2') return route.continue();
    await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{message:'تعذر تحديث الهيكل في اختبار تحمّل الأخطاء'}})});
  });
  // The intentional 503 is a controlled fixture, not a real server failure.
  errors.length = 0;
  await page.getByRole('button',{name:'تحديث',exact:true}).click();
  const refreshError = page.getByRole('alert').filter({hasText:'تعذر تحديث الهيكل'});
  await expect(refreshError).toBeVisible();
  await expect(hierarchy.getByRole('button',{name:'مجلس قسم الذكاء الاصطناعي',exact:true})).toBeVisible();
  await page.unroute('**/api/admin/councils');
  errors.length = 0;
  await page.getByRole('button',{name:'إعادة تحميل الهيكل',exact:true}).click();
  await expect(refreshError).toHaveCount(0);
  await page.setViewportSize({width:390,height:844});
  await hierarchy.getByRole('button',{name:'مجلس قسم الذكاء الاصطناعي',exact:true}).scrollIntoViewIfNeeded();
  if(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth)) throw Error('Mobile tree overflows the page');
  await page.screenshot({path:'/tmp/qarar-organizational-tree-mobile.png',fullPage:true});
  await hierarchy.getByRole('button',{name:'طي الكل',exact:true}).click();
  await expect(hierarchy.getByText('قسم الذكاء الاصطناعي',{exact:true})).toHaveCount(0);
  await hierarchy.getByRole('button',{name:'فرد الكل',exact:true}).click();
  await expect(hierarchy.getByRole('button',{name:'مجلس قسم الذكاء الاصطناعي',exact:true})).toBeVisible();
  if(errors.length) throw Error(errors.join('\n'));
  console.log('PASS 390px: no page overflow, controls usable; failed refresh retains tree and shows local retry, recovery succeeds, no runtime errors.');
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

