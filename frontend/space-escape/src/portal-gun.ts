import {
  BufferGeometry, Curve, ExtrudeGeometry, Float32BufferAttribute, Group, LatheGeometry,
  Mesh, MeshStandardMaterial, Shape, TubeGeometry, Vector2, Vector3,
} from "three";
import { mergeGeometries, mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";

import { machinedRing, mergeMachinedParts } from "./machined-detail";

export type PortalGunColor = "blue" | "orange";
type Surface = "ceramic" | "chassis" | "titanium" | "grip" | "insulator" | "bronze" | "lit";
type Station = [depth: number, halfWidth: number, halfHeight: number, centerHeight: number];
type Arc = [start: number, end: number];

const rear = 0.290;
const tau = Math.PI * 2;
class InductionCoil extends Curve<Vector3> {
  constructor(private startAngle: number) { super(); }
  getPoint(t: number, point = new Vector3()) {
    const angle = this.startAngle + t * tau * 2.2;
    return point.set(.078 * Math.cos(angle), .078 * Math.sin(angle), -.118 - t * .045);
  }
}
const shell: Station[] = [
  [0.012, .060, .050, .005], [.021, .074, .061, .006],
  [.053, .088, .074, .008], [.112, .101, .082, .009],
  [.172, .100, .079, .008], [.237, .090, .069, .007],
  [.291, .091, .071, .006], [.332, .098, .077, .006],
  [.352, .094, .070, .006], [.361, .083, .061, .006],
];

// Each row describes an elliptical section viewed along the barrel.
// The inner surface has the same stations so the panel ends can be closed.
function loft(stations: Station[], arc: Arc, divisions: number, thickness: number) {
  const positions: number[] = [];
  const indices: number[] = [];
  const stride = divisions + 1;
  const layerSize = stride * stations.length;

  for (const inset of thickness ? [0, thickness] : [0]) {
    for (const [depth, radiusX, radiusY, centerY] of stations) {
      for (let column = 0; column <= divisions; column++) {
        const angle = arc[0] + (arc[1] - arc[0]) * column / divisions;
        // The last two degrees roll under the outer lip of each split panel.
        const shoulder = thickness && inset === 0 && (column === 0 || column === divisions) ? .0025 : 0;
        positions.push(
          (radiusX - inset - shoulder) * Math.cos(angle),
          centerY + (radiusY - inset - shoulder) * Math.sin(angle),
          rear - depth,
        );
      }
    }
  }

  const quad = (a: number, b: number, c: number, d: number) => indices.push(a, b, c, a, c, d);
  for (let row = 0; row < stations.length - 1; row++) {
    const first = row * stride;
    for (let column = 0; column < divisions; column++) {
      const v = first + column;
      if (thickness) quad(v + layerSize, v + layerSize + 1, v + layerSize + stride + 1, v + layerSize + stride);
      quad(v, v + stride, v + stride + 1, v + 1);
    }
    if (thickness) {
      quad(first, first + layerSize, first + layerSize + stride, first + stride);
      const far = first + divisions;
      quad(far, far + stride, far + layerSize + stride, far + layerSize);
    }
  }

  if (thickness) {
    const end = layerSize - stride;
    for (let col = 0; col < divisions; col++) {
      quad(col, col + 1, layerSize + col + 1, layerSize + col);
      quad(end + col, layerSize + end + col, layerSize + end + col + 1, end + col + 1);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  if (arc[1] - arc[0] === tau) {
    const normal = geometry.getAttribute("normal");
    for (let row = 0; row < stations.length; row++) {
      const a = row * stride;
      const b = a + divisions;
      const x = normal.getX(a) + normal.getX(b);
      const y = normal.getY(a) + normal.getY(b);
      const z = normal.getZ(a) + normal.getZ(b);
      const length = Math.hypot(x, y, z);
      normal.setXYZ(a, x / length, y / length, z / length);
      normal.setXYZ(b, x / length, y / length, z / length);
    }
  }
  return geometry;
}

function profile(draw: (shape: Shape) => void, width: number, bevel: number, x = 0, steps = 6, bevelSegments = 3) {
  const shape = new Shape();
  draw(shape);
  shape.closePath();
  return new ExtrudeGeometry(shape, {
    depth: width, curveSegments: steps, bevelEnabled: bevel > 0,
    bevelThickness: bevel, bevelSize: bevel, bevelSegments,
  }).translate(0, 0, -width / 2).rotateY(-Math.PI / 2).translate(x, 0, 0);
}

// Radius and depth from the rear datum. Rotating the meridian aims the aperture along −Z.
function turn(path: [radius: number, depth: number][], divisions: number) {
  return new LatheGeometry(path.map(([radius, depth]) => new Vector2(radius, depth)), divisions)
    .rotateX(-Math.PI / 2).translate(0, 0, rear);
}

function grip() {
  return profile(s => {
    s.moveTo(.174, -.035);
    s.quadraticCurveTo(.171, -.056, .189, -.072);
    s.lineTo(.229, -.140);
    s.quadraticCurveTo(.236, -.148, .226, -.150);
    s.lineTo(.169, -.145);
    s.quadraticCurveTo(.159, -.144, .156, -.131);
    s.lineTo(.127, -.067);
    s.quadraticCurveTo(.116, -.047, .119, -.038);
  }, .048, .002);
}

function claw(width: number, inner: boolean, gray: boolean) {
  return profile(s => {
    if (inner) {
      s.moveTo(-.219, .056); s.lineTo(-.247, .060); s.lineTo(-.292, .066);
      s.lineTo(-.326, .061); s.lineTo(-.328, .053);
      s.lineTo(-.295, .051); s.lineTo(-.244, .051);
    } else {
      s.moveTo(-.205, .058);
      s.quadraticCurveTo(-.218, .080, -.242, .082);
      s.lineTo(-.276, .080); s.lineTo(-.315, .072);
      s.quadraticCurveTo(-.324, .070, -.327, .064);
      s.lineTo(-.298, .066); s.lineTo(-.248, .065); s.lineTo(-.224, .054);
    }
  }, width, inner ? .002 : .003, 0, gray ? 6 : 12, gray ? 3 : 5);
}

function worldGeometry(batches: Map<Surface, BufferGeometry[]>, surface: Surface, geometry: BufferGeometry) {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry;
  if (flat !== geometry) geometry.dispose();
  flat.deleteAttribute("uv");
  const entries = batches.get(surface);
  if (entries) entries.push(flat);
  else batches.set(surface, [flat]);
}

export function createPortalGun(detail: "blockout" | "review" = "review") {
  const gray = detail === "blockout";
  const radial = gray ? 24 : 64;
  const shellSteps = gray ? 10 : 32;
  const material = (color: number, roughness: number, metalness: number) =>
    new MeshStandardMaterial({ color: gray ? 0x7d858c : color, roughness: gray ? .67 : roughness, metalness: gray ? 0 : metalness });
  const materials: Record<Surface, MeshStandardMaterial> = {
    ceramic: material(0x8e9693, .41, .19),
    chassis: material(0x222c32, .41, .60),
    titanium: material(0x667681, .36, .78),
    grip: material(0x161f23, .74, .12),
    insulator: material(0x11191e, .56, .25),
    bronze: material(0x9e7758, .33, .77),
    lit: material(0x2a7491, .23, .24),
  };
  for (const [name, entry] of Object.entries(materials)) entry.name = name;
  const root = new Group();
  root.name = "dawn_lab_portal_projector";
  const housing = new Group();
  housing.name = "housing_and_grip";
  const emitter = new Group();
  emitter.name = "emitter_cartridge";
  root.add(housing, emitter);
  const solids = new Map<Surface, BufferGeometry[]>();
  const cartridge = new Map<Surface, BufferGeometry[]>();
  const add = (surface: Surface, geometry: BufferGeometry) => worldGeometry(solids, surface, geometry);
  const mount = (surface: Surface, geometry: BufferGeometry) => worldGeometry(cartridge, surface, geometry);

  add("chassis", loft([
    [0, .052, .044, .005], [.010, .064, .053, .005], [.043, .077, .062, .006], [.105, .088, .068, .007],
    [.231, .080, .061, .005], [.306, .080, .061, .005], [.375, .073, .065, .003], [.410, .059, .056, 0],
  ], [0, tau], radial, 0));
  add("ceramic", loft(shell, [-.72, 1.515], shellSteps, .011));
  add("ceramic", loft(shell, [Math.PI - 1.515, Math.PI + .72], shellSteps, .011));
  add("chassis", turn([[0, 0], [.046, 0], [.052, .004], [.056, .010], [.053, .016], [.042, .022], [0, .022]], radial).scale(1.1, .94, 1));
  add("grip", grip());

  // Trigger guard formed as an open part in the side profile.
  add("chassis", profile(s => {
    s.moveTo(.140, -.042); s.lineTo(.037, -.043); s.lineTo(.040, -.064);
    s.quadraticCurveTo(.048, -.104, .072, -.105); s.lineTo(.168, -.105);
    s.lineTo(.163, -.092); s.lineTo(.078, -.092);
    s.quadraticCurveTo(.057, -.090, .053, -.061); s.lineTo(.139, -.061);
  }, .028, .003));
  add("titanium", profile(s => {
    s.moveTo(.119, -.052); s.quadraticCurveTo(.115, -.071, .131, -.079);
    s.lineTo(.130, -.087); s.quadraticCurveTo(.104, -.078, .106, -.052);
  }, .019, .0015));

  mount("chassis", turn([
    [.050, .355], [.058, .361], [.068, .376], [.077, .400], [.076, .441],
    [.068, .457], [.062, .464], [.050, .464], [.047, .455], [.047, .404], [.050, .355],
  ], radial));
  mount("titanium", turn([
    [.075, .419], [.077, .421], [.077, .437], [.074, .441], [.072, .437], [.072, .421], [.075, .419],
  ], radial));
  mount("insulator", turn([
    [0, .404], [.037, .404], [.045, .418], [.047, .440], [.051, .454],
    [.054, .455], [.053, .440], [.047, .412], [.039, .396], [0, .396],
  ], radial));
  mount("titanium", turn([
    [.015, .401], [.022, .410], [.025, .434], [.023, .442], [.017, .442], [.013, .436], [.012, .407], [.015, .401],
  ], radial));
  mount("lit", turn([
    [.044, .429], [.046, .433], [.047, .442], [.046, .447], [.043, .445], [.043, .436], [.044, .429],
  ], radial));
  mount("lit", turn([[0, .435], [.012, .435], [.016, .439], [.014, .444], [0, .444]], radial));

  const jaw = claw(.026, false, gray);
  const shoe = claw(.015, true, gray);
  const jawSeat = gray ? null : profile(s => {
    s.moveTo(-.140, .066);
    s.quadraticCurveTo(-.152, .078, -.172, .079);
    s.lineTo(-.206, .077);
    s.quadraticCurveTo(-.228, .076, -.242, .070);
    s.lineTo(-.239, .055);
    s.lineTo(-.179, .051); s.lineTo(-.148, .061);
  }, .035, .003, 0, 10, 5);
  for (const angle of [0, tau / 3, -tau / 3]) {
    if (jawSeat) mount("chassis", jawSeat.clone().rotateZ(angle));
    mount("titanium", jaw.clone().rotateZ(angle));
    mount("chassis", shoe.clone().rotateZ(angle));
  }
  jaw.dispose();
  shoe.dispose();
  jawSeat?.dispose();

  if (!gray) {
    add("chassis", profile(s => {
      s.moveTo(.244, .066); s.quadraticCurveTo(.235, .091, .200, .092);
      s.lineTo(-.024, .093); s.quadraticCurveTo(-.045, .093, -.053, .079); s.lineTo(-.054, .066);
    }, .023, .002));
    add("lit", profile(s => {
      s.moveTo(.160, .094); s.lineTo(.068, .095);
      s.quadraticCurveTo(.059, .095, .055, .097);
      s.lineTo(.061, .098); s.lineTo(.157, .097);
    }, .010, .0006));
    add("chassis", profile(s => {
      s.moveTo(.274, .010); s.lineTo(.288, .010);
      s.quadraticCurveTo(.291, .018, .288, .031); s.lineTo(.276, .031);
    }, .052, .0013));
    add("lit", profile(s => {
      s.moveTo(.287, .018); s.lineTo(.292, .019); s.lineTo(.291, .026); s.lineTo(.287, .027);
    }, .031, .0009));
    add("titanium", profile(s => {
      s.moveTo(.225, -.134); s.lineTo(.233, -.143); s.lineTo(.230, -.151);
      s.lineTo(.167, -.148); s.lineTo(.162, -.142); s.lineTo(.163, -.136);
    }, .050, .0018));

    for (const side of [-1, 1]) {
      add("chassis", profile(s => {
        s.moveTo(.190, .048); s.quadraticCurveTo(.176, .057, .154, .057);
        s.lineTo(.097, .054); s.lineTo(.071, .041); s.lineTo(.031, .039);
        s.lineTo(.038, .031); s.lineTo(.086, .033); s.lineTo(.106, .044);
        s.lineTo(.170, .046);
      }, .010, .0015, side * .081, 8));
      add("titanium", profile(s => {
        s.moveTo(.173, .048); s.lineTo(.113, .048); s.lineTo(.096, .041);
        s.lineTo(.113, .044); s.lineTo(.170, .044);
      }, .003, .0006, side * .088));
      add("insulator", profile(s => {
        s.moveTo(.139, -.001); s.quadraticCurveTo(.123, .012, .094, .010);
        s.lineTo(-.018, .004); s.lineTo(-.052, -.029); s.lineTo(-.013, -.044); s.lineTo(.127, -.035);
      }, .015, .003, side * .090));
      for (let fin = 0; fin < 6; fin++) {
        const z = .002 + fin * .0185;
        add("chassis", profile(s => {
          s.moveTo(z - .010, -.027); s.lineTo(z - .002, .002);
          s.lineTo(z + .008, .001); s.lineTo(z, -.026);
        }, .007, .0015, side * .101));
      }
      for (const [z, y, x] of [[.215, -.014, .083], [-.014, -.046, .081], [.164, -.094, .025]]) {
        const axle = new LatheGeometry([
          new Vector2(0, -.003), new Vector2(.0064, -.003), new Vector2(.0064, .001),
          new Vector2(.0051, .0022), new Vector2(.0031, .0022), new Vector2(.0024, .0004), new Vector2(0, .0004),
        ], 20).rotateZ(-side * Math.PI / 2).translate(side * x, y, z);
        add("titanium", axle);
      }
    }
    mount("bronze", turn([
      [.055, .466], [.055, .468], [.054, .470], [.052, .471],
      [.051, .469], [.051, .466], [.055, .466],
    ], radial));
    mount("bronze", turn([
      [.026, .426], [.029, .428], [.029, .432], [.028, .433], [.024, .432], [.024, .426], [.026, .426],
    ], radial));
  }

  for (const [parent, batches] of [[housing, solids], [emitter, cartridge]] as const) {
    for (const [surface, geometries] of batches) {
      const merged = mergeGeometries(geometries);
      if (!merged) throw new Error(`Cannot merge portal gun surface ${surface}`);
      const mesh = new Mesh(mergeVertices(merged), materials[surface]);
      mesh.name = `${parent.name}_${surface}`;
      parent.add(mesh);
      merged.dispose();
      for (const geometry of geometries) geometry.dispose();
    }
  }

  if (!gray) {
    const titanium = machinedRing([
      [.073, 0], [.077, .003], [.083, .008], [.087, .013], [.087, .018],
      [.083, .021], [.081, .025], [.086, .027], [.087, .031], [.086, .038],
      [.081, .041], [.076, .041], [.074, .038], [.073, 0],
    ], 160, 12).translate(0, 0, -.119);
    const lens = machinedRing([
      [.002, 0], [.013, -.002], [.022, -.006], [.030, -.009],
      [.033, -.010], [.035, -.014], [.035, -.019], [.033, -.021],
      [.030, -.022], [.022, -.023], [.013, -.024], [.001, -.025],
    ], 160, 12).translate(0, 0, -.164);
    const apertures = Array.from({ length: 12 }, (_, i) => machinedRing([
      [.051, 0], [.057, .001], [.063, .005], [.063, .009],
      [.059, .013], [.054, .013], [.050, .010], [.049, .003], [.051, 0],
    ], 40, 6, i * tau / 12 + .018, tau / 12 - .036).translate(0, 0, -.163));
    const coils = [0, tau / 3, 2 * tau / 3].map(angle =>
      new TubeGeometry(new InductionCoil(angle), 384, .0024, 12, false));
    const seal = machinedRing([
      [.072, 0], [.076, .001], [.080, .003], [.081, .006], [.079, .008],
      [.078, .009], [.079, .010], [.081, .012], [.080, .014],
      [.076, .015], [.073, .013], [.072, 0],
    ], 128, 6).translate(0, 0, -.106);

    const ceramicLens = new MeshStandardMaterial({ color: 0x234850, roughness: .23, metalness: .55 });
    emitter.add(
      mergeMachinedParts("induction_collar", [titanium], materials.chassis),
      mergeMachinedParts("field_lens", [lens], ceramicLens),
      mergeMachinedParts("segmented_aperture", apertures, materials.titanium),
      mergeMachinedParts("wound_induction_coils", coils, materials.bronze),
      mergeMachinedParts("threaded_seal", [seal], materials.insulator),
    );
  }

  const gripPivot = new Group();
  gripPivot.name = "right_hand_socket";
  gripPivot.position.set(0, -.09, .174);
  root.add(gripPivot);

  function setColor(color: PortalGunColor) {
    if (gray) return;
    materials.lit.color.setHex(color === "blue" ? 0x0b516f : 0x983a0c);
    materials.lit.emissive.setHex(color === "blue" ? 0x139ae9 : 0xff711c);
    materials.lit.emissiveIntensity = 1.38;
  }
  setColor("blue");
  return { model: root, setColor };
}
