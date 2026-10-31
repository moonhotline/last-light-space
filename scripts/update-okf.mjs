#!/usr/bin/env node
/**
 * Dynamic OKF (Open Knowledge Format) Knowledge Bundle Sync Script.
 * Automatically runs during PR creation/synchronization or pre-commit checks.
 * Detects changed source files, refreshes OKF concept frontmatter,
 * updates index.md, and appends audit logs to log.md.
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");
const KNOWLEDGE_DIR = path.join(REPO_ROOT, "knowledge");
const CONCEPTS_DIR = path.join(KNOWLEDGE_DIR, "concepts");
const INDEX_FILE = path.join(KNOWLEDGE_DIR, "index.md");
const LOG_FILE = path.join(KNOWLEDGE_DIR, "log.md");

const MODULE_CONCEPT_MAP = [
  { pattern: /shared\/physics\.ts/, concept: "concepts/movement-physics.md", name: "运动物理系统" },
  { pattern: /shared\/celestial\.ts/, concept: "concepts/celestial-system.md", name: "天体物理与大气" },
  { pattern: /shared\/interplanetary-nav\.ts/, concept: "concepts/interplanetary-nav.md", name: "星际轨道导航" },
  { pattern: /shared\/simulation\.ts/, concept: "concepts/multiplayer-simulation.md", name: "权威多人仿真" },
  { pattern: /shared\/npc-ai\.ts/, concept: "concepts/npc-tactical-ai.md", name: "NPC 战术决策" },
  { pattern: /shared\/entity-system\.ts/, concept: "concepts/ecs-entity-system.md", name: "ECS Lite 系统" },
  { pattern: /(src\/scene\.ts|shared\/lod-culling\.ts)/, concept: "concepts/rendering-pipeline.md", name: "渲染管线与 LOD" },
  { pattern: /shared\/perf-benchmark\.ts/, concept: "concepts/performance-telemetry.md", name: "性能与抖动度量" },
  { pattern: /(server\/index\.ts|party\/)/, concept: "concepts/architecture-overview.md", name: "网络架构与服务" },
];

function runGit(cmd) {
  try {
    return execSync(`git ${cmd}`, { cwd: REPO_ROOT, encoding: "utf8" }).trim();
  } catch (err) {
    return "";
  }
}

function getPRContext() {
  let prNumber = null;
  let author = "developer";
  let commitHash = runGit("rev-parse --short HEAD") || "local";
  let commitSubject = runGit("log -1 --pretty=%s") || "manual update";

  if (process.env.GITHUB_EVENT_PATH && fs.existsSync(process.env.GITHUB_EVENT_PATH)) {
    try {
      const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
      if (event.pull_request) {
        prNumber = event.pull_request.number;
        author = event.pull_request.user?.login || author;
        commitSubject = event.pull_request.title || commitSubject;
      } else if (event.pusher) {
        author = event.pusher.name || author;
      }
    } catch (e) {
      // Ignore JSON parse errors in local test
    }
  }

  if (!prNumber) {
    // Check if branch name has issue/pr id
    const branch = runGit("rev-parse --abbrev-ref HEAD");
    const match = branch.match(/(?:issue|pr)-0*(\d+)/i);
    if (match) {
      prNumber = match[1];
    }
  }

  return {
    prNumber,
    author,
    commitHash,
    commitSubject,
  };
}

function getChangedFiles() {
  let changed = [];

  // If in PR, diff against origin/main or base branch
  if (process.env.GITHUB_BASE_REF) {
    changed = runGit(`diff --name-only origin/${process.env.GITHUB_BASE_REF}...HEAD`)
      .split("\n")
      .filter(Boolean);
  }

  if (changed.length === 0) {
    // Try diff against HEAD~1 or uncommitted changes
    const diffHead1 = runGit("diff --name-only HEAD~1").split("\n").filter(Boolean);
    const diffWorking = runGit("diff --name-only").split("\n").filter(Boolean);
    const diffCached = runGit("diff --cached --name-only").split("\n").filter(Boolean);
    changed = Array.from(new Set([...diffHead1, ...diffWorking, ...diffCached]));
  }

  return changed;
}

function updateConceptTimestamp(conceptRelPath, nowIso) {
  const fullPath = path.join(KNOWLEDGE_DIR, conceptRelPath);
  if (!fs.existsSync(fullPath)) return false;

  let content = fs.readFileSync(fullPath, "utf8");
  if (content.startsWith("---")) {
    const endFm = content.indexOf("\n---", 3);
    if (endFm !== -1) {
      const fm = content.slice(3, endFm);
      let updatedFm = fm;
      if (/timestamp:\s*.+/.test(fm)) {
        updatedFm = fm.replace(/timestamp:\s*.+/, `timestamp: ${nowIso}`);
      } else {
        updatedFm = `${fm}\ntimestamp: ${nowIso}`;
      }
      content = `---${updatedFm}${content.slice(endFm)}`;
      fs.writeFileSync(fullPath, content, "utf8");
      return true;
    }
  }
  return false;
}

function updateIndex(nowIso) {
  if (!fs.existsSync(INDEX_FILE)) return;

  const conceptFiles = fs
    .readdirSync(CONCEPTS_DIR)
    .filter((f) => f.endsWith(".md"))
    .map((f) => `concepts/${f}`);

  let content = fs.readFileSync(INDEX_FILE, "utf8");
  if (content.startsWith("---")) {
    const endFm = content.indexOf("\n---", 3);
    if (endFm !== -1) {
      const fm = content.slice(3, endFm);
      let updatedFm = fm;
      if (/lastUpdated:\s*.+/.test(fm)) {
        updatedFm = fm.replace(/lastUpdated:\s*.+/, `lastUpdated: ${nowIso}`);
      } else {
        updatedFm = `${fm}\nlastUpdated: ${nowIso}`;
      }
      content = `---${updatedFm}${content.slice(endFm)}`;
      fs.writeFileSync(INDEX_FILE, content, "utf8");
    }
  }
}

function appendLog(context, affectedModules, nowStr) {
  if (!fs.existsSync(LOG_FILE)) return;

  const prText = context.prNumber ? `PR #${context.prNumber} (${context.commitHash})` : `Commit ${context.commitHash}`;
  const moduleStr = affectedModules.length > 0 ? affectedModules.join(", ") : "全库/配置同步";
  const safeSubject = context.commitSubject.replace(/\|/g, "\\|").slice(0, 80);

  const newRow = `| ${nowStr} | ${prText} | ${context.author} | ${moduleStr} | ${safeSubject} |\n`;

  let content = fs.readFileSync(LOG_FILE, "utf8");
  // Check if this commit is already logged to prevent duplicates
  if (content.includes(context.commitHash)) {
    console.log(`[OKF Sync] Commit ${context.commitHash} already recorded in log.md.`);
    return;
  }

  content = content + newRow;
  fs.writeFileSync(LOG_FILE, content, "utf8");
  console.log(`[OKF Sync] Appended entry to log.md: ${prText}`);
}

function main() {
  console.log("=========================================");
  console.log("   oodaispace OKF Knowledge Bundle Sync   ");
  console.log("=========================================");

  const now = new Date();
  const nowIso = now.toISOString();
  const nowStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  const context = getPRContext();
  const changedFiles = getChangedFiles();
  console.log(`Detected changes across ${changedFiles.length} file(s).`);

  const updatedConcepts = new Set();
  const affectedNames = new Set();

  for (const file of changedFiles) {
    for (const mapping of MODULE_CONCEPT_MAP) {
      if (mapping.pattern.test(file)) {
        if (updateConceptTimestamp(mapping.concept, nowIso)) {
          updatedConcepts.add(mapping.concept);
          affectedNames.add(mapping.name);
        }
      }
    }
  }

  updateIndex(nowIso);
  appendLog(context, Array.from(affectedNames), nowStr);

  console.log(`[OKF Sync] Completed. Synchronized ${updatedConcepts.size} concept(s).`);
  for (const c of updatedConcepts) {
    console.log(`  - Updated: ${c}`);
  }
}

main();
