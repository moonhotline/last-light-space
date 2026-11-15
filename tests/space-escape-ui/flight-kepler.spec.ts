import { test, expect } from "@playwright/test";

test("both authored hulls stay in frame with attached exhaust, and Kepler renders after a real landing", async ({ page }, testInfo) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#world")).toHaveAttribute("data-ready", "true", { timeout: 30000 });
  await page.locator("#launch").click();
  await expect(page.locator("body")).toHaveAttribute("data-phase", "active");
  await expect.poll(() => page.evaluate(() => {
    const view = (window as any).__lastLight.view();
    return view.interplanetary.downloadedAssets.has("intergalactic") && !!view.interplanetary.planets.get("kepler").highDetail;
  }), { timeout: 45000 }).toBe(true);

  for (const kind of ["light_fighter", "intergalactic"]) {
    await page.evaluate(kind => {
      const api = (window as any).__lastLight, sim = api.sim(), p = sim.s.players[0];
      Object.assign(sim.s.adventure.ship, { kind, x: 0, y: 120, z: 0, vx: 0, vy: 0, vz: -600,
        yaw: 0, bank: 0, grounded: false, repaired: true, seats: [p.id, "", "", ""] });
      Object.assign(p, { seat: 0, x: 0, y: 122.2, z: 0, yaw: 0, pitch: 0, planet: null });
      api.setViewRotation(0, 0); api.view().thirdPerson = true;
    }, kind);
    await page.keyboard.down("w"); await page.keyboard.down("Shift");
    await expect.poll(() => page.evaluate(kind => {
      const api = (window as any).__lastLight, ship = api.snapshot().adventure.ship;
      const hull = api.view().interplanetary.shipMeshes.get(kind);
      const fx = kind === "light_fighter" ? api.view().adventure.propulsionFX : api.view().adventure.intergalacticPropulsionFX;
      return fx.rootGroup.parent === hull && ship.z < -50;
    }, kind)).toBe(true);
    await expect.poll(() => page.evaluate(() => {
      const ship = (window as any).__lastLight.snapshot().adventure.ship;
      return Math.hypot(ship.vx, ship.vy, ship.vz);
    }), { timeout: 30000 }).toBeGreaterThan(599);
    const frame = await page.evaluate(kind => {
      const api = (window as any).__lastLight, view = api.view(), hull = view.interplanetary.shipMeshes.get(kind);
      const model = kind === "light_fighter" ? hull.children.find((n: any) => n.userData.chassisClearance !== undefined) : view.interplanetary.downloadedAssets.get("intergalactic");
      const bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
      model.updateWorldMatrix(true, true);
      model.traverse((node: any) => {
        if (!node.isMesh) return;
        const positions = node.geometry.attributes.position, point = hull.position.clone();
        for (let i = 0; i < positions.count; i++) {
          point.fromBufferAttribute(positions, i).applyMatrix4(node.matrixWorld).project(view.camera);
          bounds.minX = Math.min(bounds.minX, point.x); bounds.maxX = Math.max(bounds.maxX, point.x);
          bounds.minY = Math.min(bounds.minY, point.y); bounds.maxY = Math.max(bounds.maxY, point.y);
        }
      });
      const fx = kind === "light_fighter" ? view.adventure.propulsionFX : view.adventure.intergalacticPropulsionFX;
      const position = fx.rootGroup.getWorldPosition(hull.position.clone());
      return { bounds, separation: position.distanceTo(hull.position), speed: Math.hypot(api.snapshot().adventure.ship.vx, api.snapshot().adventure.ship.vy, api.snapshot().adventure.ship.vz) };
    }, kind);
    expect(frame.separation).toBeLessThan(1e-6);
    expect(frame.speed).toBeGreaterThan(590); expect(frame.speed).toBeLessThanOrEqual(600.000001);
    expect(frame.bounds.minX).toBeGreaterThan(-0.95); expect(frame.bounds.maxX).toBeLessThan(0.95);
    expect(frame.bounds.minY).toBeGreaterThan(-0.95); expect(frame.bounds.maxY).toBeLessThan(0.95);
    await page.screenshot({ path: testInfo.outputPath(`${kind}-600.png`) });
    await page.keyboard.up("w"); await page.keyboard.up("Shift");
  }

  await page.evaluate(() => {
    const api = (window as any).__lastLight, sim = api.sim(), body = api.solarSystem.kepler, p = sim.s.players[0];
    Object.assign(sim.s.adventure.ship, { x: body.position.x, y: body.position.y + body.radius + 1,
      z: body.position.z, vx: 0, vy: -5, vz: 0, yaw: 0, bank: 0, grounded: false });
    Object.assign(p, { x: body.position.x, y: body.position.y + body.radius + 3.2, z: body.position.z, planet: "kepler" });
    api.setViewRotation(0, 0); api.view().thirdPerson = false;
  });
  await expect.poll(() => page.evaluate(() => (window as any).__lastLight.snapshot().adventure.ship.grounded)).toBe(true);
  await page.keyboard.press("e");
  await expect.poll(() => page.evaluate(() => (window as any).__lastLight.player().seat)).toBe(-1);
  await expect.poll(() => page.evaluate(() => (window as any).__lastLight.player().planet)).toBe("kepler");
  await page.evaluate(() => (window as any).__lastLight.setViewRotation(0, -0.35));
  // A real framebuffer sample must change when the actual authored crust is hidden.
  const surface = await page.evaluate(() => {
    const view = (window as any).__lastLight.view(), entry = view.interplanetary.planets.get("kepler");
    const target = new view.composer.readBuffer.constructor(64, 64);
    const renderer = view.renderer, prior = renderer.getRenderTarget();
    const sample = () => {
      renderer.setRenderTarget(target); renderer.render(view.scene, view.camera);
      const pixels = new Uint8Array(64 * 64 * 4); renderer.readRenderTargetPixels(target, 0, 0, 64, 64, pixels); return pixels;
    };
    const terrain: any[] = [];
    entry.highDetail.traverse((node: any) => { if (node.isMesh && node.material.name === "Planet") terrain.push(node); });
    const withCrust = sample(); terrain.forEach(node => node.visible = false);
    const withoutCrust = sample(); terrain.forEach(node => node.visible = true);
    renderer.setRenderTarget(prior); target.dispose();
    let changed = 0;
    for (let i = 0; i < withCrust.length; i += 4) if (Math.abs(withCrust[i] - withoutCrust[i]) + Math.abs(withCrust[i + 1] - withoutCrust[i + 1]) + Math.abs(withCrust[i + 2] - withoutCrust[i + 2]) > 15) changed++;
    return { changed, scale: entry.group.scale.x };
  });
  expect(surface.changed).toBeGreaterThan(500); expect(surface.scale).toBe(1);
  await page.screenshot({ path: testInfo.outputPath("kepler-landed.png") });
  expect(errors).toEqual([]);
});
