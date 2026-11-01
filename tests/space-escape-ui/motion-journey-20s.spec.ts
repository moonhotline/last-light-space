import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

test.setTimeout(90000);

const read = (p: Page) =>
  p.evaluate(() => (window as any).__lastLight.player());
const rendering = (p: Page) =>
  p.evaluate(() => (window as any).__lastLight.rendering());

const OUT_DIR = path.resolve("docs/space-escape/motion-journey");

test("20-second end-to-end motion journey: idle, walk, run, jetpack and flight", async ({
  page,
}) => {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });

  // Ready and launch game
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#world")).toHaveAttribute("data-ready", "true");
  await page.locator("#launch").click();
  await expect(page.locator("#hud")).toBeVisible();

  // Wait for avatar to complete landing sequence and stand firmly on ground
  await expect
    .poll(async () => (await read(page))?.grounded, { timeout: 25000 })
    .toBe(true);

  // Step slightly forward into the open valley basin so camera has full clear view
  await page.keyboard.down("KeyW");
  await expect
    .poll(async () => (await read(page)).z, { timeout: 10000 })
    .toBeLessThan(335);
  await page.keyboard.up("KeyW");
  await page.waitForTimeout(500);

  // Ensure camera is in third person mode and avatar is rendered
  if ((await rendering(page)).camera !== "third") {
    await page.keyboard.press("KeyV");
  }
  await expect
    .poll(async () => (await rendering(page)).ownAvatarVisible)
    .toBe(true);

  const diag = await page.evaluate(() => {
    const view = (window as any).__lastLight.view();
    const me = (window as any).__lastLight.player();
    const avatar = view.avatars.get(me.id);
    const meshes: any[] = [];
    avatar.traverse((o: any) => {
      if (o.isMesh) {
        meshes.push({
          name: o.name,
          visible: o.visible,
          material: o.material?.name || o.material?.type,
          opacity: o.material?.opacity,
          transparent: o.material?.transparent,
          hasGeometry: !!o.geometry,
          vertCount: o.geometry?.attributes?.position?.count,
        });
      }
    });
    return {
      avatarVisible: avatar?.visible,
      avatarPos: avatar?.position,
      childrenCount: avatar?.children?.length,
      meshes,
    };
  });
  console.log("=== DIAGNOSTIC ===", JSON.stringify(diag, null, 2));

  // Assert bone names are clean and present
  const rigBones: string[] = await page.evaluate(
    () => (window as any).__lastLight.rendering().rigBones,
  );
  expect(rigBones).toContain("Hips");
  expect(rigBones).toContain("Spine1");
  expect(rigBones).toContain("LeftArm");
  expect(rigBones).toContain("Head");

  // ==========================================
  // Stage 1 (0-3s): Ground Natural Idle
  // ==========================================
  await page.waitForTimeout(2000);
  const idleShot = path.join(OUT_DIR, "motion-01-idle.png");
  await page.screenshot({ path: idleShot });
  console.log("Captured Stage 1 Idle:", idleShot);

  // ==========================================
  // Stage 2 (3-7s): Natural Walk Forward
  // ==========================================
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(2000);
  const walkSpeed = Math.hypot(
    (await read(page)).vx,
    (await read(page)).vz,
  );
  expect(walkSpeed).toBeGreaterThan(0.5);

  const walkShot = path.join(OUT_DIR, "motion-02-walk.png");
  await page.screenshot({ path: walkShot });
  console.log("Captured Stage 2 Walk:", walkShot);

  // ==========================================
  // Stage 3 (7-11s): High Speed Run / Sprint
  // ==========================================
  await page.waitForTimeout(2500);
  const runShot = path.join(OUT_DIR, "motion-03-run.png");
  await page.screenshot({ path: runShot });
  console.log("Captured Stage 3 Run:", runShot);
  await page.keyboard.up("KeyW");
  await page.waitForTimeout(600);

  // ==========================================
  // Stage 4 (11-15s): Jetpack Takeoff & Thrusters
  // ==========================================
  await page.keyboard.down("Space");
  await page.waitForTimeout(1600);
  expect((await read(page)).jetting).toBe(true);
  expect((await read(page)).grounded).toBe(false);

  const jetShot = path.join(OUT_DIR, "motion-04-jetpack.png");
  await page.screenshot({ path: jetShot });
  console.log("Captured Stage 4 Jetpack:", jetShot);

  // ==========================================
  // Stage 5 (15-20s): Aerodynamic Flight / Glide
  // ==========================================
  await page.keyboard.up("Space");
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(1800);
  expect((await read(page)).grounded).toBe(false);

  const floatShot = path.join(OUT_DIR, "motion-05-floating.png");
  await page.screenshot({ path: floatShot });
  console.log("Captured Stage 5 Floating:", floatShot);
  await page.keyboard.up("KeyW");

  // Wait for safe landing
  await expect
    .poll(async () => (await read(page))?.grounded, { timeout: 20000 })
    .toBe(true);

  expect(errors).toEqual([]);
});
