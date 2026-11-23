/**
 * Single Source of Truth for Static & Dynamic World Colliders.
 * Shared across rendering (AdventureView / GameView), client prediction,
 * and authoritative physics simulation (MovementWorld).
 */
import {
  ALIEN1_POS,
  ALIEN2_POS,
  DESTINATION,
  FIGHTER_POS,
  INTERGALACTIC_POS,
  LORE,
  MINERALS_POS,
  OUTPOST,
  RESOURCE_SITES,
  SPAWN_FLEET,
} from "./adventure-data";
import { SOLAR_SYSTEM, type SpaceshipKind } from "./celestial";
import { distance, groundAt, hash, ROCKS, SCENIC_SITES, type Vec } from "./map";

/** Rapier 16-bit collision group bitflags (membership << 16 | filter). */
export const COLLISION_GROUP = {
  WORLD: 0x0001,
  INTERACTABLE: 0x0002,
  SHIP: 0x0004,
  NPC: 0x0008,
  PLAYER: 0x0010,
} as const;

export const makeCollisionGroups = (membership: number, filter: number) =>
  ((membership & 0xffff) << 16) | (filter & 0xffff);

export interface BoxColliderSpec {
  id: string;
  x: number;
  y: number;
  z: number;
  hx: number;
  hy: number;
  hz: number;
  rotY?: number;
  rotZ?: number;
  qx?: number;
  qy?: number;
  qz?: number;
  qw?: number;
  group: number;
}

export interface CylinderColliderSpec {
  id: string;
  x: number;
  y: number;
  z: number;
  halfHeight: number;
  radius: number;
  group: number;
}

export interface SphereColliderSpec {
  id: string;
  x: number;
  y: number;
  z: number;
  radius: number;
  group: number;
}

export interface GroveTreeSpec {
  x: number;
  y: number;
  z: number;
  angle: number;
  tilt: number;
  scale: number;
}

export interface ShipColliderSpec {
  halfWidth: number;
  halfHeight: number;
  halfLength: number;
  yOffset: number;
}

/** Shared physical shell for the continuously meshed north-polar terrain. */
export { HOME_PLANET_SPHERE } from "./home-planet";

/** Deterministic Echo Grove trees shared by visual InstancedMesh and Rapier colliders. */
export const GROVE_TREES: readonly GroveTreeSpec[] = Array.from({ length: 52 }, (_, i) => {
  const angle = hash(i, 70) * Math.PI * 2;
  const r = 30 + hash(i, 71) * 90;
  const x = DESTINATION.x + Math.cos(angle) * r;
  const z = DESTINATION.z + Math.sin(angle) * r;
  const y = groundAt(x, z);
  const scale = 0.7 + hash(i, 72) * 0.9;
  const tilt = (hash(i, 73) - 0.5) * 0.12;
  return { x, y, z, angle, tilt, scale };
});

/** Deterministic Outpost perimeter sentry pylons shared by visuals and physics. */
export const OUTPOST_POSTS: readonly (Vec & { angle: number })[] = Array.from({ length: 9 }, (_, i) => {
  const angle = (i / 9) * Math.PI * 2;
  const x = OUTPOST.x + Math.cos(angle) * 28;
  const z = OUTPOST.z + Math.sin(angle) * 28;
  return { x, y: groundAt(x, z), z, angle };
});

/** Static mineral specimen outcrops in the basin. */
export const MINERAL_OUTCROPS: readonly { id: string; x: number; y: number; z: number }[] = [
  { id: "spawn_mineral", x: MINERALS_POS.x, y: MINERALS_POS.y, z: MINERALS_POS.z },
  { id: "calcite", x: -35, y: groundAt(-35, 120) + 0.6, z: 120 },
  { id: "pyrite", x: 145, y: groundAt(145, -40) + 0.6, z: -40 },
  { id: "amethyst", x: -180, y: groundAt(-180, -160) + 0.6, z: -160 },
  { id: "celestite", x: 80, y: groundAt(80, 290) + 0.6, z: 290 },
];

