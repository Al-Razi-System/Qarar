// Visual integration smoke on DEV only; fixture administrator in an isolated tenant.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../apps/dashboard/package.json',import.meta.url));
const {chromium,expect:baseExpect}=require('@playwright/test');
const expect=baseExpect.configure({timeout:60000});
const env=Object.fromEntries(fs.readFileSync(new URL('../supabase/docker/.env.remote-dev',import.meta.url),'utf8').split(/\r?\n/).filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i),l.slice(i+1).replace(/^"|"$/g,'')]}));
const base='http://127.0.0.1:55421',domain='https://devqarar.prideidea.com';
const suffix=Date.now(),org=crypto.randomUUID(),email=`design-${suffix}@example.test`,password=crypto.randomBytes(24).toString('hex')+'!Aa';
let browser,userId;
async function api(path,body,key=env.SERVICE_ROLE_KEY,extra={}){
 const res=await fetch(base+path,{method:'POST',headers:{apikey:env.ANON_KEY,Authorization:`Bearer ${key}`,'Content-Type':'application/json',...extra},body:JSON.stringify(body),signal:AbortSignal.timeout(60000)});
 const data=await res.json();if(!res.ok)throw Error('Fixture request failed: '+res.status);return data;
}
function totp(secret){let bits='';for(const c of secret.toUpperCase().replace(/=+$/,''))bits+='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(c).toString(2).padStart(5,'0');const bytes=[];for(let i=0;i+8<=bits.length;i+=8)bytes.push(parseInt(bits.slice(i,i+8),2));const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));const digest=crypto.createHmac('sha1',Buffer.from(bytes)).update(counter).digest();return String((digest.readUInt32BE(digest[19]&15)&0x7fffffff)%1000000).padStart(6,'0');}
try{
 browser=await chromium.launch({headless:true});
 const context=await browser.newContext();const page=await context.newPage();
 const errors=[],failedFonts=[],checks=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('response',r=>{if(/\.(woff2?|ttf)(\?|$)/.test(r.url())&&!r.ok())failedFonts.push(r.status());});
 async function inspect(name,route,heading){
  for(const width of [1440,390]){
   await page.setViewportSize({width,height:width===390?844:1000});
   await page.goto(domain+route,{waitUntil:'domcontentloaded',timeout:90000});
   await expect(page.getByRole('heading',{name:heading,exact:true}).first()).toBeVisible();
   if(name==='login')await expect(page.getByRole('button',{name:'تسجيل الدخول',exact:true})).toBeEnabled();
   if(name==='users')await expect(page.getByRole('button',{name:'إنشاء حساب جديد',exact:true})).toBeEnabled();
   if(name==='meetings')await expect(page.getByRole('heading',{name:'لا توجد اجتماعات',exact:true})).toBeVisible();
   await page.evaluate(()=>document.fonts.ready);
   const font=await page.evaluate(()=>({family:getComputedStyle(document.body).fontFamily,loaded:[...document.fonts].some(f=>f.status==='loaded'&&f.family.includes('qararSans'))}));
   if(!font.loaded||!font.family.startsWith('qararSans'))throw Error(name+': IBM Plex local face is not actually loaded '+JSON.stringify(font));
   await page.screenshot({path:`/tmp/qarar-foundation-${name}-${width}.png`,fullPage:true});
   if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)){
    const overflow=await page.evaluate(()=>[...document.querySelectorAll('body *')].filter(el=>el.getBoundingClientRect().width>innerWidth).slice(0,8).map(el=>({tag:el.tagName,cls:el.className,width:el.getBoundingClientRect().width})));
    throw Error(name+': overflow at '+width+' '+JSON.stringify(overflow));
   }
   checks.push({screen:name,width,fontLoaded:true});
  }
 }
 await inspect('login','/login','تسجيل الدخول إلى قرار');
 userId=(await api('/auth/v1/admin/users',{email,password,email_confirm:true})).id;
 execFileSync('docker',['exec','qarar-dev-supabase-db','psql','-X','-v','ON_ERROR_STOP=1','-U','supabase_admin','-d','postgres','-c',`insert into qarar_core.organizations(id,code,name_ar) values('${org}','design-${suffix}','فحص دمج التصميم المعزول');`]);
 await api('/rest/v1/rpc/service_bootstrap_organization_admin',{p_auth_user_id:userId,p_organization_code:'design-'+suffix,p_email:email,p_full_name_ar:'مدير فحص التصميم',p_full_name_en:null,p_employee_no:null,p_mobile:null,p_job_title:null,p_approval_reference:'DEV-DESIGN-'+suffix},env.SERVICE_ROLE_KEY,{'Content-Profile':'api_v1'});
 const session=await api('/auth/v1/token?grant_type=password',{email,password},env.ANON_KEY);
 const factor=await api('/auth/v1/factors',{factor_type:'totp',friendly_name:'Design smoke'},session.access_token);
 const challenge=await api('/auth/v1/factors/'+factor.id+'/challenge',{},session.access_token);
 const verified=await api('/auth/v1/factors/'+factor.id+'/verify',{challenge_id:challenge.id,code:totp(factor.totp.secret)},session.access_token);
 await context.addCookies([{name:'qarar_access_token',value:verified.access_token,url:domain,httpOnly:true,sameSite:'Lax'},{name:'qarar_refresh_token',value:verified.refresh_token,url:domain,httpOnly:true,sameSite:'Lax'}]);
 await inspect('users','/admin/users','المستخدمون');
 await inspect('councils','/admin/councils','المجالس والوحدات الحوكمية');
 await inspect('meetings','/admin/meetings','الاجتماعات والقرارات');
 if(errors.length||failedFonts.length)throw Error(JSON.stringify({errors,failedFonts}));
 console.log(JSON.stringify({ok:true,checks}));
}finally{
 await browser?.close();
 if(userId)await fetch(base+'/auth/v1/admin/users/'+userId,{method:'PUT',headers:{apikey:env.ANON_KEY,Authorization:'Bearer '+env.SERVICE_ROLE_KEY,'Content-Type':'application/json'},body:JSON.stringify({ban_duration:'876000h'})});
}
