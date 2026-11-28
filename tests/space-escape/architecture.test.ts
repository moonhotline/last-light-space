import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseImports,
  runArchitectureChecks,
  stripCommentsAndStrings,
} from "../../scripts/check-architecture.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("architecture guardrails pass with zero cycles, boundary leaks, XSS sinks, or emoji", () => {
  const result = runArchitectureChecks(REPO_ROOT);
  assert.equal(
    result.ok,
    true,
    `Architecture check failed:\n${result.violations
      .map((v: { rule: string; file: string; message: string }) => `[${v.rule}] ${v.file}: ${v.message}`)
      .join("\n")}`,
  );
  assert.equal(result.stats.cycles, 0);
  assert.ok(result.stats.checkedTsFiles >= 40, "expected full module graph to be scanned");
});

test("stripCommentsAndStrings masks comments, strings, and regexes while preserving template expressions", () => {
  const sample = [
    "// el.innerHTML = 'commented'",
    "/* block window.document */",
    "const msg = 'el.innerHTML = 1';",
    "const re = /'/;",
    "const blockRe = /[/*]/;",
    "const tpl = `safe ${(el.innerHTML = 'live')} ${({ a: 1 }).a}`;",
    "el.innerHTML += 'append';",
  ].join("\n");
  const stripped = stripCommentsAndStrings(sample);
  assert.equal(stripped.split("\n").length, sample.split("\n").length);
  const matches = stripped.match(/\.innerHTML\s*\+?=/g) || [];
  assert.equal(matches.length, 2, "expected both template expression and += HTML sinks to survive stripping");
  assert.ok(!/\bwindow\b/.test(stripped));
});

test("parseImports handles compact ESM, side-effect imports, and export type preceding runtime imports", () => {
  const source = [
    `export type Foo = { x: number };`,
    `import { initPhysics } from "../shared/physics";`,
    `export const msg = "from './fake'";`,
    `import "../shared/side-effect";`,
    `import{a}from"./compact.js";`,
    `import*as ns from"./star";`,
    `import { type OnlyType } from "../shared/physics";`,
  ].join("\n");
  const parsed = parseImports(source);
  const physicsImports = parsed.filter((p: { specifier: string }) => p.specifier === "../shared/physics");
  assert.equal(physicsImports.length, 2);
  assert.equal(physicsImports[0].typeOnly, false, "runtime import after export type must not be marked typeOnly");
  assert.equal(physicsImports[1].typeOnly, true, "inline type-only import must be marked typeOnly");
  assert.ok(parsed.some((p: { specifier: string }) => p.specifier === "../shared/side-effect"));
  assert.ok(parsed.some((p: { specifier: string }) => p.specifier === "./compact.js"));
  assert.ok(parsed.some((p: { specifier: string }) => p.specifier === "./star"));
  assert.ok(!parsed.some((p: { specifier: string }) => p.specifier === "./fake"));
});

test("architecture guardrails catch cycles, layer leaks, bypass attempts, HTML sinks, warp IDs, and emoji", (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "last-light-arch-"));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const write = (rel: string, content: string) => {
    const full = path.join(tmp, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, "utf8");
  };

  write("frontend/space-escape/shared/a.ts", "import { b } from './b';\nexport const a = `${window.location}` + b;\n");
  write("frontend/space-escape/shared/b.ts", `import { a } from "./a";\nexport const b = a;\n`);
  write("frontend/space-escape/shared/physics.ts", `export const initPhysics = () => {};\n`);
  write("frontend/space-escape/shared/room-session.ts", `export class RoomSession {}\n`);
  write(
    "frontend/space-escape/src/bad.ts",
    [
      `export type Local = { id: string };`,
      `import { initPhysics } from "../shared/physics.js";`,
      `export function render(el: HTMLElement) {`,
      `  const re = /'/;`,
      "  const gate = `warpgate_east`;",
      "  const tpl = `${(el.innerHTML = gate)}`;",
      `  el.innerHTML += String(initPhysics) + String(re) + tpl;`,
      `}`,
    ].join("\n"),
  );
  write("frontend/space-escape/server/index.ts", `export const bad = "close-lore";\n`);
  write("frontend/space-escape/party/index.ts", `import { RoomSession } from "../shared/room-session.js";\nexport const ok = RoomSession;\n`);
  write("frontend/space-escape/index.html", `<html><body>\u{1F680}</body></html>\n`);

  const result = runArchitectureChecks(tmp);
  assert.equal(result.ok, false);
  const rules = new Set(result.violations.map((v: { rule: string }) => v.rule));
  assert.ok(rules.has("no-cycles"), "expected cycle violation");
  assert.ok(rules.has("shared-dom-free"), "expected shared DOM violation inside template expression");
  assert.ok(rules.has("lazy-physics-chunk"), "expected static .js physics import after export type to fail");
  assert.ok(rules.has("warp-gate-ssot"), "expected backtick warp gate ID violation");
  assert.ok(rules.has("no-unsafe-html"), "expected innerHTML = and += violations");
  assert.ok(rules.has("canonical-room-session"), "expected RoomSession adapter violation on server/index.ts");
  assert.ok(rules.has("no-emoji"), "expected emoji violation");

  // Verify party/index.ts importing ../shared/room-session.js passed Rule 4
  assert.ok(
    !result.violations.some((v: { file: string; rule: string }) => v.file === "frontend/space-escape/party/index.ts" && v.rule === "canonical-room-session"),
    "expected .js specifier resolving to shared/room-session.ts to pass Rule 4",
  );
  // Verify both innerHTML sinks in bad.ts (template expression + +=) were caught
  const htmlViolations = result.violations.filter((v: { rule: string }) => v.rule === "no-unsafe-html");
  assert.equal(htmlViolations.length, 2);
});
