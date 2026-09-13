import { test, expect, type Page } from "@playwright/test";
import type {
  Snapshot,
  Player,
} from "../../frontend/space-escape/shared/types";
const state = (page: Page): Promise<Snapshot> =>
  page.evaluate(() => (window as any).__lastLight.snapshot());
const player = (page: Page): Promise<Player> =>
  page.evaluate(() => (window as any).__lastLight.position());
// Use actual keyboard input, including crossing the ravine with a limited-fuel jetpack.
// Only read the debug facade; never teleport or alter the simulation to pass a journey.
async function travel(
  page: Page,
  x: number,
  z: number,
  fly = false,
  land = false,
) {
  const held = new Set<string>();
  await page.keyboard.down("ShiftLeft");
  if (fly) await page.keyboard.down("Space");
  try {
    await expect
      .poll(
        async () => {
          const p = await player(page),
            dx = x - p.x,
            dz = z - p.z;
          if (Math.hypot(dx, dz) < 5 && (!land || p.grounded)) return true;
          const wanted = new Set<string>();
          if (Math.abs(dx) > 2) wanted.add(dx > 0 ? "KeyD" : "KeyA");
          if (Math.abs(dz) > 2) wanted.add(dz > 0 ? "KeyS" : "KeyW");
          for (const k of held)
            if (!wanted.has(k)) {
              await page.keyboard.up(k);
              held.delete(k);
            }
          for (const k of wanted)
            if (!held.has(k)) {
              await page.keyboard.down(k);
              held.add(k);
            }
          return false;
        },
        { timeout: 25000, intervals: [60] },
      )
      .toBe(true);
  } catch (e) {
    console.log(
      "Route diagnostics",
      await player(page),
      await page.evaluate(() => (window as any).__lastLight.rendering()),
    );
    throw e;
  } finally {
    for (const k of held) await page.keyboard.up(k);
    await page.keyboard.up("ShiftLeft");
    if (fly) await page.keyboard.up("Space");
  }
}
async function activate(page: Page, id: number, observer: Page) {
  await expect
    .poll(async () => (await player(page)).grounded, { timeout: 20000 })
    .toBe(true);
  await page.keyboard.down("KeyE");
  try {
    await expect
      .poll(async () => (await state(observer)).beacons[id].active, {
        timeout: 12000,
      })
      .toBe(true);
  } catch (error) {
    console.log(
      "Beacon diagnostics",
      await player(page),
      (await state(page)).beacons[id],
    );
    throw error;
  } finally {
    await page.keyboard.up("KeyE");
  }
}
test("two explorers share a complete planetary expedition, upgrades, sky events and restart", async ({
  browser,
}) => {
  test.setTimeout(240000);
  const a = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    }),
    b = await browser.newContext({ viewport: { width: 960, height: 640 } });
  const host = await a.newPage(),
    guest = await b.newPage();
  const errors: string[] = [];
  for (const p of [host, guest]) {
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
  }
  try {
    await host.goto("/");
    await expect(host.locator("#world")).toHaveAttribute("data-ready", "true");
    await host.locator("#callsign").fill("Pathfinder");
    await host.locator("#coopTab").click();
    await host.locator("#launch").click();
    await expect(host.locator("#crew li")).toHaveCount(1);
    const room = await host.locator("#roomLabel").textContent();
    await guest.goto(`/?room=${room}`);
    await expect(guest.locator("#world")).toHaveAttribute("data-ready", "true");
    await guest.locator("#callsign").fill("Stargazer");
    await guest.locator("#join").click();
    await expect(guest.locator("#crew li")).toHaveCount(2);
    await expect(guest.locator("#begin")).toBeDisabled();
    await host.locator("#begin").click();
    for (const p of [guest, host]) {
      await expect(p.locator("body")).toHaveAttribute("data-phase", "active");
      if (await p.locator("#paused").isVisible())
        await p.locator("#resume").click();
    }
    await travel(host, 0, 285);
    await travel(host, -40, 160, false, true);
    await activate(host, 0, guest);
    expect((await state(guest)).players.every((p) => p.level === 1)).toBe(true);
    expect((await player(host)).crystals).toBeGreaterThan(3);
    expect((await state(guest)).earthAt).toBeGreaterThan(0);
    await host.screenshot({
      path: "docs/space-escape/planet-beacon-earth.png",
    });
    await travel(host, -10, 95);
    await expect
      .poll(async () => (await player(host)).fuel)
      .toBeGreaterThan(135);
    await travel(host, 100, 50, true);
    await travel(host, 180, -90, false, true);
    await activate(host, 1, guest);
    expect((await state(guest)).players.every((p) => p.level === 2)).toBe(true);
    await expect
      .poll(async () =>
        host.evaluate(
          () => (window as any).__lastLight.rendering().thermalCount,
        ),
      )
      .toBe(2);
    await host.screenshot({ path: "docs/space-escape/planet-observatory.png" });
    await travel(host, 130, -170);
    await travel(host, 20, -235);
    await travel(host, -110, -370, false, true);
    await activate(host, 2, guest);
    for (const p of [host, guest]) {
      await expect(p.locator("#result")).toBeVisible();
      expect((await state(p)).completedAt).toBeGreaterThan(0);
      await p.locator("#explore").click();
    }
    await host.keyboard.press("KeyR");
    await expect.poll(async () => (await state(guest)).markers.length).toBe(1);
    await expect
      .poll(
        async () =>
          host.evaluate(() => (window as any).__lastLight.rendering().moonY),
        { timeout: 20000 },
      )
      .toBeGreaterThan(0);
    await host.screenshot({ path: "docs/space-escape/planet-summit.png" });
    const authoritative = (await state(guest)).players.find(
        (p) => p.name === "Pathfinder",
      )!,
      visible = await player(host);
    expect(
      Math.hypot(
        visible.x - authoritative.x,
        visible.y - authoritative.y,
        visible.z - authoritative.z,
      ),
    ).toBeLessThan(3);
    await host.keyboard.press("Escape");
    await host.locator("#journal").click();
    await host.locator("#again").click();
    for (const p of [host, guest]) {
      await expect(p.locator("body")).toHaveAttribute("data-phase", "lobby");
      expect((await state(p)).beacons.every((b) => !b.active)).toBe(true);
    }
    await host.locator("#begin").click();
    await expect(guest.locator("body")).toHaveAttribute("data-phase", "active");
    expect(errors).toEqual([]);
  } finally {
    await a.close();
    await b.close();
  }
});
