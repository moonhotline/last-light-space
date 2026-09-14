/** Record real keyboard gameplay through the same complete cooperative acceptance journey. */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../../", import.meta.url));
const url = process.env.SPACE_WEB_URL || "http://127.0.0.1:2567";
const response = await fetch(new URL("/health", url), {
  signal: AbortSignal.timeout(5000),
});
if (!response.ok)
  throw new Error(
    "Start the built room server before recording, or set SPACE_WEB_URL to its URL.",
  );
const test = spawnSync(
  process.execPath,
  [
    root + "node_modules/@playwright/test/cli.js",
    "test",
    "--config",
    "playwright.space.config.ts",
    "tests/space-escape-ui/mission.spec.ts",
    "--trace",
    "off",
  ],
  {
    cwd: root,
    env: { ...process.env, SPACE_WEB_URL: url, SPACE_RECORD: "1" },
    stdio: "inherit",
  },
);
if (test.status !== 0) process.exit(test.status || 1);
const render = spawnSync(
  "ffmpeg",
  [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    root + "docs/space-escape/echo-expedition.webm",
    "-stream_loop",
    "-1",
    "-i",
    root + "frontend/space-escape/public/assets/planet-awake.wav",
    "-c:v",
    "libx264",
    "-preset",
    "fast",
    "-crf",
    "22",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-shortest",
    "-movflags",
    "+faststart",
    root + "docs/space-escape/echo-expedition.mp4",
  ],
  { stdio: "inherit" },
);
if (render.status !== 0) process.exit(render.status || 1);
console.log(
  "Saved docs/space-escape/echo-expedition.mp4 (real gameplay, original soundtrack).",
);
