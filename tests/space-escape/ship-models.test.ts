import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { InterplanetarySystem } from "../../frontend/space-escape/src/interplanetary";
import { createAdventure } from "../../frontend/space-escape/shared/adventure";
import { SPAWN_FLEET } from "../../frontend/space-escape/shared/adventure-data";
import type { SpaceshipKind } from "../../frontend/space-escape/shared/celestial";

const shipAssets = [
  ["skiff", "skiff", "/assets/skiff.glb"],
  ["cruiser", "lander", "/assets/lander.glb"],
  ["light_fighter", "fighter", "/assets/models/fighter/scene.gltf"],
  ["intergalactic", "intergalactic", "/assets/models/intergalactic/scene.gltf"],
] as const;

function createSystem() {
  return new InterplanetarySystem(new THREE.Scene(), new THREE.PerspectiveCamera());
}

function fixtureLoader(urls: readonly string[]) {
  const requests: string[] = [];
  const models = new Map<string, THREE.Group>();
  const loader = {
    async loadAsync(url: string) {
      requests.push(url);
      if (!urls.includes(url)) throw new Error("Unused fixture asset");
      const scene = new THREE.Group();
      scene.name = "authored_debug_root";
      scene.add(new THREE.Mesh(new THREE.BoxGeometry(10, 2, 15), new THREE.MeshStandardMaterial()));
      models.set(url, scene);
      return { scene };
    },
  } as unknown as GLTFLoader;
  return { loader, requests, models };
}

function assertVisibleInScene(node: THREE.Object3D, scene: THREE.Scene) {
  let ancestor: THREE.Object3D | null = node;
  while (ancestor && ancestor !== scene) {
    assert.equal(ancestor.visible, true, `${ancestor.name || ancestor.type} must remain visible`);
    ancestor = ancestor.parent;
  }
  assert.ok(ancestor === scene, "model must be attached to the rendered scene");
}

test("ships wait for asset files without generating hull geometry", () => {
  const system = createSystem();
  assert.equal(system.shipMeshes.size, shipAssets.length);
  for (const [kind, ship] of system.shipMeshes) {
    const meshes: THREE.Object3D[] = [];
    ship.traverse((node) => { if (node instanceof THREE.Mesh) meshes.push(node); });
    assert.equal(meshes.length, 0, `${kind} must not have a generated hull`);
    assert.equal(ship.position.x, SPAWN_FLEET[kind].position.x);
    assert.equal(ship.position.z, SPAWN_FLEET[kind].position.z);
  }
});

test("all four ship assets render in their fleet containers and preserve flight state", async () => {
  const system = createSystem();
  const { loader, requests, models } = fixtureLoader(shipAssets.map(([, , url]) => url));
  const state = createAdventure().ship;
  Object.assign(state, { kind: "cruiser", x: 120, y: 900, z: -80, grounded: false });
  system.setShipState(state);
  await system.loadAssets(loader);

  for (const [kind, key, url] of shipAssets) {
    assert.ok(requests.includes(url), `${url} must be loaded`);
    const model = system.downloadedAssets.get(key)!;
    assert.ok(model, `${key} must be registered`);
    assert.ok(model.parent === system.shipMeshes.get(kind), `${kind} must own its loaded asset`);
    assert.ok(model.children[0] === models.get(url), `${kind} must preserve the authored root`);
    assertVisibleInScene(models.get(url)!, system.scene);
    const expected = kind === state.kind ? state : SPAWN_FLEET[kind].position;
    assert.equal(model.parent!.position.x, expected.x);
    assert.equal(model.parent!.position.z, expected.z);
  }
  assert.ok(system.cruiserModel === system.shipMeshes.get("cruiser"));
  assert.ok(system.cruiserModel!.position.y >= state.y);
});

