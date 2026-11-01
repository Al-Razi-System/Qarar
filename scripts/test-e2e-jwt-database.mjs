import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {repository,e2eEnvFile,parseEnv} from './prepare-e2e-supabase-env.mjs';
execFileSync(process.execPath,['scripts/e2e-supabase.mjs','config'],{cwd:repository,stdio:'pipe'});
const env=parseEnv(readFileSync(e2eEnvFile,'utf8'));
const docker=args=>execFileSync('docker',args,{encoding:'utf8'}).trim();
const inspect=JSON.parse(docker(['inspect','qarar-e2e-db']))[0];
assert.equal(inspect.Config.Labels['com.docker.compose.project'],'qarar-e2e');
assert.ok(inspect.Config.Env.includes('POSTGRES_DB=qarar_e2e'));
const sql=database=>['exec','qarar-e2e-db','psql','-X','-U','supabase_admin','-d',database,'-v','ON_ERROR_STOP=1'];
// Exercise the unchanged default database and the dedicated test database,
// both INSIDE the disposable container. Never query a shared container.
for(const database of ['postgres','qarar_e2e']) {
  docker([...sql(database),'-f','/docker-entrypoint-initdb.d/init-scripts/99-jwt.sql']);
  const value=docker([...sql(database),'-Atqc',`select array_to_json(setconfig) from pg_db_role_setting s join pg_database d on d.oid=s.setdatabase where d.datname=current_database() and s.setrole=0`]);
  const settings=JSON.parse(value);
  assert.ok(settings.includes(`app.settings.jwt_secret=${env.JWT_SECRET}`));
  assert.ok(settings.includes(`app.settings.jwt_exp=${env.JWT_EXPIRY}`));
}
console.log('JWT database initialization verified for postgres and qarar_e2e inside qarar-e2e-db');
