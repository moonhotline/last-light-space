import { expect, test, type Page } from "@playwright/test";
import { LAB } from "../../frontend/space-escape/shared/adventure-data";

async function startInLab(page: Page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#world")).toHaveAttribute("data-ready", "true", { timeout: 30000 });
  await page.locator("#launch").click();
  await expect(page.locator("body")).toHaveAttribute("data-phase", "active");

  await page.evaluate(lab => {
    const api = (window as any).__lastLight;
    const sim = api.sim();
    const player = sim.s.players[0];
    Object.assign(player, { x: lab.x + 4, y: lab.y + 1.125, z: lab.z, vx: 0, vy: 0, vz: 0, grounded: true });
    sim.physics.reset(player.id, player);
    api.setViewRotation(0, 0);
  }, LAB);
}

test("place both portals with real controls, see through and walk through in both directions", async ({ page }, info) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => {
    if (message.type() === "error" && /shader|WebGL/i.test(message.text())) errors.push(message.text());
  });
  await startInLab(page);
  await page.keyboard.press("4");
  await expect(page.locator("#portalBlue")).toHaveClass(/active/);
  await expect(page.locator("#portalOrange")).not.toHaveClass(/active/);
  await page.evaluate(() => (window as any).__lastLight.setViewRotation(-Math.PI / 2, 0));
  await page.evaluate(() => document.exitPointerLock());
  await page.locator("#portalOrange").click();
  await expect(page.locator("#portalOrange")).toHaveClass(/active/);

  await page.evaluate(() => (window as any).__lastLight.setViewRotation(0, 0));
  await expect.poll(() => page.evaluate(() => {
    const view = (window as any).__lastLight.view();
    const mesh = view.scene.getObjectByName("manual-portal-blue");
    const uniforms = mesh.material.uniforms;
    return mesh.visible && uniforms.preview.value;
  })).toBe(true);
  const destination = await page.evaluate(() => {
    const view = (window as any).__lastLight.view();
    const target = view.portals.portals.blue.target;
    const pixels = new Uint8Array(16 * 16 * 4);
    view.renderer.readRenderTargetPixels(target, Math.floor(target.width / 2) - 8, Math.floor(target.height / 2) - 8, 16, 16, pixels);
    return new Set(Array.from({ length: 256 }, (_, i) => pixels[i * 4] + pixels[i * 4 + 1] + pixels[i * 4 + 2])).size;
  });
  expect(destination).toBeGreaterThan(1);
  const visibleRim = await page.evaluate(() => {
    const view = (window as any).__lastLight.view();
    const mesh = view.scene.getObjectByName("manual-portal-blue");
    const renderer = view.renderer;
    const oldTarget = renderer.getRenderTarget();
    const target = new view.composer.readBuffer.constructor(320, 200);
    const read = () => {
      renderer.setRenderTarget(target);
      renderer.clear();
      renderer.render(view.scene, view.camera);
      const pixels = new Uint8Array(320 * 200 * 4);
      renderer.readRenderTargetPixels(target, 0, 0, 320, 200, pixels);
      return pixels;
    };
    try {
      mesh.visible = false;
      const wall = read();
      mesh.visible = true;
      const portal = read();
      let changed = 0;
      for (let i = 0; i < portal.length; i += 4) {
        if (portal[i + 2] > wall[i + 2] + 50 && portal[i + 2] > portal[i] + 40) changed++;
      }
      return changed;
    } finally {
      mesh.visible = true;
      renderer.setRenderTarget(oldTarget);
      target.dispose();
    }
  });
  expect(visibleRim).toBeGreaterThan(12);
  await page.screenshot({ path: info.outputPath("manual-portal.png") });

  await page.keyboard.down("w");
  await expect.poll(() => page.evaluate(() => (window as any).__lastLight.player().portalTransit)).toBe(1);
  await page.keyboard.up("w");
  const emerged = await page.evaluate(() => {
    const p = (window as any).__lastLight.player();
    return { yaw: p.yaw, vx: p.vx };
  });
  expect(emerged.yaw).toBeCloseTo(Math.PI / 2, 2);
  expect(emerged.vx).toBeLessThan(0);

  await page.evaluate(() => {
    const api = (window as any).__lastLight;
    const p = api.player();
    const exit = api.snapshot().portals.orange.center;
    api.setViewRotation(Math.atan2(p.x - exit.x, p.z - exit.z), 0);
  });
  await page.keyboard.down("w");
  try {
    await expect.poll(() => page.evaluate(() => (window as any).__lastLight.player().portalTransit), {
      timeout: 12000,
    }).toBe(2);
  } finally {
    await page.keyboard.up("w");
  }
  expect(errors).toEqual([]);
});

test.describe("touch controls", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("tap both portal colors on a narrow screen", async ({ page }) => {
    await startInLab(page);
    const blue = page.getByRole("button", { name: "放置蓝色传送门" });
    const orange = page.getByRole("button", { name: "放置橙色传送门" });
    await blue.tap({ position: { x: 22, y: 22 } });
    await expect(blue).toHaveClass(/active/);
    await page.setViewportSize({ width: 568, height: 320 });
    await page.evaluate(() => (window as any).__lastLight.setViewRotation(-Math.PI / 2, 0));
    await orange.tap({ position: { x: 22, y: 22 } });
    await expect(orange).toHaveClass(/active/);
  });
});
