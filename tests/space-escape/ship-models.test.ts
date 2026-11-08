import test from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import { authoredModel } from "./helpers/authored-model";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { InterplanetarySystem } from "../../frontend/space-escape/src/interplanetary";
import { createAdventure } from "../../frontend/space-escape/shared/adventure";
import { SPAWN_FLEET } from "../../frontend/space-escape/shared/adventure-data";
import type { SpaceshipKind } from "../../frontend/space-escape/shared/celestial";

const shipAssets = [
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

test("both downloaded ship assets render in their fleet containers and preserve flight state", async () => {
  const system = createSystem();
  const { loader, requests, models } = fixtureLoader(shipAssets.map(([, , url]) => url));
  const state = createAdventure().ship;
  Object.assign(state, { kind: "intergalactic", x: 120, y: 900, z: -80, grounded: false });
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
  assert.ok(system.intergalacticModel === system.shipMeshes.get("intergalactic"));
  assert.ok(system.intergalacticModel!.position.y >= state.y);
});

test("registering AdventureView's fighter removes the duplicate fleet container", async () => {
  const system = createSystem();
  const previous = system.shipMeshes.get("light_fighter")!;
  previous.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()));
  const externalFighter = new THREE.Group();
  externalFighter.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()));
  externalFighter.position.set(25, 900, -80);
  system.scene.add(externalFighter);
  system.setShipReference(externalFighter);

  const { loader, requests } = fixtureLoader(shipAssets.map(([, , url]) => url));
  system.setShipState({ ...createAdventure().ship, x: 100, y: 900, z: -100, grounded: false });
  await system.loadAssets(loader);
  assert.equal(previous.parent, null, "retired container must not leave a duplicate hull in the scene");
  assertVisibleInScene(externalFighter, system.scene);
  assert.ok(system.shipMeshes.get("light_fighter") === externalFighter);
  assert.equal(externalFighter.children.length, 1, "AdventureView owns loading the fighter asset");
  assert.equal(requests.includes("/assets/models/fighter/scene.gltf"), false, "do not duplicate AdventureView's fighter");
  assert.deepEqual(externalFighter.position.toArray(), [25, 900, -80], "AdventureView owns fighter animation");
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

test("downloaded fighter and heavy starship preserve original GLTF meshes", async () => {
  const system = createSystem();
  const meshes = new Map<SpaceshipKind, THREE.Mesh[]>();
  const loader = {
    async loadAsync(url: string) {
      const asset = shipAssets.find(([, , path]) => path === url);
      if (!asset) throw new Error("Unused fixture asset");
      const gltf = await authoredModel(url);
      const original: THREE.Mesh[] = [];
      gltf.scene.traverse(node => { if (node instanceof THREE.Mesh) original.push(node); });
      meshes.set(asset[0], original);
      return gltf;
    },
  } as unknown as GLTFLoader;
  await system.loadAssets(loader);
  for (const [kind] of shipAssets) {
    const original = meshes.get(kind)!;
    assert.ok(original.length > 0);
    const mounted: THREE.Mesh[] = [];
    system.shipMeshes.get(kind)!.traverse(node => { if (node instanceof THREE.Mesh) mounted.push(node); });
    assert.deepEqual(mounted.map(node => node.uuid), original.map(node => node.uuid));
    for (const mesh of mounted) assertVisibleInScene(mesh, system.scene);
  }
});

test("retired generated hull files and placeholder factories cannot return to the spawn fleet", async () => {
  assert.deepEqual(Object.keys(SPAWN_FLEET), ["light_fighter", "intergalactic"]);
  assert.equal(createAdventure().ship.kind, "light_fighter");
  for (const name of ["skiff", "lander"]) {
    await assert.rejects(access(new URL(`../../frontend/space-escape/public/assets/${name}.glb`, import.meta.url)));
  }
  const source = await readFile(new URL("../../frontend/space-escape/src/interplanetary.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /makePlaceholder|CapsuleGeometry|OctahedronGeometry/);
});

test("spawn aliens and minerals mount only downloaded assets and remain empty on failure", async () => {
  for (const succeeds of [false, true]) {
    const system = createSystem();
    const entries = [["alien1", system.alien1Model!], ["alien2", system.alien2Model!],
      ["minerals", system.mineralsModel!]] as const;
    const urls = entries.map(([key]) => `/assets/models/${key}/scene.gltf`);
    const { loader, models } = fixtureLoader(succeeds ? urls : []);
    await system.loadAssets(loader);
    for (const [key, container] of entries) {
      assert.equal(container.children.length, succeeds ? 1 : 0);
      if (succeeds) assertVisibleInScene(models.get(`/assets/models/${key}/scene.gltf`)!, system.scene);
    }
  }
});
