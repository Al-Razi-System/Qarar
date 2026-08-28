import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const productionTemplate = path.join(repositoryRoot, "deploy", "production", ".env.production.example");
const validator = path.join(repositoryRoot, "scripts", "validate-production-env.mjs");

function configuredEnvironment() {
  const genericSecret = "a".repeat(64);
  let source = fs.readFileSync(productionTemplate, "utf8")
    .replace(/REPLACE_WITH_[A-Z0-9_]+/g, genericSecret)
    .replace(/example\.gov/g, "qarar.internal");

  source = source
    .replace(/^VAULT_ENC_KEY=.*$/m, `VAULT_ENC_KEY=${"v".repeat(32)}`)
    .replace(/^REALTIME_DB_ENC_KEY=.*$/m, `REALTIME_DB_ENC_KEY=${"r".repeat(16)}`)
    .replace(/^ANON_KEY=.*$/m, `ANON_KEY=${"n".repeat(64)}`)
    .replace(/^SERVICE_ROLE_KEY=.*$/m, `SERVICE_ROLE_KEY=${"s".repeat(64)}`)
    .replace(/^QARAR_LOGIN_RATE_LIMIT_REDIS_PASSWORD=.*$/m, `QARAR_LOGIN_RATE_LIMIT_REDIS_PASSWORD=${"p".repeat(48)}`)
    .replace(/^QARAR_LOGIN_RATE_LIMIT_HMAC_SECRET=.*$/m, `QARAR_LOGIN_RATE_LIMIT_HMAC_SECRET=${"h".repeat(48)}`);
  return source;
}

function validate(input) {
  return spawnSync(process.execPath, [validator, "-"], {
    cwd: repositoryRoot,
    encoding: "utf8",
    input,
  });
}

function composeService(source, name, nextService) {
  const start = source.indexOf(`\n  ${name}:\n`);
  const end = source.indexOf(`\n  ${nextService}:\n`, start + 1);
  assert.notEqual(start, -1, `missing compose service ${name}`);
  assert.notEqual(end, -1, `missing compose service after ${name}`);
  return source.slice(start, end);
}

test("production gate accepts an explicitly configured shared login limiter", () => {
  const result = validate(configuredEnvironment());
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Production environment validation passed/);
});

test("production gate rejects a spoofable forwarded-IP header", () => {
  const result = validate(configuredEnvironment().replace(
    /^QARAR_LOGIN_RATE_LIMIT_CLIENT_IP_HEADER=.*$/m,
    "QARAR_LOGIN_RATE_LIMIT_CLIENT_IP_HEADER=x-forwarded-for",
  ));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must equal x-qarar-client-ip/);
});

test("compose keeps the Redis limiter private and Kong limits password grants by trusted header", () => {
  const compose = fs.readFileSync(path.join(repositoryRoot, "supabase", "docker", "docker-compose.yml"), "utf8");
  const kong = fs.readFileSync(path.join(repositoryRoot, "supabase", "docker", "volumes", "api", "kong.yml"), "utf8");

  const redisService = composeService(compose, "login-rate-limit-redis", "mail");
  assert.match(redisService, /--protected-mode[\s\S]*?--requirepass/);
  assert.doesNotMatch(
    redisService,
    /^\s+ports:/m,
  );
  assert.match(kong, /name: auth-v1-token-rate-limited/);
  assert.match(kong, /http\.queries\.grant_type\) == "password"/);
  assert.match(kong, /limit_by: header[\s\S]*?header_name: X-Qarar-Client-IP/);
  assert.match(kong, /policy: redis[\s\S]*?sync_rate: 0[\s\S]*?fault_tolerant: false/);
});
