import { chromium } from "playwright";

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=metal"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

await page.goto("http://127.0.0.1:5184/");
await page.waitForFunction(() => {
  const btn = document.querySelector("#launch");
  return btn && !btn.disabled;
}, { timeout: 30000 });
await page.click("#launch");
await page.waitForTimeout(3000);

const assetsMap = await page.evaluate(() => {
  const ll = window.__lastLight;
  const view = ll.view();
  const entries = [];
  for (const [k, v] of view.interplanetary.downloadedAssets.entries()) {
    entries.push({
      key: k,
      visible: v.visible,
      parent: v.parent?.constructor.name || null,
      children: v.children.length,
      pos: { x: v.position.x, y: v.position.y, z: v.position.z },
    });
  }
  return {
    downloadedEntries: entries,
    corridorVisible: view.interplanetary.corridorGroup.visible,
    inCorridor: view.interplanetary.inCorridor,
    activeShip: view.interplanetary.activeShip,
    shipMeshesCount: view.interplanetary.shipMeshes.size,
    planetsCount: view.interplanetary.planets.size,
    mineralChildren: view.interplanetary.mineralNodes.children.length,
    activeWeapon: view.activeWeapon,
    fpRifleVisible: view.fpRifle?.visible,
    toolModelVisible: view.toolModel.visible,
  };
});
console.log("Assets map in game:", JSON.stringify(assetsMap, null, 2));

await browser.close();
process.exit(0);
