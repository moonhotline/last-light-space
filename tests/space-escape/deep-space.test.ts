import test from "node:test";
import assert from "node:assert/strict";
import { Scene, PerspectiveCamera, Vector3, Group, Mesh, SphereGeometry, MeshStandardMaterial, DataTexture, Frustum, Matrix4 } from "three";
import { InterplanetarySystem } from "../../frontend/space-escape/src/interplanetary";
import { SOLAR_SYSTEM } from "../../frontend/space-escape/shared/celestial";
import { groundAt, SPAWN } from "../../frontend/space-escape/shared/map";
import { FIGHTER_POS } from "../../frontend/space-escape/shared/adventure-data";

test("orbital planet surfaces and atmospheres share elevated global coordinates", () => {
  const system = new InterplanetarySystem(new Scene(), new PerspectiveCamera());
  system.step(0, { x: 0, y: 1000, z: 0 });
  for (const [id, planet] of system.planets) {
    assert.deepEqual(planet.group.position.toArray(), Object.values(SOLAR_SYSTEM[id].position));
    assert.equal(planet.surfaceMesh.parent, planet.group);
    const atmosphere = planet.atmosphereMesh;
    if (id.startsWith("warpgate")) {
      assert.equal(atmosphere, undefined, "a traversable gate has no spherical atmosphere shell");
      continue;
    }
    assert.ok(atmosphere);
    assert.equal(atmosphere.position.length(), 0);
  }
});

test("raising decorative Kepler does not put basin players in cruise mode", () => {
  const system = new InterplanetarySystem(new Scene(), new PerspectiveCamera());
  const floor = groundAt(SPAWN.x, SPAWN.z);
  system.step(1 / 30, { ...SPAWN, y: floor + 0.85 });
  assert.equal(system.flightMode, "surface");
  assert.ok(system.flightAltitude < 1);
  system.step(1 / 30, { ...SPAWN, y: floor + 700 });
  assert.equal(system.flightMode, "cruise");
  assert.equal(system.flightAltitude, 700);
  system.step(1 / 30, { ...SPAWN, y: floor + 0.85 });
  assert.equal(system.flightMode, "surface");
  const kepler = SOLAR_SYSTEM.kepler;
  system.step(1 / 30, { ...kepler.landingSite, planet: "kepler" });
  assert.equal(system.flightAltitude, 1, "spherical Kepler walkers retain radial altitude");
  assert.equal(system.flightMode, "surface");
  system.currentPlanet = "earth";
  const earth = SOLAR_SYSTEM.earth;
  system.step(1 / 30, new Vector3().copy(earth.position).add(new Vector3(0, earth.radius + 400, 0)));
  assert.equal(system.flightMode, "cruise");
  assert.equal(system.flightAltitude, 400);
});

test("Mercury surfaceMesh possesses visible cosmic emissive glow against deep space", () => {
  const system = new InterplanetarySystem(new Scene(), new PerspectiveCamera());
  const mercury = system.planets.get("mercury");
  assert.ok(mercury);
  const mat = mercury.surfaceMesh.material as any;
  assert.ok(mat.emissiveIntensity >= 0.2, "Mercury must possess positive emissive intensity");
  assert.equal(mercury.surfaceMesh.visible, true);
});

test("Blerk equips hoverboard and activates repulsor surfing when following at speed", () => {
  const scene = new Scene();
  const system = new InterplanetarySystem(scene, new PerspectiveCamera());
  const placeholder = new Group();
  system.downloadedAssets.set("hoverboard", new Group());
  system.guideModel = placeholder;
  scene.add(placeholder);

  const hoverboard = system.attachBlerkHoverboard();
  assert.ok(hoverboard);
  assert.equal(hoverboard.name, "blerk-hoverboard");
  assert.equal(hoverboard.parent, placeholder);
  assert.equal(hoverboard.visible, false);

  // Trigger follow update: distance > 4 triggers run & hoverboard surfing
  system.guideFollowing = true;
  system.step(0.1, new Vector3(100, 20, 335));
  assert.equal(hoverboard.visible, true, "Hoverboard should deploy when Blerk is running/surfing");
  assert.ok(system.guideModel.position.y > groundAt(system.guideModel.position.x, system.guideModel.position.z) + 1.2);

  // Trigger idle update: close distance
  system.step(0.1, new Vector3(system.guideModel.position.x + 1, 20, system.guideModel.position.z));
  assert.equal(hoverboard.visible, false, "Hoverboard should stow when Blerk is idle");
});

