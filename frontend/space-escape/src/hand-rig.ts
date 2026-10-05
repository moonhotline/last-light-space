import * as THREE from "three";
import { clone } from "three/addons/utils/SkeletonUtils.js";

/** Real avatar hand/forearm skin and bones, with the torso excluded from the view. */
export function createHandRig(source: THREE.Object3D, side: "Right" | "Left", grip: THREE.Vector3) {
  const rig = clone(source);
  const joint = rig.getObjectByName(`${side}Hand`) || rig.getObjectByName(`mixamorig:${side}Hand`);
  if (!joint) return null;
  rig.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.visible = false;
    if (!(object instanceof THREE.SkinnedMesh)) return;
    const geometry = object.geometry;
    const skinIndex = geometry.getAttribute("skinIndex");
    const skinWeight = geometry.getAttribute("skinWeight");
    if (!skinIndex || !skinWeight) return;
    const belongs = (vertex: number) => {
      let weight = 0;
      for (let i = 0; i < 4; i++) {
        const bone = object.skeleton.bones[skinIndex.getComponent(vertex, i)];
        if (bone && new RegExp(`${side}(Hand|ForeArm)`).test(bone.name)) {
          weight += skinWeight.getComponent(vertex, i);
        }
      }
      return weight > 0.5;
    };
    const indices: number[] = [];
    const count = geometry.index?.count || geometry.getAttribute("position").count;
    for (let i = 0; i < count; i += 3) {
      const a = geometry.index?.getX(i) ?? i;
      const b = geometry.index?.getX(i + 1) ?? i + 1;
      const c = geometry.index?.getX(i + 2) ?? i + 2;
      if (belongs(a) && belongs(b) && belongs(c)) indices.push(a, b, c);
    }
    if (!indices.length) return;
    object.geometry = geometry.clone();
    object.geometry.setIndex(indices);
    object.geometry.clearGroups();
    object.visible = true;
    object.castShadow = false;
    object.frustumCulled = false;
  });
  const root = new THREE.Group();
  root.name = `${side.toLowerCase()}_view_arm`;
  root.add(rig);
  root.updateMatrixWorld(true);
  // Compensate the imported centimetre skeleton through a world-space socket,
  // instead of making the held object 100 times too small under a 0.01 hand.
  const target = new THREE.Matrix4().compose(
    grip,
    new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, side === "Right" ? -0.15 : 0.25)),
    new THREE.Vector3(0.01, 0.01, 0.01),
  );
  const transform = target.multiply(joint.matrixWorld.clone().invert());
  transform.decompose(root.position, root.quaternion, root.scale);
  root.updateMatrixWorld(true);
  return { root, joint };
}

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

export function attachHeldModel(parent: THREE.Object3D, hand: THREE.Object3D | null, model: THREE.Group, position: THREE.Vector3) {
  parent.add(model);
  model.position.copy(position);
  parent.updateWorldMatrix(true, true);
  if (hand) hand.attach(model);
}
