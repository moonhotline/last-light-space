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

const findGiant = await page.evaluate(() => {
  const ll = window.__lastLight;
  const view = ll.view();
  const giantObjects = [];
  view.scene.traverse((node) => {
    if (node.isMesh) {
      if (node.scale.x > 3 || node.parent?.scale.x > 3) {
        giantObjects.push({
          name: node.name,
          parentName: node.parent?.name,
          parentType: node.parent?.constructor.name,
          scale: { x: node.scale.x, y: node.scale.y, z: node.scale.z },
          parentScale: node.parent ? { x: node.parent.scale.x, y: node.parent.scale.y, z: node.parent.scale.z } : null,
          pos: node.parent ? { x: node.parent.position.x, y: node.parent.position.y, z: node.parent.position.z } : null,
        });
      }
    }
  });
  return giantObjects;
});
console.log("Giant objects in scene:", JSON.stringify(findGiant, null, 2));

await browser.close();
process.exit(0);
