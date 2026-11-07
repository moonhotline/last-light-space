#!/usr/bin/env node
import { spawn } from "node:child_process";
import process from "node:process";

const prompt = process.argv.slice(2).join(" ");
if (!prompt) {
  console.error("Usage: node scripts/codex-task.mjs <prompt>");
  process.exit(1);
}

const MAX_RETRIES = 5;
const BASE_BACKOFF_MS = 2000;

async function runCodex(attempt = 1) {
  console.log(`\n========================================`);
  console.log(`[Codex Runner] Attempt ${attempt}/${MAX_RETRIES}`);
  console.log(`[Codex Runner] Prompt: ${prompt.slice(0, 120)}...`);
  console.log(`========================================\n`);

  return new Promise((resolve, reject) => {
    const child = spawn(
      "/opt/homebrew/bin/codex",
      ["exec", "--sandbox", "workspace-write", prompt],
      {
        stdio: "inherit",
        env: process.env,
      }
    );

    child.on("error", (err) => {
      console.error(`[Codex Runner] Process spawn error:`, err);
      reject(err);
    });

    child.on("close", (code) => {
      if (code === 0) {
        console.log(`\n[Codex Runner] Task completed successfully on attempt ${attempt}.`);
        resolve();
      } else {
        console.warn(`\n[Codex Runner] Task exited with code ${code}.`);
        reject(new Error(`Exit code ${code}`));
      }
    });
  });
}

async function main() {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await runCodex(attempt);
      process.exit(0);
    } catch (err) {
      if (attempt < MAX_RETRIES) {
        const delay = BASE_BACKOFF_MS * Math.pow(1.5, attempt - 1);
        console.log(`[Codex Runner] Retrying in ${(delay / 1000).toFixed(1)}s due to failure: ${err.message}...`);
        await new Promise((r) => setTimeout(r, delay));
      } else {
        console.error(`[Codex Runner] Failed after ${MAX_RETRIES} attempts.`);
        process.exit(1);
      }
    }
  }
}

main();