test("InterplanetarySystem preserves all planets and docks spaceship at starting position with frustum culling", () => {
  const scene = new Scene();
  const camera = new PerspectiveCamera(60, 1, 0.1, 10000);
  camera.position.set(0, 10, 0);
  camera.lookAt(0, 10, 100); // looking toward +Z
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();

  const system = new InterplanetarySystem(scene, camera);
  const floor = groundAt(SPAWN.x, SPAWN.z);

  // Kepler and other planets are NOT deleted or hidden; systemGroup remains active
  system.step(1 / 30, { ...SPAWN, y: floor + 0.85 });
  assert.equal(system.systemGroup.visible, true, "systemGroup and planetary bodies must be preserved");
  assert.ok(system.planets.has("kepler"), "Kepler planet must exist");
  assert.ok(system.planets.has("earth"), "Earth planet must exist");
  assert.ok(system.planets.has("mercury"), "Mercury planet must exist");
  assert.ok(system.planets.has("stylized"), "Stylized planet must exist");

  // Spaceship is docked at starting position FIGHTER_POS
  const ship = system.shipMeshes.get("light_fighter");
  assert.ok(ship, "Spaceship model must exist");
  assert.equal(ship.position.x, FIGHTER_POS.x, "Ship x coordinate must match FIGHTER_POS starting position");
  assert.equal(ship.position.z, FIGHTER_POS.z, "Ship z coordinate must match FIGHTER_POS starting position");

  // Camera pointing at FIGHTER_POS starting position
  camera.lookAt(FIGHTER_POS.x, FIGHTER_POS.y, FIGHTER_POS.z);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  system.step(1 / 30, { ...SPAWN, y: floor + 0.85 });
  assert.equal(ship.visible, true, "Spaceship in front of camera must be visible at starting position");

  // Turning away leaves visibility intact; the renderer culls individual meshes.
  camera.lookAt(-FIGHTER_POS.x, FIGHTER_POS.y, -FIGHTER_POS.z);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  system.step(1 / 30, { ...SPAWN, y: floor + 0.85 });
  assert.equal(ship.visible, true, "camera orientation must not hide the ship container");
  assert.equal(ship.frustumCulled, true);
});

test("Venus uses an opaque standard surface with its atmospheric cloud texture", () => {
  const system = new InterplanetarySystem(new Scene(), new PerspectiveCamera());
  const material = system.planets.get("venus")!.surfaceMesh.material as MeshStandardMaterial;
  assert.equal(material.type, "MeshStandardMaterial");
  assert.ok(material.map instanceof DataTexture);
  assert.equal(material.transparent, false);
  assert.equal(material.opacity, 1);
});

test("planet fallback surfaces and Saturn's rings survive detail loading and rapid camera turns", () => {
  const scene = new Scene();
  const camera = new PerspectiveCamera(60, 1, 0.1, 50000);
  const system = new InterplanetarySystem(scene, camera);
  for (const [id, entry] of system.planets) {
    if (id === "warpgate") continue;
    const detail = new Group();
    detail.add(new Mesh(new SphereGeometry(entry.body.radius), new MeshStandardMaterial()));
    entry.highDetail = detail;
    // The asset has resolved, but its requestAnimationFrame mount is still pending.
    system.step(0, { x: 0, y: 20, z: 0 });
    assert.equal(entry.surfaceMesh.visible, true, `${id} must render while detail mounting is pending`);
    entry.group.add(detail);
  }
  for (const height of [20, 1000, 20]) {
    for (const yaw of [0, Math.PI, -Math.PI / 2, Math.PI / 2]) {
      camera.rotation.y = yaw; // Deliberately leave camera matrices from the previous frame.
      system.step(1 / 60, { x: 0, y: height, z: 0 });
      for (const [id, entry] of system.planets) {
        assert.equal(entry.group.visible, true, id);
        assert.equal(entry.surfaceMesh.visible, true, `${id} fallback must stay visible`);
        entry.group.traverse((node) => {
          if (node instanceof Mesh) assert.equal(node.frustumCulled, true, id);
        });
        if (entry.highDetail) assert.equal(entry.highDetail.visible, true, id);
        if (entry.rings) {
          assert.equal(entry.rings.visible, true, id);
          assert.ok(entry.rings.children.every(node => node.visible));
        }
      }
    }
  }
});

test("spawn entities stay visible on frame zero and native frusta track camera turns", () => {
  const scene = new Scene();
  const camera = new PerspectiveCamera(60, 1, 0.1, 10000);
  const system = new InterplanetarySystem(scene, camera);
  const entities = [...system.shipMeshes.values(), system.alien1Model!, system.alien2Model!, system.mineralsModel!];
  const body = new Mesh(new SphereGeometry(2), new MeshStandardMaterial());
  system.shipMeshes.get("light_fighter")!.add(body);
  system.step(0, FIGHTER_POS);
  assert.ok(entities.every(entity => entity.visible), "frame zero must not hide spawn entities");
  camera.position.copy(system.shipMeshes.get("light_fighter")!.position).add(new Vector3(0, 0, 30));
  for (const facingShip of [true, false, true]) {
    camera.rotation.set(0, facingShip ? 0 : Math.PI, 0);
    system.step(1 / 60, FIGHTER_POS);
    assert.ok(entities.every(entity => entity.visible), "camera turns must not rewrite visibility");
    scene.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    const frustum = new Frustum().setFromProjectionMatrix(
      new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
    );
    assert.equal(body.frustumCulled, true);
    assert.equal(frustum.intersectsObject(body), facingShip, "native mesh culling uses the current render matrices");
  }
});
