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
await page.waitForTimeout(3500);

const info = await page.evaluate(() => {
  const ll = window.__lastLight;
  const ip = ll.view().interplanetary;
  const THREE = window.THREE || window.__lastLight.view().scene.constructor.prototype;
  // Let's get THREE constructor from an existing object
  const dummy = window.__lastLight.view().camera.position.clone();
  const Box3 = dummy.constructor.name === 'Vector3' ? window.__lastLight.view().camera.position.constructor : null;
  // Alternatively, just inspect position, scale, and children
  const res = {};
  for (const [k, v] of ip.downloadedAssets.entries()) {
    res[k] = {
      visible: v.visible,
      pos: { x: +v.position.x.toFixed(2), y: +v.position.y.toFixed(2), z: +v.position.z.toFixed(2) },
      scale: { x: +v.scale.x.toFixed(4), y: +v.scale.y.toFixed(4), z: +v.scale.z.toFixed(4) },
      parent: v.parent ? (v.parent.name || v.parent.type) : 'none',
      childrenCount: v.children.length
    };
  }
  return res;
});

console.log(JSON.stringify(info, null, 2));
await browser.close();
process.exit(0);
