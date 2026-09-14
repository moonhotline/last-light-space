import { copyFile, writeFile } from "node:fs/promises";
import { test, expect, type Page } from "@playwright/test";
import type {
  Snapshot,
  Player,
} from "../../frontend/space-escape/shared/types";
import {
  LORE,
  LAB,
  DESTINATION,
} from "../../frontend/space-escape/shared/adventure-data";
const state = (p: Page): Promise<Snapshot> =>
  p.evaluate(() => (window as any).__lastLight.snapshot());
const player = (p: Page): Promise<Player> =>
  p.evaluate(() => (window as any).__lastLight.position());
const wrap = (n: number) => Math.atan2(Math.sin(n), Math.cos(n));
async function travel(
  page: Page,
  x: number,
  z: number,
  fly = false,
  land = true,
  radius = 3,
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
          if (Math.hypot(dx, dz) < radius && (!land || p.grounded)) return true;
          const f = -Math.sin(p.yaw) * dx - Math.cos(p.yaw) * dz,
            s = Math.cos(p.yaw) * dx - Math.sin(p.yaw) * dz;
          const want = new Set<string>();
          if (Math.abs(f) > 1.2) want.add(f > 0 ? "KeyW" : "KeyS");
          if (Math.abs(s) > 1.2) want.add(s > 0 ? "KeyD" : "KeyA");
          for (const k of held)
            if (!want.has(k)) {
              await page.keyboard.up(k);
              held.delete(k);
            }
          for (const k of want)
            if (!held.has(k)) {
              await page.keyboard.down(k);
              held.add(k);
            }
          return false;
        },
        { timeout: 35000, intervals: [60] },
      )
      .toBe(true);
  } catch (e) {
    console.log(
      "TRAVEL",
      x,
      z,
      await player(page),
      await page.locator("#paused").isVisible(),
      await page.locator("#pauseTitle").textContent(),
      await page.evaluate(() => ({
        focus: document.activeElement?.id,
        render: (window as any).__lastLight.rendering(),
      })),
    );
    throw e;
  } finally {
    for (const k of held) await page.keyboard.up(k);
    await page.keyboard.up("ShiftLeft");
    if (fly) await page.keyboard.up("Space");
  }
}
async function look(page: Page, target: { x: number; y: number; z: number }) {
  const held = new Set<string>();
  try {
    await expect
      .poll(
        async () => {
          const p = await player(page),
            yaw = Math.atan2(p.x - target.x, p.z - target.z),
            pitch = Math.atan2(
              target.y - p.y - 0.9,
              Math.hypot(target.x - p.x, target.z - p.z),
            );
          const dy = wrap(yaw - p.yaw),
            dp = pitch - p.pitch;
          const want = new Set<string>();
          if (Math.abs(dy) > 0.055)
            want.add(dy > 0 ? "ArrowLeft" : "ArrowRight");
          if (Math.abs(dp) > 0.05) want.add(dp > 0 ? "KeyI" : "KeyK");
          for (const k of held)
            if (!want.has(k)) {
              await page.keyboard.up(k);
              held.delete(k);
            }
          for (const k of want)
            if (!held.has(k)) {
              await page.keyboard.down(k);
              held.add(k);
            }
          return want.size === 0;
        },
        { timeout: 10000, intervals: [30] },
      )
      .toBe(true);
  } finally {
    for (const k of held) await page.keyboard.up(k);
  }
}
async function read(page: Page, id: number) {
  await page.keyboard.press("KeyE");
  await expect(page.locator("#archive")).toBeVisible();
  await expect(page.locator("#loreTitle")).toContainText(LORE[id].title);
  await page.locator("#closeLore").click();
  console.log("Recovered archive", id);
}
async function harvest(page: Page, id: number) {
  const n = (await state(page)).adventure.nodes[id];
  await look(page, n);
  await page.keyboard.down("KeyT");
  try {
    await expect
      .poll(async () => (await state(page)).adventure.nodes[id].readyAt, {
        timeout: 10000,
      })
      .toBeGreaterThan(0);
  } finally {
    await page.keyboard.up("KeyT");
  }
}

