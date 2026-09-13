import { test, expect, type Page } from "@playwright/test";
const read = (p: Page) =>
  p.evaluate(() => (window as any).__lastLight.player());
const rendering = (p: Page) =>
  p.evaluate(() => (window as any).__lastLight.rendering());
async function ready(p: Page) {
  await p.goto("/", { waitUntil: "domcontentloaded" });
  await expect(p.locator("#world")).toHaveAttribute("data-ready", "true");
}
async function launch(p: Page) {
  await ready(p);
  await p.locator("#launch").click();
  await expect(p.locator("body")).toHaveAttribute("data-phase", "active");
}
test("planet scene, jetpack, finite fuel, landing feedback and both cameras work", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await ready(page);
  await page.screenshot({ path: "docs/space-escape/planet-landing.png" });
  await page.locator("#launch").click();
  await expect(page.locator("#hud")).toBeVisible();
  await expect
    .poll(async () => (await rendering(page)).ownAvatarVisible)
    .toBe(true);
  const start = (await read(page)).y;
  await page.keyboard.down("Space");
  await expect
    .poll(async () => (await read(page)).y)
    .toBeGreaterThan(start + 9);
  await page.keyboard.up("Space");
  expect((await read(page)).fuel).toBeLessThan(95);
  await page.keyboard.press("KeyV");
  await expect.poll(async () => (await rendering(page)).camera).toBe("first");
  await expect
    .poll(async () => (await rendering(page)).ownAvatarVisible)
    .toBe(false);
  await page.keyboard.press("KeyV");
  await expect
    .poll(async () => (await rendering(page)).ownAvatarVisible)
    .toBe(true);
  await expect
    .poll(async () => (await read(page)).grounded, { timeout: 18000 })
    .toBe(true);
  expect((await read(page)).landingId).toBeGreaterThan(0);
  await page.keyboard.down("KeyW");
  await expect.poll(async () => (await read(page)).z).toBeLessThan(330);
  await page.keyboard.up("KeyW");
  await page.keyboard.press("KeyR");
  await expect
    .poll(async () =>
      page.evaluate(
        () => (window as any).__lastLight.snapshot().markers.length,
      ),
    )
    .toBe(1);
  await page.screenshot({ path: "docs/space-escape/planet-start.png" });
  await page.keyboard.press("Escape");
  await expect(page.locator("#paused")).toBeVisible();
  const before = await read(page);
  await page.keyboard.press("KeyW");
  expect((await read(page)).z).toBe(before.z);
  await page.locator("#leave").click();
  await expect(page.locator("#landing")).toBeVisible();
  expect(errors).toEqual([]);
});
test("third-person camera contracts before entering terrain and motion feedback can be disabled", async ({
  page,
}) => {
  await launch(page);
  await page.keyboard.down("KeyI");
  await expect
    .poll(async () => (await rendering(page)).cameraObstructed)
    .toBe(true);
  await page.keyboard.up("KeyI");
  expect((await rendering(page)).cameraRange).toBeLessThan(7);
  await page.keyboard.press("Escape");
  await page.locator("#effects").fill("0");
  await expect(page.locator("#effects")).toHaveValue("0");
  await page.locator("#resume").click();
  await expect(page.locator("#paused")).toBeHidden();
});
test("mobile layout exposes movement, flight and camera controls within the viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
  await page.screenshot({
    path: "docs/space-escape/planet-mobile-landing.png",
  });
  await page.locator("#launch").click();
  await expect(page.locator("#touchControls")).toBeVisible();
  const start = await read(page);
  const move = await page
    .getByRole("button", { name: "前进", exact: true })
    .boundingBox();
  await page.mouse.move(move!.x + 20, move!.y + 20);
  await page.mouse.down();
  await expect.poll(async () => (await read(page)).z).toBeLessThan(start.z - 8);
  await page.mouse.up();
  const jet = await page.locator("#touchJet").boundingBox();
  await page.mouse.move(jet!.x + 25, jet!.y + 25);
  await page.mouse.down();
  await expect.poll(async () => (await read(page)).jetting).toBe(true);
  await expect
    .poll(async () => (await read(page)).y)
    .toBeGreaterThan(start.y + 8);
  await page.mouse.up();
  await page.locator("#camera").click();
  await expect.poll(async () => (await rendering(page)).camera).toBe("first");
  await page.screenshot({ path: "docs/space-escape/planet-mobile-game.png" });
  const rects = await page
    .locator(".vitals,.touch-action,.dpad,.top-tools")
    .evaluateAll((nodes) =>
      nodes.map((n) => {
        const r = n.getBoundingClientRect();
        return { x: r.x, right: r.right, bottom: r.bottom };
      }),
    );
  for (const r of rects) {
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.right).toBeLessThanOrEqual(390);
    expect(r.bottom).toBeLessThanOrEqual(844);
  }
});
test("shared origin creates a room and solo mode stays available without a room endpoint", async ({
  page,
}) => {
  test.skip(
    !!process.env.SPACE_WEB_URL,
    "Local shared-origin endpoint is tested before deployment.",
  );
  await page.goto("http://127.0.0.1:2567/");
  await expect(page.locator("#world")).toHaveAttribute("data-ready", "true");
  expect(
    await page.evaluate(() => (window as any).__lastLight.endpoint()),
  ).toBe("ws://127.0.0.1:2567");
  await page.locator("#coopTab").click();
  await page.locator("#launch").click();
  await expect(page.locator("#crew li")).toHaveCount(1);
  await page.locator("#leaveLobby").click();
  await page.route("**/connection.json", (route) =>
    route.fulfill({ json: { url: "" } }),
  );
  await page.goto("/");
  await expect(page.locator("#world")).toHaveAttribute("data-ready", "true");
  await page.locator("#launch").click();
  await expect(page.locator("body")).toHaveAttribute("data-phase", "active");
});
