import { OpenWAProvider } from "./openwa-provider.mjs";
import { QararClient } from "./qarar-client.mjs";
import { runDeliveryBatch } from "./worker.mjs";

const required = ["QARAR_SUPABASE_URL","QARAR_SERVICE_ROLE_KEY","OPENWA_BASE_URL","OPENWA_SESSION_ID","OPENWA_API_KEY"];
for (const name of required) if (!process.env[name]) throw new Error(`Missing required environment variable: ${name}`);

const client = new QararClient({ baseUrl: process.env.QARAR_SUPABASE_URL, serviceRoleKey: process.env.QARAR_SERVICE_ROLE_KEY });
const provider = new OpenWAProvider({ baseUrl: process.env.OPENWA_BASE_URL, sessionId: process.env.OPENWA_SESSION_ID, apiKey: process.env.OPENWA_API_KEY });

const result = await runDeliveryBatch({ client, provider });
console.log(JSON.stringify({ processed: result.length, results: result }));
