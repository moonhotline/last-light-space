import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as THREE from "three";
import { GameView } from "../../frontend/space-escape/src/scene";
import { InterplanetarySystem } from "../../frontend/space-escape/src/interplanetary";
import { SOLAR_SYSTEM } from "../../frontend/space-escape/shared/celestial";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { authoredModel } from "./helpers/authored-model";

function skyView() {
  const view: GameView = Object.assign(Object.create(GameView.prototype), {
    skyScene: new THREE.Scene(), sky: new THREE.Group(), moon: new THREE.Group(),
    camera: new THREE.PerspectiveCamera(66, 16 / 9, 0.1, 30000),
    skyCamera: new THREE.PerspectiveCamera(66, 16 / 9, 100, 30000),
    radialTexture: () => new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1),
  });
  view.buildSky();
  return view;
}

test("the sky keeps the textured moon without a second procedural Kepler", async () => {
  const view = skyView();
  assert.deepEqual(view.moon.position.toArray(), [-3600, 1400, -8500]);
  assert.equal(view.moon.parent, view.sky);
  assert.equal(view.sky.getObjectByName("kepler-sky"), undefined);
  assert.ok(view.moon.children.some(node => node instanceof THREE.Sprite), "the moon must have its halo");
  const texture = await readFile(new URL("../../frontend/space-escape/public/assets/moon.jpg", import.meta.url));
  assert.equal(texture.readUInt16BE(0), 0xffd8, "the shipped lunar texture must be a JPEG");
});

test("sky bodies survive viewpoint changes, flight altitude and returning from a reverse view", () => {
  const view = skyView();
  for (const position of [[0, 24, 355], [100, 900, -100], [10000, -1000, 10000]]) {
    for (const fov of [40, 66, 78]) {
      view.camera.position.fromArray(position);
      view.camera.fov = fov;
      for (const body of [view.moon]) {
        for (const facing of [true, false, true]) {
          const direction = body.position.clone().multiplyScalar(facing ? 1 : -1);
          view.camera.lookAt(view.camera.position.clone().add(direction));
          view.syncSkyCamera();
          view.skyScene.updateMatrixWorld(true);
          view.skyCamera.updateMatrixWorld(true);
          const frustum = new THREE.Frustum().setFromProjectionMatrix(
            new THREE.Matrix4().multiplyMatrices(view.skyCamera.projectionMatrix, view.skyCamera.matrixWorldInverse),
          );
          assert.equal(body.visible, true, "viewpoint must never toggle sky visibility");
          assert.equal(frustum.intersectsObject(body.children[0]), facing, "the complete body must return to view without far clipping");
          assert.ok(body.getWorldPosition(new THREE.Vector3()).sub(view.skyCamera.position).distanceTo(body.position) < 1e-8);
        }
      }
    }
  }
});

test("authored Kepler mounts immediately and stays overhead inside both 30 km camera frustums", async (t) => {
  // Other assets are irrelevant here; parse the actual shipped planet geometry.
  const gltf = await authoredModel("/assets/models/stylized_planet/scene.gltf");
  const loader = new GLTFLoader();
  t.mock.method(loader, "loadAsync", async (url: string) => {
    if (url !== "/assets/models/stylized_planet/scene.gltf") throw new Error("unrelated asset");
    return { ...gltf, scene: gltf.scene.clone(true) };
  });
  // A resolved asset must not depend on a later animation-frame mount.
  const originalFrame = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = () => 0;
  t.after(() => { globalThis.requestAnimationFrame = originalFrame; });
  const camera = new THREE.PerspectiveCamera(66, 16 / 9, 0.1, 30000);
  const skyCamera = new THREE.PerspectiveCamera(66, 16 / 9, 100, 30000);
  const system = new InterplanetarySystem(new THREE.Scene(), camera);
  await system.loadAssets(loader);
  const entry = system.planets.get("kepler")!;
  assert.ok(entry.highDetail);
  assert.ok(entry.highDetail.parent === entry.group, "loaded GLTF must be mounted before loadAssets resolves");
  for (const height of [0, 24, 50, 300, 5423]) {
    system.step(1 / 60, { x: 0, y: height, z: 355 });
    assert.ok(entry.group.position.y >= 4000 && entry.group.position.y <= 6000);
    assert.equal(entry.surfaceMesh.parent, entry.group, "fallback stays mounted alongside authored detail");
    assert.equal(entry.surfaceMesh.visible, true);
    if (height <= 300) {
      assert.ok(entry.surfaceMesh.scale.x <= 0.9, "fallback must sit beneath the authored terrain");
    } else {
      assert.equal(entry.surfaceMesh.scale.x, 1, "fallback matches full orbital radius in deep space");
    }
    for (const cam of [camera, skyCamera]) {
      cam.position.set(0, height + 2, 355);
      // Look towards Kepler in the celestial sky.
      const toKepler = entry.group.position.clone().sub(cam.position);
      const pitch = Math.atan2(toKepler.y, Math.hypot(toKepler.x, toKepler.z));
      const yaw = -Math.atan2(toKepler.x, -toKepler.z);
      cam.rotation.set(pitch, yaw, 0, "YXZ");
      cam.updateMatrixWorld(true);
      system.scene.updateMatrixWorld(true);
      const frustum = new THREE.Frustum().setFromProjectionMatrix(
        new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse),
      );
      const meshes: THREE.Mesh[] = [];
      entry.highDetail.traverse(node => { if (node instanceof THREE.Mesh) meshes.push(node); });
      assert.deepEqual(meshes.map(mesh => (mesh.material as THREE.Material).name).sort(), ["Clouds", "Planet"]);
      for (const mesh of meshes) {
        const material = mesh.material as THREE.MeshBasicMaterial;
        assert.equal(material.opacity, 1, "preserve the authored cloud and ocean opacity");
        assert.equal(material.fog, false, "26 km of basin fog must not erase the model");
        assert.ok(frustum.intersectsObject(mesh));
        // Check actual vertices: a cloud's empty bounding-box corners can exceed
        // the far plane even when every rendered triangle is safely inside it.
        const positions = mesh.geometry.getAttribute("position");
        const point = new THREE.Vector3();
        for (let index = 0; index < positions.count; index++) {
          point.fromBufferAttribute(positions, index).applyMatrix4(mesh.matrixWorld);
          assert.ok(frustum.containsPoint(point), `${material.name}: vertex ${index} must remain inside the frustum`);
        }
      }
      const planet = meshes.find(mesh => (mesh.material as THREE.Material).name === "Planet")!;
      const diameter = new THREE.Box3().setFromObject(planet).getSize(new THREE.Vector3()).y;
      const angularDiameter = THREE.MathUtils.radToDeg(2 * Math.atan(diameter / (2 * cam.position.distanceTo(entry.group.position))));
      if (height <= 300) {
        assert.ok(angularDiameter >= 9, `terrain must be large enough to read from spawn; got ${angularDiameter} degrees`);
      } else {
        assert.ok(angularDiameter >= 3, `terrain remains visible at high elevation; got ${angularDiameter} degrees`);
      }
    }
  }
  system.step(1 / 60, SOLAR_SYSTEM.kepler.landingSite);
  assert.deepEqual(entry.group.position.toArray(), Object.values(SOLAR_SYSTEM.kepler.position));
  assert.deepEqual(entry.group.scale.toArray(), [1, 1, 1], "orbital capture must retain the physical planet size");
});
