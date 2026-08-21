const base = (process.env.DASHBOARD_URL ?? "http://localhost:3000").replace(/\/$/, "");
const failures = [];
async function check(path, expected, assertions = {}, method = "GET", requestHeaders = {}) {
  const sendsJson = ["POST", "PUT", "PATCH", "DELETE"].includes(method);
  const headers = {
    ...(sendsJson ? { "content-type": "application/json" } : {}),
    ...requestHeaders,
  };
  const response = await fetch(`${base}${path}`, {
    redirect: "manual",
    method,
    headers,
    body: sendsJson ? "{}" : undefined,
  });
  if (!expected.includes(response.status)) failures.push(`${path}: HTTP ${response.status}, expected ${expected.join("/")}`);
  for (const [header, pattern] of Object.entries(assertions)) if (!pattern.test(response.headers.get(header) ?? "")) failures.push(`${path}: missing/invalid ${header}`);
}
await check("/api/health", [200], {"x-content-type-options":/^nosniff$/i,"x-frame-options":/^deny$/i,"referrer-policy":/strict-origin/});
const mutatingAdminRoutes = [
  ["/api/admin/regulations", "POST"],
  ["/api/admin/topics", "POST"],
  ["/api/admin/users", "POST"],
  ["/api/admin/users/00000000-0000-4000-8000-000000000001", "PATCH"],
  ["/api/admin/users/00000000-0000-4000-8000-000000000001/action", "POST"],
  ["/api/admin/iam", "POST"],
  ["/api/admin/roles", "POST"],
  ["/api/admin/delegations", "POST"],
  ["/api/admin/meetings", "POST"],
  ["/api/admin/sso", "POST"],
  ["/api/admin/sessions", "POST"],
  ["/api/admin/topics/upload", "POST"],
  ["/api/admin/regulations/upload", "POST"],
];
for (const [path, method] of mutatingAdminRoutes) {
  await check(path, process.env.NODE_ENV === "production" ? [403] : [401, 403], {}, method);
  if (process.env.NODE_ENV === "production") {
    await check(path, [403], {}, method, { origin: "https://attacker.invalid" });
  }
}
await check("/api/metrics", process.env.NODE_ENV === "production" ? [403] : [200,403]);
if (failures.length) { console.error(`Security audit failed:\n- ${failures.join("\n- ")}`); process.exit(1); }
console.log("HTTP security boundary audit passed.");
