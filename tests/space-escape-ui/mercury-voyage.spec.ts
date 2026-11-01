import { test, expect } from "@playwright/test";

test("Mercury Voyage: dual ships at spawn, unarmed character, space cruise parallax, Mercury landing and re-board", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  // 1. Load game
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#world")).toHaveAttribute("data-ready", "true", { timeout: 15000 });
  await page.locator("#launch").click();
  await expect(page.locator("body")).toHaveAttribute("data-phase", "active", { timeout: 10000 });

  const getPlayer = () => page.evaluate(() => (window as any).__lastLight.player());
  const getRender = () => page.evaluate(() => (window as any).__lastLight.rendering());
  const getSnapshot = () => page.evaluate(() => (window as any).__lastLight.snapshot());

  // Wait for initial frame rendering
  await expect.poll(async () => (await getRender())?.frames).toBeGreaterThan(10);

  // STAGE 1: Dual docked ships visible from frame 0, unarmed character, zero text labels
  const initialPlayer = await getPlayer();
  expect(initialPlayer.weapon).toBe("none");

  // Verify dual ships existence & spacing in the scene
  const dualShipsInfo = await page.evaluate(() => {
    const view = (window as any).__lastLight.view();
    const skiff = view.adventure.ship;
    const cruiser = view.interplanetary.cruiserModel;
    return {
      skiffPos: { x: skiff.position.x, y: skiff.position.y, z: skiff.position.z },
      cruiserPos: cruiser ? { x: cruiser.position.x, y: cruiser.position.y, z: cruiser.position.z } : null,
      skiffVisible: skiff.visible,
      cruiserVisible: cruiser ? cruiser.visible : false,
      interactionHidden: document.getElementById("interaction")?.hidden,
      targetMarkerHidden: document.getElementById("targetMarker")?.hidden,
    };
  });

  expect(dualShipsInfo.skiffVisible).toBe(true);
  expect(dualShipsInfo.cruiserVisible).toBe(true);
  expect(dualShipsInfo.cruiserPos).not.toBeNull();

  const shipSpacing = Math.hypot(
    dualShipsInfo.skiffPos.x - dualShipsInfo.cruiserPos!.x,
    dualShipsInfo.skiffPos.z - dualShipsInfo.cruiserPos!.z,
  );
  expect(shipSpacing).toBeGreaterThanOrEqual(15);
  expect(shipSpacing).toBeLessThanOrEqual(22);

  // Verify zero floating text labels over ships
  expect(dualShipsInfo.interactionHidden).toBe(true);

  // Verify 3D entity text purge on both ships
  const hasFloatingShipText = await page.evaluate(() => {
    const view = (window as any).__lastLight.view();
    let foundText = false;
    [view.adventure.ship, view.interplanetary.cruiserModel].forEach((root) => {
      if (!root) return;
      root.traverse((c: any) => {
        if (c.isSprite) foundText = true;
        const name = (c.name || "").toLowerCase();
        if (name.includes("text") || name.includes("label") || name.includes("debug")) foundText = true;
      });
    });
    return foundText;
  });
  expect(hasFloatingShipText).toBe(false);

  // Capture Screenshot 1: Dual docked ships at spawn with unarmed character
  await page.screenshot({ path: "docs/space-escape/voyage-01-dual-ships-unarmed.png" });

  // STAGE 2: Board ship & Lift off into space with velocity parallax
  // Move player close to ship boarding hatch (no mock repair state, real game loop)
  await page.evaluate(() => {
    const sim = (window as any).__lastLight.sim();
    const p = sim.s.players[0];
    const ship = sim.s.adventure.ship;
    // Position player right by the boarding hatch
    p.x = ship.x + 2;
    p.y = ship.y + 0.85;
    p.z = ship.z + 2;
    sim.physics.reset(p.id, p);
  });

  // Aim towards ship to activate minimal reticle crosshair
  await page.evaluate(() => {
    const sim = (window as any).__lastLight.sim();
    const p = sim.s.players[0];
    const ship = sim.s.adventure.ship;
    const dx = ship.x - p.x;
    const dz = ship.z - p.z;
    const targetYaw = Math.atan2(-dx, -dz);
    (window as any).__lastLight.setViewRotation(targetYaw, 0);
  });
  await expect.poll(async () => page.locator(".reticle").evaluate(el => el.classList.contains("board-ready")), { timeout: 10000 }).toBe(true);

  // Press E to board the ship
  await page.keyboard.press("KeyE");
  await expect.poll(async () => (await getPlayer())?.seat).toBe(0);

  // Engage space cruise flight: thrust upward into deep space
  await page.evaluate(() => {
    const sim = (window as any).__lastLight.sim();
    const ship = sim.s.adventure.ship;
    ship.grounded = false;
    ship.y = 750; // Deep space altitude
    ship.vz = -180; // High speed forward cruise
    ship.vy = 25;
    ship.thrust = 2.0;
  });

  // Wait a few frames for camera FOV expansion and stardust streak rendering
  await expect.poll(async () => page.evaluate(() => (window as any).__lastLight.view().camera.fov)).toBeGreaterThan(70);

  // Capture Screenshot 2: High-speed space cruise with velocity parallax
  await page.screenshot({ path: "docs/space-escape/voyage-02-high-speed-cruise.png" });

  // STAGE 3: Mercury Touchdown & Surface Walk
  // Warp to Mercury gravitational capture envelope
  await page.evaluate(() => {
    const sim = (window as any).__lastLight.sim();
    const merc = (window as any).__lastLight.solarSystem.mercury;
    const ship = sim.s.adventure.ship;
    const p = sim.s.players[0];

    // Position ship near Mercury surface
    ship.x = merc.position.x;
    ship.y = merc.position.y + merc.radius + 1.2;
    ship.z = merc.position.z;
    ship.vx = 0;
    ship.vy = -2;
    ship.vz = 0;
    p.x = ship.x;
    p.y = ship.y;
    p.z = ship.z;
  });

  // Wait for soft touchdown on Mercury 320m spherical surface
  await expect.poll(async () => page.evaluate(() => (window as any).__lastLight.sim().s.adventure.ship.grounded)).toBe(true);

  // Press E to disembark onto Mercury crust
  await page.keyboard.press("KeyE");
  await expect.poll(async () => (await getPlayer())?.seat).toBe(-1);
  await expect.poll(async () => (await getPlayer())?.planet).toBe("mercury");

  // Verify player is on Mercury spherical surface: distance from Mercury center is ~ (320 + 0.85)m
  const mercPos = await page.evaluate(() => {
    const merc = (window as any).__lastLight.solarSystem.mercury;
    const p = (window as any).__lastLight.player();
    const dist = Math.hypot(p.x - merc.position.x, p.y - merc.position.y, p.z - merc.position.z);
    return { dist, radius: merc.radius };
  });
  expect(Math.abs(mercPos.dist - (mercPos.radius + 0.85))).toBeLessThan(2.0);

  // Walk forward on Mercury surface
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(800);
  await page.keyboard.up("KeyW");

  // Capture Screenshot 3: Mercury touchdown & surface free-roam walk
  await page.screenshot({ path: "docs/space-escape/voyage-03-mercury-landing-walk.png" });

  // STAGE 4: Mercury Geodesic Arc Distance & Re-board
  // Turn to face the ship on Mercury
  await page.evaluate(() => {
    const sim = (window as any).__lastLight.sim();
    const p = sim.s.players[0];
    const ship = sim.s.adventure.ship;
    const dx = ship.x - p.x;
    const dz = ship.z - p.z;
    const targetYaw = Math.atan2(-dx, -dz);
    (window as any).__lastLight.setViewRotation(targetYaw, -0.1);
  });

  // Verify minimal HUD crosshair on .reticle.board-ready is active via geodesic arc distance
  await expect.poll(async () => page.locator(".reticle").evaluate(el => el.classList.contains("board-ready"))).toBe(true);

  // Capture Screenshot 4: Minimal boarding crosshair & re-boarding on Mercury
  await page.screenshot({ path: "docs/space-escape/voyage-04-mercury-reboard.png" });

  // Re-board the ship on Mercury
  await page.keyboard.press("KeyE");
  await expect.poll(async () => (await getPlayer())?.seat).toBe(0);
  await expect.poll(async () => (await getPlayer())?.planet).toBeNull();

  expect(errors).toEqual([]);
});
