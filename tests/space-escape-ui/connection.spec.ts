import { test, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";

test("deployed clients share a room, buffered interaction, inventory state and movement", async ({
  browser,
}) => {
  test.setTimeout(120000);
  const a = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    }),
    b = await browser.newContext({ viewport: { width: 960, height: 640 } });
  const host = await a.newPage(),
    guest = await b.newPage();
  const errors: string[] = [],
    failures: string[] = [];
  for (const p of [host, guest]) {
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    p.on("response", (r) => {
      if (r.status() >= 400)
        failures.push(`${r.status()} ${new URL(r.url()).pathname}`);
    });
  }
  try {
    await host.goto("/");
    await expect(host.locator("#world")).toHaveAttribute("data-ready", "true");
    await host.locator("#coopTab").click();
    await host.locator("#launch").click();
    await expect(host.locator("#crew li")).toHaveCount(1);
    const code = await host.locator("#roomLabel").textContent();
    await guest.goto(`/?room=${code}`);
    await expect(guest.locator("#world")).toHaveAttribute("data-ready", "true");
    await guest.locator("#join").click();
    await expect(host.locator("#crew li")).toHaveCount(2);
    await host.locator("#begin").click();
    for (const p of [host, guest]) {
      await expect(p.locator("body")).toHaveAttribute("data-phase", "active");
      if (await p.locator("#paused").isVisible())
        await p.locator("#resume").click();
    }
    await host.keyboard.down("KeyW");
    await expect
      .poll(
        async () =>
          host.evaluate(() => (window as any).__lastLight.position().z),
        { intervals: [50] },
      )
      .toBeLessThan(315);
    await host.keyboard.up("KeyW");
    await expect
      .poll(async () =>
        guest.evaluate(
          () => (window as any).__lastLight.snapshot().players[0].z,
        ),
      )
      .toBeLessThan(318);
    await expect(host.locator("#interactionText")).toContainText("阅读");
    await host.keyboard.press("KeyE");
    await expect(host.locator("#archive")).toBeVisible();
    await host.locator("#closeLore").click();
    await expect
      .poll(async () =>
        guest.evaluate(() =>
          (window as any).__lastLight.snapshot().adventure.lore.includes(0),
        ),
      )
      .toBe(true);
    await host.keyboard.press("Tab");
    await expect(host.locator("#inventoryGrid .inventory-slot")).toHaveCount(
      12,
    );
    await host.locator("#closeInventory").click();
    await host.keyboard.press("KeyV");
    await expect
      .poll(async () =>
        host.evaluate(
          () => (window as any).__lastLight.rendering().ownAvatarVisible,
        ),
      )
      .toBe(false);
    const render = await host.evaluate(() =>
      (window as any).__lastLight.rendering(),
    );
    await host.screenshot({
      path: "docs/space-escape/echo-production-first-person.png",
    });
    expect(errors).toEqual([]);
    expect(failures).toEqual([]);
    await writeFile(
      "docs/space-escape/echo-production-smoke.json",
      JSON.stringify(
        {
          date: new Date().toISOString(),
          url: process.env.SPACE_WEB_URL,
          errors,
          httpFailures: failures,
          rendering: render,
          checks: [
            "two browsers join and start",
            "remote movement",
            "buffered E interaction",
            "shared lore",
            "12 inventory slots",
            "first-person avatar hidden",
          ],
        },
        null,
        2,
      ),
    );
  } finally {
    await a.close();
    await b.close();
  }
});
