import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';

const script = new URL('./pull-supabase-compose-images.sh', import.meta.url).pathname;
const mirrors = (image) => execFileSync('sh', ['-c', `. "${script}"; mirrors_for "$1"`, 'sh', image], {env: {...process.env, QARAR_PULL_LIB_ONLY: '1'}, encoding: 'utf8'}).trim();

test('pulls Supabase images from ghcr.io first, then Docker Hub, before the quota-limited public.ecr.aws', () => {
  assert.equal(mirrors('public.ecr.aws/supabase/postgres:17.6.1.143'), 'ghcr.io/supabase/postgres:17.6.1.143 docker.io/supabase/postgres:17.6.1.143');
  assert.equal(mirrors('public.ecr.aws/supabase/vector:0.53.0-alpine'), 'ghcr.io/supabase/vector:0.53.0-alpine docker.io/supabase/vector:0.53.0-alpine');
  assert.equal(mirrors('supabase/studio:2026.07.07-sha-a6a04f2'), 'ghcr.io/supabase/studio:2026.07.07-sha-a6a04f2');
});

test('sends logflare, which ghcr.io does not carry, to Docker Hub', () => {
  assert.equal(mirrors('public.ecr.aws/supabase/logflare:1.47.2'), 'docker.io/supabase/logflare:1.47.2');
});

test('leaves images without a known mirror to their own registry', () => {
  for (const image of ['kong/kong:3.9.1', 'darthsim/imgproxy:v3.30.1', 'redis:7.4.7-alpine']) assert.equal(mirrors(image), '');
});

test('loads its functions without pulling anything when sourced for tests', () => {
  const output = execFileSync('sh', ['-c', `. "${script}"; echo loaded`], {env: {...process.env, QARAR_PULL_LIB_ONLY: '1', PATH: '/usr/bin:/bin'}, encoding: 'utf8'});
  assert.equal(output.trim(), 'loaded');
});
