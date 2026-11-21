import { test, expect } from "@playwright/test";
import { LAB } from "../../frontend/space-escape/shared/adventure-data";

test("new avatar animates while running and flying; first person shoots, reloads and grapples", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  await expect(page.locator("#world")).toHaveAttribute("data-ready", "true");
  await page.locator("#launch").click();
  await expect(page.locator("body")).toHaveAttribute("data-phase", "active");
  const player = () => page.evaluate(() => (window as any).__lastLight.player());
  const render = () => page.evaluate(() => (window as any).__lastLight.rendering());
  await page.keyboard.down("ShiftLeft"); await page.keyboard.down("KeyW");
  await expect.poll(async () => Math.abs((await render()).joints.leg_L)).toBeGreaterThan(.2);
  await expect.poll(async () => Math.abs((await render()).joints.shin_L)).toBeGreaterThan(.1);
  await page.screenshot({ path: "docs/space-escape/astronaut-running.png" });
  await page.keyboard.up("KeyW"); await page.keyboard.up("ShiftLeft");
  const start = (await player()).y;
  await page.keyboard.down("Space");
  await expect.poll(async () => (await player()).y).toBeGreaterThan(start + 3);
  await expect.poll(async () => (await player()).jetting).toBe(true);
  await page.screenshot({ path: "docs/space-escape/astronaut-jetpack.png" });
  await page.keyboard.up("Space");
  await page.keyboard.press("KeyV");
  await expect.poll(async () => (await render()).equipment.firstPerson).toBe(true);
  await page.locator("#world").click({ position: { x: 720, y: 450 } });
  await page.mouse.down();
  await expect.poll(async () => (await player()).ammo).toBeLessThan(24);
  await page.mouse.up();
  await page.screenshot({ path: "docs/space-escape/kinetic-first-person.png" });
  await page.keyboard.press("KeyR");
  await expect.poll(async () => (await player()).reloadTime).toBeGreaterThan(1);
  await expect(page.locator("#weaponAmmo")).toContainText("换弹");
  await expect.poll(async () => (await player()).reloadTime).toBeLessThan(1.1);
  await page.screenshot({ path: "docs/space-escape/kinetic-reload.png" });
  await expect.poll(async () => (await player()).ammo).toBe(24);
  await page.keyboard.press("Digit2");
  await expect.poll(async () => (await player()).weapon).toBe("grapple");
  await page.keyboard.down("KeyK");
  await expect.poll(async () => (await player()).pitch).toBeLessThan(-.45);
  await page.keyboard.up("KeyK");
  await page.mouse.down();
  await expect.poll(async () => (await player()).hook).not.toBeNull();
  await expect.poll(async () => (await render()).equipment.cables).toBe(1);
  await page.screenshot({ path: "docs/space-escape/echo-grapple.png" });
  await page.mouse.up();
  await expect.poll(async () => (await player()).hook).toBeNull();
  expect(errors).toEqual([]);
});

test("first-person camera and rifle are unbound, and the DX5 releases a rendered muzzle cable", async ({ page }) => {
  test.setTimeout(60000);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#world")).toHaveAttribute("data-ready", "true", { timeout: 30000 });
  await page.locator("#launch").click();
  await expect(page.locator("body")).toHaveAttribute("data-phase", "active");

  await page.keyboard.press("3");
  await expect(page.locator("#cameraViewfinder")).toBeVisible();
  expect(await page.evaluate(() => {
    const view = (window as any).__lastLight.view();
    return view.fpCamera.parent === view.toolModel && !view.scene.getObjectByName(view.fpCamera.name);
  })).toBe(true);

  await page.keyboard.press("1");
  await expect.poll(() => page.evaluate(() => {
    const view = (window as any).__lastLight.view();
    return view.fpRifle.parent === view.toolModel && !!view.fpRifle.getObjectByName("barrel_shroud");
  })).toBe(true);

  await page.evaluate(async lab => {
    const api = (window as any).__lastLight;
    const sim = api.sim();
    const p = sim.s.players[0];
    Object.assign(p, { x: lab.x + 4, y: lab.y + 1.125, z: lab.z, vx: 0, vy: 0, vz: 0, grounded: true });
    sim.physics.reset(p.id, p);
    api.setViewRotation(0, 0);
  }, LAB);
  await page.keyboard.press("q");
  await expect.poll(() => page.evaluate(() => {
    const api = (window as any).__lastLight;
    const view = api.view();
    return api.player().weapon === "grapple" &&
      [...view.adventure.ropes.values()].some((rope: any) => rope.isMesh && rope.visible);
  })).toBe(true);
  await page.keyboard.press("q");
  await expect.poll(() => page.evaluate(() => !((window as any).__lastLight.player().hook))).toBe(true);
});

test("the outpost registers only wedge sentinels and switches their detail by distance", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#world")).toHaveAttribute("data-ready", "true", { timeout: 30000 });
  await page.locator("#launch").click();
  await expect(page.locator("body")).toHaveAttribute("data-phase", "active");
  const kinds = await page.evaluate(() => (window as any).__lastLight.snapshot().adventure.drones.map((enemy: any) => enemy.kind));
  expect(kinds).toEqual(["wedge-sentinel", "wedge-sentinel", "wedge-sentinel"]);

  const lod = () => page.evaluate(() => {
    const view = (window as any).__lastLight.view();
    const group = view.adventure.drones[0];
    return group.children.filter((model: any) => model.visible).map((model: any) => model.name);
  });
  await expect.poll(lod).toEqual(["sentinel-far"]);
  await page.evaluate(lab => {
    const api = (window as any).__lastLight;
    const sim = api.sim();
    const p = sim.s.players[0];
    Object.assign(p, { x: lab.x + 4, y: lab.y + 1.125, z: lab.z, grounded: true });
    sim.physics.reset(p.id, p);
    Object.assign(sim.s.adventure.drones[0], { x: p.x, y: p.y + .8, z: p.z - 7, mode: "stunned", timer: 10 });
  }, LAB);
  await expect.poll(lod).toEqual(["sentinel-near"]);
  const triangles = await page.evaluate(() => {
    let count = 0;
    (window as any).__lastLight.view().adventure.drones[0].getObjectByName("sentinel-near").traverse((part: any) => {
      if (part.isMesh) count += (part.geometry.index?.count ?? part.geometry.attributes.position.count) / 3;
    });
    return count;
  });
  expect(triangles).toBeGreaterThanOrEqual(100000);
});
