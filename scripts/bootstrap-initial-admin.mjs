#!/usr/bin/env node
// Controlled production bootstrap for the first Qarar system administrator.
//
// This process intentionally does not create Auth identities and has no
// password, invite-token, or service-key command-line option.  The identity
// must be created and email-confirmed by the approved Auth/IdP process first.

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const MAX_CONFIG_BYTES = 16 * 1024;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const APPROVAL_REFERENCE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{7,127}$/;
const CONFIGURATION_FIELDS = new Set([
  "organization_code",
  "auth_user_id",
  "email",
  "full_name_ar",
  "full_name_en",
  "employee_no",
  "mobile",
  "job_title",
  "approval_reference",
]);

export class BootstrapInputError extends Error {}
export class BootstrapOperationError extends Error {}

const inputError = (message) => new BootstrapInputError(message);

function requiredText(value, label, maximumLength) {
  if (typeof value !== "string") throw inputError(`${label} is required`);
  const normalized = value.trim();
  if (!normalized) throw inputError(`${label} is required`);
  if (normalized.length > maximumLength) throw inputError(`${label} is too long`);
  return normalized;
}

function optionalText(value, label, maximumLength) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw inputError(`${label} must be text`);
  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized.length > maximumLength) throw inputError(`${label} is too long`);
  return normalized;
}

export function normalizeBootstrapConfiguration(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw inputError("bootstrap configuration must be a JSON object");
  }

  for (const key of Object.keys(raw)) {
    if (!CONFIGURATION_FIELDS.has(key)) {
      throw inputError(`bootstrap configuration contains unsupported field: ${key}`);
    }
  }

  const organizationCode = requiredText(raw.organization_code, "organization_code", 64);
  const authUserId = requiredText(raw.auth_user_id, "auth_user_id", 36);
  const email = requiredText(raw.email, "email", 320).toLowerCase();
  const fullNameAr = requiredText(raw.full_name_ar, "full_name_ar", 200);
  const approvalReference = requiredText(raw.approval_reference, "approval_reference", 128);

  if (!UUID_PATTERN.test(authUserId)) throw inputError("auth_user_id must be a UUID");
  if (!EMAIL_PATTERN.test(email)) throw inputError("email must be a valid address");
  if (fullNameAr.length < 2) throw inputError("full_name_ar must contain at least two characters");
  if (!APPROVAL_REFERENCE_PATTERN.test(approvalReference)) {
    throw inputError("approval_reference must be 8-128 ticket-safe characters");
  }

  return Object.freeze({
    organization_code: organizationCode,
    auth_user_id: authUserId,
    email,
    full_name_ar: fullNameAr,
    full_name_en: optionalText(raw.full_name_en, "full_name_en", 200),
    employee_no: optionalText(raw.employee_no, "employee_no", 64),
    mobile: optionalText(raw.mobile, "mobile", 32),
    job_title: optionalText(raw.job_title, "job_title", 200),
    approval_reference: approvalReference,
  });
}

export function loadBootstrapConfiguration(configurationPath, fileSystem = fs) {
  if (typeof configurationPath !== "string" || !configurationPath.trim()) {
    throw inputError("--config is required");
  }

  let stat;
  try {
    stat = fileSystem.statSync(configurationPath);
  } catch {
    throw inputError("bootstrap configuration file cannot be read");
  }
  if (!stat.isFile() || stat.size > MAX_CONFIG_BYTES) {
    throw inputError("bootstrap configuration file must be a regular JSON file no larger than 16 KiB");
  }

  let parsed;
  try {
    parsed = JSON.parse(fileSystem.readFileSync(configurationPath, "utf8"));
  } catch {
    throw inputError("bootstrap configuration must contain valid JSON");
  }
  return normalizeBootstrapConfiguration(parsed);
}

export function parseArguments(argv) {
  const options = { configPath: null, confirmation: null, dryRun: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") {
      options.help = true;
    } else if (argument === "--dry-run") {
      options.dryRun = true;
    } else if (argument === "--config" || argument === "--confirm") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw inputError(`${argument} requires a value`);
      if (argument === "--config") {
        if (options.configPath) throw inputError("--config may be supplied only once");
        options.configPath = value;
      } else {
        if (options.confirmation) throw inputError("--confirm may be supplied only once");
        options.confirmation = value;
      }
      index += 1;
    } else {
      throw inputError(`unsupported argument: ${argument}`);
    }
  }
  return options;
}

