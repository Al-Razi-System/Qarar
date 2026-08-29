import { spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
const source=path.resolve(process.env.QARAR_BACKUP_SOURCE??"backups"); const bucket=process.env.QARAR_BACKUP_OFFSITE_BUCKET; const prefix=process.env.QARAR_BACKUP_OFFSITE_PREFIX??"qarar"; const kms=process.env.QARAR_BACKUP_KMS_KEY_ID; const days=Number(process.env.QARAR_BACKUP_RETENTION_DAYS);
if(!bucket||!kms||!Number.isInteger(days)||days<30)throw new Error("offsite bucket, KMS key and retention >=30 days are required");
const retainUntil=new Date(Date.now()+days*86400000).toISOString();
function files(dir){return readdirSync(dir).flatMap(name=>{const item=path.join(dir,name);return statSync(item).isDirectory()?files(item):[item];});}
for(const file of files(source)){const key=`${prefix}/${path.relative(source,file).replaceAll("\\","/")}`;const args=["s3api","put-object","--bucket",bucket,"--key",key,"--body",file,"--server-side-encryption","aws:kms","--ssekms-key-id",kms,"--object-lock-mode","COMPLIANCE","--object-lock-retain-until-date",retainUntil];const result=spawnSync("aws",args,{stdio:"inherit"});if(result.status!==0)throw new Error(`offsite upload failed: ${key}`);}
console.log(`Published encrypted backups outside the host with KMS and COMPLIANCE retention until ${retainUntil}`);
