import { performance } from "node:perf_hooks";
const base = (process.env.LOAD_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const concurrency = Math.max(1, Number(process.env.LOAD_CONCURRENCY ?? 10));
const requests = Math.max(concurrency, Number(process.env.LOAD_REQUESTS ?? 100));
const maxP95 = Number(process.env.LOAD_MAX_P95_MS ?? 750);
const maxErrorRate = Number(process.env.LOAD_MAX_ERROR_RATE ?? 0.01);
const timings = []; let errors = 0; let cursor = 0;
async function worker() { while (cursor < requests) { cursor += 1; const start = performance.now(); try { const r = await fetch(`${base}/api/health`, { headers: { "x-load-test": "qarar-readonly" } }); if (!r.ok) errors += 1; await r.arrayBuffer(); } catch { errors += 1; } timings.push(performance.now() - start); } }
await Promise.all(Array.from({ length: concurrency }, worker));
timings.sort((a,b)=>a-b); const percentile = (p) => timings[Math.min(timings.length - 1, Math.ceil(timings.length * p) - 1)]; const errorRate = errors / requests;
console.log(JSON.stringify({requests,concurrency,errorRate,p50Ms:+percentile(.5).toFixed(1),p95Ms:+percentile(.95).toFixed(1),p99Ms:+percentile(.99).toFixed(1)}, null, 2));
if (errorRate > maxErrorRate || percentile(.95) > maxP95) process.exit(1);