/** Ship hull dimensions used for parked/active colliders and shape casts. */
export const SHIP_COLLIDER_SPECS: Record<SpaceshipKind, ShipColliderSpec> = {
  light_fighter: {
    // Central fuselage footprint keeps spawn runway x=0 clear while resting flush on sloped ground
    halfWidth: 1.55,
    halfHeight: 1.85,
    halfLength: SPAWN_FLEET.light_fighter.halfLength * 0.88,
    yOffset: 1.75,
  },
  intergalactic: {
    halfWidth: SPAWN_FLEET.intergalactic.halfWidth * 0.85,
    halfHeight: 2.65,
    halfLength: SPAWN_FLEET.intergalactic.halfLength * 0.88,
    yOffset: 2.35,
  },
};

/** Static rock sphere colliders (lowered threshold from >3m to >1.2m while keeping launch pads clear). */
export const ROCK_COLLIDERS: readonly SphereColliderSpec[] = ROCKS.filter(
  (r) =>
    r.size > 1.2 &&
    distance(r, FIGHTER_POS) > 15 &&
    distance(r, INTERGALACTIC_POS) > 22,
).map((r, idx) => ({
  id: `rock_${idx}`,
  x: r.x,
  y: r.y + r.size * 0.44,
  z: r.z,
  radius: r.size * 0.64,
  group: COLLISION_GROUP.WORLD,
}));

/** Giant scenic obelisk colliders. */
export const SCENIC_COLLIDERS: readonly BoxColliderSpec[] = SCENIC_SITES.map((site, idx) => ({
  id: `scenic_${idx}`,
  x: site.x,
  y: site.y + 10.5 * site.scale,
  z: site.z,
  hx: 2.1 * site.scale,
  hy: 10.5 * site.scale,
  hz: 2.1 * site.scale,
  rotY: hash(site.x, site.z) * Math.PI * 2,
  group: COLLISION_GROUP.WORLD,
}));

/** Archive lore monolith colliders (INTERACTABLE group so line-of-sight reading still succeeds). */
export const LORE_COLLIDERS: readonly BoxColliderSpec[] = LORE.map((clue) => ({
  id: `lore_${clue.id}`,
  x: clue.x,
  y: clue.y + 1.7,
  z: clue.z,
  hx: 1.05,
  hy: 1.7,
  hz: 0.45,
  group: COLLISION_GROUP.INTERACTABLE,
}));

/** Outpost perimeter sentry pylon colliders. */
export const OUTPOST_COLLIDERS: readonly BoxColliderSpec[] = OUTPOST_POSTS.map((post, idx) => ({
  id: `outpost_post_${idx}`,
  x: post.x,
  y: post.y + 2.5,
  z: post.z,
  hx: 0.48,
  hy: 2.55,
  hz: 0.48,
  group: COLLISION_GROUP.WORLD,
}));

/** Echo Grove tree trunk colliders. */
export const GROVE_TREE_COLLIDERS: readonly CylinderColliderSpec[] = GROVE_TREES.map((tree, idx) => ({
  id: `grove_tree_${idx}`,
  x: tree.x,
  y: tree.y + 5.6 * tree.scale,
  z: tree.z,
  halfHeight: 5.6 * tree.scale,
  radius: 0.72 * tree.scale,
  group: COLLISION_GROUP.WORLD,
}));

/** Static alien fauna & mineral outcrop colliders. */
export const SPAWN_NPC_COLLIDERS: readonly CylinderColliderSpec[] = [
  {
    id: "alien1",
    x: ALIEN1_POS.x,
    y: ALIEN1_POS.y + 1.0,
    z: ALIEN1_POS.z,
    halfHeight: 1.0,
    radius: 0.85,
    group: COLLISION_GROUP.NPC,
  },
  {
    id: "alien2",
    x: ALIEN2_POS.x,
    y: ALIEN2_POS.y + 1.25,
    z: ALIEN2_POS.z,
    halfHeight: 1.25,
    radius: 0.95,
    group: COLLISION_GROUP.NPC,
  },
  {
    id: "blerk_idle",
    x: 8,
    y: groundAt(8, 335) + 1.1,
    z: 335,
    halfHeight: 1.05,
    radius: 0.65,
    group: COLLISION_GROUP.NPC,
  },
];

