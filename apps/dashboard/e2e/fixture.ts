import { writeFile } from "node:fs/promises";
import path from "node:path";
import { readE2EEnvironment } from "../src/lib/e2e-environment";

export const fixturePath = path.resolve(process.cwd(), ".playwright-regulations-fixture.json");

export async function dockerEnv() {
  return readE2EEnvironment();
}

export async function saveFixture(value: unknown) {
  await writeFile(fixturePath, JSON.stringify(value), "utf8");
}
