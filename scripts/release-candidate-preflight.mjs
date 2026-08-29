import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";

const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const sha = git("rev-parse", "HEAD");
const branch = git("branch", "--show-current") || "detached";
const dirty = git("status", "--porcelain").split(/\r?\n/).filter(Boolean);
const report = {
  generated_at: new Date().toISOString(),
  commit_sha: sha,
  branch,
  clean_worktree: dirty.length === 0,
  changed_paths: dirty.length,
  decision: dirty.length === 0 ? "eligible-for-ci" : "no-go-dirty-worktree",
};
await mkdir(".production-reports", { recursive: true });
await writeFile(".production-reports/release-candidate.json", `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (dirty.length) process.exitCode = 1;
