import { spawn } from "node:child_process";
import { cpSync, existsSync, symlinkSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import { fileURLToPath } from "node:url";
import forge from "node-forge";

const publicPort = 3100;
const upstreamPort = 3101;
const dashboardRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = process.env.QARAR_NEXT_DIST_DIR || ".next-e2e";
const standaloneRoot = path.join(dashboardRoot, distDir, "standalone");
const standaloneStatic = path.join(standaloneRoot, distDir, "static");

// Next's standalone output deliberately omits static assets. Point the server
// at the assets from the same immutable build instead of invoking `next start`,
// which is unsupported for standalone output and caused intermittent slow loads.
if (!existsSync(standaloneStatic)) {
  symlinkSync(path.join("..", "..", "static"), standaloneStatic, "dir");
}
// Standalone tracing only copies public files reached by server modules. The
// browser still requests the remaining brand assets directly, so mirror the
// complete public tree from this exact checkout before serving the build.
cpSync(path.join(dashboardRoot, "public"), path.join(standaloneRoot, "public"), {
  recursive: true,
  force: true,
});

function createLoopbackCertificate() {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const certificate = forge.pki.createCertificate();
  certificate.publicKey = keys.publicKey;
  certificate.serialNumber = "01";
  certificate.validity.notBefore = new Date(Date.now() - 60_000);
  certificate.validity.notAfter = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const attributes = [{ name: "commonName", value: "127.0.0.1" }];
  certificate.setSubject(attributes);
  certificate.setIssuer(attributes);
  certificate.setExtensions([{
    name: "subjectAltName",
    altNames: [
      { type: 7, ip: "127.0.0.1" },
      { type: 2, value: "localhost" },
    ],
  }]);
  certificate.sign(keys.privateKey, forge.md.sha256.create());
  return {
    cert: forge.pki.certificateToPem(certificate),
    key: forge.pki.privateKeyToPem(keys.privateKey),
  };
}

const dashboard = spawn(
  process.execPath,
  ["server.js"],
  {
    cwd: standaloneRoot,
    env: {
      ...process.env,
      HOSTNAME: "127.0.0.1",
      PORT: String(upstreamPort),
    },
    stdio: "inherit",
  },
);

const proxy = https.createServer(createLoopbackCertificate(), (request, response) => {
  const upstream = http.request({
    hostname: "127.0.0.1",
    port: upstreamPort,
    path: request.url,
    method: request.method,
    headers: {
      ...request.headers,
      host: `127.0.0.1:${publicPort}`,
      "x-forwarded-host": `127.0.0.1:${publicPort}`,
      "x-forwarded-proto": "https",
    },
  }, (upstreamResponse) => {
    response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
    upstreamResponse.pipe(response);
  });
  upstream.on("error", () => {
    if (!response.headersSent) response.writeHead(502);
    response.end("Dashboard upstream is not ready.");
  });
  request.pipe(upstream);
});

proxy.listen(publicPort, "127.0.0.1");

function shutdown(signal) {
  proxy.close(() => process.exit(0));
  dashboard.kill(signal);
  setTimeout(() => process.exit(0), 2_000).unref();
}

dashboard.once("exit", (code, signal) => {
  proxy.close();
  process.exitCode = code ?? (signal ? 1 : 0);
});
process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
