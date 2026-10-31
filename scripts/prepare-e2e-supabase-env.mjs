import {readFileSync, writeFileSync, appendFileSync} from 'node:fs';
import {randomBytes, createHmac} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

export const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const e2eEnvFile = path.join(repository, 'supabase/docker/.env.e2e');
export function parseEnv(text) {
  return Object.fromEntries(text.split(/\r?\n/).filter(line => /^[A-Z][A-Z0-9_]*=/.test(line)).map(line => {
    const at=line.indexOf('=');
    return [line.slice(0,at),line.slice(at+1).replace(/^"|"$/g,'')];
  }));
}
export function buildE2EEnvironment(example, caller) {
  // Fixed loopback port, not merely any local address: local DEV/PROD gateways
  // must never become the HTTP half of an otherwise isolated SQL fixture.
  if(caller.SUPABASE_PUBLIC_URL && caller.SUPABASE_PUBLIC_URL !== 'http://127.0.0.1:64321') {
    throw new Error('E2E preparation requires the dedicated loopback endpoint http://127.0.0.1:64321');
  }
  const secret=randomBytes(48).toString('hex');
  const jwt = role => {
    const header=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');
    const payload=Buffer.from(JSON.stringify({role,iss:'supabase-demo',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+86400})).toString('base64url');
    return `${header}.${payload}.${createHmac('sha256',secret).update(`${header}.${payload}`).digest('base64url')}`;
  };
  return {...parseEnv(example),
    COMPOSE_PROJECT_NAME:'qarar-e2e',
    COMPOSE_FILE:'docker-compose.yml:docker-compose.e2e.yml',
    POSTGRES_DB:'qarar_e2e',POSTGRES_HOST:'db',POSTGRES_PORT:'5432',
    POSTGRES_PASSWORD:randomBytes(32).toString('hex'),
    JWT_SECRET:secret,ANON_KEY:jwt('anon'),SERVICE_ROLE_KEY:jwt('service_role'),
    QARAR_E2E_DATABASE_CONTAINER:'qarar-e2e-db',QARAR_E2E_DATABASE_NAME:'qarar_e2e',
    QARAR_E2E_ALLOW_DATABASE_MUTATION:'isolated-local-only',QARAR_APPLY_SEED:'false',
    QARAR_DB_DATA_VOLUME:'qarar-e2e-db-data',QARAR_STORAGE_DATA_VOLUME:'qarar-e2e-storage-data',
    SUPABASE_PUBLIC_URL:'http://127.0.0.1:64321',API_EXTERNAL_URL:'http://127.0.0.1:64321/auth/v1',
    SITE_URL:'http://127.0.0.1:3100',ALLOWED_ORIGINS:'http://127.0.0.1:3100',
    QARAR_LOGIN_RATE_LIMIT_REDIS_PASSWORD:randomBytes(32).toString('hex'),
    QARAR_LOGIN_RATE_LIMIT_HMAC_SECRET:randomBytes(32).toString('hex'),
    QARAR_ACTIVATION_TOKEN_SECRET:randomBytes(32).toString('hex'),
    KONG_HTTP_PORT:'64321',KONG_HTTPS_PORT:'64326',QARAR_API_PORT:'64321',QARAR_API_HTTPS_PORT:'64326',
    QARAR_STUDIO_PORT:'64323',QARAR_DB_PORT:'64322',QARAR_DB_DIRECT_PORT:'64327',
    QARAR_POOLER_PORT:'64329',QARAR_MAIL_UI_PORT:'64025',QARAR_SMTP_PORT:'64026',
  };
}

export function validateE2ECompose(config) {
  const reject=()=>{throw new Error('Refusing Compose: resources are not an isolated qarar-e2e stack');};
  if(config.name!=='qarar-e2e' || config.services?.db?.container_name!=='qarar-e2e-db' || config.services.db.environment?.POSTGRES_DB!=='qarar_e2e') reject();
  for(const volume of Object.values(config.volumes??{})) {
    if(volume.external || !/^qarar-e2e[-_]/.test(volume.name??'') || volume.driver_opts) reject();
  }
  for(const network of Object.values(config.networks??{})) {
    if(network.external || !/^qarar-e2e[-_]/.test(network.name??'')) reject();
  }
  const allowedPorts=new Set(['64321','64326','64323','64322','64327','64329','64025','64026']);
  for(const service of Object.values(config.services??{})) {
    if(!service.container_name?.startsWith('qarar-e2e-') || service.network_mode || service.privileged || service.volumes_from) reject();
    if(service.environment?.POSTGRES_HOST && service.environment.POSTGRES_HOST!=='db' && service.environment.POSTGRES_HOST!=='/var/run/postgresql') reject();
    for(const port of service.ports??[]) if(port.host_ip!=='127.0.0.1' || !allowedPorts.has(String(port.published))) reject();
    for(const mount of service.volumes??[]) {
      if(mount.type==='bind') {
        const relative=path.relative(path.join(repository,'supabase'),mount.source);
        if(!mount.read_only || relative.startsWith('..') || path.isAbsolute(relative) || mount.source.includes('docker.sock')) reject();
      }
      if(mount.type==='volume' && !config.volumes?.[mount.source]) reject();
    }
  }
}

if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  if(process.env.CI!=='true') throw new Error('Preparation is CI-only; no shared local configuration will be written');
  const values=buildE2EEnvironment(readFileSync(path.join(repository,'supabase/docker/.env.example'),'utf8'),process.env);
  // Exclusive creation: never replace a local configuration or running fixture.
  writeFileSync(e2eEnvFile,Object.entries(values).map(([key,value])=>`${key}=${value}`).join('\n')+'\n',{flag:'wx',mode:0o600});
  if(process.env.GITHUB_ENV) appendFileSync(process.env.GITHUB_ENV,`QARAR_E2E_ENV_FILE=${e2eEnvFile}\n`);
  console.log('Prepared isolated CI environment: qarar-e2e-db / qarar_e2e (secrets not printed)');
}
