// DEV only, new isolated organizations and identities; never changes real councils.
import fs from "node:fs";
import crypto from "node:crypto";
import {execFileSync} from "node:child_process";
import {createRequire} from "node:module";
const require=createRequire(new URL("../apps/dashboard/package.json",import.meta.url));
const {chromium,expect}=require("@playwright/test");
const env=Object.fromEntries(fs.readFileSync(new URL("../supabase/docker/.env.remote-dev",import.meta.url),"utf8").split(/\r?\n/).filter(l=>/^[A-Z_]+=/.test(l)).map(l=>{const at=l.indexOf("=");return[l.slice(0,at),l.slice(at+1).replace(/^"|"$/g,"")];}));
const gateway="http://127.0.0.1:55421",domain="https://devqarar.prideidea.com";
const sql=body=>execFileSync("docker",["exec","-i","qarar-dev-supabase-db","psql","-X","-U","supabase_admin","-d","postgres","-At","-v","ON_ERROR_STOP=1"],{input:body,encoding:"utf8",maxBuffer:4*1024*1024}).trim();
const suffix=crypto.randomUUID(),identities=[],ids=new Map(),contexts=[],pages=new Map();
let browser,stage="fixture";
const id=tail=>ids.get("89000000-0000-0000-0000-"+tail.padStart(12,"0"));
async function auth(path,body,token=env.SERVICE_ROLE_KEY,method="POST"){
 const response=await fetch(gateway+path,{method,headers:{apikey:env.ANON_KEY,Authorization:"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify(body),signal:AbortSignal.timeout(60000)});
 if(!response.ok)throw Error("Test identity request failed: "+response.status);
 return response.json();
}
function totp(secret){
 let bits="";for(const c of secret.toUpperCase().replace(/=+$/,""))bits+="ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".indexOf(c).toString(2).padStart(5,"0");
 const bytes=[];for(let i=0;i+8<=bits.length;i+=8)bytes.push(parseInt(bits.slice(i,i+8),2));
 const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));
 const digest=crypto.createHmac("sha1",Buffer.from(bytes)).update(counter).digest();
 return String((digest.readUInt32BE(digest[19]&15)&0x7fffffff)%1000000).padStart(6,"0");
}
async function rpc(page,contract,params,allowed=true){
 const response=await page.request.post(domain+"/api/admin/meetings",{headers:{Origin:domain},data:{contract,params}});
 if(allowed&&response.status()!==200)throw Error("Meeting HTTP check failed: "+contract+" ("+response.status()+")");
 if(!allowed){if(response.status()===200)throw Error("Denied action accepted: "+contract);return null;}
 return (await response.json()).data;
}
try{
 let fixture=fs.readFileSync(new URL("../supabase/tests/concurrency/decision_minutes_lock_setup.sql",import.meta.url),"utf8");
 fixture=fixture.slice(0,fixture.indexOf("select api_v1.complete_meeting_session"))+"\nreset role;\n";
 for(const original of new Set(fixture.match(/89000000-0000-0000-0000-[0-9]{12}/g)))ids.set(original,crypto.randomUUID());
 for(const [index,label] of ["chair","rapporteur","member","foreign","sysadmin","secretary"].entries()){
  const password=crypto.randomBytes(24).toString("hex")+"!Aa1",email=`live-${label}-${suffix}@example.test`;
  const identity=await auth("/auth/v1/admin/users",{email,password,email_confirm:true});
  identities.push({id:identity.id,email,password,label});
  ids.set("89000000-0000-0000-0000-"+String(11+index).padStart(12,"0"),identity.id);
  fixture=fixture.replaceAll(label+"@s89.test",email);
 }
 fixture=fixture.replace(/insert into auth\.users\(id,email\) values[\s\S]*?;/,"");
 for(const [original,replacement] of ids)fixture=fixture.replaceAll(original,replacement);
 fixture=fixture.replaceAll("s89-prod","live-prod-"+suffix).replaceAll("s89-foreign","live-foreign-"+suffix);
 fixture=fixture.replaceAll("Decision Meeting","اجتماع اختبار الدمج").replaceAll("Decision Topic","موضوع اختبار الدمج");
 sql(fixture);
 // Give the fixture member only the existing read contracts needed by the room.
 sql(`insert into qarar_iam.role_permissions(organization_id,role_id,permission_id)
 select '${id("1")}',r.id,p.id from qarar_iam.roles r join qarar_iam.permissions p on p.organization_id=r.organization_id
 where r.organization_id='${id("1")}' and r.code in ('council_chair','council_rapporteur','s89_member') and p.code in ('meetings.read','topics.read')
 on conflict(organization_id,role_id,permission_id) do nothing;`);
 browser=await chromium.launch({headless:true,args:["--disable-dev-shm-usage"]});
 for(const actor of identities.slice(0,3)){
  stage=actor.label+" login";
  let session=await auth("/auth/v1/token?grant_type=password",{email:actor.email,password:actor.password},env.ANON_KEY);
  const factor=await auth("/auth/v1/factors",{factor_type:"totp",friendly_name:"Live integration test"},session.access_token);
  const challenge=await auth(`/auth/v1/factors/${factor.id}/challenge`,{},session.access_token);
  session=await auth(`/auth/v1/factors/${factor.id}/verify`,{challenge_id:challenge.id,code:totp(factor.totp.secret)},session.access_token);
  const context=await browser.newContext({viewport:{width:1440,height:1000}});contexts.push(context);
  await context.addCookies([{name:"qarar_access_token",value:session.access_token,url:domain,httpOnly:true},{name:"qarar_refresh_token",value:session.refresh_token,url:domain,httpOnly:true}]);
  const page=await context.newPage(),errors=[];page.on("pageerror",e=>errors.push(e.message));
  pages.set(actor.label,page);
  stage=actor.label+" room";
  await page.goto(domain+`/admin/meetings/${id("81")}/live`,{waitUntil:"domcontentloaded",timeout:90000});
  await expect(page.getByRole("button",{name:"جدول الأعمال والتصويت",exact:true})).toBeVisible({timeout:60000});
  await page.getByRole("button",{name:"جدول الأعمال والتصويت",exact:true}).click();
  const decisions=await rpc(page,"list_meeting_decisions",{p_meeting_id:id("81")});
  if(decisions.length!==1||decisions[0].can_edit_text!==(actor.label!=="member"))throw Error("Contextual decision capability mismatch");
  if(actor.label==="member"){
   await expect(page.getByRole("button",{name:"تعديل القرار",exact:true})).toHaveCount(0);
   await rpc(page,"update_meeting_decision_text",{p_decision_id:decisions[0].id,p_decision_text:"تعديل غير مسموح من العضو",p_expected_updated_at:decisions[0].updated_at},false);
  }else{
   stage=actor.label+" edit";
   await page.getByRole("button",{name:"تعديل القرار",exact:true}).first().click();
   const dialog=page.getByRole("dialog"),text="اعتماد الموضوع بعد مراجعة النص بواسطة "+actor.label;
   await dialog.getByRole("textbox",{name:/نص القرار/}).fill(text);
   await dialog.getByRole("button",{name:"حفظ التعديل",exact:true}).click();
   await expect(dialog).toHaveCount(0,{timeout:60000});
   const saved=await rpc(page,"list_meeting_decisions",{p_meeting_id:id("81")});
   if(saved[0].decision_text!==text)throw Error("Saved decision text mismatch");
  }
  for(const width of [1440,390]){
   await page.setViewportSize({width,height:width===390?844:1000});
   for(const dark of [false,true]){
    if(dark)await page.getByRole("button",{name:"الوضع الليلي",exact:true}).click();
    if(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth))throw Error("Room overflow at "+width);
    await page.screenshot({path:`/tmp/qarar-live-${actor.label}-${width}-${dark?"dark":"light"}.png`,fullPage:true});
    if(dark)await page.getByRole("button",{name:"الوضع الفاتح",exact:true}).click();
   }
  }
  if(errors.length)throw Error("Room client error");
 }
 stage="minutes HTTP journey";
 const chair=pages.get("chair"),rapporteur=pages.get("rapporteur"),member=pages.get("member"),meetingParams={p_meeting_id:id("81")};
 let detail=await rpc(chair,"get_meeting_detail",meetingParams);
 await rpc(chair,"complete_meeting_session",{...meetingParams,p_expected_updated_at:detail.updated_at});
 let draft=await rpc(chair,"generate_meeting_minutes_draft",meetingParams);
 await rpc(chair,"submit_meeting_minutes",{...meetingParams,p_content_final:draft.content_draft,p_expected_updated_at:draft.updated_at});
 let minutes=await rpc(member,"get_meeting_minutes",meetingParams);
 const approval=minutes.approvals.find(a=>a.user_id===identities[2].id);
 if(!approval)throw Error("Member approval not available");
 await rpc(member,"respond_meeting_minutes_approval",{p_approval_id:approval.id,p_decision:"return",p_notes:"يرجى تعديل صياغة القرار قبل اعتماد المحضر",p_expected_updated_at:approval.updated_at});
 detail=await rpc(chair,"get_meeting_detail",meetingParams);
 if(detail.status!=="waiting_for_minutes")throw Error("Returned meeting did not reopen minutes preparation");
 const current=(await rpc(rapporteur,"list_meeting_decisions",meetingParams))[0];
 if(!current.can_edit_text)throw Error("Returned minutes did not reopen decision editing");
 await rpc(rapporteur,"update_meeting_decision_text",{p_decision_id:current.id,p_decision_text:"اعتماد الموضوع بالصياغة النهائية بعد إعادة المحضر",p_expected_updated_at:current.updated_at});
 minutes=await rpc(chair,"get_meeting_minutes",meetingParams);
 await rpc(chair,"submit_meeting_minutes",{...meetingParams,p_content_final:draft.content_draft,p_expected_updated_at:minutes.updated_at},false);
 draft=await rpc(chair,"generate_meeting_minutes_draft",meetingParams);
 await rpc(chair,"submit_meeting_minutes",{...meetingParams,p_content_final:draft.content_draft,p_expected_updated_at:draft.updated_at});
 for(const actor of identities.slice(0,3)){
  const page=pages.get(actor.label),state=await rpc(page,"get_meeting_minutes",meetingParams),own=state.approvals.find(a=>a.user_id===actor.id);
  if(!own)throw Error("Resubmitted approval not available");
  await rpc(page,"respond_meeting_minutes_approval",{p_approval_id:own.id,p_decision:"approve",p_notes:null,p_expected_updated_at:own.updated_at});
 }
 detail=await rpc(chair,"get_meeting_detail",meetingParams);
 if(detail.status!=="closed")throw Error("Full approval did not close the meeting");
 console.log(JSON.stringify({passed:true,roles:["chair","rapporteur","member"],decision_ui_save:true,member_denied_in_http:true,minutes_return_regenerate_approve:true,stale_minutes_denied_in_http:true,viewports:[1440,390],themes:["light","dark"]}));
}catch(error){console.error(stage+": "+(error instanceof Error?error.message.split("Call log:")[0]:"Live room test failed"));process.exitCode=1;}
finally{
 await browser?.close();
 for(const actor of identities){try{await auth("/auth/v1/admin/users/"+actor.id,{ban_duration:"876000h"},env.SERVICE_ROLE_KEY,"PUT");}catch{console.error("Test identity cleanup needs retry");process.exitCode=1;}}
}
