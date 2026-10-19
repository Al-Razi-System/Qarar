import { OpenWAProvider } from "./openwa-provider.mjs";
import { QararClient } from "./qarar-client.mjs";
import { runDeliveryBatch } from "./worker.mjs";
import { runDispatchBatch } from "./dispatcher.mjs";

const required = ["QARAR_SUPABASE_URL","QARAR_SERVICE_ROLE_KEY","OPENWA_BASE_URL","OPENWA_SESSION_ID","OPENWA_API_KEY"];
for (const name of required) if (!process.env[name]) throw new Error(`Missing required environment variable: ${name}`);

const client = new QararClient({ baseUrl: process.env.QARAR_SUPABASE_URL, serviceRoleKey: process.env.QARAR_SERVICE_ROLE_KEY });
const timeoutMs = Number.parseInt(process.env.OPENWA_TIMEOUT_MS ?? "45000", 10);
if (!Number.isInteger(timeoutMs) || timeoutMs < 5_000 || timeoutMs > 120_000) throw new Error("OPENWA_TIMEOUT_MS must be between 5000 and 120000");
const provider = new OpenWAProvider({ baseUrl: process.env.OPENWA_BASE_URL, sessionId: process.env.OPENWA_SESSION_ID, apiKey: process.env.OPENWA_API_KEY, timeoutMs });

const dispatched = await runDispatchBatch({ client });
const delivered = await runDeliveryBatch({ client, provider });
console.log(JSON.stringify({ dispatched: dispatched.length, delivered: delivered.length, results: { dispatched, delivered } }));
