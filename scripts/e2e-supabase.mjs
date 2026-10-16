import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {repository,e2eEnvFile,parseEnv,validateE2ECompose} from './prepare-e2e-supabase-env.mjs';
const values=parseEnv(readFileSync(e2eEnvFile,'utf8'));
if(values.QARAR_E2E_ALLOW_DATABASE_MUTATION!=='isolated-local-only' || values.SUPABASE_PUBLIC_URL!=='http://127.0.0.1:64321' || values.QARAR_E2E_DATABASE_NAME!=='qarar_e2e' || values.QARAR_E2E_DATABASE_CONTAINER!=='qarar-e2e-db') throw new Error('Refusing non-isolated E2E environment');
const options={cwd:repository,env:{...process.env,...values,COMPOSE_PROFILES:''}};
const docker=(args,stdio='pipe')=>execFileSync('docker',args,{...options,stdio,encoding:'utf8'});
if(process.env.DOCKER_HOST || process.env.DOCKER_CONTEXT) throw new Error('E2E does not accept ambient Docker endpoint overrides');
const context=JSON.parse(docker(['context','inspect']));
const endpoint=context[0]?.Endpoints?.docker?.Host??'';
if(!endpoint.startsWith('unix://')) throw new Error('E2E requires a local Unix Docker socket');
const base=['compose','--project-name','qarar-e2e','--env-file',e2eEnvFile,'-f','supabase/docker/docker-compose.yml','-f','supabase/docker/docker-compose.e2e.yml'];
const config=JSON.parse(docker([...base,'config','--format','json']));
validateE2ECompose(config);
const action=process.argv[2];
if(action==='config') console.log('Isolated Compose verified: qarar-e2e / qarar_e2e / loopback-only ports');
else if(action==='up') docker([...base,'up','-d','--wait','--wait-timeout','600','--pull','never'],'inherit');
else if(action==='seed') docker([...base,'run','--rm','--no-deps','-e','QARAR_APPLY_SEED=true','db-migrate'],'inherit');
else if(action==='down') docker([...base,'down','-v'],'inherit');
else if(action==='logs') {
  let logs=docker([...base,'logs','--tail','150']);
  for(const [key,value] of Object.entries(values)) {
    if(value && /SECRET|PASSWORD|KEY|TOKEN/.test(key)) logs=logs.replaceAll(value,'[REDACTED]');
  }
  process.stdout.write(logs);
}
else if(action==='pull') {
  for(const [service,definition] of Object.entries(config.services)) {
    if(definition.profiles?.length) continue;
    for(let attempt=1; ;attempt++) {
      try { docker([...base,'pull',service],'inherit'); break; }
      catch(error) {
        if(attempt>=6) throw error;
        console.error(`Retrying isolated service ${service} (attempt ${attempt+1}/6)`);
        await new Promise(resolve=>setTimeout(resolve,Math.min(attempt*20000,60000)));
      }
    }
  }
} else throw new Error('Expected config, pull, up, seed, logs or down');
