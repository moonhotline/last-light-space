import { test, expect } from "@playwright/test";

test("authored ships face forward and a real warp snaps hull/camera without losing heading", async ({ page }, testInfo) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#world")).toHaveAttribute("data-ready", "true", { timeout: 30000 });
  await page.locator("#launch").click();
  await expect(page.locator("body")).toHaveAttribute("data-phase", "active");
  await expect.poll(() => page.evaluate(() => {
    const v = (window as any).__lastLight.view();
    return v.adventure.ship.children.some((c: any) => c.userData.chassisClearance !== undefined) && v.interplanetary.downloadedAssets.has("intergalactic");
  }), { timeout: 30000 }).toBe(true);
  const rotations = await page.evaluate(() => {
    const v = (window as any).__lastLight.view();
    const fighter = v.adventure.ship.children.find((c: any) => c.userData.chassisClearance !== undefined);
    return [fighter.children[0].rotation.y,
      v.interplanetary.downloadedAssets.get("intergalactic").children[0].rotation.y];
  });
  expect(rotations).toEqual([Math.PI, Math.PI]);
  await page.evaluate(() => {
    const api = (window as any).__lastLight, sim = api.sim(), ship = sim.s.adventure.ship, p = sim.s.players[0];
    Object.assign(ship, { x: 0, y: 3900, z: -8780, vx: 0, vy: 0, vz: -200,
      yaw: 0, yawVelocity: 0, grounded: false, repaired: true, seats: [p.id, "", "", ""] });
    Object.assign(p, { seat: 0, x: 0, y: 3902.2, z: -8780, yaw: 0 });
    api.setViewRotation(0, 0);
    api.view().thirdPerson = true;
  });
  await expect.poll(() => page.evaluate(() => (window as any).__lastLight.snapshot().adventure.ship.warpUntil ?? 0)).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => {
    const api = (window as any).__lastLight, ship = api.snapshot().adventure.ship, v = api.view();
    return Math.hypot(v.camera.position.x - ship.x, v.camera.position.y - ship.y, v.camera.position.z - ship.z);
  })).toBeLessThan(100);
  await expect.poll(() => page.evaluate(() => {
    const api = (window as any).__lastLight, ship = api.snapshot().adventure.ship, hull = api.view().adventure.ship;
    return Math.hypot(hull.position.x - ship.x, hull.position.y - ship.y, hull.position.z - ship.z);
  })).toBeLessThan(20);
  // Allow several real input/send/receive cycles after the traversal.
  await expect.poll(() => page.evaluate(() => {
    const s = (window as any).__lastLight.snapshot();
    return s.time > s.adventure.ship.warpUntil - 2;
  })).toBe(true);
  const after = await page.evaluate(() => {
    const s = (window as any).__lastLight.snapshot();
    return { yaw: s.adventure.ship.yaw, playerYaw: s.players[0].yaw, x: s.adventure.ship.x };
  });
  expect(after.x).toBeLessThan(8400);
  expect(after.yaw).toBeCloseTo(Math.PI / 2, 2);
  expect(after.playerYaw).toBeCloseTo(Math.PI / 2, 2);
  await page.screenshot({ path: testInfo.outputPath("warp-flight.png") });
  expect(errors).toEqual([]);
});
