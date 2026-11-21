import {
  BufferGeometry, Group, LatheGeometry, Mesh, MeshStandardMaterial, Vector2,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

type ProfilePoint = [radius: number, depth: number];

// The meridian tracks the real fillets, lips and grooves of the part.
// Surface nodes lie at measured points on the meridian so the bevels hold their highlight in close-up.
export function machinedRing(
  profile: ProfilePoint[], sectors: number, interpolation: number,
  phiStart = 0, phiLength = Math.PI * 2,
) {
  const points = profile.map(([r, d]) => new Vector2(r, d));
  const contour: Vector2[] = [];
  for (let n = 0; n < points.length - 1; n++) {
    const a = points[n], b = points[n + 1];
    const previous = points[n - 1] ?? a;
    const next = points[n + 2] ?? b;
    const startTangent = b.clone().sub(previous).multiplyScalar(0.30);
    const endTangent = next.clone().sub(a).multiplyScalar(0.30);
    for (let j = 0; j < interpolation; j++) {
      const t = j / interpolation;
      const t2 = t * t;
      const t3 = t2 * t;
      const p = a.clone().multiplyScalar(2 * t3 - 3 * t2 + 1)
        .addScaledVector(startTangent, t3 - 2 * t2 + t)
        .addScaledVector(b, -2 * t3 + 3 * t2)
        .addScaledVector(endTangent, t3 - t2);
      p.x = Math.max(.00001, p.x);
      contour.push(p);
    }
  }
  contour.push(points[points.length - 1]);
  return new LatheGeometry(contour, sectors, phiStart, phiLength).rotateX(-Math.PI / 2);
}

// Lit joints stay separate; all static pieces using one material are submitted together.
export function mergeMachinedParts(name: string, parts: BufferGeometry[], material: MeshStandardMaterial) {
  const geometry = mergeGeometries(parts);
  parts.forEach(part => part.dispose());
  if (!geometry) throw new Error(`Incompatible mesh parts for ${name}`);
  const mesh = new Mesh(geometry, material);
  mesh.name = name;
  return mesh;
}

export function finish(color: number, metalness: number, roughness: number, emissive = 0) {
  return new MeshStandardMaterial({ color, roughness, metalness, emissive, emissiveIntensity: emissive ? 1.25 : 0 });
}

export function meshTriangles(model: Group) {
  let count = 0;
  model.traverse(node => {
    if (node instanceof Mesh) count += (node.geometry.index?.count ?? node.geometry.attributes.position.count) / 3;
  });
  return count;
}
