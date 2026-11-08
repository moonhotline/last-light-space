import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as THREE from "three";
import { GameView } from "../../frontend/space-escape/src/scene";

function skyView() {
  const view: GameView = Object.assign(Object.create(GameView.prototype), {
    skyScene: new THREE.Scene(), sky: new THREE.Group(), giant: new THREE.Group(), moon: new THREE.Group(),
    camera: new THREE.PerspectiveCamera(66, 16 / 9, 0.1, 30000),
    skyCamera: new THREE.PerspectiveCamera(66, 16 / 9, 100, 30000),
    radialTexture: () => new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1),
  });
  view.buildSky();
  return view;
}

test("Kepler's cloud bands, rings, atmosphere and the moon render above the spawn horizon", async () => {
  const view = skyView();
  assert.deepEqual(view.giant.position.toArray(), [4800, 4500, -9200]);
  assert.deepEqual(view.moon.position.toArray(), [-3600, 1400, -8500]);
  assert.equal(view.giant.parent, view.sky);
  assert.equal(view.moon.parent, view.sky);
  assert.equal(view.giant.children.length, 3, "gas surface, rings and atmosphere must all be restored");
  assert.ok(view.giant.getObjectByName("kepler-cloud-bands") instanceof THREE.Mesh);
  const ring = view.giant.getObjectByName("kepler-rings") as THREE.Mesh;
  assert.ok(ring.geometry instanceof THREE.RingGeometry);
  assert.equal((ring.material as THREE.ShaderMaterial).side, THREE.DoubleSide);
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
      for (const body of [view.giant, view.moon]) {
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
