import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import forge from "node-forge";

function discoverLanIp() {
  for (const addresses of Object.values(os.networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === "IPv4" && !address.internal && !address.address.startsWith("169.254.")) {
        return address.address;
      }
    }
  }
  throw new Error("تعذر اكتشاف عنوان IPv4 للشبكة المحلية.");
}

const networkIp = process.argv[2]?.trim() || discoverLanIp();
const outputDirectory = path.resolve(process.cwd(), ".certificates", "local-network");
const keyPath = path.join(outputDirectory, "qarar-local.key.pem");
const certificatePath = path.join(outputDirectory, "qarar-local.cert.pem");
const metadataPath = path.join(outputDirectory, "certificate.json");

fs.mkdirSync(outputDirectory, { recursive: true });

if (fs.existsSync(keyPath) && fs.existsSync(certificatePath) && fs.existsSync(metadataPath)) {
  const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
  if (metadata.networkIp === networkIp) {
    process.stdout.write(`${JSON.stringify({ networkIp, keyPath, certificatePath })}\n`);
    process.exit(0);
  }
}

const keys = forge.pki.rsa.generateKeyPair(2048);
const certificate = forge.pki.createCertificate();
certificate.publicKey = keys.publicKey;
certificate.serialNumber = forge.util.bytesToHex(forge.random.getBytesSync(16)).replace(/^0/, "1");
certificate.validity.notBefore = new Date(Date.now() - 5 * 60 * 1000);
certificate.validity.notAfter = new Date();
certificate.validity.notAfter.setFullYear(certificate.validity.notAfter.getFullYear() + 2);

const attributes = [
  { name: "commonName", value: networkIp },
  { name: "organizationName", value: "Qarar Local Development" },
];
certificate.setSubject(attributes);
certificate.setIssuer(attributes);
certificate.setExtensions([
  { name: "basicConstraints", cA: false },
  { name: "keyUsage", digitalSignature: true, keyEncipherment: true },
  { name: "extKeyUsage", serverAuth: true },
  {
    name: "subjectAltName",
    altNames: [
      { type: 7, ip: networkIp },
      { type: 7, ip: "127.0.0.1" },
      { type: 2, value: "localhost" },
    ],
  },
]);
certificate.sign(keys.privateKey, forge.md.sha256.create());

fs.writeFileSync(keyPath, forge.pki.privateKeyToPem(keys.privateKey), { mode: 0o600 });
fs.writeFileSync(certificatePath, forge.pki.certificateToPem(certificate));
fs.writeFileSync(metadataPath, `${JSON.stringify({ networkIp, keyPath, certificatePath, generatedAt: new Date().toISOString() }, null, 2)}\n`);

process.stdout.write(`${JSON.stringify({ networkIp, keyPath, certificatePath })}\n`);
