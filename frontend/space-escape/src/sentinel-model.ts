import { ExtrudeGeometry, Group, Mesh, Path, Shape } from "three";
import { finish, machinedRing, mergeMachinedParts } from "./machined-detail";

type Point = [number, number];
const tau = Math.PI * 2;

function outline(path: Path, points: Point[]) {
  const [[x, y], ...rest] = points;
  path.moveTo(x, y);
  rest.forEach(([x, y]) => path.lineTo(x, y));
  path.closePath();
}

function panel(points: Point[], thickness: number, bevel: number, near: boolean, hole?: Point[]) {
  const shape = new Shape();
  outline(shape, points);
  if (hole) {
    const opening = new Path();
    outline(opening, hole);
    shape.holes.push(opening);
  }
  return new ExtrudeGeometry(shape, {
    depth: thickness, bevelThickness: bevel, bevelSize: bevel, bevelSegments: near ? 4 : 1,
  });
}

export function createSentinel(detail: "near" | "far") {
  const near = detail === "near";
  const alloy = finish(0x283840, .72, .34);
  const armour = finish(0x677378, .54, .39);
  const ceramic = finish(0x9b9d8f, .29, .44);
  const graphite = finish(0x171d20, .55, .39);
  const copper = finish(0x91604a, .72, .36);
  const hot = finish(0x802319, .31, .32, 0xf14726);
  const sensor = finish(0x682022, .33, .27, 0xdb2515);

  const model = new Group();
  model.name = `sentinel-${detail}`;

  // An inverted wedge under a split knife-edge canopy, with no spherical fairing.
  const hull = panel([
    [-.48, -.31], [-.51, .17], [-.33, .445], [0, .46],
    [.33, .445], [.51, .17], [.48, -.31], [.26, -.49], [-.26, -.49],
  ], .26, .060, near).rotateX(Math.PI / 2).translate(0, .12, 0);
  const belly = panel([
    [-.28, -.32], [-.30, .12], [-.18, .34], [0, .43],
    [.18, .34], [.30, .12], [.28, -.32],
  ], .115, .045, near).rotateX(Math.PI / 2).translate(0, -.21, 0);
  const carapace = panel([
    [.033, -.43], [.35, -.31], [.51, -.055], [.39, .31],
    [.20, .50], [.045, .39],
  ], .049, .022, near).rotateX(Math.PI / 2).rotateZ(-.14).translate(0, .255, .025);
  const wing = panel([
    [.43, -.17], [.73, -.21], [1.22, -.50], [1.15, -.19],
    [.94, .23], [.70, .29], [.58, .47], [.44, .32],
  ], .078, .022, near, [[.73, -.105], [.94, -.216], [.83, .055], [.67, .19]])
    .rotateX(Math.PI / 2).rotateZ(-.19).translate(0, .072, 0);
  const fin = panel([
    [.68, -.47], [1.13, -.31], [.93, .12], [.66, .25],
    [.50, .093], [.65, -.085],
  ], .066, .020, near).rotateX(Math.PI / 2).rotateZ(-.37).translate(0, -.07, -.045);
  const plate = panel([
    [.57, -.06], [.70, -.11], [.95, -.24], [.87, -.114], [.69, .012],
  ], .013, .004, near).rotateX(Math.PI / 2).rotateZ(-.38).translate(0, -.035, -.055);

  function paired(name: string, geometry: ExtrudeGeometry, material: typeof alloy) {
    const right = new Mesh(geometry, material);
    const left = new Mesh(geometry, material);
    right.name = `${name}_right`;
    left.name = `${name}_left`;
    left.scale.x = -1;
    right.castShadow = left.castShadow = true;
    model.add(right, left);
  }
  paired("wedge_canopy", carapace, ceramic);
  paired("spar_with_cutout", wing, armour);
  paired("vector_surfaces", fin, alloy);
  paired("heat_shield", plate, copper);
  paired("wing_status_inlay", panel([
    [.76, -.231], [.99, -.366], [.945, -.302], [.76, -.202], [.677, -.171],
  ], .004, .001, near).rotateX(Math.PI / 2).rotateZ(-.19).translate(0, .079, 0), hot);

  const visor = panel([
    [-.29, -.045], [-.18, -.105], [.18, -.105], [.29, -.045],
    [.22, .088], [.12, .12], [-.12, .12], [-.22, .088],
  ], .073, .013, near, [[-.19, -.013], [-.13, -.042], [.13, -.042], [.19, -.013],
    [.145, .039], [-.145, .039]]).translate(0, .025, .511);
  const scanStrip = panel([
    [-.182, -.018], [-.125, -.038], [.125, -.038], [.182, -.018],
    [.132, .035], [-.132, .035],
  ], .013, .003, near).translate(0, .025, .571);

  const pods = [-.54, 0, .54];
  const thrust = pods.map(x => machinedRing([
    [.090, 0], [.104, .005], [.122, .015], [.137, .032],
    [.141, .056], [.139, .087], [.131, .113], [.115, .128], [.104, .126],
    [.095, .115], [.086, .093], [.078, .043], [.090, 0],
  ], near ? 100 : 24, near ? 6 : 1).rotateX(-Math.PI / 2).translate(x, -.17, -.23));
  const turbine = pods.flatMap(x => Array.from({ length: 11 }, (_, i) => machinedRing([
    [.022, .034], [.050, .030], [.083, .043], [.091, .056],
    [.078, .064], [.041, .057], [.022, .034],
  ], near ? 14 : 3, near ? 3 : 1, i * tau / 11, .31).rotateX(-Math.PI / 2).translate(x, -.176, -.23)));
  const nozzleLiners = pods.map(x => machinedRing([
    [.084, 0], [.091, .002], [.094, .010], [.092, .020],
    [.087, .023], [.082, .018], [.084, 0],
  ], near ? 72 : 16, near ? 6 : 1).rotateX(-Math.PI / 2).translate(x, -.272, -.23));

  const targets = [-.117, 0, .117];
  const lenses = targets.map(x => machinedRing([
    [.049, 0], [.052, .004], [.052, .009], [.047, .015],
    [.038, .018], [.035, .017], [.034, .006], [.039, .001], [.049, 0],
  ], near ? 72 : 16, near ? 5 : 1).scale(1, .54, 1).rotateY(Math.PI).translate(x, .027, .590));
  const lensCover = targets.map(x => machinedRing([
    [.002, 0], [.025, .001], [.034, .005], [.034, .010],
    [.031, .012], [.022, .015], [.001, .017],
  ], near ? 56 : 16, near ? 4 : 1).scale(1, .55, 1).rotateY(Math.PI).translate(x, .027, .601));

  const shell = new Mesh(hull, alloy);
  shell.name = "pressure_wedge";
  shell.castShadow = shell.receiveShadow = true;
  const undercarriage = new Mesh(belly, graphite);
  undercarriage.name = "belly_keel";
  const face = new Mesh(visor, graphite);
  face.name = "split_forward_visor";
  const scan = new Mesh(scanStrip, sensor);
  scan.name = "forward_scan_strip";
  model.add(
    shell, undercarriage, face, scan,
    mergeMachinedParts("thrust_gimbals", thrust, armour),
    mergeMachinedParts("turbine_vanes", turbine, copper),
    mergeMachinedParts("glowing_nozzle_liners", nozzleLiners, hot),
    mergeMachinedParts("optic_bezels", lenses, graphite),
    mergeMachinedParts("scanning_optics", lensCover, sensor),
  );
  return model;
}
