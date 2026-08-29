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

function setEnvironmentValue(source, key, value) {
  return source.replace(new RegExp(`^${key}=.*$`, "m"), `${key}=${value}`);
}

function validate(input) {
  return spawnSync(process.execPath, [validator, "-"], {
    cwd: repositoryRoot,
    encoding: "utf8",
    input,
  });
}

test("production gate accepts canonical Auth topology", () => {
  const result = validate(configuredEnvironment());
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Production environment validation passed/);
});

test("production gate requires SITE_URL to match APP_ORIGIN literally", () => {
  const result = validate(setEnvironmentValue(
    configuredEnvironment(),
    "SITE_URL",
    "https://another.qarar.internal",
  ));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /SITE_URL: must exactly equal APP_ORIGIN/);
});

test("production gate rejects non-exact or untrusted Auth redirect entries", () => {
  const missingCallback = validate(setEnvironmentValue(
    configuredEnvironment(),
    "ADDITIONAL_REDIRECT_URLS",
    "https://admin.qarar.internal/auth/reset",
  ));
  assert.notEqual(missingCallback.status, 0);
  assert.match(missingCallback.stderr, /must include the exact APP_ORIGIN\/auth\/callback URL/);

  const wildcard = validate(setEnvironmentValue(
    configuredEnvironment(),
    "ADDITIONAL_REDIRECT_URLS",
    "https://*.qarar.internal/auth/callback",
  ));
  assert.notEqual(wildcard.status, 0);
  assert.match(wildcard.stderr, /invalid canonical HTTPS redirect/);

  const credentials = validate(setEnvironmentValue(
    configuredEnvironment(),
    "ADDITIONAL_REDIRECT_URLS",
    "https://operator:secret@admin.qarar.internal/auth/callback",
  ));
  assert.notEqual(credentials.status, 0);
  assert.match(credentials.stderr, /invalid canonical HTTPS redirect/);

  const nonCanonical = validate(setEnvironmentValue(
    configuredEnvironment(),
    "ADDITIONAL_REDIRECT_URLS",
    "https://admin.qarar.internal:443/auth/callback",
  ));
  assert.notEqual(nonCanonical.status, 0);
  assert.match(nonCanonical.stderr, /invalid canonical HTTPS redirect/);

  const foreignOrigin = validate(setEnvironmentValue(
    configuredEnvironment(),
    "ADDITIONAL_REDIRECT_URLS",
    "https://admin.qarar.internal/auth/callback,https://other.qarar.internal/auth/callback",
  ));
  assert.notEqual(foreignOrigin.status, 0);
  assert.match(foreignOrigin.stderr, /redirect origin must be in ALLOWED_ORIGINS/);
});

test("production gate requires a canonical public GoTrue endpoint", () => {
  const wrongPath = validate(setEnvironmentValue(
    configuredEnvironment(),
    "API_EXTERNAL_URL",
    "https://api.qarar.internal/auth/v1/",
  ));
  assert.notEqual(wrongPath.status, 0);
  assert.match(wrongPath.stderr, /must use the exact canonical \/auth\/v1 path/);

  const nonCanonical = validate(setEnvironmentValue(
    configuredEnvironment(),
    "API_EXTERNAL_URL",
    "https://api.qarar.internal:443/auth/v1",
  ));
  assert.notEqual(nonCanonical.status, 0);
  assert.match(nonCanonical.stderr, /must be a canonical HTTPS URL/);
});
