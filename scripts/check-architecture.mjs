#!/usr/bin/env node
/**
 * Machine-enforceable architecture guardrails for Last Light (space-escape).
 *
 * Enforces:
 * 1. Zero circular dependencies (runtime or type-only) across shared/, src/, server/, party/.
 * 2. Strict layer boundaries (shared/ is leaf & DOM-free; server/ & party/ never import src/;
 *    src/ never imports server/ or party/; shared/types.ts never imports simulation/physics/adventure).
 * 3. Vite physics chunk isolation: src/ never statically imports shared/physics.ts.
 * 4. Canonical multiplayer room protocol: server/index.ts, party/index.ts, party/worker.ts
 *    all delegate to RoomSession from shared/room-session.ts without duplicating cooldown rules.
 * 5. Single Source of Truth for warp gate IDs (owned by shared/celestial.ts).
 * 6. Zero unsafe DOM HTML injection (.innerHTML =/+=, .outerHTML =/+=, .insertAdjacentHTML, document.write) in src/.
 * 7. Zero emoji or regional indicator characters in code, HTML, and architecture docs (per AGENTS.md).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LAYERS = ["shared", "src", "server", "party"];
const EMOJI_RE = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u;

const REGEX_PRECEDING_KEYWORDS = new Set([
  "return",
  "case",
  "throw",
  "in",
  "of",
  "typeof",
  "void",
  "delete",
  "await",
  "yield",
  "new",
  "else",
  "do",
]);

const REGEX_PRECEDING_PUNCT = new Set([
  "(",
  "[",
  "{",
  ",",
  ";",
  ":",
  "=",
  "!",
  "?",
  "&",
  "|",
  "^",
  "~",
  "+",
  "-",
  "*",
  "%",
  "<",
  ">",
]);

/**
 * Recursive-descent JS/TS lexer that strips comments and optionally strips
 * string/template-quasi/regex literal bodies while preserving line numbers
 * and executable code inside `${...}` template expressions.
 */
