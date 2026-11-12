// Narrow operational repair: never reruns SQL or substitutes an applied checksum.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.resolve(import.meta.dirname,'..');
export function planRepair(source,rows){
 const ledger=new Map(rows.map(row=>[row.version,row]));
 const repairs=[];
 for(const row of rows){
  // Any timestamp-only alias: ad-hoc applies have written them in more than one batch.
  if(!/^\d{14}$/.test(row.version))continue;
  const matches=[...source.keys()].filter(name=>name.startsWith(row.version+'_'));
  if(matches.length!==1)throw Error('ambiguous source: '+row.version);
  const to=matches[0],checksum=source.get(to);
  if(!/^[a-f0-9]{64}$/.test(row.checksum||'')||checksum!==row.checksum)throw Error('checksum mismatch: '+row.version);
  if(ledger.has(to))throw Error('canonical collision: '+to);
  repairs.push({from:row.version,to,checksum,applied_at:row.applied_at});
 }
 return repairs;
}
/**
 * Migrations proven live by inspection (definitions equal what the file produces) but never written to
 * the ledger. Only names passed explicitly are recorded, with the file's own checksum; nothing is run.
 */
export function planRecord(source,rows,versions){
 const recorded=new Set(rows.map(row=>row.version));
 return versions.map(version=>{
  if(!/^\d{14}_[a-z0-9_]+$/.test(version))throw Error('not a canonical migration name: '+version);
  if(!source.has(version))throw Error('no source migration: '+version);
  if(recorded.has(version)||recorded.has(version.slice(0,14)))throw Error('already recorded: '+version);
  return {version,checksum:source.get(version)};
 });
}
function main(){
 const container=process.env.DB_CONTAINER;
 if(container!=='qarar-dev-supabase-db')throw Error('Only the explicit isolated DEV container is allowed');
 const sql=body=>execFileSync('docker',['exec','-i',container,'psql','-X','-qAt','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1'],{input:body,encoding:'utf8'});
 const read=()=>JSON.parse(sql("select coalesce(json_agg(t),'[]'::json) from (select version,checksum_sha256 as checksum,applied_at from qarar_internal.applied_migrations order by version) t;"));
 const dir=path.join(root,'supabase/migrations');
 const source=new Map(fs.readdirSync(dir).filter(n=>n.endsWith('.sql')).map(n=>[n.slice(0,-4),createHash('sha256').update(fs.readFileSync(path.join(dir,n))).digest('hex')]));
 const before=read(),repairs=planRepair(source,before);
 const recordArg=process.argv.find(arg=>arg.startsWith('--record-verified='));
 const records=recordArg?planRecord(source,before,recordArg.slice('--record-verified='.length).split(',').filter(Boolean)):[];
 const apply=process.argv.includes('--apply');
 const reportDir=path.join(root,'.production-reports');fs.mkdirSync(reportDir,{recursive:true});
 const reportPath=path.join(reportDir,'dev-ledger-repair-'+Date.now()+'.json');
 const report={container,apply,repairs,records,before,after:null,completed:false};
 // Persist before mutation, including exact fingerprints and original timestamps.
 fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');
 if(apply&&(repairs.length||records.length)){
  const quote=value=>"'"+value.replaceAll("'","''")+"'";
  sql('begin; lock table qarar_internal.applied_migrations in exclusive mode;\n'+repairs.map(r=>`do $repair$ begin
   if not exists(select 1 from qarar_internal.applied_migrations where version=${quote(r.from)} and checksum_sha256=${quote(r.checksum)} and applied_at=${quote(r.applied_at)}::timestamptz)
      or exists(select 1 from qarar_internal.applied_migrations where version=${quote(r.to)}) then
     raise exception 'Ledger changed since repair inspection';
   end if;
   update qarar_internal.applied_migrations set version=${quote(r.to)} where version=${quote(r.from)};
  end $repair$;`).join('\n')+'\n'+records.map(r=>`do $record$ begin
   if exists(select 1 from qarar_internal.applied_migrations where version in (${quote(r.version)},${quote(r.version.slice(0,14))})) then
     raise exception 'Ledger changed since repair inspection';
   end if;
   insert into qarar_internal.applied_migrations(version,checksum_sha256) values(${quote(r.version)},${quote(r.checksum)});
  end $record$;`).join('\n')+'\ncommit;');
 }
 report.after=read();report.completed=true;
 fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({apply,renamed:apply?repairs.length:0,recorded:apply?records.length:0,planned:{renames:repairs.map(r=>r.to),records:records.map(r=>r.version)},reportPath}));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
