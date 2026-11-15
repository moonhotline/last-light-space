import test from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

test("OKF source sync settles after its generated commit and resumes for new source edits", t => {
  const dir = mkdtempSync(join(tmpdir(), "last-light-okf-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, encoding: "utf8" });
  mkdirSync(join(dir, "scripts"));
  cpSync(new URL("../../scripts/update-okf.mjs", import.meta.url), join(dir, "scripts/update-okf.mjs"));
  cpSync(new URL("../../knowledge", import.meta.url), join(dir, "knowledge"), { recursive: true });
  mkdirSync(join(dir, "frontend/space-escape/src"), { recursive: true });
  git("init", "-q");
  git("config", "user.name", "OKF regression");
  git("config", "user.email", "okf-test@example.invalid");
  git("add", "."); git("commit", "-qm", "baseline");
  git("update-ref", "refs/remotes/origin/main", "HEAD");
  const source = join(dir, "frontend/space-escape/src/scene.ts");
  writeFileSync(source, "// Source change\n");
  git("add", "."); git("commit", "-qm", "fix: flight");
  const sync = () => execFileSync(process.execPath, ["scripts/update-okf.mjs"], {
    cwd: dir, encoding: "utf8", env: { ...process.env, GITHUB_BASE_REF: "main", GITHUB_EVENT_PATH: "" },
  });
  sync();
  assert.match(git("status", "--porcelain"), /knowledge\//);
  git("add", "knowledge"); git("commit", "-qm", "chore(okf): generated sync");
  const log = readFileSync(join(dir, "knowledge/log.md"), "utf8");
  sync();
  assert.equal(git("status", "--porcelain"), "", "bot's own commit must not generate another commit");
  assert.equal(readFileSync(join(dir, "knowledge/log.md"), "utf8"), log);
  writeFileSync(source, "// New source edit\n");
  sync();
  assert.match(git("status", "--porcelain"), /knowledge\//, "uncommitted source work still syncs");
  git("add", "."); git("commit", "-qm", "fix: further flight changes");
  const next = git("rev-parse", "--short", "HEAD").trim();
  sync();
  assert.ok(readFileSync(join(dir, "knowledge/log.md"), "utf8").includes(next));
});
