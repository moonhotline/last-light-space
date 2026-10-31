import { test, expect } from "@playwright/test";

test("30km camera includes planets and logarithmic shaders preserve near/far occlusion", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => {
    if (message.type() === "error") errors.push(message.text());
  });
  // Build the real view without starting gameplay or depending on model downloads.
  await page.route("**/src/main.ts", route => route.fulfill({ contentType: "text/javascript", body: "" }));
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const result = await page.evaluate(async () => {
    const { GameView } = await import("/src/scene.ts");
    const THREE = await import("/node_modules/.vite/deps/three.js");
    const { SOLAR_SYSTEM } = await import("/shared/celestial.ts");
    const { SPAWN } = await import("/shared/map.ts");
    const view = new GameView(document.querySelector("canvas")!);
    const renderer = view.renderer;
    const camera = view.camera;
    camera.position.copy(SPAWN);
    const included = Object.values(SOLAR_SYSTEM).map((planet: any) => {
      camera.lookAt(planet.position.x, planet.position.y, planet.position.z);
      camera.updateMatrixWorld(true);
      const frustum = new THREE.Frustum().setFromProjectionMatrix(
        new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
      return { id: planet.id, included: frustum.containsPoint(new THREE.Vector3().copy(planet.position)) };
    });
    // Force normally hidden thermal effects to compile, plus the atmosphere shader.
    view.thermalGroups.forEach((group: any) => { group.visible = true; });
    view.atmosphere(view.scene, 3, 0x38bdf8, 0.2);
    await renderer.compileAsync(view.scene, camera);
    await renderer.compileAsync(view.skyScene, view.skyCamera);

    // Real framebuffer test: a custom particle must be hidden behind a built-in
    // material and visible just in front, both near the hands and near Earth.
    const target = new THREE.WebGLRenderTarget(32, 32);
    const scene = new THREE.Scene();
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ color: 0xff0000 }));
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0], 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute([0, 1, 0], 3));
    geometry.setAttribute("size", new THREE.Float32BufferAttribute([1000], 1));
    const particle = new THREE.Points(geometry, view.particlePoints.material);
    particle.frustumCulled = false;
    scene.add(wall, particle);
    camera.position.set(0, 0, 0);
    camera.lookAt(0, 0, -1);
    const samples: number[][] = [];
    renderer.setRenderTarget(target);
    for (const depth of [0.5, 9000]) {
      wall.position.z = -depth;
      wall.scale.setScalar(depth);
      for (const offset of [-0.02, 0.02]) {
        particle.position.z = -depth + offset;
        renderer.render(scene, camera);
        const pixel = new Uint8Array(4);
        renderer.readRenderTargetPixels(target, 16, 16, 1, 1, pixel);
        samples.push([...pixel]);
      }
    }
    renderer.setRenderTarget(null);
    target.dispose();
    const settings = { near: camera.near, far: camera.far, log: renderer.capabilities.logarithmicDepthBuffer };
    renderer.dispose();
    view.composer.dispose();
    return { included, samples, settings };
  });
  expect(result.settings).toEqual({ near: 0.1, far: 30000, log: true });
  expect(result.included.every((planet: any) => planet.included)).toBe(true);
  for (let index = 0; index < result.samples.length; index += 2) {
    expect(result.samples[index][0]).toBeGreaterThan(100);
    expect(result.samples[index][1]).toBe(0);
    expect(result.samples[index + 1][1]).toBeGreaterThan(100);
  }
  expect(errors).toEqual([]);
});