export function expectedConfirmation(configuration) {
  return `BOOTSTRAP ${configuration.organization_code} ${configuration.auth_user_id} ${configuration.approval_reference}`;
}

export function validateExecutionApproval(configuration, confirmation, environment) {
  if (environment.QARAR_BOOTSTRAP_APPROVED !== "true") {
    throw inputError("QARAR_BOOTSTRAP_APPROVED=true is required for a bootstrap operation");
  }
  if (environment.QARAR_BOOTSTRAP_APPROVAL_ID !== configuration.approval_reference) {
    throw inputError("QARAR_BOOTSTRAP_APPROVAL_ID must exactly match approval_reference");
  }
  if (confirmation !== expectedConfirmation(configuration)) {
    throw inputError("--confirm must exactly match the displayed bootstrap confirmation phrase");
  }
}

export function resolveServiceBaseUrl(value) {
  if (typeof value !== "string" || !value.trim()) {
    throw inputError("QARAR_SUPABASE_URL is required");
  }
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw inputError("QARAR_SUPABASE_URL must be an HTTPS origin");
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash ||
    value !== parsed.origin
  ) {
    throw inputError("QARAR_SUPABASE_URL must be an exact HTTPS origin without credentials or a path");
  }
  return parsed.origin;
}

export function loadServiceRoleKey(environment, fileSystem = fs) {
  const secretFile = environment.QARAR_SUPABASE_SERVICE_ROLE_KEY_FILE?.trim();
  const environmentSecret = environment.QARAR_SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (secretFile && environmentSecret) {
    throw inputError("set only one service-role credential source: _KEY_FILE or _KEY");
  }

  let secret = environmentSecret;
  if (secretFile) {
    try {
      const stat = fileSystem.statSync(secretFile);
      if (!stat.isFile() || stat.size > MAX_CONFIG_BYTES) throw new Error("invalid secret file");
      secret = fileSystem.readFileSync(secretFile, "utf8").trim();
    } catch {
      throw inputError("service-role credential file cannot be read");
    }
  }
  if (!secret || secret.length < 20) {
    throw inputError("a service-role credential is required through QARAR_SUPABASE_SERVICE_ROLE_KEY_FILE or QARAR_SUPABASE_SERVICE_ROLE_KEY");
  }
  return secret;
}

export function validateApprovedAuthUser(authResponse, configuration, now = Date.now()) {
  const user = authResponse?.user ?? authResponse;
  if (!user || typeof user !== "object" || user.id !== configuration.auth_user_id) {
    throw new BootstrapOperationError("approved Auth user could not be verified");
  }
  if (typeof user.email !== "string" || user.email.trim().toLowerCase() !== configuration.email) {
    throw new BootstrapOperationError("approved Auth user email does not match the bootstrap configuration");
  }
  if (!user.email_confirmed_at) {
    throw new BootstrapOperationError("approved Auth user email is not confirmed");
  }
  if (user.banned_until) {
    const bannedUntil = Date.parse(user.banned_until);
    if (Number.isFinite(bannedUntil) && bannedUntil > now) {
      throw new BootstrapOperationError("approved Auth user is currently banned");
    }
  }
  return user;
}

function maskedEmail(email) {
  const [localPart, domain] = email.split("@");
  return `${localPart.slice(0, 1)}***@${domain}`;
}

export function safePlan(configuration) {
  return {
    action: "bootstrap_initial_system_administrator",
    organization_code: configuration.organization_code,
    auth_user_id: configuration.auth_user_id,
    approved_email: maskedEmail(configuration.email),
    approval_reference: configuration.approval_reference,
  };
}

async function getJson(fetchImplementation, url, options, operationName) {
  let response;
  try {
    response = await fetchImplementation(url, options);
  } catch {
    throw new BootstrapOperationError(`${operationName} could not reach the configured service`);
  }
  if (!response?.ok) {
    throw new BootstrapOperationError(`${operationName} was rejected (HTTP ${response?.status ?? "unknown"})`);
  }
  try {
    return await response.json();
  } catch {
    throw new BootstrapOperationError(`${operationName} returned an invalid response`);
  }
}

