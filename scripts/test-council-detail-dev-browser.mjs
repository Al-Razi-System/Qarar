// DEV-only isolated fixture; never changes existing councils or memberships.
import fs from "node:fs";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
const require=createRequire(new URL("../apps/dashboard/package.json",import.meta.url));
const {chromium,expect}=require("@playwright/test");
const env=Object.fromEntries(fs.readFileSync(new URL("../supabase/docker/.env.remote-dev",import.meta.url),"utf8").split(/\r?\n/).filter(l=>/^[A-Z_]+=/.test(l)).map(l=>{const i=l.indexOf("=");return [l.slice(0,i),l.slice(i+1).replace(/^"|"$/g,"")];}));
const base="http://127.0.0.1:55421",domain="https://devqarar.prideidea.com";
const org=crypto.randomUUID(),council=crypto.randomUUID(),type=crypto.randomUUID(),meetingType=crypto.randomUUID(),suffix=Date.now();
const verifyEditing=process.env.VERIFY_COUNCIL_EDIT==="true";
let actor,browser,activePage,stage="setup";
const sql=body=>execFileSync("docker",["exec","qarar-dev-supabase-db","psql","-X","-U","supabase_admin","-d","postgres","-At","-v","ON_ERROR_STOP=1","-c",body],{encoding:"utf8"}).trim();
async function api(path,body,token=env.SERVICE_ROLE_KEY,extra={}) {
 const response=await fetch(base+path,{method:"POST",headers:{apikey:env.ANON_KEY,Authorization:"Bearer "+token,"Content-Type":"application/json",...extra},body:JSON.stringify(body),signal:AbortSignal.timeout(60000)});
 if(!response.ok)throw Error(`Fixture request failed (${response.status})`);
 return response.json();
}
function totp(secret) {
 let bits="";for(const char of secret.toUpperCase().replace(/=+$/,""))bits+="ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".indexOf(char).toString(2).padStart(5,"0");
 const bytes=[];for(let i=0;i+8<=bits.length;i+=8)bytes.push(parseInt(bits.slice(i,i+8),2));
 const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));
 const digest=crypto.createHmac("sha1",Buffer.from(bytes)).update(counter).digest();
 return String((digest.readUInt32BE(digest[19]&15)&0x7fffffff)%1000000).padStart(6,"0");
}
try {
 sql(`insert into qarar_core.organizations(id,code,name_ar) values('${org}','council-read-${suffix}','اختبار قراءة المجلس المعزول');`);
 const email=`council-read-${suffix}@example.test`,password=crypto.randomBytes(24).toString("hex")+"!Aa";
 actor=(await api("/auth/v1/admin/users",{email,password,email_confirm:true})).id;
 await api("/rest/v1/rpc/service_bootstrap_organization_admin",{p_auth_user_id:actor,p_organization_code:`council-read-${suffix}`,p_email:email,p_full_name_ar:"مسؤول اختبار قراءة المجلس",p_full_name_en:null,p_employee_no:null,p_mobile:null,p_job_title:null,p_approval_reference:`DEV-COUNCIL-READ-${suffix}`},env.SERVICE_ROLE_KEY,{"Content-Profile":"api_v1"});
 sql(`insert into qarar_core.governance_unit_types(id,organization_id,code,name_ar,is_council_type) values('${type}','${org}','fixture','مجلس',true);
 insert into qarar_core.governance_units(id,organization_id,unit_type_id,code,name_ar,status) values('${council}','${org}','${type}','fixture','مجلس اختبار القراءة','inactive');
 insert into qarar_iam.roles(organization_id,code,name_ar,role_scope) values('${org}','council_member','عضو','governance_unit') on conflict(organization_id,code) do nothing;
 insert into qarar_iam.memberships(organization_id,user_id,role_id,governance_unit_id,membership_status,start_date)
 select '${org}','${actor}',id,'${council}','active',current_date from qarar_iam.roles where organization_id='${org}' and code='council_member';`);
 if(sql(`select count(*) from qarar_iam.memberships where governance_unit_id='${council}'`)!=="1")throw Error("Fixture membership not created");
 let session=await api("/auth/v1/token?grant_type=password",{email,password},env.ANON_KEY);
 const factor=await api("/auth/v1/factors",{factor_type:"totp",friendly_name:"Council read verification"},session.access_token);
 const challenge=await api(`/auth/v1/factors/${factor.id}/challenge`,{},session.access_token);
 session=await api(`/auth/v1/factors/${factor.id}/verify`,{challenge_id:challenge.id,code:totp(factor.totp.secret)},session.access_token);
 browser=await chromium.launch({headless:true,args:["--disable-dev-shm-usage"]});
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 await context.addCookies([{name:"qarar_access_token",value:session.access_token,url:domain,httpOnly:true},{name:"qarar_refresh_token",value:session.refresh_token,url:domain,httpOnly:true}]);
 const page=await context.newPage(),errors=[];page.on("pageerror",e=>errors.push(e.message));
 activePage=page;
 const response=await page.request.post(domain+"/api/admin/councils",{headers:{Origin:domain},data:{contract:"admin_get_council_detail_v2",params:{p_council_id:council}}});
 if(response.status()!==200)throw Error(`Real detail API failed (${response.status()})`);
 const payload=await response.json();if(payload.data.id!==council)throw Error("Detail returned another council");
 if(verifyEditing && payload.data.meeting_plan_unavailable)throw Error("Council editing contracts are still unavailable");
 await page.goto(domain+"/admin/councils",{waitUntil:"domcontentloaded",timeout:90000});
 await expect(page.getByRole("button",{name:"الأعضاء (1)",exact:true})).toBeVisible({timeout:60000});
 if(verifyEditing) {
  sql(`insert into qarar_meetings.meeting_types(id,organization_id,code,name_ar) values('${meetingType}','${org}','fixture','اجتماع حوكمي للاختبار');`);
  await page.reload({waitUntil:"domcontentloaded"});
  await page.getByRole("button",{name:"تعديل",exact:true}).click();
  const dialog=page.getByRole("dialog",{name:"تعديل بيانات المجلس"});
  await dialog.getByLabel("اسم المجلس",{exact:true}).fill("مجلس اختبار الحفظ الفعلي");
  await dialog.getByLabel("إنشاء خطة اجتماعات لهذا المجلس",{exact:false}).check();
  stage="recurrence";
  await dialog.getByRole("combobox",{name:/^الدورية/}).selectOption("monthly");
  stage="monthly-week";
  await dialog.getByLabel("موعد الاجتماع الشهري",{exact:false}).selectOption("3");
  await dialog.getByLabel("شهر البداية",{exact:true}).fill("2026-11");
  stage="save";
  await dialog.getByRole("button",{name:"حفظ التعديلات",exact:true}).click();
  await expect(dialog).toHaveCount(0,{timeout:60000});
  await expect(page.getByRole("heading",{name:"مجلس اختبار الحفظ الفعلي",exact:true})).toBeVisible();
  const saved=await page.request.post(domain+"/api/admin/councils",{headers:{Origin:domain},data:{contract:"admin_get_council_detail_v2",params:{p_council_id:council}}});
  const savedData=(await saved.json()).data;
  if(saved.status()!==200 || savedData.meeting_plan?.monthly_week!==3)throw Error("Saved plan did not read back");
  if(sql(`select count(*) from qarar_meetings.meetings where governance_unit_id='${council}' and status='draft' and schedule_date_confirmed=false`)!=="1")throw Error("Expected one unconfirmed governed draft");
  await page.getByRole("button",{name:"تعديل",exact:true}).click();
  await expect(dialog.getByRole("heading",{name:"خطة اجتماعات المجلس",exact:true})).toBeVisible();
  await dialog.getByRole("button",{name:"إلغاء",exact:true}).click();
 }
 await page.getByRole("button",{name:"الأعضاء (1)",exact:true}).click();
 await expect(page.getByText("مسؤول اختبار قراءة المجلس",{exact:true}).last()).toBeVisible();
 await page.screenshot({path:"/tmp/qarar-council-members-desktop.png",fullPage:true});
 await page.setViewportSize({width:390,height:844});
 await expect(page.getByRole("button",{name:"الأعضاء (1)",exact:true})).toBeVisible();
 if(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth))throw Error("Horizontal overflow at 390px");
 await page.screenshot({path:"/tmp/qarar-council-members-mobile.png",fullPage:true});
 await page.route("**/api/admin/councils",async route=>{
  if(route.request().postDataJSON()?.contract==="admin_get_council_detail_v2")await route.fulfill({status:503,contentType:"application/json",body:JSON.stringify({error:{message:"تعذر تحميل بيانات المجلس أثناء اختبار الانقطاع"}})});
  else await route.continue();
 });
 await page.reload({waitUntil:"domcontentloaded"});
 await expect(page.getByRole("button",{name:"إعادة تحميل بيانات المجلس",exact:true})).toBeVisible({timeout:60000});
 await expect(page.getByText("الأعضاء (0)",{exact:true})).toHaveCount(0);
 await page.unroute("**/api/admin/councils");
 await page.getByRole("button",{name:"إعادة تحميل بيانات المجلس",exact:true}).click();
 await expect(page.getByRole("button",{name:"الأعضاء (1)",exact:true})).toBeVisible({timeout:60000});
 if(errors.length)throw Error("Browser raised a client error");
 console.log(JSON.stringify({passed:true,actual_detail_api:true,viewport:[1440,390],member_count:1,failure_retry:true,compatibility_read:payload.data.meeting_plan_unavailable===true,editing_verified:verifyEditing}));
} catch(error) {
 await activePage?.screenshot({path:"/tmp/qarar-council-edit-failure.png",fullPage:true}).catch(()=>console.error("Debug screenshot unavailable"));
 console.error(stage+": "+(error instanceof Error?error.message.split("Call log:")[0]:"Council browser test failed"));process.exitCode=1;
} finally {
 await browser?.close();
 if(actor) {
  await fetch(base+"/auth/v1/admin/users/"+actor,{method:"PUT",headers:{apikey:env.ANON_KEY,Authorization:"Bearer "+env.SERVICE_ROLE_KEY,"Content-Type":"application/json"},body:JSON.stringify({ban_duration:"876000h"}),signal:AbortSignal.timeout(60000)});
 }
}
