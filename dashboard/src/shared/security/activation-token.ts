import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const TOKEN_VERSION = "v1";
const TOKEN_PATTERN = /^v1\.([0-9]{10})\.([A-Za-z0-9_-]{43})\.([A-Za-z0-9_-]{43})$/;

function secretBytes(secret: string) {
  const value = secret.trim();
  if (value.length < 32) throw new Error("ACTIVATION_TOKEN_CONFIGURATION_ERROR");
  return Buffer.from(value, "utf8");
}

export function issueActivationToken(secret: string, expiresAt: Date) {
  const expires = Math.floor(expiresAt.getTime() / 1000);
  const unsigned = `${TOKEN_VERSION}.${expires}.${randomBytes(32).toString("base64url")}`;
  const signature = createHmac("sha256", secretBytes(secret)).update(unsigned).digest("base64url");
  return `${unsigned}.${signature}`;
}

export function verifyActivationToken(token: string, secret: string, now = new Date()) {
  const match = TOKEN_PATTERN.exec(token);
  if (!match) return null;
  const unsigned = token.slice(0, token.lastIndexOf("."));
  const expected = createHmac("sha256", secretBytes(secret)).update(unsigned).digest();
  const supplied = Buffer.from(match[3], "base64url");
  // Node accepts non-canonical base64url encodings whose ignored trailing bits
  // decode to the same bytes. Reject them so changing any token character is
  // always treated as tampering and hashes remain one-to-one with signatures.
  if (supplied.toString("base64url") !== match[3]) return null;
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;
  const expiresAt = new Date(Number(match[1]) * 1000);
  if (!Number.isFinite(expiresAt.getTime()) || expiresAt <= now) return null;
  return { expiresAt, tokenHash: hashActivationValue(token) };
}

export function hashActivationValue(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function activationClaimHash(token: string, secret: string) {
  return createHmac("sha256", secretBytes(secret)).update(`activation-claim:${token}`).digest("hex");
}
