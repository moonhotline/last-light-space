import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const output = new URL("./", import.meta.url);
const origin = process.env.AUDIT_URL || "http://127.0.0.1:5180";
const models = [
  ["hmg-379", "HMG-379 机枪"],
  ["blerk", "Blerk 外星向导"],
  ["alien1", "Another Alien"],
  ["alien2", "Reptillian Alien"],
  ["stylized_planet", "绿意星球"],
  ["mercury", "水星"],
  ["earth", "地球"],
  ["cave", "异星洞窟 · 内景"],
  ["sky", "幻想天空 · 内景"],
  ["minerals", "矿物标本"],
  ["solar_system", "太阳系模型"],
  ["corridor", "飞船走廊"],
  ["fighter", "轻型战机"],
  ["intergalactic", "重型星舰"],
];
const browser = await chromium.launch({ headless: true });
const report = { origin, capturedAt: new Date().toISOString(), warnings: [], errors: [], models: [] };
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 720 } });
  page.on("pageerror", (e) => report.errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "warning") report.warnings.push(m.text());
    if (m.type() === "error") report.errors.push(m.text());
  });
  await page.goto(origin, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.__lastLight, { polling: 100 }, { timeout: 60000 });
  // Pause only the game presentation in this isolated browser. Its real loading
  // pipeline continues; no mock models or fabricated successful counts.
  await page.evaluate(() => { window.__lastLight.view().render = () => {}; });
  await page.waitForFunction(
    () => window.__lastLight.view().interplanetary.downloadedAssets.size === 14,
    { polling: 250 },
    { timeout: 120000 },
  );
  const setup = await page.evaluate(async () => {
    const THREE = await import("/@fs/Users/alexander/develop/github/last-light-space/node_modules/three/build/three.module.js");
    const view = window.__lastLight.view();
    const stage = new THREE.Scene();
    stage.background = new THREE.Color("#e6e9ec");
    stage.add(new THREE.HemisphereLight(0xffffff, 0x586271, 2));
    const key = new THREE.DirectionalLight(0xfff3df, 3);
    key.position.set(4, 6, 8);
    stage.add(key);
    const fill = new THREE.DirectionalLight(0xa4caff, 1.8);
    fill.position.set(-4, 3, -3);
    stage.add(fill);
    const camera = new THREE.PerspectiveCamera(42, 4 / 3, 0.01, 1000);
    view.renderer.setPixelRatio(1);
    view.renderer.setSize(960, 720);
    view.renderer.shadowMap.enabled = false;
    view.renderer.toneMappingExposure = 1;
    window.__audit = { THREE, view, stage, camera, current: null };
    return {
      count: view.interplanetary.downloadedAssets.size,
      assetErrors: view.interplanetary.assetErrors,
    };
  });
  Object.assign(report, setup);
  await mkdir(output, { recursive: true });
  for (const [id, name] of models) {
    const result = await page.evaluate(({ id }) => {
      const { THREE, view, stage, camera, current } = window.__audit;
      if (current) stage.remove(current);
      const model = view.interplanetary.downloadedAssets.get(id);
      if (!model) throw new Error(`Missing runtime model ${id}`);
      model.removeFromParent();
      model.visible = true;
      model.position.set(0, 0, 0);
      model.rotation.set(0, 0, 0);
      model.scale.setScalar(1);
      const group = new THREE.Group();
      group.add(model);
      stage.add(group);
      group.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(group);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      model.position.sub(center);
      group.scale.setScalar(4 / Math.max(size.x, size.y, size.z));
      group.updateMatrixWorld(true);
      let meshes = 0, triangles = 0;
      const textures = new Set();
      model.traverse((o) => {
        if (!o.isMesh) return;
        meshes++;
        triangles += (o.geometry.index?.count || o.geometry.attributes.position.count) / 3;
        for (const mat of Array.isArray(o.material) ? o.material : [o.material]) {
          for (const value of Object.values(mat)) if (value?.isTexture) textures.add(value.uuid);
        }
      });
      camera.up.set(0, 1, 0);
      camera.fov = 42;
      camera.near = 0.01;
      camera.position.set(5.5, 3.3, 7);
      camera.lookAt(0, 0, 0);
      if (id === "cave" || id === "sky") {
        camera.fov = 85;
        camera.position.set(0, 0, 0);
        camera.lookAt(0, 0, -1);
      }
      if (id === "solar_system") {
        camera.position.set(0, 5.8, 5.8);
        camera.lookAt(0, 0, 0);
      }
      camera.updateProjectionMatrix();
      view.renderer.info.reset();
      view.renderer.render(stage, camera);
      const pixels = new Uint8Array(960 * 720 * 4);
      const gl = view.renderer.getContext();
      gl.readPixels(0, 0, 960, 720, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      const colors = new Set();
      for (let i = 0; i < pixels.length; i += 16) {
        colors.add((pixels[i] << 16) | (pixels[i + 1] << 8) | pixels[i + 2]);
      }
      window.__audit.current = group;
      return {
        id, meshes, triangles, textures: textures.size,
        drawCalls: view.renderer.info.render.calls,
        pixelColors: colors.size,
        image: view.renderer.domElement.toDataURL("image/png"),
      };
    }, { id });
    if (!result.drawCalls || result.pixelColors < 30) throw new Error(`Blank render: ${id}`);
    await writeFile(new URL(`${id}.png`, output), Buffer.from(result.image.split(",")[1], "base64"));
    report.models.push({ ...result, image: undefined, name });
    console.log(`${id}: ${result.meshes} meshes, ${result.pixelColors} colors`);
  }
  const gallery = await browser.newPage({ viewport: { width: 2000, height: 1670 }, deviceScaleFactor: 1 });
  const { readFile } = await import("node:fs/promises");
  const tiles = [];
  for (const [index, [id, name]] of models.entries()) {
    const image = (await readFile(new URL(`${id}.png`, output))).toString("base64");
    const stats = report.models.find((m) => m.id === id);
    tiles.push(`<article><img src="data:image/png;base64,${image}"><div class="caption"><b>${String(index + 1).padStart(2, "0")}　${name}</b><span>已渲染</span></div><small>${id} · ${stats.meshes} meshes · ${stats.textures} textures</small></article>`);
  }
  const html = `<!doctype html><html lang="zh"><meta charset="utf-8"><title>14 模型渲染验收</title><style>
    *{box-sizing:border-box}body{margin:0;padding:32px;background:#f4f5f6;color:#19242e;font-family:Arial,"PingFang SC",sans-serif}
    header{display:flex;justify-content:space-between;align-items:center;margin-bottom:24px}h1{font-size:32px;margin:0 0 10px}p{margin:0;font-size:17px;color:#586470}.count{font-size:40px;font-weight:bold;color:#126846}
    main{display:grid;grid-template-columns:repeat(4,1fr);gap:18px}article{background:white;overflow:hidden;border:1px solid #d7dde2;border-radius:4px}
    img{display:block;width:100%;height:268px;object-fit:contain;background:#e6e9ec}.caption{display:flex;align-items:center;justify-content:space-between;padding:12px 14px 7px;font-size:17px}span{color:#126846;font-size:14px}.warn{color:#a94713}small{display:block;padding:0 14px 13px;color:#65727c;font-size:13px}
    aside{grid-column:span 2;padding:28px;border-top:3px solid #b75d2e;font-size:19px;line-height:1.8;background:#fff}aside b{color:#8e3b16}footer{font-size:15px;color:#586470;margin-top:22px}
    </style><header><div><h1>14 个模型 · 浏览器实际渲染</h1><p>本地工作区验收　|　${new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" })}　|　非线上游戏截图</p></div><div class="count">${report.count} / 14</div></header>
    <main>${tiles.join("")}<aside><b>本地验收，不等于线上完成</b><br>14 个模型取自游戏的实际加载结果，逐个渲染。<br>Blerk 已转换标准 PBR；天空已修复纹理绑定。<br>游戏内放置、交互与正式部署仍须另行验收。</aside></main><footer>Three.js / WebGL 实拍 · 截图只调整取景、尺度及灯光，使用修复后的实际运行资产。洞窟与天空为全景贴图模型，采用内部视角。</footer></html>`;
  await writeFile(new URL("gallery.html", output), html);
  await gallery.setContent(html, { waitUntil: "load" });
  await gallery.screenshot({ path: fileURLToPath(new URL("overview.png", output)), fullPage: true });
  await writeFile(new URL("report.json", output), JSON.stringify(report, null, 2));
  console.log(fileURLToPath(new URL("overview.png", output)));
} finally {
  await browser.close();
}
