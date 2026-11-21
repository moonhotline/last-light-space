import * as THREE from "three";
import { clone } from "three/addons/utils/SkeletonUtils.js";

/** Preserve authored root scale; normalise the wrapper, never reset the glTF root. */
export function equipmentModel(source: THREE.Object3D, size: number, rotationY = Math.PI) {
  const model = new THREE.Group();
  const imported = clone(source);
  imported.rotation.y += rotationY;
  model.add(imported);
  const bounds = new THREE.Box3().setFromObject(model);
  const dimensions = bounds.getSize(new THREE.Vector3());
  imported.position.sub(bounds.getCenter(new THREE.Vector3()));
  model.scale.setScalar(size / Math.max(dimensions.x, dimensions.y, dimensions.z, 0.001));
  model.traverse((o) => {
    if (o instanceof THREE.Mesh) o.castShadow = false;
  });
  return model;
}
