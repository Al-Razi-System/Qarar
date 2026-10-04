import { defineConfig, devices } from "@playwright/test";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

function localSupabaseEnv() {
  const dockerDirectory = path.resolve(__dirname, "../../supabase/docker");
  const candidates = [".env", ".env.example"];
  const source = candidates.map((name) => path.join(dockerDirectory, name)).find((file) => {
    try { readFileSync(file); return true; } catch { return false; }
  });
  if (!source) throw new Error("لا يوجد إعداد Supabase محلي لتشغيل اختبارات المتصفح.");
  const values = Object.fromEntries(readFileSync(source, "utf8").split(/\r?\n/).filter((line) => line && !line.startsWith("#") && line.includes("=")).map((line) => {
    const at = line.indexOf("=");
    return [line.slice(0, at), line.slice(at + 1).replace(/^"|"$/g, "")];
  }));
  const redisHost = execFileSync("docker", [
    "inspect",
    "-f",
    "{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}",
    "supabase-login-rate-limit-redis-1",
  ], { encoding: "utf8" }).trim();
  return {
    QARAR_SUPABASE_URL: values.SUPABASE_PUBLIC_URL || "http://127.0.0.1:54321",
    QARAR_SUPABASE_ANON_KEY: values.ANON_KEY || "",
    QARAR_SUPABASE_SERVICE_ROLE_KEY: values.SERVICE_ROLE_KEY || "",
    QARAR_LOGIN_RATE_LIMIT_REDIS_HOST: redisHost,
    QARAR_LOGIN_RATE_LIMIT_REDIS_PORT: values.QARAR_LOGIN_RATE_LIMIT_REDIS_PORT || "6379",
    QARAR_LOGIN_RATE_LIMIT_REDIS_PASSWORD: values.QARAR_LOGIN_RATE_LIMIT_REDIS_PASSWORD || "",
    QARAR_LOGIN_RATE_LIMIT_HMAC_SECRET: values.QARAR_LOGIN_RATE_LIMIT_HMAC_SECRET || "",
    QARAR_LOGIN_RATE_LIMIT_CLIENT_IP_HEADER: values.QARAR_LOGIN_RATE_LIMIT_CLIENT_IP_HEADER || "x-qarar-client-ip",
    // Browser suites intentionally create several fresh sessions for the same
    // isolated fixture. Keep throttling enabled, but size its test-only budget
    // above the number of serial desktop and mobile journeys.
    QARAR_LOGIN_RATE_LIMIT_EMAIL_MAX_ATTEMPTS: "100",
    QARAR_LOGIN_RATE_LIMIT_CLIENT_MAX_ATTEMPTS: "100",
    QARAR_LOGIN_RATE_LIMIT_GLOBAL_MAX_ATTEMPTS: values.QARAR_LOGIN_RATE_LIMIT_GLOBAL_MAX_ATTEMPTS || "300",
    QARAR_LOGIN_RATE_LIMIT_WINDOW_SECONDS: values.QARAR_LOGIN_RATE_LIMIT_WINDOW_SECONDS || "900",
    QARAR_LOGIN_RATE_LIMIT_GLOBAL_WINDOW_SECONDS: values.QARAR_LOGIN_RATE_LIMIT_GLOBAL_WINDOW_SECONDS || "60",
  };
}

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  // The current E2E fixture provisions one shared tenant and administrator.
  // Keep journeys serial until fixtures are isolated per worker; otherwise
  // concurrent login/session mutations make failures nondeterministic.
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [["html", { open: "never" }], ["github"], ["junit", { outputFile: "test-results/e2e-junit.xml" }]]
    : "list",
  globalSetup: process.env.QARAR_ACTIVATION_E2E_ONLY ? undefined : "./e2e/global-setup.ts",
  globalTeardown: process.env.QARAR_ACTIVATION_E2E_ONLY ? undefined : "./e2e/global-teardown.ts",
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
    {
      name: "mobile-chromium",
      use: {
        ...devices["Pixel 7"],
      },
    },
  ],
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1 --port 3100",
    env: { ...process.env, ...localSupabaseEnv() },
    url: "http://127.0.0.1:3100/login",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
