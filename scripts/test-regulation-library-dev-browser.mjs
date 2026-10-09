// Explicitly isolated remote-development UI smoke test. Never targets production.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../apps/dashboard/package.json', import.meta.url));
const { chromium, expect: baseExpect } = require('@playwright/test');
const expect=baseExpect.configure({timeout:30000});
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
let userId, browser, diagnosticPage;
async function api(path, body, key = env.SERVICE_ROLE_KEY, extra = {}) {
  const response = await fetch(base + path, {
    method: 'POST', headers: { apikey: env.ANON_KEY, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...extra },
    body: JSON.stringify(body), signal: AbortSignal.timeout(60000),
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
  diagnosticPage = page;
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('response', r => { if (r.status() >= 500) errors.push(`${r.status()} ${r.url()}`); });


  await page.goto(domain + '/admin/regulations/library', { waitUntil:'domcontentloaded', timeout:90000 });
  await expect(page.getByRole('heading', {name:'اللوائح والبنود',exact:true})).toBeVisible();
  await expect(page.getByText('لا توجد لوائح في هذه القائمة.',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'إضافة لائحة',exact:true}).click();
  await page.getByLabel('اسم اللائحة',{exact:true}).fill('لائحة الشؤون الأكاديمية');
  await expect(page.getByLabel('رمز اللائحة')).toHaveCount(0);
  let firstKey, secondKey;
  await page.route('**/api/admin/regulations', async route => {
    const body=route.request().postDataJSON();
    if(body.params?.p_action!=='create') return route.continue();
    firstKey=body.params.p_client_request_id;
    await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{message:'تعذر حفظ اللائحة مؤقتًا.',requestId:'isolated-fixture'}})});
  });
  await page.getByRole('button',{name:'حفظ اللائحة',exact:true}).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('تعذر حفظ اللائحة');
  await expect(page.getByLabel('اسم اللائحة',{exact:true})).toHaveValue('لائحة الشؤون الأكاديمية');
  await page.unroute('**/api/admin/regulations');
  errors.length=0;
  page.on('request', r => { if(r.url().endsWith('/api/admin/regulations') && r.postDataJSON()?.params?.p_action==='create') secondKey=r.postDataJSON().params.p_client_request_id; });
  await page.getByRole('button',{name:'حفظ اللائحة',exact:true}).click();
  await expect(page.getByText('تم حفظ اللائحة.',{exact:true})).toBeVisible();
  if(firstKey!==secondKey) throw Error('Save retry changed idempotency key');
  await page.getByRole('button',{name:'إضافة بند',exact:true}).click();
  await page.getByLabel('عنوان البند',{exact:true}).fill('المادة الأولى: قبول الطلاب');
  const legalText='تنظم هذه المادة إجراءات قبول الطلاب وفق المعايير المعتمدة، مع حفظ حقوق الطالب وتوثيق القرارات.\n\n'+'يراعى تطبيق التعليمات المعتمدة وإتاحة المعلومات بصورة واضحة لجميع الجهات المختصة. '.repeat(8);
  await page.getByLabel('النص النظامي',{exact:true}).fill(legalText);
  await page.getByRole('button',{name:'حفظ البند',exact:true}).click();
  await expect(page.getByText('تم حفظ البند.',{exact:true})).toBeVisible();
  const policyId=new URL(page.url()).pathname.split('/').at(-1);
  await page.reload({waitUntil:'domcontentloaded',timeout:90000});
  await expect(page.locator('article').getByRole('heading',{name:'المادة الأولى: قبول الطلاب',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'تعديل البند',exact:true}).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByLabel('النص النظامي',{exact:true}).fill(legalText+'\nنص تمت مراجعته.');
  await page.getByText('تنظيم النص وبيانات المصدر · اختياري',{exact:true}).click();
  await page.getByLabel('موضع النص في المصدر',{exact:true}).fill('المادة الأولى');
  await page.getByLabel('صفحة البداية',{exact:true}).fill('3');
  await page.getByLabel('صفحة النهاية',{exact:true}).fill('4');
  await page.getByRole('button',{name:'حفظ البند',exact:true}).click();
  await expect(page.locator('article')).toContainText('نص تمت مراجعته.');
  await page.getByRole('button',{name:'إضافة بند',exact:true}).click();
  await page.getByRole('button',{name:'بند',exact:true}).click();
  await page.getByLabel('عنوان البند',{exact:true}).fill('بند مؤقت للحذف');
  await page.getByLabel('النص النظامي',{exact:true}).fill('نص بند تجريبي');
  await page.getByRole('button',{name:'حفظ البند',exact:true}).click();
  await expect(page.locator('article')).toContainText('بند مؤقت للحذف');
  await page.getByLabel('المزيد من إجراءات البند').click();
  await page.getByRole('button',{name:'حذف البند',exact:true}).click();
  await page.getByRole('button',{name:'تأكيد حذف البند',exact:true}).click();
  await expect(page.getByText('تم حذف البند من المسودة.',{exact:true})).toBeVisible();
  await page.reload({waitUntil:'domcontentloaded',timeout:90000});
  await expect(page.locator('article')).toContainText('نص تمت مراجعته.');
  await expect(page.getByText('بند مؤقت للحذف',{exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'إضافة بند',exact:true}).click();
  await page.getByLabel('عنوان البند',{exact:true}).fill('بند آخر يبقى مسودة');
  await page.getByLabel('النص النظامي',{exact:true}).fill('لا يجب نشر هذا النص عند تنشيط البند الأول.');
  await page.getByRole('button',{name:'حفظ البند',exact:true}).click();
  await page.getByRole('navigation',{name:'فهرس المحتوى'}).getByRole('button',{name:'المادة الأولى: قبول الطلاب'}).click();
  await expect(page.getByRole('button',{name:'تعديل البند',exact:true})).toBeEnabled();
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:'/tmp/qarar-regulation-library-authoring-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await page.locator('article').scrollIntoViewIfNeeded();
  await page.screenshot({path:'/tmp/qarar-regulation-library-reader-mobile.png',fullPage:false});
  await page.getByRole('button',{name:'تعديل البند',exact:true}).click();
  if(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth)) throw Error('Mobile library overflows');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.screenshot({path:'/tmp/qarar-regulation-library-authoring-mobile.png',fullPage:false});
  await page.getByRole('button',{name:'إلغاء',exact:true}).click();
  await expect(page.getByRole('button',{name:'إرسال للمراجعة',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'تنشيط النص',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'تنشيط البند',exact:true}).click();
  await page.getByRole('dialog').getByRole('button',{name:'تأكيد التنشيط',exact:true}).click();
  await expect(page.locator('article').getByText('نشط',{exact:true})).toBeVisible();
  const single=await api('/rest/v1/rpc/admin_get_regulation_library_v2',{p_policy_id:policyId},verified.access_token,{'Content-Profile':'api_v2'});
  if(single.policy.versions.find(v=>v.legal_status==='effective')?.items.length!==1 || single.policy.versions.find(v=>v.id===single.working_version_id)?.items.length!==2) throw Error('Selected-item activation published another draft');
  await page.getByRole('button',{name:'تعطيل البند',exact:true}).click();
  await page.getByRole('dialog').getByRole('button',{name:'تأكيد التعطيل',exact:true}).click();
  await expect(page.locator('article').getByText('معطل',{exact:true})).toBeVisible();
  await page.reload({waitUntil:'domcontentloaded',timeout:90000});
  await expect(page.locator('article').getByText('معطل',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'تنشيط البند',exact:true}).click();
  await page.getByRole('dialog').getByRole('button',{name:'تأكيد التنشيط',exact:true}).click();
  await expect(page.locator('article').getByText('نشط',{exact:true})).toBeVisible();
  // One actor owns the entire journey; no second account is created.
  await expect(page.getByRole('button',{name:'تعديل البند',exact:true})).toBeEnabled();
  await expect(page.getByText('مسودة تعديل',{exact:true})).toBeVisible();
  await expect(page.locator('article')).toContainText('نص تمت مراجعته.');
  await page.reload({waitUntil:'domcontentloaded',timeout:90000});
  await expect(page.locator('article').getByText('نشط',{exact:true})).toBeVisible();
  await expect(page.getByText('مسودة تعديل',{exact:true})).toBeVisible();
  const evidence=await api('/rest/v1/rpc/admin_get_regulation_library_v2',{p_policy_id:policyId},verified.access_token,{'Content-Profile':'api_v2'});
  if(evidence.policy.versions.length!==4 || evidence.policy.versions[0].items.length!==1) throw Error('Draft inheritance or idempotent reopening failed');
  await page.getByText('المزيد',{exact:true}).click();
  await page.getByRole('button',{name:'أرشفة اللائحة',exact:true}).click();
  await page.getByRole('button',{name:'تأكيد الأرشفة',exact:true}).click();
  await expect(page.getByRole('button',{name:'بدء تعديل',exact:true})).toBeDisabled();
  await page.getByText('المزيد',{exact:true}).click();
  await page.getByRole('button',{name:'إعادة التفعيل',exact:true}).click();
  await page.getByRole('dialog').getByRole('button',{name:'إعادة التفعيل',exact:true}).click();
  await expect(page.getByRole('button',{name:'إضافة بند',exact:true})).toBeEnabled();
  console.log('PASS single-account publication, disable/reactivate and authoring. Checking concurrent commands.');
  const snapshot=await api('/rest/v1/rpc/admin_get_regulation_library_v2',{p_policy_id:policyId},verified.access_token,{'Content-Profile':'api_v2'});
  const command={p_policy_id:policyId,p_action:'save_identity',p_payload:{name_ar:'لائحة الشؤون الأكاديمية',description:null},p_expected_revision:snapshot.revision,p_client_request_id:crypto.randomUUID()};
  const replay=await Promise.all([api('/rest/v1/rpc/admin_save_regulation_library_v2',command,verified.access_token,{'Content-Profile':'api_v2'}),api('/rest/v1/rpc/admin_save_regulation_library_v2',command,verified.access_token,{'Content-Profile':'api_v2'})]);
  if(replay.filter(result=>result.idempotent_replay).length!==1) throw Error('Concurrent identical command was not idempotent');
  const revision=replay[0].revision;
  const competing=await Promise.allSettled(['عنوان التعديل الأول','عنوان التعديل الثاني'].map(name=>api('/rest/v1/rpc/admin_save_regulation_library_v2',{...command,p_payload:{name_ar:name,description:null},p_expected_revision:revision,p_client_request_id:crypto.randomUUID()},verified.access_token,{'Content-Profile':'api_v2'})));
  if(competing.filter(result=>result.status==='fulfilled').length!==1 || !competing.some(result=>result.status==='rejected' && result.reason.message.includes('LIBRARY_CONFLICT'))) throw Error('Concurrent edits did not protect against a lost update');
  if(errors.length) throw Error(errors.join('\n'));
  console.log('PASS UI create, safe retry, add/edit/source/delete/reload, mobile dialog, selected-item publication with another draft preserved, disable/reactivate, archive/restore; no second account required.');
} catch(error) {
  console.error('Browser journey failed:', error.message);
  if(diagnosticPage) {
    await diagnosticPage.screenshot({path:'/tmp/qarar-regulation-library-failure.png',fullPage:true}).catch(()=>{});
    console.error((await diagnosticPage.locator('body').innerText()).slice(-5500));
  }
  throw error;
} finally {
  if (browser) await browser.close();
  for (const identityId of [userId].filter(Boolean)) {
    // Keep isolated evidence and audit records, but disable the throwaway identity.
    const response = await fetch(base + '/auth/v1/admin/users/' + identityId, {
      method: 'PUT', headers: { apikey: env.ANON_KEY, Authorization: `Bearer ${env.SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ban_duration: '87600h' }), signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) {
      // The disposable UUID was created by this run. Keep cleanup scoped even
      // if the development auth gateway is temporarily unavailable.
      if(!/^[0-9a-f-]{36}$/.test(identityId)) throw Error('Invalid fixture identity');
      execFileSync('docker',['exec',db,'psql','-X','-v','ON_ERROR_STOP=1','-U','supabase_admin','-d','postgres','-c',
        `update auth.users set banned_until=now()+interval '10 years' where id='${identityId}' and email in ('${email}','library-review-${suffix}@example.test');`],{stdio:'pipe'});
    }
    console.log('Isolated test identity disabled.');
  }
}


