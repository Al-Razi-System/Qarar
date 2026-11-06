import { OpenWAProvider } from "./openwa-provider.mjs";
import { QararClient } from "./qarar-client.mjs";
import { readFileSync } from "node:fs";
import { runWorkerCycle, runWorkerLoop } from "./runtime.mjs";
import { createInvitationMediaRenderer } from "./invitation-media.mjs";

const required = ["QARAR_SUPABASE_URL","QARAR_SERVICE_ROLE_KEY","QARAR_APP_URL","OPENWA_BASE_URL","OPENWA_SESSION_ID"];
for (const name of required) if (!process.env[name]) throw new Error(`Missing required environment variable: ${name}`);

const apiKey=process.env.OPENWA_API_KEY??(process.env.OPENWA_API_KEY_FILE?readFileSync(process.env.OPENWA_API_KEY_FILE,"utf8").trim():null);
if(!apiKey) throw new Error("Missing required OpenWA API key");

const client = new QararClient({ baseUrl: process.env.QARAR_SUPABASE_URL, serviceRoleKey: process.env.QARAR_SERVICE_ROLE_KEY });
const timeoutMs = Number.parseInt(process.env.OPENWA_TIMEOUT_MS ?? "45000", 10);
if (!Number.isInteger(timeoutMs) || timeoutMs < 5_000 || timeoutMs > 120_000) throw new Error("OPENWA_TIMEOUT_MS must be between 5000 and 120000");
const intervalMs=Number.parseInt(process.env.NOTIFICATION_WORKER_INTERVAL_MS??"5000",10);
if(!Number.isInteger(intervalMs)||intervalMs<1000||intervalMs>300000) throw new Error("NOTIFICATION_WORKER_INTERVAL_MS must be between 1000 and 300000");
const batchSize=Number.parseInt(process.env.NOTIFICATION_WORKER_BATCH_SIZE??"25",10);
if(!Number.isInteger(batchSize)||batchSize<1||batchSize>100) throw new Error("NOTIFICATION_WORKER_BATCH_SIZE must be between 1 and 100");
const provider = new OpenWAProvider({ baseUrl: process.env.OPENWA_BASE_URL, sessionId: process.env.OPENWA_SESSION_ID, apiKey, timeoutMs });
const appBaseUrl = new URL(process.env.QARAR_APP_URL).origin;
const mediaRenderer = createInvitationMediaRenderer({ appBaseUrl, serviceKey: process.env.QARAR_SERVICE_ROLE_KEY });

const controller=new AbortController();
process.once("SIGTERM",()=>controller.abort());
process.once("SIGINT",()=>controller.abort());
await runWorkerLoop({
  signal:controller.signal,
  intervalMs,
  runOnce:async()=>{
    const results=await runWorkerCycle({client,provider,mediaRenderer,limit:batchSize,appBaseUrl});
    return {dispatched:results.dispatched.length,delivered:results.delivered.length,results};
  }
});
