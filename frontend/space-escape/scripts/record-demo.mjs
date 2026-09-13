/** Record actual keyboard play; no teleports, clock edits, or hidden state mutations. */
import { chromium } from "playwright";
import { mkdir, copyFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../../", import.meta.url));
const output = root + "docs/space-escape/";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: ["--use-angle=metal"],
});
const context = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  recordVideo: {
    dir: root + "frontend/space-escape/.runtime/recording",
    size: { width: 1280, height: 720 },
  },
});
const page = await context.newPage(),
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
const pos = () => page.evaluate(() => window.__lastLight.position());
const milestones = [];
async function wait(check, limit = 25000) {
  const end = Date.now() + limit;
  while (Date.now() < end) {
    if (await check()) return;
    await page.waitForTimeout(60);
  }
  throw Error("Traversal timed out: " + JSON.stringify(await pos()));
}
async function travel(x, z, fly = false, land = false) {
  const held = new Set();
  await page.keyboard.down("ShiftLeft");
  if (fly) await page.keyboard.down("Space");
  try {
    await wait(async () => {
      const p = await pos(),
        dx = x - p.x,
        dz = z - p.z;
      if (Math.hypot(dx, dz) < 5 && (!land || p.grounded)) return true;
      const f = -Math.sin(p.yaw) * dx - Math.cos(p.yaw) * dz,
        s = Math.cos(p.yaw) * dx - Math.sin(p.yaw) * dz,
        want = new Set();
      if (Math.abs(s) > 2) want.add(s > 0 ? "KeyD" : "KeyA");
      if (Math.abs(f) > 2) want.add(f > 0 ? "KeyW" : "KeyS");
      for (const k of held)
        if (!want.has(k)) {
          await page.keyboard.up(k);
          held.delete(k);
        }
      for (const k of want)
        if (!held.has(k)) {
          await page.keyboard.down(k);
          held.add(k);
        }
      return false;
    });
  } finally {
    for (const k of held) await page.keyboard.up(k);
    await page.keyboard.up("ShiftLeft");
    if (fly) await page.keyboard.up("Space");
  }
}
async function activate(id) {
  await wait(async () => (await pos()).grounded);
  await page.keyboard.down("KeyE");
  try {
    await wait(
      async () =>
        page.evaluate(
          (i) => window.__lastLight.snapshot().beacons[i].active,
          id,
        ),
      8000,
    );
  } finally {
    await page.keyboard.up("KeyE");
  }
  milestones.push({
    beacon: id,
    time: await page.evaluate(() => window.__lastLight.snapshot().time),
  });
}
try {
  await page.goto(process.env.SPACE_WEB_URL || "http://127.0.0.1:5180");
  await page.waitForFunction(
    () => document.querySelector("#world").dataset.ready === "true",
  );
  await page.waitForTimeout(1000);
  await page.locator("#launch").click();
  await page.waitForFunction(() => document.body.dataset.phase === "active");
  await travel(0, 285);
  await travel(-40, 160, false, true);
  await activate(0);
  await travel(-10, 95);
  await wait(async () => (await pos()).fuel > 135);
  await travel(100, 50, true);
  await travel(180, -90, false, true);
  await activate(1);
  await travel(130, -170);
  await travel(20, -235);
  await travel(-110, -370, false, true);
  await activate(2);
  await page.locator("#explore").click();
  await travel(-99, -380, false, true);
  await page.keyboard.down("KeyI");
  await page.waitForTimeout(230);
  await page.keyboard.up("KeyI");
  await page.keyboard.press("KeyV");
  await page.keyboard.press("KeyH");
  await page.waitForTimeout(36000);
  await page.screenshot({ path: output + "planet-panorama.png" });
  await page.keyboard.down("ArrowLeft");
  await page.waitForTimeout(280);
  await page.keyboard.up("ArrowLeft");
  await page.waitForTimeout(1800);
  await page.screenshot({ path: output + "planet-moonrise.png" });
  console.log(
    JSON.stringify({
      milestones,
      errors,
      rendering: await page.evaluate(() => window.__lastLight.rendering()),
    }),
  );
} finally {
  const video = page.video();
  await context.close();
  if (video)
    await copyFile(await video.path(), output + "planet-expedition.webm");
  await browser.close();
}
const ffmpeg = spawnSync(
  "/opt/homebrew/bin/ffmpeg",
  [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    output + "planet-expedition.webm",
    "-stream_loop",
    "-1",
    "-i",
    root + "frontend/space-escape/public/assets/planet-awake.wav",
    "-vf",
    "setpts=0.62*PTS,fps=30",
    "-af",
    "volume=0.55",
    "-c:v",
    "libx264",
    "-preset",
    "fast",
    "-crf",
    "20",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-shortest",
    "-movflags",
    "+faststart",
    output + "planet-expedition.mp4",
  ],
  { stdio: "inherit" },
);
if (ffmpeg.status) throw Error("FFmpeg export failed");
await writeFile(
  output + "planet-recording.json",
  JSON.stringify(
    { source: "actual keyboard input", playbackSpeed: 1 / 0.62, milestones },
    null,
    2,
  ),
);
console.log("Exported docs/space-escape/planet-expedition.mp4");