test("registering AdventureView's skiff preserves the previous rendered model", async () => {
  const system = createSystem();
  const previous = system.shipMeshes.get("skiff")!;
  previous.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()));
  const externalSkiff = new THREE.Group();
  externalSkiff.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()));
  externalSkiff.position.set(25, 900, -80);
  system.scene.add(externalSkiff);
  system.setShipReference(externalSkiff);

  const { loader, requests } = fixtureLoader(shipAssets.map(([, , url]) => url));
  system.setShipState({ ...createAdventure().ship, x: 100, y: 900, z: -100, grounded: false });
  await system.loadAssets(loader);
  assertVisibleInScene(previous, system.scene);
  assertVisibleInScene(externalSkiff, system.scene);
  assert.ok(system.shipMeshes.get("skiff") === externalSkiff);
  assert.equal(externalSkiff.children.length, 1, "AdventureView owns loading the skiff asset");
  assert.equal(requests.includes("/assets/skiff.glb"), false, "do not duplicate AdventureView's skiff");
  assert.deepEqual(externalSkiff.position.toArray(), [25, 900, -80], "AdventureView owns skiff animation");
});

test("asset hydration retains every existing corridor, ship, alien and mineral node", async () => {
  const system = createSystem();
  const containers = [
    ...system.shipMeshes.values(), system.corridorGroup,
    system.alien1Model!, system.alien2Model!, system.mineralsModel!,
  ];
  const existing: { node: THREE.Object3D; parent: THREE.Object3D | null }[] = [];
  for (const container of containers) {
    container.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()));
    container.traverse((node) => existing.push({ node, parent: node.parent }));
  }
  const { loader } = fixtureLoader([
    ...shipAssets.map(([, , url]) => url),
    ...["corridor", "alien1", "alien2", "minerals"].map((key) => `/assets/models/${key}/scene.gltf`),
  ]);
  for (let pass = 0; pass < 2; pass++) {
    await system.loadAssets(loader);
    for (const { node, parent } of existing) {
      assert.ok(node.parent === parent, `${node.name || node.type} must keep its parent`);
    }
    for (const model of system.downloadedAssets.values()) {
      model.traverse((node) => existing.push({ node, parent: node.parent }));
    }
  }
});

test("failed ship downloads preserve rendered models and never synthesize fallback hulls", async () => {
  const system = createSystem();
  const existing = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
  system.shipMeshes.get("light_fighter")!.add(existing);
  const { loader } = fixtureLoader([]);
  await system.loadAssets(loader);
  for (const [kind, , url] of shipAssets) {
    assert.ok(system.assetErrors.includes(url));
    const ship = system.shipMeshes.get(kind)!;
    assert.equal(ship.children.length, kind === "light_fighter" ? 1 : 0);
  }
  assertVisibleInScene(existing, system.scene);
});

test("authored skiff and lander GLBs load with their original meshes intact", async () => {
  const system = createSystem();
  const parser = new GLTFLoader();
  const meshes = new Map<SpaceshipKind, THREE.Mesh[]>();
  const loader = {
    async loadAsync(url: string) {
      if (url !== "/assets/skiff.glb" && url !== "/assets/lander.glb") throw new Error("Unused fixture asset");
      const data = await readFile(new URL(`../../frontend/space-escape/public${url}`, import.meta.url));
      const gltf = await parser.parseAsync(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), "");
      const originalMeshes: THREE.Mesh[] = [];
      gltf.scene.traverse((node) => { if (node instanceof THREE.Mesh) originalMeshes.push(node); });
      meshes.set(url.includes("skiff") ? "skiff" : "cruiser", originalMeshes);
      return gltf;
    },
  } as unknown as GLTFLoader;
  await system.loadAssets(loader);
  for (const kind of ["skiff", "cruiser"] as const) {
    const originalMeshes = meshes.get(kind);
    assert.ok(originalMeshes?.length, `${kind} must load geometry from its GLB`);
    const mounted: THREE.Mesh[] = [];
    system.shipMeshes.get(kind)!.traverse((node) => { if (node instanceof THREE.Mesh) mounted.push(node); });
    assert.equal(mounted.length, originalMeshes.length);
    assert.ok(mounted.every((mesh, index) => mesh === originalMeshes[index]), "original meshes must survive hydration");
    for (const mesh of mounted) assertVisibleInScene(mesh, system.scene);
  }
});
