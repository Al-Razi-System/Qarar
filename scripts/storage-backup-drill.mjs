import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { createReadStream, createWriteStream, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable, Transform } from "node:stream";
import { spawnSync } from "node:child_process";
import path from "node:path";

const started = Date.now();
const api = (process.env.QARAR_SUPABASE_URL ?? "http://127.0.0.1:54321").replace(/\/$/, "");
const keyText = process.env.QARAR_BACKUP_ENCRYPTION_KEY;
if (!keyText) throw new Error("QARAR_BACKUP_ENCRYPTION_KEY is required");
const key = Buffer.from(keyText, "base64"); if (key.length !== 32) throw new Error("backup key must be 32 bytes");
let serviceKey = process.env.QARAR_SUPABASE_SERVICE_ROLE_KEY ?? process.env.SERVICE_ROLE_KEY;
if (!serviceKey) {
  const env = readFileSync("supabase/docker/.env", "utf8"); serviceKey = env.match(/^SERVICE_ROLE_KEY=(.+)$/m)?.[1]?.trim();
}
if (!serviceKey) throw new Error("service role key is required");
const container = process.env.DB_CONTAINER ?? "qarar-supabase-db";
const output = path.resolve(process.env.QARAR_STORAGE_BACKUP_DIRECTORY ?? `backups/storage-${Date.now()}`);
const objectsDir = path.join(output, "objects"); mkdirSync(objectsDir, { recursive: true });
const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
const fixtureName = `recovery-drill/${crypto.randomUUID()}.txt`;
const fixture = Buffer.from(`qarar-storage-recovery-${crypto.randomUUID()}`);
const drill = process.env.QARAR_STORAGE_DRILL_CREATE_FIXTURE === "true";
let createdFixtureBucket = false;

async function request(url, init={}) { const response=await fetch(url,{...init,headers:{...headers,...init.headers},signal:AbortSignal.timeout(30000)}); if(!response.ok)throw new Error(`Storage ${response.status}: ${await response.text()}`); return response; }
if (drill) {
  const bucketCheck=await fetch(`${api}/storage/v1/bucket/qarar-evidence`,{headers,signal:AbortSignal.timeout(30000)});
  const missingBucket=bucketCheck.status===404||(bucketCheck.status===400&&(await bucketCheck.clone().text()).includes("NoSuchBucket"));
  if(missingBucket){await request(`${api}/storage/v1/bucket`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:"qarar-evidence",name:"qarar-evidence",public:false})});createdFixtureBucket=true;}
  else if(!bucketCheck.ok)throw new Error(`cannot inspect recovery bucket: ${bucketCheck.status}`);
  await request(`${api}/storage/v1/object/qarar-evidence/${fixtureName}`,{method:"POST",headers:{"Content-Type":"text/plain","x-upsert":"false"},body:fixture});
}

const sql = "select coalesce(json_agg(json_build_object('bucket',bucket_id,'name',name) order by bucket_id,name),'[]'::json)::text from storage.objects where name is not null";
const listed = spawnSync("docker",["exec",container,"psql","-X","-U","supabase_admin","-d","postgres","-At","-v","ON_ERROR_STOP=1","-c",sql],{encoding:"utf8"});
if (listed.status !== 0) throw new Error(`cannot enumerate storage catalog: ${listed.stderr}`);
const objects = JSON.parse(listed.stdout.trim() || "[]"); const manifestObjects=[]; let totalBytes=0;
for (let index=0; index<objects.length; index++) {
  const item=objects[index]; const response=await request(`${api}/storage/v1/object/${encodeURIComponent(item.bucket)}/${item.name.split("/").map(encodeURIComponent).join("/")}`);
  const iv=randomBytes(12); const cipher=createCipheriv("aes-256-gcm",key,iv); const hash=createHash("sha256"); let bytes=0;
  const counter=new Transform({transform(chunk,_encoding,callback){bytes+=chunk.length;hash.update(chunk);callback(null,chunk);}});
  const filename=`${String(index).padStart(8,"0")}.enc`; await pipeline(Readable.fromWeb(response.body),counter,cipher,createWriteStream(path.join(objectsDir,filename),{flags:"wx"}));
  totalBytes+=bytes; manifestObjects.push({bucket:item.bucket,name:item.name,filename,bytes,sha256:hash.digest("hex"),iv:iv.toString("base64"),tag:cipher.getAuthTag().toString("base64"),content_type:response.headers.get("content-type")??"application/octet-stream"});
}
const capturedAt=new Date().toISOString(); const manifest={format_version:1,captured_at_utc:capturedAt,object_count:manifestObjects.length,total_plaintext_bytes:totalBytes,objects:manifestObjects};
writeFileSync(path.join(output,"manifest.json"),JSON.stringify(manifest,null,2),{flag:"wx",mode:0o600});

let restored=false; let restoreMs=0;
if (drill) {
  const record=manifestObjects.find(v=>v.bucket==="qarar-evidence"&&v.name===fixtureName); if(!record)throw new Error("fixture was not captured");
  await request(`${api}/storage/v1/object/qarar-evidence/${fixtureName}`,{method:"DELETE"}); const restoreStarted=Date.now();
  const decipher=createDecipheriv("aes-256-gcm",key,Buffer.from(record.iv,"base64"));decipher.setAuthTag(Buffer.from(record.tag,"base64"));
  const temporary=path.join(output,"fixture.restore"); await pipeline(createReadStream(path.join(objectsDir,record.filename)),decipher,createWriteStream(temporary,{flags:"wx",mode:0o600}));
  await request(`${api}/storage/v1/object/qarar-evidence/${fixtureName}`,{method:"POST",headers:{"Content-Type":record.content_type,"x-upsert":"false"},body:createReadStream(temporary),duplex:"half"});
  const downloaded=Buffer.from(await (await request(`${api}/storage/v1/object/qarar-evidence/${fixtureName}`)).arrayBuffer());
  restored=createHash("sha256").update(downloaded).digest("hex")===record.sha256; restoreMs=Date.now()-restoreStarted;
  await request(`${api}/storage/v1/object/qarar-evidence/${fixtureName}`,{method:"DELETE"}); rmSync(temporary,{force:true}); if(!restored)throw new Error("restored attachment hash mismatch");
  if(createdFixtureBucket)await request(`${api}/storage/v1/bucket/qarar-evidence`,{method:"DELETE"});
}
const report={captured_at_utc:capturedAt,objects:manifestObjects.length,bytes:totalBytes,backup_duration_ms:Date.now()-started,restore_duration_ms:restoreMs,measured_rpo_seconds:Math.ceil((Date.now()-Date.parse(capturedAt))/1000),attachment_restored_and_downloaded:restored};
mkdirSync(".production-reports",{recursive:true});writeFileSync(".production-reports/storage-recovery.json",JSON.stringify(report,null,2));
console.log(JSON.stringify(report)); key.fill(0);
