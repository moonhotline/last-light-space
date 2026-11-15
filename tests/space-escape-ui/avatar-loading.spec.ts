import { test, expect } from "@playwright/test";

test.describe.configure({ timeout: 90000 });

test("a failed authored astronaut load never substitutes the old primitive avatar", async ({ page }) => {
  const legacyRequests: string[] = [];
  let attempts = 0;
  page.on("request", request => {
    if (/\/assets\/(explorer(?:-v[23])?|astronaut)\.glb/.test(request.url())) legacyRequests.push(request.url());
  });
  await page.route("**/assets/explorer-v4.glb", route => { attempts++; return route.abort("failed"); });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect.poll(() => attempts).toBe(3);
  await expect(page.locator("#entryStatus")).toHaveText("星球加载失败，请刷新重试", { timeout: 30000 });
  expect(legacyRequests).toEqual([]);
  await expect(page.locator("#launch")).toBeDisabled();
  await expect(page.locator("#world")).not.toHaveAttribute("data-ready", "true");
});

test("the authored astronaut remains textured and rigged after a transient load failure", async ({ page }, testInfo) => {
  let attempts = 0;
  const legacyRequests: string[] = [];
  page.on("request", request => {
    if (/\/assets\/(explorer(?:-v[23])?|astronaut)\.glb/.test(request.url())) legacyRequests.push(request.url());
  });
  await page.route("**/assets/explorer-v4.glb", route => ++attempts === 1 ? route.abort("failed") : route.continue());
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#world")).toHaveAttribute("data-ready", "true", { timeout: 45000 });
  await page.locator("#launch").click();
  await expect(page.locator("body")).toHaveAttribute("data-phase", "active");
  await expect.poll(() => page.evaluate(() => {
    const api = (window as any).__lastLight;
    return api.view().avatars.has(api.player().id);
  })).toBe(true);
  const avatar = await page.evaluate(() => {
    const api = (window as any).__lastLight, view = api.view();
    view.thirdPerson = true;
    const renderedAvatar = view.avatars.get(api.player().id);
    const originalGeometry = new Set<string>();
    view.astronaut.traverse((node: any) => {
      if (node.isSkinnedMesh) originalGeometry.add(node.geometry.uuid);
    });
    let triangles = 0, skinnedMeshes = 0, texturedMeshes = 0;
    renderedAvatar.traverse((node: any) => {
      if (!node.isSkinnedMesh || !originalGeometry.has(node.geometry.uuid)) return;
      triangles += (node.geometry.index?.count ?? node.geometry.attributes.position.count) / 3;
      if (node.isSkinnedMesh) skinnedMeshes++;
      if ((Array.isArray(node.material) ? node.material : [node.material]).some((mat: any) => mat.map)) texturedMeshes++;
    });
    return { triangles, skinnedMeshes, texturedMeshes, clips: view.astronautAnimations.length, visible: renderedAvatar.visible };
  });
  expect(attempts).toBe(2);
  expect(legacyRequests).toEqual([]);
  expect(avatar.triangles).toBe(58312);
  expect(avatar.skinnedMeshes).toBe(3);
  expect(avatar.texturedMeshes).toBeGreaterThanOrEqual(2);
  expect(avatar.clips).toBeGreaterThanOrEqual(3);
  await expect.poll(() => page.evaluate(() => {
    const api = (window as any).__lastLight;
    return api.view().avatars.get(api.player().id).visible;
  })).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("authored-astronaut.png") });
});
