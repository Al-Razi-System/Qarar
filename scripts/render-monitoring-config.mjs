import { readFile, writeFile } from "node:fs/promises";
import { URL } from "node:url";

const source = process.argv[2] ?? "deploy/production/monitoring/alertmanager.yml";
const destination = process.argv[3] ?? ".production-reports/alertmanager.yml";
const webhook = process.env.QARAR_ALERT_WEBHOOK_URL ?? "";
const token = process.env.QARAR_ALERT_WEBHOOK_TOKEN ?? "";

let parsed;
try { parsed = new URL(webhook); } catch { throw new Error("QARAR_ALERT_WEBHOOK_URL must be a valid URL"); }
if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.hash) {
  throw new Error("QARAR_ALERT_WEBHOOK_URL must be a credential-free HTTPS URL");
}
if (token.length < 32 || /REPLACE|example/i.test(token)) {
  throw new Error("QARAR_ALERT_WEBHOOK_TOKEN must be a non-placeholder secret of at least 32 characters");
}
const template = await readFile(source, "utf8");
const rendered = template
  .replace("__QARAR_ALERT_WEBHOOK_URL__", webhook.replaceAll('"', "%22"))
  .replace("__QARAR_ALERT_WEBHOOK_TOKEN__", token.replaceAll('"', "\\\""));
if (rendered.includes("__QARAR_ALERT_")) throw new Error("Monitoring template was not fully rendered");
await writeFile(destination, rendered, { mode: 0o600 });
console.log(`Rendered Alertmanager configuration: ${destination}`);
