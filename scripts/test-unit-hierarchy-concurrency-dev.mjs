// Development-only concurrent opposing moves. Creates an isolated fixture tenant.
import { randomUUID } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
const db = 'qarar-dev-supabase-db';
const org = randomUUID(), actor = randomUUID(), type = randomUUID(), a = randomUUID(), b = randomUUID();
const args = ['exec', '-i', db, 'psql', '-X', '-At', '-v', 'ON_ERROR_STOP=1', '-U', 'supabase_admin', '-d', 'postgres'];
function sql(input) { return execFileSync('docker', args, { input, encoding: 'utf8' }).trim(); }
sql(`begin;
  insert into qarar_core.organizations(id,code,name_ar) values ('${org}','concurrent-${org}','اختبار تزامن معزول');
  insert into auth.users(id,email) values ('${actor}','concurrent-${actor}@example.test');
  insert into qarar_iam.users(id,organization_id,email,full_name_ar,is_system_admin) values ('${actor}','${org}','concurrent-${actor}@example.test','اختبار تزامن',true);
  insert into qarar_core.governance_unit_types(id,organization_id,code,name_ar,is_council_type) values ('${type}','${org}','department','قسم',false);
  insert into qarar_core.governance_units(id,organization_id,unit_type_id,code,name_ar,status) values
    ('${a}','${org}','${type}','a','القسم الأول','active'),('${b}','${org}','${type}','b','القسم الثاني','active');
  commit;`);
const timestamps = JSON.parse(sql(`select jsonb_object_agg(id,updated_at) from qarar_core.governance_units where organization_id='${org}';`));
function move(id, parent, name) {
  return new Promise((resolve) => {
    const child = spawn('docker', args); let output = '', error = '';
    child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { error += chunk; });
    child.on('close', code => resolve({ code, output, error }));
    child.stdin.end(`begin; set local statement_timeout='15s';
      select set_config('request.jwt.claim.sub','${actor}',true),set_config('request.jwt.claim.role','authenticated',true);
      select api_v2.admin_update_organizational_unit_v2('${id}','${name}','${type}','${parent}','active','${timestamps[id]}');
      select pg_sleep(0.2); commit;`);
  });
}
const results = await Promise.all([move(a, b, 'القسم الأول'), move(b, a, 'القسم الثاني')]);
if (results.filter(result => result.code === 0).length !== 1) throw Error(JSON.stringify(results));
const rejected = results.find(result => result.code !== 0);
if (!/تم تعديل الوحدة|لا يمكن جعل الوحدة/.test(rejected.error)) throw Error(rejected.error);
const cycle = sql(`with recursive walk as (
  select id,parent_unit_id,array[id] path,false cycle from qarar_core.governance_units where organization_id='${org}'
  union all select u.id,u.parent_unit_id,w.path||u.id,u.id=any(w.path) from walk w join qarar_core.governance_units u
    on u.id=w.parent_unit_id where u.organization_id='${org}' and not w.cycle
) select exists(select 1 from walk where cycle);`);
if (cycle !== 'f') throw Error('Concurrent moves created a hierarchy cycle');
console.log('PASS concurrent opposing moves: one commit, one safe rejection, no cycle. Isolated passwordless fixture tenant retained for audit.');
