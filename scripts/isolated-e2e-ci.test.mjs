import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {execFileSync, spawnSync} from 'node:child_process';
import {buildE2EEnvironment, validateE2ECompose, repository, e2eEnvFile} from './prepare-e2e-supabase-env.mjs';

const example = readFileSync(new URL('../supabase/docker/.env.example', import.meta.url), 'utf8');
test('generates an explicitly isolated target, never the shared defaults', () => {
  const env = buildE2EEnvironment(example, {});
  assert.equal(env.POSTGRES_DB, 'qarar_e2e');
  assert.equal(env.QARAR_E2E_DATABASE_CONTAINER, 'qarar-e2e-db');
  assert.equal(env.QARAR_E2E_ALLOW_DATABASE_MUTATION, 'isolated-local-only');
  assert.equal(env.QARAR_DB_DATA_VOLUME, 'qarar-e2e-db-data');
  assert.equal(env.QARAR_STORAGE_DATA_VOLUME, 'qarar-e2e-storage-data');
  assert.equal(env.SUPABASE_PUBLIC_URL, 'http://127.0.0.1:64321');
  assert.notEqual(env.POSTGRES_PASSWORD, 'your-super-secret-and-long-postgres-password');
});
test('refuses remote, shared local ports, malformed URLs and credentialed URLs', () => {
  for(const url of ['https://devqarar.prideidea.com', 'https://qarar.prideidea.com', 'http://127.0.0.1:55421', 'bad', 'http://user:pass@127.0.0.1:64321']) {
    assert.throws(() => buildE2EEnvironment(example, {SUPABASE_PUBLIC_URL:url}));
  }
});
test('CLI refusal never creates or replaces any environment file', () => {
  const before=existsSync(e2eEnvFile)?readFileSync(e2eEnvFile,'utf8'):null;
  for(const env of [{PATH:process.env.PATH},{PATH:process.env.PATH,CI:'true',SUPABASE_PUBLIC_URL:'https://devqarar.prideidea.com'}]) {
    const child=spawnSync(process.execPath,['scripts/prepare-e2e-supabase-env.mjs'],{cwd:repository,env,encoding:'utf8'});
    assert.notEqual(child.status,0);
    assert.equal(existsSync(e2eEnvFile)?readFileSync(e2eEnvFile,'utf8'):null,before);
  }
});
const safe = () => ({name:'qarar-e2e',services:{db:{container_name:'qarar-e2e-db',environment:{POSTGRES_DB:'qarar_e2e'},ports:[{host_ip:'127.0.0.1',published:'64327'}],volumes:[{type:'volume',source:'db',target:'/var/lib/postgresql/data'}]}},volumes:{db:{name:'qarar-e2e-db-data'}},networks:{default:{name:'qarar-e2e_default'}}});
test('accepts a resolved isolated compose model', () => assert.doesNotThrow(() => validateE2ECompose(safe())));
test('rejects resource overlap, public ports, remote DB and writable host paths', () => {
  const mutations = [
    c => c.name='supabase',
    c => c.services.db.container_name='qarar-dev-supabase-db',
    c => c.services.db.environment.POSTGRES_DB='postgres',
    c => c.services.db.environment.POSTGRES_HOST='external.example',
    c => c.volumes.db.name='qarar-v2-db-data',
    c => c.volumes.db.external=true,
    c => c.services.db.ports[0].host_ip='0.0.0.0',
    c => c.services.db.ports[0].published='55427',
    c => c.services.db.volumes.push({type:'bind',source:'/home/partner/Qarar',target:'/data'}),
    c => c.services.db.volumes.push({type:'bind',source:'/home/partner/Qarar',target:'/data',read_only:true}),
    c => c.services.db.network_mode='host',
    c => c.networks.default.external=true,
    c => c.services.db.volumes[0].source='unknown',
  ];
  for(const mutate of mutations){const c=safe();mutate(c);assert.throws(()=>validateE2ECompose(c));}
});
test('resolved overlay is isolated; unmodified default stack is rejected', () => {
  const env={...process.env,...buildE2EEnvironment(example,{}),COMPOSE_PROFILES:''};
  const args=['compose','--env-file','supabase/docker/.env.example','-f','supabase/docker/docker-compose.yml'];
  const compose=extra=>JSON.parse(execFileSync('docker',[...args,...extra,'config','--format','json'],{cwd:repository,env,encoding:'utf8'}));
  assert.throws(()=>validateE2ECompose(compose([])));
  assert.doesNotThrow(()=>validateE2ECompose(compose(['--project-name','qarar-e2e','-f','supabase/docker/docker-compose.e2e.yml'])));
  // Default configuration still has exactly the same production/development
  // identity and storage; the E2E job never writes that environment file.
  const defaults=JSON.parse(execFileSync('docker',[...args,'config','--format','json'],{cwd:repository,env:{PATH:process.env.PATH},encoding:'utf8'}));
  assert.equal(defaults.services.db.container_name,'qarar-supabase-db');
  assert.equal(defaults.services.db.environment.POSTGRES_DB,'postgres');
  assert.equal(defaults.volumes['qarar-db-data'].name,'qarar-v2-db-data');
});
test('browser scenarios reuse the warmed runner without weakening the aggregate gate', () => {
  const workflow=readFileSync(new URL('../.github/workflows/dashboard-quality.yml',import.meta.url),'utf8');
  const start=workflow.indexOf('  docker-smoke:');
  const gate=workflow.indexOf('  regulations-e2e:');
  const runner=workflow.slice(start,gate);
  assert.ok(runner.includes('run: npm run test:e2e'));
  assert.ok(runner.indexOf('down -v')<runner.indexOf('sh scripts/prepare-e2e-supabase-env.sh'));
  assert.ok(runner.includes('node scripts/e2e-supabase.mjs images'));
  assert.ok(!runner.includes('node scripts/e2e-supabase.mjs pull'));
  assert.match(workflow.slice(gate),/needs: \[quality, api-contracts, docker-smoke\]/);
  assert.ok(readFileSync(new URL('./e2e-supabase.mjs',import.meta.url),'utf8').includes("'--pull','never'"));
});