function scanJsTs(source, { stripStrings }) {
  const n = source.length;
  const out = [];
  let i = 0;

  const maskChar = (ch) => (ch === "\n" ? "\n" : " ");

  function scanBlock(stopOnBrace) {
    let braceDepth = 0;
    let canStartRegex = true;

    while (i < n) {
      const ch = source[i];
      const next = source[i + 1];

      // End of `${...}` template expression
      if (stopOnBrace && ch === "}" && braceDepth === 0) {
        out.push(stripStrings ? " " : "}");
        i++;
        return;
      }

      // Whitespace preserves regex context
      if (ch === " " || ch === "\t" || ch === "\r" || ch === "\n") {
        out.push(ch);
        i++;
        continue;
      }

      // Line comment
      if (ch === "/" && next === "/") {
        out.push("  ");
        i += 2;
        while (i < n && source[i] !== "\n") {
          out.push(" ");
          i++;
        }
        continue;
      }

      // Block comment
      if (ch === "/" && next === "*") {
        out.push("  ");
        i += 2;
        while (i < n && !(source[i] === "*" && source[i + 1] === "/")) {
          out.push(maskChar(source[i]));
          i++;
        }
        if (i < n) {
          out.push("  ");
          i += 2;
        }
        continue;
      }

      // Regex literal
      if (ch === "/" && canStartRegex) {
        out.push(stripStrings ? " " : "/");
        i++;
        let inCharClass = false;
        while (i < n) {
          const rc = source[i];
          if (rc === "\\" && i + 1 < n) {
            out.push(stripStrings ? maskChar(rc) + maskChar(source[i + 1]) : rc + source[i + 1]);
            i += 2;
            continue;
          }
          if (rc === "[") {
            inCharClass = true;
          } else if (rc === "]" && inCharClass) {
            inCharClass = false;
          } else if (rc === "/" && !inCharClass) {
            out.push(stripStrings ? " " : "/");
            i++;
            while (i < n && /[a-z]/i.test(source[i])) {
              out.push(stripStrings ? " " : source[i]);
              i++;
            }
            break;
          } else if (rc === "\n") {
            out.push("\n");
            i++;
            break;
          }
          out.push(stripStrings ? maskChar(rc) : rc);
          i++;
        }
        canStartRegex = false;
        continue;
      }

      // Single or double quoted string
      if (ch === "'" || ch === '"') {
        const quote = ch;
        out.push(stripStrings ? " " : quote);
        i++;
        while (i < n && source[i] !== quote) {
          if (source[i] === "\\" && i + 1 < n) {
            out.push(
              stripStrings
                ? maskChar(source[i]) + maskChar(source[i + 1])
                : source[i] + source[i + 1],
            );
            i += 2;
          } else {
            out.push(stripStrings ? maskChar(source[i]) : source[i]);
            i++;
          }
        }
        if (i < n) {
          out.push(stripStrings ? " " : source[i]);
          i++;
        }
        canStartRegex = false;
        continue;
      }

      // Template literal (preserve executable code inside `${...}`)
      if (ch === "`") {
        out.push(stripStrings ? " " : "`");
        i++;
        while (i < n) {
          const tc = source[i];
          if (tc === "\\" && i + 1 < n) {
            out.push(
              stripStrings
                ? maskChar(tc) + maskChar(source[i + 1])
                : tc + source[i + 1],
            );
            i += 2;
            continue;
          }
          if (tc === "$" && source[i + 1] === "{") {
            out.push(stripStrings ? "  " : "${");
            i += 2;
            scanBlock(true);
            continue;
          }
          if (tc === "`") {
            out.push(stripStrings ? " " : "`");
            i++;
            break;
          }
          out.push(stripStrings ? maskChar(tc) : tc);
          i++;
        }
        canStartRegex = false;
        continue;
      }

      // Track nested braces inside template expressions
      if (ch === "{") {
        if (stopOnBrace) braceDepth++;
        out.push(ch);
        i++;
        canStartRegex = true;
        continue;
      }
      if (ch === "}") {
        if (stopOnBrace && braceDepth > 0) braceDepth--;
        out.push(ch);
        i++;
        canStartRegex = true;
        continue;
      }

      // Identifiers / keywords
      if (/[A-Za-z_$]/.test(ch)) {
        const start = i;
        while (i < n && /[A-Za-z0-9_$]/.test(source[i])) i++;
        const word = source.slice(start, i);
        out.push(word);
        canStartRegex = REGEX_PRECEDING_KEYWORDS.has(word);
        continue;
      }

      // Numbers
      if (/[0-9]/.test(ch)) {
        const start = i;
        while (i < n && /[0-9A-Za-z_.]/.test(source[i])) i++;
        out.push(source.slice(start, i));
        canStartRegex = false;
        continue;
      }

      // Arrow `=>`
      if (ch === "=" && next === ">") {
        out.push("=>");
        i += 2;
        canStartRegex = true;
        continue;
      }

      // Punctuation / operators
      out.push(ch);
      i++;
      if (ch === ")" || ch === "]") {
        canStartRegex = false;
      } else if (REGEX_PRECEDING_PUNCT.has(ch)) {
        canStartRegex = true;
      } else {
        canStartRegex = false;
      }
    }
  }

  scanBlock(false);
  return out.join("");
}

/**
 * Strip JS/TS comments, string/regex literals, and template quasi text,
 * keeping `${...}` expressions intact and preserving line numbers.
 */
export function stripCommentsAndStrings(source) {
  return scanJsTs(source, { stripStrings: true });
}

/** Strip only comments while preserving strings, regexes, and template literals. */
export function stripCommentsOnly(source) {
  return scanJsTs(source, { stripStrings: false });
}

function collectFiles(dir, extFilter) {
  if (!fs.existsSync(dir)) return [];
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFiles(full, extFilter));
    } else if (extFilter(entry.name)) {
      results.push(full);
    }
  }
  return results.sort();
}

