// DEV only. Apply the reviewed seven-migration integration batch atomically.
import fs from "node:fs";
import crypto from "node:crypto";
import {execFileSync} from "node:child_process";
const container=process.env.DB_CONTAINER??"qarar-dev-supabase-db";
if(container!=="qarar-dev-supabase-db"&&!/^qarar-council-test-db-[a-z0-9-]+$/.test(container))throw Error("Refusing a non-development database");
const args=["exec","-i",container,"psql","-X","-U","supabase_admin","-d","postgres","-At","-v","ON_ERROR_STOP=1"];
const query=sql=>execFileSync("docker",args,{input:sql,encoding:"utf8",maxBuffer:10*1024*1024}).trim();
const directory=new URL("../supabase/migrations/",import.meta.url);
const batch=["20261009030000_close_working_branch_db_checks",...fs.readdirSync(directory).filter(f=>/^2026101005[0-5]000_/.test(f)).map(f=>f.slice(0,-4))].sort();
if(batch.length!==7)throw Error("Council integration batch changed; review it first");
const applied=new Map(query("select version||'|'||coalesce(checksum_sha256,'') from qarar_internal.applied_migrations where version<>'seed';").split("\n").map(line=>line.split("|")));
const hash=source=>crypto.createHash("sha256").update(source).digest("hex");
for(const [version,checksum] of applied){
 const path=new URL(version+".sql",directory);
 if(!fs.existsSync(path)||!checksum||hash(fs.readFileSync(path))!==checksum)throw Error("Migration drift: "+version);
}
const pending=fs.readdirSync(directory).filter(f=>f.endsWith(".sql")&&!applied.has(f.slice(0,-4))).map(f=>f.slice(0,-4));
if(pending.some(v=>!batch.includes(v)))throw Error("Unreviewed pending migrations exist");
if(process.env.APPLY_DEV_COUNCIL_BATCH!=="true"){
 console.log(JSON.stringify({preview:true,verified:applied.size,pending}));
}else{
 const before=query("select count(*) from qarar_iam.memberships;");
 let sql="begin;set local check_function_bodies=off;select pg_advisory_xact_lock(19017,20260724);\n";
 for(const version of pending.sort()){
  const source=fs.readFileSync(new URL(version+".sql",directory),"utf8");
  const body=source.replace(/^(?:\s|--[^\n]*(?:\n|$))*/,"");
  if(!/^begin;/i.test(body)||!/commit;$/i.test(body.trim()))throw Error("Unrecognized migration transaction: "+version);
  sql+=body.replace(/^begin;/i,"").replace(/commit;\s*$/i,"")+"\n";
  sql+=`insert into qarar_internal.applied_migrations(version,checksum_sha256) values('${version}','${hash(source)}');\n`;
 }
 sql+="notify pgrst,'reload schema';commit;";
 query(sql);
 if(query("select count(*) from qarar_iam.memberships;")!==before)throw Error("Membership count changed unexpectedly");
 console.log(JSON.stringify({applied:pending,memberships_preserved:true}));
}
