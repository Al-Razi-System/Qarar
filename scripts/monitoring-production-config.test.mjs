import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const compose = await readFile("deploy/production/docker-compose.production.yml", "utf8");
const alerts = await readFile("deploy/production/monitoring/alerts.yml", "utf8");
const workflow = await readFile(".github/workflows/production-readiness.yml", "utf8");

test("monitoring services are isolated and not publicly published", () => {
  for (const service of ["prometheus:", "alertmanager:", "blackbox-exporter:", "postgres-exporter:", "loki:", "promtail:"]) {
    assert.match(compose, new RegExp(`\\n  ${service}`));
  }
  assert.doesNotMatch(compose, /9090:9090|9093:9093|9115:9115|9187:9187/);
});

test("alerts cover availability latency and database monitoring", () => {
  for (const name of ["QararEndpointDown", "QararEndpointLatencyHigh", "QararDatabaseExporterDown"]) {
    assert.match(alerts, new RegExp(`alert: ${name}`));
  }
});

test("release workflow produces SBOM and scans containers", () => {
  assert.match(workflow, /anchore\/sbom-action/);
  assert.match(workflow, /aquasecurity\/trivy-action/);
});
