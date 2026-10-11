// Explicit one-way, DEV-only import. Production queries are SELECT-only.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {planMemberships} from './dev-user-import-plan.mjs';
const apply=process.argv.includes('--apply');
if(process.argv.slice(2).some(x=>x!=='--apply'))throw Error('Only --apply accepted');
const sourceContainer='qarar-supabase-db',targetContainer='qarar-dev-supabase-db';
const base='http://127.0.0.1:55421',organizationCode='qarar-demo';
const privateDir='/home/partner/.codex/private/qarar-dev-user-import';
const statePath=privateDir+'/accounts.json',csvPath=privateDir+'/temporary-passwords.csv';
const q=v=>v==null?'null':"'"+String(v).replaceAll("'","''")+"'";
function sql(container,statement) {
 if(container===sourceContainer && !statement.trimStart().toLowerCase().startsWith('select '))throw Error('Production is read-only');
 try {
  return execFileSync('docker',['exec','-i',container,'psql','-X','-U','supabase_admin','-d','postgres','-At','-v','ON_ERROR_STOP=1'],{input:statement,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
 } catch(error) {
  throw Error('Database operation rolled back: '+String(error.stderr??'').split('\n')[0]);
 }
}
function snapshot(container,source=false) {
 return JSON.parse(sql(container,`select jsonb_build_object(
 'org',o.id,
 'users',coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'email',u.email,'full_name_ar',u.full_name_ar,'employee_no',u.employee_no,'mobile',u.mobile,'job_title',u.job_title,'status',u.status,'admin',u.is_system_admin)) from qarar_iam.users u where u.organization_id=o.id),'[]'::jsonb),
 'councils',coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'name_ar',g.name_ar,'status',g.status)) from qarar_core.governance_units g join qarar_core.governance_unit_types t on t.id=g.unit_type_id and t.organization_id=g.organization_id where g.organization_id=o.id and t.is_council_type and t.is_active),'[]'::jsonb),
 'roles',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'code',r.code)) from qarar_iam.roles r where r.organization_id=o.id and r.is_active),'[]'::jsonb),
 'memberships',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'user_id',m.user_id,'role_code',r.code,'unit_name',g.name_ar,'membership_status',m.membership_status,'title',m.membership_title,'start_date',m.start_date,'end_date',m.end_date,'unit_id',m.governance_unit_id))
 from qarar_iam.memberships m join qarar_iam.roles r on r.id=m.role_id left join qarar_core.governance_units g on g.id=m.governance_unit_id where m.organization_id=o.id),'[]'::jsonb)
 ) from qarar_core.organizations o where o.code=${q(organizationCode)};`));
}
const source=snapshot(sourceContainer,true),before=snapshot(targetContainer);
// These three aliases were explicitly approved by the user.
const plan=planMemberships(source.memberships,before.councils,{
 'مجلس قسم المختبرات الطبية':'مجلس قسم المختبرات',
 'مجلس قسم التغذية وصحة المجتمع':'مجلس قسم صحة المجتمع والتغذية',
 'مجلس قسم إدارة الأعمال الدولية باللغة العربية':'مجلس قسم إدارة الأعمال الدولية',
});
const existing=new Map(before.users.map(u=>[u.email.toLowerCase(),u]));
const administrator=before.users.find(u=>u.admin && u.status==='active');
if(!administrator)throw Error('DEV administrator missing');
const roleMap=new Map(before.roles.map(r=>[r.code,r.id]));
if(plan.planned.some(m=>!roleMap.has(m.role_code)))throw Error('Required DEV role missing');
const summary={source_users:source.users.length,new_users:source.users.filter(u=>!existing.has(u.email.toLowerCase())).length,matched_memberships:plan.planned.length,unmatched_councils:[...new Set(plan.unresolved.map(m=>m.unit_name))]};
console.log(JSON.stringify(summary,null,2));
if(!apply)process.exit(0);
const env=Object.fromEntries(fs.readFileSync(new URL('../supabase/docker/.env.remote-dev',import.meta.url),'utf8').split(/\r?\n/).filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i),l.slice(i+1).replace(/^"|"$/g,'')]}));
async function api(path,body,method='POST',profile) {
 const response=await fetch(base+path,{method,headers:{apikey:env.ANON_KEY,Authorization:'Bearer '+env.SERVICE_ROLE_KEY,'Content-Type':'application/json',...(profile?{'Content-Profile':profile}:{})},body:JSON.stringify(body),signal:AbortSignal.timeout(60000)});
 const data=await response.json();
 if(!response.ok)throw Error('DEV API failed '+path+' status '+response.status+' code '+(data.code||data.error_code||'unknown'));
 return data;
}
fs.mkdirSync(privateDir,{recursive:true,mode:0o700});
const state=fs.existsSync(statePath)?JSON.parse(fs.readFileSync(statePath,'utf8')):{accounts:[]};
function persist() {
 fs.writeFileSync(statePath,JSON.stringify(state,null,2),{mode:0o600});
 const cell=v=>'"'+String(v??'').replaceAll('"','""')+'"';
 fs.writeFileSync(csvPath,'name,email,temporary_password,development_user_id\n'+state.accounts.map(a=>[a.name,a.email,a.password,a.id].map(cell).join(',')).join('\n')+'\n',{mode:0o600});
}
const mapping=new Map();
for(const user of source.users) {
 const found=existing.get(user.email.toLowerCase());
 if(found){mapping.set(user.id,found.id);continue;}
 let entry=state.accounts.find(a=>a.source_id===user.id);
 if(!entry) {
  const password=crypto.randomBytes(24).toString('base64url')+'!Aa1';
  const identity=await api('/auth/v1/admin/users',{email:user.email,password,email_confirm:false,user_metadata:{full_name_ar:user.full_name_ar}});
  entry={source_id:user.id,id:identity.id,email:user.email,name:user.full_name_ar,password,complete:false};
  state.accounts.push(entry);persist();
 }
 if(!entry.complete) {
  const receipt=await api('/rest/v1/rpc/service_finalize_temporary_user',{p_actor_user_id:administrator.id,p_auth_user_id:entry.id,p_email:user.email,p_full_name_ar:user.full_name_ar,p_employee_no:user.employee_no,p_mobile:user.mobile,p_job_title:user.job_title,p_role_id:null,p_governance_unit_id:null,p_membership_title:null},'POST','api_v1');
  if(receipt.user_id!==entry.id || receipt.must_change_password!==true)throw Error('Unconfirmed profile receipt');
  await api('/auth/v1/admin/users/'+entry.id,{email_confirm:true},'PUT');
  entry.complete=true;persist();
 }
 mapping.set(user.id,entry.id);
}
const current=snapshot(targetContainer),commands=[],leadershipConflicts=[];
for(const m of plan.planned) {
 const userId=mapping.get(m.user_id);
 if(!userId)throw Error('Missing imported user');
 if(current.memberships.some(t=>t.user_id===userId&&t.unit_id===m.target_unit_id&&t.role_code===m.role_code&&t.membership_status==='active'))continue;
 if(['council_chair','council_rapporteur'].includes(m.role_code)&&current.memberships.some(t=>t.user_id!==userId&&t.unit_id===m.target_unit_id&&t.role_code===m.role_code&&t.membership_status==='active'&&(!t.end_date||t.end_date>=m.start_date))) {
  leadershipConflicts.push({council:m.unit_name,role:m.role_code});continue;
 }
 commands.push(`select api_v2.manage_user_role_v2(p_user_id=>${q(userId)}::uuid,p_action=>'add',p_role_id=>${q(roleMap.get(m.role_code))}::uuid,p_unit_id=>${q(m.target_unit_id)}::uuid,p_title=>${q(m.title)},p_start_date=>${q(m.start_date)}::date,p_end_date=>${q(m.end_date)}::date,p_request_id=>${q(m.id)}::uuid);`);
}
sql(targetContainer,`begin;
select set_config('request.jwt.claims',${q(JSON.stringify({sub:administrator.id,role:'authenticated',aal:'aal2'}))},true);
select pg_advisory_xact_lock(hashtextextended('production-users-to-dev:qarar-demo',0));
${commands.join('\n')}
select qarar_audit.append_audit_log(${q(before.org)}::uuid,'iam.dev_import.production_users','users',${q(administrator.id)}::uuid,${q(JSON.stringify({source:'qarar-supabase-db',user_count:source.users.length,membership_count:commands.length,unmatched_councils:summary.unmatched_councils}))}::jsonb);
commit;`);
const after=snapshot(targetContainer);
if(JSON.stringify(before.councils)!==JSON.stringify(after.councils))throw Error('Council state changed');
if(after.users.length!==before.users.length+summary.new_users)throw Error('Unexpected user count');
if(after.users.filter(u=>u.admin).length!==before.users.filter(u=>u.admin).length)throw Error('Administrative authority changed');
const check=JSON.parse(sql(targetContainer,`select jsonb_build_object('temporary',(select count(*) from qarar_iam.users where id in (${state.accounts.map(a=>q(a.id)+'::uuid').join(',')||'null'}) and must_change_password and status='active'),'missing',(select count(*) from auth.users where id in (${state.accounts.map(a=>q(a.id)+'::uuid').join(',')||'null'}) and email_confirmed_at is null));`));
if(check.temporary!==state.accounts.length||check.missing!==0)throw Error('Temporary account verification failed');
console.log(JSON.stringify({created_accounts:state.accounts.length,added_memberships:commands.length,verified_temporary_accounts:check.temporary,credentials_file:csvPath,unmatched_councils:summary.unmatched_councils,leadership_conflicts:leadershipConflicts},null,2));