test("two explorers recover lore and materials, fight, repair and fly together to the grove", async ({
  browser,
}) => {
  test.setTimeout(420000);
  const a = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      ...(process.env.SPACE_RECORD
        ? {
            recordVideo: {
              dir: "frontend/space-escape/.runtime/echo-video",
              size: { width: 1280, height: 800 },
            },
          }
        : {}),
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
    const code = await host.locator("#roomLabel").textContent();
    await guest.goto(`/?room=${code}`);
    await expect(guest.locator("#world")).toHaveAttribute("data-ready", "true");
    await guest.locator("#join").click();
    await expect(guest.locator("#crew li")).toHaveCount(2);
    await host.locator("#begin").click();
    for (const p of [host, guest]) {
      await expect(p.locator("body")).toHaveAttribute("data-phase", "active");
      if (await p.locator("#paused").isVisible())
        await p.locator("#resume").click();
    }
    await travel(guest, -5, 353);
    await travel(host, -6, 339);
    await harvest(host, 0);
    await travel(host, -5, 314);
    await read(host, 0);
    await expect
      .poll(async () => (await state(guest)).adventure.lore.includes(0))
      .toBe(true);
    await travel(host, 6, 283);
    await harvest(host, 1);
    await travel(host, -24, 228);
    await harvest(host, 2);
    await host.keyboard.press("Tab");
    await expect(host.locator("#inventory")).toBeVisible();
    await expect(host.locator("#inventoryGrid .inventory-slot")).toHaveCount(
      12,
    );
    await host.screenshot({ path: "docs/space-escape/echo-inventory.png" });
    await host.locator("#closeInventory").click();
    await travel(host, 12, 226);
    await look(host, { x: LAB.x + 6, y: LAB.y + 6, z: LAB.z + 13 });
    await host.keyboard.down("KeyQ");
    await expect
      .poll(async () => (await player(host)).grapple !== null)
      .toBe(true);
    await host.keyboard.up("KeyQ");
    await expect
      .poll(async () =>
        Math.hypot((await player(host)).vx, (await player(host)).vz),
      )
      .toBeGreaterThan(8);
    await host.screenshot({ path: "docs/space-escape/echo-grapple.png" });
    await host.keyboard.press("KeyQ");
    await expect.poll(async () => (await player(host)).grapple).toBeNull();
    await travel(host, 12, 209);
    await travel(host, 12, 201);
    await travel(host, 12, 193);
    await read(host, 1);
    await look(host, { x: LAB.x - 6, y: LAB.y + 2, z: LAB.z - 7 });
    await host.screenshot({ path: "docs/space-escape/echo-laboratory.png" });
    await travel(host, 16, 201);
    await harvest(host, 3);
    await travel(host, 12, 209);
    await travel(host, -12, 211);
    await travel(host, -40, 160);
    await host.keyboard.down("KeyE");
    await expect
      .poll(async () => (await state(guest)).beacons[0].active)
      .toBe(true);
    await host.keyboard.up("KeyE");
    await travel(host, -10, 95);
    await travel(host, 100, 50, true, false);
    await travel(host, 145, -22);
    for (let id = 0; id < 3; id++) {
      await expect
        .poll(
          async () => {
            const d = (await state(host)).adventure.drones[id];
            if (d.hp <= 0) return true;
            await look(host, d);
            await host.keyboard.down("KeyT");
            await host.waitForTimeout(320);
            await host.keyboard.up("KeyT");
            if ((await player(host)).health < 65)
              await host.keyboard.press("KeyG");
            return false;
          },
          { timeout: 35000, intervals: [50] },
        )
        .toBe(true);
    }
    await host.screenshot({ path: "docs/space-escape/echo-outpost.png" });
    await travel(host, 172, -62);
    await harvest(host, 6);
    await travel(host, 174, -73);
    await read(host, 2);
    await expect
      .poll(async () =>
        (await state(guest)).adventure.drones.every((d) => d.hp === 0),
      )
      .toBe(true);
    await host.keyboard.press("KeyB");
    await expect
      .poll(async () => (await player(host)).respawns)
      .toBeGreaterThan(0);
    await travel(host, -24, 223);
    await travel(host, 0, 285);
    await travel(host, -11, 359);
    await host.keyboard.down("KeyE");
    await expect
      .poll(async () => (await state(guest)).adventure.ship.repaired, {
        timeout: 12000,
      })
      .toBe(true);
    await host.keyboard.up("KeyE");
    await look(host, {
      x: -11,
      y: (await state(host)).adventure.ship.y + 3,
      z: 347,
    });
    await host.screenshot({ path: "docs/space-escape/echo-skiff.png" });
    await host.keyboard.press("KeyE");
    await expect.poll(async () => (await player(host)).seat).toBe(0);
    await guest.keyboard.press("KeyE");
    await expect.poll(async () => (await player(guest)).seat).toBe(1);
    await host.keyboard.down("Space");
    await expect
      .poll(async () => (await state(host)).adventure.ship.y, {
        timeout: 32000,
      })
      .toBeGreaterThan(340);
    await host.keyboard.up("Space");
    const flightKeys = new Set<string>();
    try {
      await expect
        .poll(
          async () => {
            const ship = (await state(host)).adventure.ship,
              p = await player(host);
            const dx = DESTINATION.x - ship.x,
              dz = DESTINATION.z - ship.z,
              d = Math.hypot(dx, dz),
              speed = Math.hypot(ship.vx, ship.vz);
            if (d < 18 && speed < 2) return true;
            const angle = wrap(Math.atan2(-dx, -dz) - p.yaw),
              wanted = new Set<string>();
            if (d > 18) wanted.add("KeyW");
            if (d < 110 || Math.abs(angle) > 0.45) wanted.add("ShiftLeft");
            if (Math.abs(angle) > 0.055)
              wanted.add(angle > 0 ? "ArrowLeft" : "ArrowRight");
            for (const k of flightKeys)
              if (!wanted.has(k)) {
                await host.keyboard.up(k);
                flightKeys.delete(k);
              }
            for (const k of wanted)
              if (!flightKeys.has(k)) {
                await host.keyboard.down(k);
                flightKeys.add(k);
              }
            return false;
          },
          { timeout: 60000, intervals: [70] },
        )
        .toBe(true);
    } finally {
      for (const k of flightKeys) await host.keyboard.up(k);
    }
    await host.keyboard.down("ShiftLeft");
    await host.screenshot({ path: "docs/space-escape/echo-flight.png" });
    await host.keyboard.down("KeyX");
    await expect(host.locator("#result")).toBeVisible({ timeout: 45000 });
    await host.keyboard.up("KeyX");
    await host.keyboard.up("ShiftLeft");
    await expect(guest.locator("#result")).toBeVisible();
    expect((await state(guest)).adventure.ship.arrived).toBe(true);
    await host.locator("#explore").click();
    await host.keyboard.press("KeyV");
    await expect
      .poll(async () =>
        host.evaluate(() => (window as any).__lastLight.rendering().camera),
      )
      .toBe("first");
    await host.keyboard.press("KeyV");
    await host.keyboard.press("KeyE");
    await expect.poll(async () => (await player(host)).seat).toBe(-1);
    await host.screenshot({ path: "docs/space-escape/echo-arrival.png" });
    const finalState = await state(host);
    const metrics = await host.evaluate(() =>
      (window as any).__lastLight.rendering(),
    );
    await writeFile(
      "docs/space-escape/echo-mission-verification.json",
      JSON.stringify(
        {
          date: new Date().toISOString(),
          url: process.env.SPACE_WEB_URL,
          errors,
          missionTime: finalState.time,
          lore: finalState.adventure.lore,
          ship: finalState.adventure.ship,
          rendering: metrics,
          input: "actual keyboard and UI; diagnostics read-only",
        },
        null,
        2,
      ),
    );
    expect(errors).toEqual([]);
    await host.keyboard.press("Escape");
    await host.locator("#journal").click();
    await host.locator("#again").click();
    await expect(guest.locator("body")).toHaveAttribute("data-phase", "lobby");
    expect((await state(guest)).adventure.ship.repaired).toBe(false);
  } catch (error) {
    console.log(
      "Chapter diagnostics",
      await state(host)
        .then((s) => ({
          phase: s.phase,
          time: s.time,
          players: s.players,
          adventure: s.adventure,
        }))
        .catch(() => null),
      await host
        .locator("#pauseTitle")
        .textContent()
        .catch(() => null),
    );
    throw error;
  } finally {
    const video = host.video();
    await a.close();
    await b.close();
    if (video)
      await copyFile(
        await video.path(),
        "docs/space-escape/echo-expedition.webm",
      );
  }
});