export const MINERAL_COLLIDERS: readonly SphereColliderSpec[] = MINERAL_OUTCROPS.map((m) => ({
  id: `mineral_${m.id}`,
  x: m.x,
  y: m.y + 0.5,
  z: m.z,
  radius: 1.15,
  group: COLLISION_GROUP.INTERACTABLE,
}));

/** Resource node collider descriptors (dynamically enabled/disabled by Simulation time). */
export const RESOURCE_COLLIDER_SPECS = RESOURCE_SITES.map((node, id) => ({
  id,
  x: node.x,
  y: node.y + (node.item === "core" ? 1.15 : 0.75),
  z: node.z,
  hx: node.item === "ore" ? 1.2 : 1.15,
  hy: node.item === "core" ? 1.25 : 0.85,
  hz: node.item === "ore" ? 1.2 : 0.95,
  group: COLLISION_GROUP.INTERACTABLE,
}));

/** Warp Gate structural outer ring colliders (leaves inner r*0.81 portal aperture completely clear). */
export const WARPGATE_FRAME_COLLIDERS: readonly BoxColliderSpec[] = (() => {
  const result: BoxColliderSpec[] = [];
  const gateIds = ["warpgate", "warpgate_east", "warpgate_south", "warpgate_west"] as const;
  for (const id of gateIds) {
    const body = SOLAR_SYSTEM[id];
    if (!body) continue;
    const rotY =
      id === "warpgate_south"
        ? Math.PI
        : id === "warpgate_east"
          ? -Math.PI / 2
          : id === "warpgate_west"
            ? Math.PI / 2
            : 0;
    const cosY = Math.cos(rotY);
    const sinY = Math.sin(rotY);
    // 8 outer structural beams at radius 0.945 * R (inner edge ~0.875 * R, safely outside 0.81 * R portal)
    const ringRadius = body.radius * 0.945;
    const segLength = ringRadius * Math.tan(Math.PI / 8) * 1.04;
    const radialHalf = body.radius * 0.065;
    const depthHalf = 34;

    for (let i = 0; i < 8; i++) {
      const a = (i + 0.5) * (Math.PI / 4);
      const lx = Math.cos(a) * ringRadius;
      const ly = Math.sin(a) * ringRadius;
      const wx = body.position.x + lx * cosY;
      const wy = body.position.y + ly;
      const wz = body.position.z - lx * sinY;

      // Compose quaternion: Ry(rotY) * Rz(a) => (qx = +sy*sz, qy = sy*cz, qz = cy*sz, qw = cy*cz)
      const cy = Math.cos(rotY / 2);
      const sy = Math.sin(rotY / 2);
      const cz = Math.cos(a / 2);
      const sz = Math.sin(a / 2);
      result.push({
        id: `${id}_seg_${i}`,
        x: wx,
        y: wy,
        z: wz,
        hx: radialHalf,
        hy: segLength,
        hz: depthHalf,
        qx: sy * sz,
        qy: sy * cz,
        qz: cy * sz,
        qw: cy * cz,
        group: COLLISION_GROUP.WORLD,
      });
    }
  }
  return result;
})();

/** Cave landmark position on the Echo Grove crater ridge (keeps landing pad clear). */
export const CAVE_POS: Vec = {
  x: -365,
  y: groundAt(-365, -245) + 10,
  z: -245,
};

/** Cave shell boundary colliders at Echo Grove ridge (preserves central walkable interior). */
export const CAVE_COLLIDERS: readonly BoxColliderSpec[] = [
  { id: "cave_arch_top", x: CAVE_POS.x, y: CAVE_POS.y + 13, z: CAVE_POS.z, hx: 16, hy: 3.2, hz: 16, group: COLLISION_GROUP.WORLD },
  { id: "cave_wall_west", x: CAVE_POS.x - 15, y: CAVE_POS.y, z: CAVE_POS.z, hx: 3, hy: 12, hz: 14, group: COLLISION_GROUP.WORLD },
  { id: "cave_wall_east", x: CAVE_POS.x + 15, y: CAVE_POS.y, z: CAVE_POS.z, hx: 3, hy: 12, hz: 14, group: COLLISION_GROUP.WORLD },
];