function serviceHeaders(serviceRoleKey) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
  };
}

export async function executeBootstrap({
  configuration,
  baseUrl,
  serviceRoleKey,
  dryRun,
  fetchImplementation = globalThis.fetch,
  now = Date.now(),
}) {
  if (typeof fetchImplementation !== "function") {
    throw new BootstrapOperationError("fetch is unavailable in this Node runtime");
  }

  const authResponse = await getJson(
    fetchImplementation,
    `${baseUrl}/auth/v1/admin/users/${encodeURIComponent(configuration.auth_user_id)}`,
    { method: "GET", headers: serviceHeaders(serviceRoleKey) },
    "Auth identity verification",
  );
  validateApprovedAuthUser(authResponse, configuration, now);

  if (dryRun) return { dry_run: true, ...safePlan(configuration) };

  const result = await getJson(
    fetchImplementation,
    `${baseUrl}/rest/v1/rpc/service_bootstrap_organization_admin`,
    {
      method: "POST",
      headers: { ...serviceHeaders(serviceRoleKey), "Content-Type": "application/json" },
      body: JSON.stringify({
        p_auth_user_id: configuration.auth_user_id,
        p_organization_code: configuration.organization_code,
        p_email: configuration.email,
        p_full_name_ar: configuration.full_name_ar,
        p_full_name_en: configuration.full_name_en,
        p_employee_no: configuration.employee_no,
        p_mobile: configuration.mobile,
        p_job_title: configuration.job_title,
        p_approval_reference: configuration.approval_reference,
      }),
    },
    "initial administrator bootstrap",
  );

  if (
    !result ||
    result.user_id !== configuration.auth_user_id ||
    result.organization_code !== configuration.organization_code ||
    result.is_system_admin !== true
  ) {
    throw new BootstrapOperationError("initial administrator bootstrap returned an unexpected result");
  }

  return {
    dry_run: false,
    action: "bootstrap_initial_system_administrator",
    organization_code: result.organization_code,
    auth_user_id: result.user_id,
    approval_reference: result.approval_reference,
    is_system_admin: true,
  };
}

export const usage = `Usage:
  node scripts/bootstrap-initial-admin.mjs --config <approved-bootstrap.json> \\
    --confirm "BOOTSTRAP <organization_code> <auth_user_id> <approval_reference>" [--dry-run]

Required environment:
  QARAR_BOOTSTRAP_APPROVED=true
  QARAR_BOOTSTRAP_APPROVAL_ID=<approval_reference>
  QARAR_SUPABASE_URL=https://api.example.gov
  QARAR_SUPABASE_SERVICE_ROLE_KEY_FILE=/run/secrets/qarar_service_role_key

The service-role key may alternatively be injected as QARAR_SUPABASE_SERVICE_ROLE_KEY.
Never pass a service key, password, or invite token on the command line.`;

export async function main({
  argv = process.argv.slice(2),
  environment = process.env,
  fileSystem = fs,
  fetchImplementation = globalThis.fetch,
  write = (line) => process.stdout.write(`${line}\n`),
} = {}) {
  const options = parseArguments(argv);
  if (options.help) {
    write(usage);
    return { help: true };
  }

  const configuration = loadBootstrapConfiguration(options.configPath, fileSystem);
  validateExecutionApproval(configuration, options.confirmation, environment);
  const baseUrl = resolveServiceBaseUrl(environment.QARAR_SUPABASE_URL);
  const serviceRoleKey = loadServiceRoleKey(environment, fileSystem);

  write(JSON.stringify({ stage: "validated", ...safePlan(configuration), dry_run: options.dryRun }));
  const result = await executeBootstrap({
    configuration,
    baseUrl,
    serviceRoleKey,
    dryRun: options.dryRun,
    fetchImplementation,
  });
  write(JSON.stringify({ stage: "completed", ...result }));
  return result;
}

const invokedDirectly = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (invokedDirectly) {
  main().catch((error) => {
    const message = error instanceof BootstrapInputError || error instanceof BootstrapOperationError
      ? error.message
      : "initial administrator bootstrap failed";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