export function parseImports(source) {
  const clean = stripCommentsOnly(source);
  const imports = [];

  // 1. Side-effect static imports: `import "./mod"` or `import"./mod"`
  const sideEffectRe = /(?:^|[;\n])\s*import\s*["']([^"']+)["']/gm;
  let match;
  while ((match = sideEffectRe.exec(clean)) !== null) {
    imports.push({
      specifier: match[1],
      dynamic: false,
      typeOnly: false,
    });
  }

  // 2. Clause + `from` static imports/re-exports (statement-bounded; cannot cross `;`, `=`, or quotes)
  const clauseFromRe =
    /(?:^|[;\n])\s*(?:import|export)\s*(?:type\s+)?(?:\*\s*(?:as\s+[\w$]+)?|\{[^};="']*\}|[\w$]+(?:\s*,\s*(?:\*\s*as\s+[\w$]+|\{[^};="']*\}))?)\s*from\s*["']([^"']+)["']/gm;
  while ((match = clauseFromRe.exec(clean)) !== null) {
    const raw = match[0].replace(/^[\s;]+/, "");
    let typeOnly = /^(?:import|export)\s+type\b/.test(raw);
    if (!typeOnly) {
      const braceOnlyMatch = raw.match(/^(?:import|export)\s*\{([^}]*)\}\s*from\b/);
      if (braceOnlyMatch) {
        const specs = braceOnlyMatch[1]
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        typeOnly = specs.length > 0 && specs.every((s) => /^type\s+/.test(s));
      }
    }
    imports.push({
      specifier: match[1],
      dynamic: false,
      typeOnly,
    });
  }

  // 3. Dynamic imports: `import("./mod")`
  const dynamicRe = /\bimport\(\s*["']([^"']+)["']\s*\)/g;
  while ((match = dynamicRe.exec(clean)) !== null) {
    imports.push({
      specifier: match[1],
      dynamic: true,
      typeOnly: false,
    });
  }
  return imports;
}

export function resolveRelative(fromFile, specifier) {
  if (!specifier.startsWith(".")) return null;
  const base = path.resolve(path.dirname(fromFile), specifier);
  const candidates = [base, `${base}.ts`, path.join(base, "index.ts")];
  if (/\.(?:m|c)?js$/.test(base)) {
    candidates.push(base.replace(/\.(?:m|c)?js$/, ".ts"));
  }
  for (const c of candidates) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  }
  return null;
}

function layerOf(spaceRoot, filePath) {
  const rel = path.relative(spaceRoot, filePath).split(path.sep);
  return LAYERS.includes(rel[0]) ? rel[0] : null;
}

function findCycles(graph) {
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map();
  const stack = [];
  const cycles = [];
  const seenKeys = new Set();

  function dfs(node) {
    color.set(node, GRAY);
    stack.push(node);
    for (const next of graph.get(node) || []) {
      const state = color.get(next) || WHITE;
      if (state === GRAY) {
        const idx = stack.indexOf(next);
        const cycle = [...stack.slice(idx), next];
        const canonical = [...cycle.slice(0, -1)].sort().join("|");
        if (!seenKeys.has(canonical)) {
          seenKeys.add(canonical);
          cycles.push(cycle);
        }
      } else if (state === WHITE) {
        dfs(next);
      }
    }
    stack.pop();
    color.set(node, BLACK);
  }

  for (const node of graph.keys()) {
    if ((color.get(node) || WHITE) === WHITE) dfs(node);
  }
  return cycles;
}

function lineOfIndex(text, index) {
  let line = 1;
  for (let i = 0; i < index; i++) {
    if (text[i] === "\n") line++;
  }
  return line;
}

/**
 * Run all architectural invariant checks against `rootDir`.
 * Returns `{ ok, violations, stats }`.
 */
export function runArchitectureChecks(rootDir) {
  const spaceRoot = path.join(rootDir, "frontend/space-escape");
  const violations = [];

  const tsFiles = [];
  for (const layer of LAYERS) {
    tsFiles.push(
      ...collectFiles(
        path.join(spaceRoot, layer),
        (name) => name.endsWith(".ts") && !name.endsWith(".d.ts"),
      ),
    );
  }

  const graph = new Map();
  const relPath = (p) => path.relative(rootDir, p).split(path.sep).join("/");

  for (const file of tsFiles) {
    const source = fs.readFileSync(file, "utf8");
    const codeOnly = stripCommentsAndStrings(source);
    const noComments = stripCommentsOnly(source);
    const fromLayer = layerOf(spaceRoot, file);
    const fromRel = relPath(file);
    const imports = parseImports(source);
    const edges = new Set();

    for (const imp of imports) {
      const resolved = resolveRelative(file, imp.specifier);
      if (!resolved) continue;
      edges.add(resolved);

      const toLayer = layerOf(spaceRoot, resolved);
      const toRel = relPath(resolved);

      // Rule 2a: shared/ is a pure leaf layer
      if (fromLayer === "shared" && toLayer && toLayer !== "shared") {
        violations.push({
          rule: "layer-boundary",
          file: fromRel,
          message: `shared/ module must not import ${toLayer}/ (${toRel})`,
        });
      }

      // Rule 2b: server/ and party/ never import browser client src/
      if ((fromLayer === "server" || fromLayer === "party") && toLayer === "src") {
        violations.push({
          rule: "layer-boundary",
          file: fromRel,
          message: `${fromLayer}/ module must not import client src/ (${toRel})`,
        });
      }

      // Rule 2c: src/ never imports server/ or party/
      if (fromLayer === "src" && (toLayer === "server" || toLayer === "party")) {
        violations.push({
          rule: "layer-boundary",
          file: fromRel,
          message: `src/ module must not import ${toLayer}/ (${toRel})`,
        });
      }

      // Rule 2d: shared/types.ts is the wire-contract leaf
      if (
        fromRel === "frontend/space-escape/shared/types.ts" &&
        /shared\/(simulation|physics|adventure|fighter-recall)\.ts$/.test(toRel)
      ) {
        violations.push({
          rule: "types-leaf",
          file: fromRel,
          message: `shared/types.ts must not depend on ${toRel}`,
        });
      }

      // Rule 3: Keep Rapier WASM chunk lazy-loaded from browser src/
      if (
        fromLayer === "src" &&
        toRel === "frontend/space-escape/shared/physics.ts" &&
        !imp.dynamic &&
        !imp.typeOnly
      ) {
        violations.push({
          rule: "lazy-physics-chunk",
          file: fromRel,
          message: `src/ must not statically import shared/physics.ts (use dynamic import() or import type)`,
        });
      }
    }

    graph.set(file, [...edges]);

    // Rule 2e: shared/ must remain DOM-free
    if (fromLayer === "shared") {
      const domRe = /\b(window|document|localStorage|sessionStorage|HTMLCanvasElement|HTMLElement)\b/g;
      let m;
      while ((m = domRe.exec(codeOnly)) !== null) {
        violations.push({
          rule: "shared-dom-free",
          file: fromRel,
          message: `DOM global '${m[1]}' referenced in shared/ at line ${lineOfIndex(codeOnly, m.index)}`,
        });
      }
    }

    // Rule 5: Warp gate IDs SSOT (owned by shared/celestial.ts)
    if (fromRel !== "frontend/space-escape/shared/celestial.ts") {
      const warpIdRe = /["'`](warpgate_east|warpgate_south|warpgate_north|warpgate_west)["'`]/g;
      let m;
      while ((m = warpIdRe.exec(noComments)) !== null) {
        violations.push({
          rule: "warp-gate-ssot",
          file: fromRel,
          message: `Hardcoded warp gate ID '${m[1]}' at line ${lineOfIndex(noComments, m.index)}; import WARP_GATE_IDS from shared/celestial.ts`,
        });
      }
    }

    // Rule 6: Zero unsafe HTML injection in src/
    if (fromLayer === "src") {
      const htmlRe = /(\.(?:innerHTML|outerHTML)\s*\+?=|\.insertAdjacentHTML\s*\(|document\.writeln?\s*\()/g;
      let m;
      while ((m = htmlRe.exec(codeOnly)) !== null) {
        violations.push({
          rule: "no-unsafe-html",
          file: fromRel,
          message: `Unsafe HTML sink '${m[1].trim()}' at line ${lineOfIndex(codeOnly, m.index)}; use safe DOM APIs`,
        });
      }
    }
  }

  // Rule 1: Zero circular dependencies across shared/, src/, server/, party/
  const cycles = findCycles(graph);
  for (const cycle of cycles) {
    violations.push({
      rule: "no-cycles",
      file: relPath(cycle[0]),
      message: `Circular dependency detected: ${cycle.map(relPath).join(" -> ")}`,
    });
  }

  // Rule 4: Canonical multiplayer RoomSession usage across all 3 server adapters
  const roomAdapters = [
    "frontend/space-escape/server/index.ts",
    "frontend/space-escape/party/index.ts",
    "frontend/space-escape/party/worker.ts",
  ];
  for (const adapterRel of roomAdapters) {
    const adapterPath = path.join(rootDir, adapterRel);
    if (!fs.existsSync(adapterPath)) continue;
    const source = fs.readFileSync(adapterPath, "utf8");
    const imports = parseImports(source);
    const importsRoomSession = imports.some((imp) => {
      if (imp.typeOnly) return false;
      const resolved = resolveRelative(adapterPath, imp.specifier);
      return resolved !== null && relPath(resolved) === "frontend/space-escape/shared/room-session.ts";
    });
    if (!importsRoomSession) {
      violations.push({
        rule: "canonical-room-session",
        file: adapterRel,
        message: `${adapterRel} must delegate room protocol logic to shared/room-session`,
      });
    }
    if (/["'`]close-lore["'`]/.test(stripCommentsOnly(source))) {
      violations.push({
        rule: "canonical-room-session",
        file: adapterRel,
        message: `${adapterRel} must not duplicate 'close-lore' cooldown bypass logic; keep it inside RoomSession`,
      });
    }
  }

  // Rule 7: Zero emoji or regional indicator characters in code, HTML, and architecture docs (per AGENTS.md)
  const emojiTargets = [
    ...tsFiles,
    path.join(spaceRoot, "index.html"),
    ...collectFiles(path.join(rootDir, "docs/architecture"), (name) => name.endsWith(".md")),
  ].filter((p) => fs.existsSync(p));

  for (const file of emojiTargets) {
    const content = fs.readFileSync(file, "utf8");
    const lines = content.split("\n");
    for (let idx = 0; idx < lines.length; idx++) {
      if (EMOJI_RE.test(lines[idx])) {
        violations.push({
          rule: "no-emoji",
          file: relPath(file),
          message: `Emoji character disallowed by AGENTS.md at line ${idx + 1}`,
        });
      }
    }
  }

  return {
    ok: violations.length === 0,
    violations,
    stats: {
      checkedTsFiles: tsFiles.length,
      cycles: cycles.length,
      emojiCheckedFiles: emojiTargets.length,
    },
  };
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const result = runArchitectureChecks(rootDir);
  if (result.ok) {
    console.log(
      `[arch-check] PASS: ${result.stats.checkedTsFiles} TS modules checked, 0 cycles, 0 boundary/SSOT/XSS/emoji violations.`,
    );
  } else {
    console.error(`[arch-check] FAIL: ${result.violations.length} violation(s) found:`);
    for (const v of result.violations) {
      console.error(`  [${v.rule}] ${v.file}: ${v.message}`);
    }
    process.exit(1);
  }
}
