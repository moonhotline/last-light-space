import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const MODELS = [
  { key: "hmg-379", title: "01 / HMG-379 重型电磁突击机枪", subtitle: "Sketchfab (533204d3a9f240f78b65973b323cba7c) · 战术科技枪械", angleY: 0.8 },
  { key: "blerk", title: "02 / Blerk The Alien 外星向导", subtitle: "Sketchfab (86aebb842059480697a6eaaa87425a4a) · 友方领航员角色", angleY: 0.3 },
  { key: "alien1", title: "03 / Another Alien 敏捷突进异兽", subtitle: "Sketchfab (18e8a671ba15466390108c01e190a989) · 敌对生物 1", angleY: 0.6 },
  { key: "alien2", title: "04 / Reptillian Alien 重装蜥蜴异兽", subtitle: "Sketchfab (4ec6a2ed140b4dcaba5f3bd6c06fd475) · 敌对生物 2", angleY: 0.5 },
  { key: "stylized_planet", title: "05 / Stylized Planet 生机新星", subtitle: "Sketchfab (789725db86f547fc9163b00f302c3e70) · 绿意盎然生态球体", angleY: 0.0 },
  { key: "mercury", title: "06 / Mercury Planet 水星陨坑球体", subtitle: "Sketchfab (ccb6c6a9ac3742109cc67c0f16032b49) · 替换月球天体", angleY: 0.0 },
  { key: "cave", title: "07 / Cave on Alien Planet 异星洞窟", subtitle: "Sketchfab (25aebeb12d8b481190bef3e86c3c2ddf) · 地下洞窟探险场景", angleY: 0.5 },
  { key: "sky", title: "08 / Fantasy Sky 梦幻异星天气球", subtitle: "Sketchfab (15c79bb2fc1147128039fe4ff90fd5a0) · 极光霞光动态天气系统", angleY: 0.0 },
  { key: "minerals", title: "09 / Mineral Samples 自然博物馆矿物", subtitle: "Sketchfab (f3da55f7fedb41adb3c57bd70c6ada76) · 地质矿石群落系统", angleY: 0.4 },
  { key: "earth", title: "10 / Earth PBR 真实地球", subtitle: "Sketchfab (5f9c35be31a047928eace8b415a8ee3a) · 替换母星真实大洋陆地", angleY: -0.4 },
  { key: "solar_system", title: "11 / Simple Solar System 太阳系航线", subtitle: "Sketchfab (e1448a9bebb449dea6c11f7e42021594) · 太阳系轨道与深空航线", angleY: 0.2 },
  { key: "corridor", title: "12 / Spaceship Corridor 飞船走廊内部", subtitle: "Sketchfab (1cdd1db557b8428892af4773bdada913) · 飞船舱内走廊场景", angleY: 1.57 },
  { key: "fighter", title: "13 / Light Fighter Spaceship 轻型战机", subtitle: "Sketchfab (51616ef53af84fe595c5603cd3e0f3e1) · 高机动穿梭战机", angleY: 0.6 },
  { key: "intergalactic", title: "14 / Intergalactic Spaceship 跃迁母舰", subtitle: "Sketchfab (d36e54a3118744c8ba1a4a47b408b659) · 重型星际探索母舰", angleY: 0.5 },
];

const DOCS_DIR = path.resolve("docs/space-escape/models-preview");
const ARTIFACT_DIR = "/Users/alexander/.gemini/antigravity/brain/013ef81d-829f-4fd7-8a71-eafb47b02bc2";

fs.mkdirSync(DOCS_DIR, { recursive: true });

console.log("Starting Vite dev server on port 5199...");
const vite = spawn("npx", ["vite", "--config", "frontend/space-escape/vite.config.ts", "--port", "5199"], {
  stdio: ["pipe", "pipe", "pipe"],
  env: { ...process.env, SPACE_WEB_PORT: "5199" },
});

vite.stderr.on("data", (d) => console.error("Vite err:", d.toString()));

let readyToTest = false;
vite.stdout.on("data", (d) => {
  const str = d.toString();
  if (str.includes("5199") || str.includes("Local:")) {
    readyToTest = true;
  }
});

// Wait for vite server
for (let i = 0; i < 30; i++) {
  if (readyToTest) break;
  await new Promise((r) => setTimeout(r, 200));
}

console.log("Vite ready! Launching Playwright browser...");
const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=metal"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

page.on("console", (m) => {
  if (m.type() === "error") console.error("[BROWSER ERROR]:", m.text());
});

await page.goto("http://127.0.0.1:5199/model-viewer.html");
await page.waitForTimeout(1000);

const results = [];

for (let i = 0; i < MODELS.length; i++) {
  const m = MODELS[i];
  console.log(`[${i + 1}/${MODELS.length}] Rendering ${m.title}...`);
  try {
    const meta = await page.evaluate(
      ({ key, title, subtitle, angleY }) => window.__renderModel(key, title, subtitle, angleY),
      m,
    );
    await page.waitForTimeout(800);

    const docPath = path.join(DOCS_DIR, `${m.key}.png`);
    const artPath = path.join(ARTIFACT_DIR, `${m.key}.png`);

    await page.screenshot({ path: docPath });
    fs.copyFileSync(docPath, artPath);

    console.log(`  -> Saved: ${docPath}`);
    console.log(`  -> Meshes: ${meta.meshCount}, Triangles: ${meta.triCount.toLocaleString()}, Size: ${meta.size.x}m x ${meta.size.y}m x ${meta.size.z}m`);
    results.push(meta);
  } catch (err) {
    console.error(`  -> Failed to render ${m.key}:`, err);
  }
}

fs.writeFileSync(
  path.join(DOCS_DIR, "manifest.json"),
  JSON.stringify(results, null, 2),
);

console.log(`\nSuccessfully rendered all ${results.length}/${MODELS.length} models!`);
await browser.close();
vite.kill();
process.exit(0);
