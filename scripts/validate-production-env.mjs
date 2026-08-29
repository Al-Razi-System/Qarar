import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const envFile = process.argv[2] ?? process.env.PRODUCTION_ENV_FILE;
if (!envFile || (envFile !== "-" && !fs.existsSync(envFile))) {
  console.error("Usage: node scripts/validate-production-env.mjs <production-env-file|->");
  process.exit(2);
}

function parseEnv(contents) {
  const env = Object.create(null);
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;

    const [, key, rawValue] = match;
    let value = rawValue.trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

const env = parseEnv(envFile === "-" ? fs.readFileSync(0, "utf8") : fs.readFileSync(envFile, "utf8"));
const errors = [];
const has = (key) => Object.hasOwn(env, key);

// Compose treats an absent ${NAME} as an empty value and only emits a warning.
// Derive this set from both production compose files so a future direct
// interpolation cannot silently bypass this release gate.
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const composeFiles = [
  path.join(repositoryRoot, "supabase", "docker", "docker-compose.yml"),
  path.join(repositoryRoot, "deploy", "production", "docker-compose.production.yml"),
];
const composeRequiredKeys = new Set();
for (const composeFile of composeFiles) {
  if (!fs.existsSync(composeFile)) {
    errors.push(`Cannot inspect production compose file: ${path.relative(repositoryRoot, composeFile)}`);
    continue;
  }

  const pattern = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g;
  const source = fs.readFileSync(composeFile, "utf8");
  for (const match of source.matchAll(pattern)) composeRequiredKeys.add(match[1]);
}
for (const key of [...composeRequiredKeys].sort()) {
  if (!has(key)) errors.push(`${key}: missing (referenced directly by production Compose)`);
}

// These values cannot be empty in a functional, secure deployment. Optional
// Compose integrations such as OPENAI_API_KEY remain defined in the template
// but are intentionally allowed to be empty.
const requiredValues = [
  "ADDITIONAL_REDIRECT_URLS",
  "ALLOWED_ORIGINS",
  "ANON_KEY",
  "API_EXTERNAL_URL",
  "APP_ORIGIN",
  "DASHBOARD_PASSWORD",
  "DASHBOARD_USERNAME",
  "DOCKER_SOCKET_LOCATION",
  "GLOBAL_S3_BUCKET",
  "GEMINI_API_KEY",
  "IMGPROXY_AUTO_WEBP",
  "JWT_SECRET",
  "KONG_HTTP_PORT",
  "KONG_HTTPS_PORT",
  "LOGFLARE_PRIVATE_ACCESS_TOKEN",
  "LOGFLARE_PUBLIC_ACCESS_TOKEN",
  "MAILER_URLPATHS_CONFIRMATION",
  "MAILER_URLPATHS_EMAIL_CHANGE",
  "MAILER_URLPATHS_INVITE",
  "MAILER_URLPATHS_RECOVERY",
  "METRICS_TOKEN",
  "QARAR_ALERT_WEBHOOK_URL",
  "QARAR_ALERT_WEBHOOK_TOKEN",
  "QARAR_ALERTMANAGER_CONFIG_PATH",
  "PG_META_CRYPTO_KEY",
  "PGRST_DB_SCHEMAS",
  "POOLER_DB_POOL_SIZE",
  "POOLER_DEFAULT_POOL_SIZE",
  "POOLER_MAX_CLIENT_CONN",
  "POOLER_TENANT_ID",
  "POSTGRES_DB",
  "POSTGRES_HOST",
  "POSTGRES_PASSWORD",
  "POSTGRES_PORT",
  "REALTIME_DB_ENC_KEY",
  "REGION",
  "QARAR_OUTBOX_WEBHOOK_TOKEN",
  "QARAR_OUTBOX_WEBHOOK_URL",
  "QARAR_ACTIVATION_TOKEN_SECRET",
  "QARAR_BACKUP_KMS_KEY_ID",
  "QARAR_BACKUP_OFFSITE_BUCKET",
  "QARAR_BACKUP_OFFSITE_PREFIX",
  "QARAR_BACKUP_RETENTION_DAYS",
  "QARAR_LOGIN_RATE_LIMIT_CLIENT_IP_HEADER",
  "QARAR_LOGIN_RATE_LIMIT_EMAIL_MAX_ATTEMPTS",
  "QARAR_LOGIN_RATE_LIMIT_GLOBAL_MAX_ATTEMPTS",
  "QARAR_LOGIN_RATE_LIMIT_GLOBAL_WINDOW_SECONDS",
  "QARAR_LOGIN_RATE_LIMIT_HMAC_SECRET",
  "QARAR_LOGIN_RATE_LIMIT_REDIS_HOST",
  "QARAR_LOGIN_RATE_LIMIT_REDIS_PASSWORD",
  "QARAR_LOGIN_RATE_LIMIT_REDIS_PORT",
  "QARAR_LOGIN_RATE_LIMIT_WINDOW_SECONDS",
  "QARAR_LOGIN_RATE_LIMIT_CLIENT_MAX_ATTEMPTS",
  "QARAR_UPLOAD_SCAN_ADAPTER",
  "QARAR_UPLOAD_SCAN_HOST",
  "QARAR_UPLOAD_SCAN_MAX_BYTES",
  "QARAR_UPLOAD_SCAN_PORT",
  "QARAR_UPLOAD_SCAN_REQUIRED",
  "QARAR_UPLOAD_SCAN_TIMEOUT_MS",
  "S3_PROTOCOL_ACCESS_KEY_ID",
  "S3_PROTOCOL_ACCESS_KEY_SECRET",
  "SECRET_KEY_BASE",
  "SERVICE_ROLE_KEY",
  "SITE_URL",
  "SMTP_ADMIN_EMAIL",
  "SMTP_HOST",
  "SMTP_PASS",
  "SMTP_PORT",
  "SMTP_SENDER_NAME",
  "SMTP_USER",
  "STORAGE_TENANT_ID",
  "STUDIO_DEFAULT_ORGANIZATION",
  "STUDIO_DEFAULT_PROJECT",
  "SUPABASE_PUBLIC_URL",
  "VAULT_ENC_KEY",
];
for (const key of requiredValues) {
  if (!env[key]) errors.push(`${key}: missing or empty`);
}
if (env.QARAR_ACTIVATION_TOKEN_SECRET && env.QARAR_ACTIVATION_TOKEN_SECRET.length < 32) {
  errors.push("QARAR_ACTIVATION_TOKEN_SECRET: must contain at least 32 characters");
}
if (env.QARAR_BACKUP_RETENTION_DAYS && (!/^\d+$/.test(env.QARAR_BACKUP_RETENTION_DAYS) || Number(env.QARAR_BACKUP_RETENTION_DAYS) < 30)) {
  errors.push("QARAR_BACKUP_RETENTION_DAYS: must be an integer of at least 30 days");
}
if (env.QARAR_BACKUP_KMS_KEY_ID && !/^(arn:|projects\/)/.test(env.QARAR_BACKUP_KMS_KEY_ID)) {
  errors.push("QARAR_BACKUP_KMS_KEY_ID: must identify an institutional AWS/GCP KMS key");
}

const placeholderPattern = /replace[_-]?with|your[-_]|example|insecure|secret1234|supabase-demo/i;
for (const key of requiredValues) {
  if (placeholderPattern.test(env[key] ?? "")) errors.push(`${key}: placeholder/default value`);
}

function requireHttps(key) {
  if (!env[key]) return;
  try {
    if (new URL(env[key]).protocol !== "https:") throw new Error("not HTTPS");
  } catch {
    errors.push(`${key}: HTTPS URL is required`);
  }
}
for (const key of ["SUPABASE_PUBLIC_URL", "QARAR_OUTBOX_WEBHOOK_URL", "QARAR_ALERT_WEBHOOK_URL"]) requireHttps(key);

// Auth redirect and issuer URLs are security boundaries. URL#toString()
// removes deceptive representations such as an explicit default port, mixed
// case host, and dot-segments, so require callers to provide that canonical
// representation rather than accepting an equivalent-looking prefix.
function asCanonicalHttpsUrl(value, { requireOrigin = false } = {}) {
  try {
    const parsed = new URL(value);
    const canonicalValue = requireOrigin ? parsed.origin : parsed.toString();
    if (
      parsed.protocol !== "https:" ||
      !parsed.hostname ||
      parsed.username ||
      parsed.password ||
      parsed.hostname.includes("*") ||
      parsed.hostname.endsWith(".") ||
      parsed.search ||
      parsed.hash ||
      value.includes("*") ||
      value.includes("%") ||
      value.includes("?") ||
      value.includes("#") ||
      (requireOrigin && parsed.pathname !== "/") ||
      value !== canonicalValue
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

// APP_ORIGIN is used as an exact allow-list entry for cookie-authenticated
// dashboard mutations and attachment URLs. It must be an origin, not a URL
// with a path, query, fragment, or embedded credentials.
let configuredAppOrigin = null;
if (env.APP_ORIGIN) {
  const appOrigin = asCanonicalHttpsUrl(env.APP_ORIGIN, { requireOrigin: true });
  if (!appOrigin || env.APP_ORIGIN !== appOrigin.origin || appOrigin.pathname !== "/") {
    errors.push("APP_ORIGIN: must be an HTTPS origin without path, query, fragment, or credentials");
  } else {
    configuredAppOrigin = appOrigin.origin;
  }
}

if (env.SITE_URL && env.APP_ORIGIN && env.SITE_URL !== env.APP_ORIGIN) {
  errors.push("SITE_URL: must exactly equal APP_ORIGIN");
}

if (env.API_EXTERNAL_URL) {
  const apiExternalUrl = asCanonicalHttpsUrl(env.API_EXTERNAL_URL);
  if (!apiExternalUrl) {
    errors.push("API_EXTERNAL_URL: must be a canonical HTTPS URL without wildcard, credentials, query, fragment, or encoded path");
  } else if (apiExternalUrl.pathname !== "/auth/v1") {
    errors.push("API_EXTERNAL_URL: must use the exact canonical /auth/v1 path");
  }
}

const allowedOrigins = (env.ALLOWED_ORIGINS ?? "").split(",").map((value) => value.trim()).filter(Boolean);
if (!allowedOrigins.length) {
  errors.push("ALLOWED_ORIGINS: must contain at least one HTTPS origin");
}
for (const origin of allowedOrigins) {
  const parsed = asCanonicalHttpsUrl(origin, { requireOrigin: true });
  if (!parsed || origin !== parsed.origin || parsed.pathname !== "/") {
    errors.push(`ALLOWED_ORIGINS: invalid exact HTTPS origin ${origin}`);
  }
}
if (env.APP_ORIGIN && !allowedOrigins.includes(env.APP_ORIGIN)) {
  errors.push("ALLOWED_ORIGINS: must include APP_ORIGIN");
}

// GoTrue accepts a comma-separated URI allow list. Keep each item as an
// exact, canonical URL on a deployment-owned CORS origin; never accept a
// wildcard, a credential-bearing URL, query/fragment, or an implicit prefix.
const redirectParts = (env.ADDITIONAL_REDIRECT_URLS ?? "").split(",");
const configuredRedirectUrls = new Set();
if (!env.ADDITIONAL_REDIRECT_URLS?.trim() || redirectParts.some((value) => !value.trim())) {
  errors.push("ADDITIONAL_REDIRECT_URLS: must be a non-empty comma-separated list without blank entries");
}
for (const rawRedirect of redirectParts) {
  const redirect = rawRedirect.trim();
  if (!redirect) continue;

  const parsed = asCanonicalHttpsUrl(redirect);
  if (!parsed) {
    errors.push(`ADDITIONAL_REDIRECT_URLS: invalid canonical HTTPS redirect ${redirect}`);
    continue;
  }
  if (!allowedOrigins.includes(parsed.origin)) {
    errors.push(`ADDITIONAL_REDIRECT_URLS: redirect origin must be in ALLOWED_ORIGINS: ${redirect}`);
    continue;
  }
  if (configuredRedirectUrls.has(redirect)) {
    errors.push(`ADDITIONAL_REDIRECT_URLS: duplicate redirect ${redirect}`);
    continue;
  }
  configuredRedirectUrls.add(redirect);
}
if (configuredAppOrigin && !configuredRedirectUrls.has(`${configuredAppOrigin}/auth/callback`)) {
  errors.push("ADDITIONAL_REDIRECT_URLS: must include the exact APP_ORIGIN/auth/callback URL");
}
if (configuredAppOrigin && !configuredRedirectUrls.has(`${configuredAppOrigin}/auth/recovery`)) {
  errors.push("ADDITIONAL_REDIRECT_URLS: must include the exact APP_ORIGIN/auth/recovery URL");
}
if (env.QARAR_SSO_ENABLED !== "false") {
  errors.push("QARAR_SSO_ENABLED: release 1 requires SSO to remain explicitly false");
}

function requirePort(key) {
  const value = Number(env[key]);
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    errors.push(`${key}: must be a port between 1 and 65535`);
  }
}
for (const key of [
  "POSTGRES_PORT",
  "KONG_HTTP_PORT",
  "KONG_HTTPS_PORT",
  "QARAR_LOGIN_RATE_LIMIT_REDIS_PORT",
  "QARAR_UPLOAD_SCAN_PORT",
  "SMTP_PORT",
]) requirePort(key);

function requirePositiveInteger(key) {
  const value = Number(env[key]);
  if (!Number.isInteger(value) || value < 1) errors.push(`${key}: must be a positive integer`);
}
for (const key of ["POOLER_DB_POOL_SIZE", "POOLER_DEFAULT_POOL_SIZE", "POOLER_MAX_CLIENT_CONN"]) requirePositiveInteger(key);

for (const [key, minLength] of Object.entries({
  POSTGRES_PASSWORD: 20,
  JWT_SECRET: 32,
  DASHBOARD_PASSWORD: 20,
  SECRET_KEY_BASE: 64,
  PG_META_CRYPTO_KEY: 32,
  LOGFLARE_PUBLIC_ACCESS_TOKEN: 32,
  LOGFLARE_PRIVATE_ACCESS_TOKEN: 32,
  S3_PROTOCOL_ACCESS_KEY_SECRET: 32,
  METRICS_TOKEN: 32,
  QARAR_ALERT_WEBHOOK_TOKEN: 32,
  QARAR_LOGIN_RATE_LIMIT_HMAC_SECRET: 32,
  QARAR_OUTBOX_WEBHOOK_TOKEN: 32,
})) {
  if ((env[key] ?? "").length < minLength) errors.push(`${key}: value is too short`);
}

if ((env.VAULT_ENC_KEY ?? "").length !== 32) errors.push("VAULT_ENC_KEY: must be exactly 32 characters");
if ((env.REALTIME_DB_ENC_KEY ?? "").length !== 16) errors.push("REALTIME_DB_ENC_KEY: must be exactly 16 characters");
if (!/^[A-Za-z0-9_-]{32,}$/.test(env.QARAR_LOGIN_RATE_LIMIT_REDIS_PASSWORD ?? "")) {
  errors.push("QARAR_LOGIN_RATE_LIMIT_REDIS_PASSWORD: must be a base64url-safe secret of at least 32 characters");
}
if (env.QARAR_LOGIN_RATE_LIMIT_REDIS_PASSWORD === env.QARAR_LOGIN_RATE_LIMIT_HMAC_SECRET) {
  errors.push("QARAR_LOGIN_RATE_LIMIT_REDIS_PASSWORD and QARAR_LOGIN_RATE_LIMIT_HMAC_SECRET must differ");
}
if (env.QARAR_LOGIN_RATE_LIMIT_REDIS_HOST !== "login-rate-limit-redis") {
  errors.push("QARAR_LOGIN_RATE_LIMIT_REDIS_HOST: must be login-rate-limit-redis for the bundled private counter store");
}
if (env.QARAR_LOGIN_RATE_LIMIT_CLIENT_IP_HEADER !== "x-qarar-client-ip") {
  errors.push("QARAR_LOGIN_RATE_LIMIT_CLIENT_IP_HEADER: must equal x-qarar-client-ip (set only by the trusted reverse proxy)");
}
if (env.QARAR_UPLOAD_SCAN_ADAPTER !== "clamav-internal") {
  errors.push("QARAR_UPLOAD_SCAN_ADAPTER: must equal clamav-internal");
}
if (env.QARAR_UPLOAD_SCAN_HOST !== "clamav") {
  errors.push("QARAR_UPLOAD_SCAN_HOST: must equal clamav (the private Compose sidecar, never a URL)");
}
if (env.QARAR_UPLOAD_SCAN_PORT !== "3310") {
  errors.push("QARAR_UPLOAD_SCAN_PORT: must equal 3310 for the private clamd sidecar");
}
if (env.QARAR_UPLOAD_SCAN_MAX_BYTES !== String(25 * 1024 * 1024)) {
  errors.push("QARAR_UPLOAD_SCAN_MAX_BYTES: must equal 26214400 to match the application upload limit");
}

for (const [key, expected] of Object.entries({
  DISABLE_SIGNUP: "true",
  ENABLE_ANONYMOUS_USERS: "false",
  ENABLE_EMAIL_SIGNUP: "false",
  ENABLE_EMAIL_AUTOCONFIRM: "false",
  ENABLE_PHONE_SIGNUP: "false",
  ENABLE_PHONE_AUTOCONFIRM: "false",
  FUNCTIONS_VERIFY_JWT: "true",
  QARAR_APPLY_SEED: "false",
  QARAR_OUTBOX_DISPATCHER_ENABLED: "true",
  QARAR_OUTBOX_REQUIRED: "true",
  QARAR_UPLOAD_SCAN_REQUIRED: "true",
})) {
  if (env[key] !== expected) errors.push(`${key}: must equal ${expected}`);
}

const expiry = Number(env.JWT_EXPIRY);
if (!Number.isInteger(expiry) || expiry < 300 || expiry > 3600) {
  errors.push("JWT_EXPIRY: must be between 300 and 3600 seconds");
}
for (const [key, minimum, maximum] of [
  ["QARAR_LOGIN_RATE_LIMIT_EMAIL_MAX_ATTEMPTS", 1, 20],
  ["QARAR_LOGIN_RATE_LIMIT_CLIENT_MAX_ATTEMPTS", 1, 100],
  ["QARAR_LOGIN_RATE_LIMIT_GLOBAL_MAX_ATTEMPTS", 10, 10_000],
  ["QARAR_LOGIN_RATE_LIMIT_WINDOW_SECONDS", 60, 3_600],
  ["QARAR_LOGIN_RATE_LIMIT_GLOBAL_WINDOW_SECONDS", 10, 3_600],
  ["QARAR_OUTBOX_DISPATCH_INTERVAL_MS", 1000, 60000],
  ["QARAR_OUTBOX_WEBHOOK_TIMEOUT_MS", 1000, 30000],
  ["QARAR_OUTBOX_BATCH_SIZE", 1, 25],
  ["QARAR_OUTBOX_LEASE_SECONDS", 60, 3600],
  ["QARAR_UPLOAD_SCAN_TIMEOUT_MS", 1000, 30000],
]) {
  const value = Number(env[key]);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    errors.push(`${key}: must be an integer between ${minimum} and ${maximum}`);
  }
}
if (env.ANON_KEY && env.ANON_KEY === env.SERVICE_ROLE_KEY) {
  errors.push("ANON_KEY and SERVICE_ROLE_KEY must differ");
}

const exposedSchemas = new Set((env.PGRST_DB_SCHEMAS ?? "").split(",").map((value) => value.trim()).filter(Boolean));
for (const requiredSchema of ["api_v1", "public", "graphql_public"]) {
  if (!exposedSchemas.has(requiredSchema)) errors.push(`PGRST_DB_SCHEMAS: must include ${requiredSchema}`);
}
for (const privateSchema of ["auth", "storage", "qarar_core", "qarar_iam", "qarar_governance"]) {
  if (exposedSchemas.has(privateSchema)) errors.push(`PGRST_DB_SCHEMAS: must not expose ${privateSchema}`);
}

if (errors.length) {
  console.error(`Production environment rejected (${errors.length}):\n- ${errors.join("\n- ")}`);
  process.exit(1);
}
console.log("Production environment validation passed.");
