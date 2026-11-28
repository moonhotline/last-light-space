import { LAB, LAB_BOXES, LAB_PORTAL_OBSTACLES, SPAWN_FLEET } from "./adventure-data";
import RAPIER from "@dimforge/rapier3d-compat";
import { Euler, Quaternion, Ray, Sphere, Vector3 } from "three";
import { FOOT_OFFSET, surfaceOrientation, eyePosition, playerUp, viewDirection } from "./surface";
import {
  terrainMesh,
  groundAt,
  HALF,
  BEACON_SITES,
  THERMALS,
  distance,
  type Vec,
} from "./map";
import {
  projectToSphere,
  sphericalGravity,
  SOLAR_SYSTEM,
  type SpaceshipKind,
  type CelestialBody,
} from "./celestial";
import {
  CAVE_COLLIDERS,
  COLLISION_GROUP,
  HOME_PLANET_SPHERE,
  GROVE_TREE_COLLIDERS,
  LORE_COLLIDERS,
  makeCollisionGroups,
  MINERAL_COLLIDERS,
  OUTPOST_COLLIDERS,
  RESOURCE_COLLIDER_SPECS,
  ROCK_COLLIDERS,
  SCENIC_COLLIDERS,
  SHIP_COLLIDER_SPECS,
  SPAWN_NPC_COLLIDERS,
  WARPGATE_FRAME_COLLIDERS,
  type BoxColliderSpec,
} from "./colliders";
import { HOME_COLLAR_RADIUS } from "./home-planet";
import {
  DT,
  fuelCapacity,
  type Adventure,
  type Input,
  type Player,
  type ShipMotionContext,
  type ShipMotionResult,
} from "./types";
import { PORTAL_RADIUS_X, PORTAL_RADIUS_Y, portalFrame, portalRotation, type Portal, type PortalPair } from "./portals";

export { fuelCapacity, type ShipMotionContext, type ShipMotionResult };

let ready: Promise<void> | undefined;
export const initPhysics = (wasmModule?: unknown) =>
  (ready ??= wasmModule ? (RAPIER as any).init(wasmModule) : RAPIER.init());

const ALL_SOLID_FOR_PLAYER = makeCollisionGroups(
  COLLISION_GROUP.PLAYER,
  COLLISION_GROUP.WORLD | COLLISION_GROUP.INTERACTABLE | COLLISION_GROUP.SHIP | COLLISION_GROUP.NPC,
);
const WORLD_ONLY_QUERY = makeCollisionGroups(
  COLLISION_GROUP.PLAYER,
  COLLISION_GROUP.WORLD,
);
const SHIP_SWEEP_GROUPS = makeCollisionGroups(
  COLLISION_GROUP.SHIP,
  COLLISION_GROUP.WORLD | COLLISION_GROUP.INTERACTABLE | COLLISION_GROUP.SHIP,
);
const WORLD_MEMBERSHIP = makeCollisionGroups(COLLISION_GROUP.WORLD, 0xffff);
const INTERACTABLE_MEMBERSHIP = makeCollisionGroups(
  COLLISION_GROUP.INTERACTABLE,
  COLLISION_GROUP.PLAYER | COLLISION_GROUP.SHIP,
);
const SHIP_MEMBERSHIP = makeCollisionGroups(
  COLLISION_GROUP.SHIP,
  COLLISION_GROUP.PLAYER | COLLISION_GROUP.SHIP,
);
const NPC_MEMBERSHIP = makeCollisionGroups(COLLISION_GROUP.NPC, COLLISION_GROUP.PLAYER);
const PLAYER_MEMBERSHIP = makeCollisionGroups(
  COLLISION_GROUP.PLAYER,
  COLLISION_GROUP.WORLD | COLLISION_GROUP.INTERACTABLE | COLLISION_GROUP.SHIP | COLLISION_GROUP.NPC,
);

function membershipFor(group: number): number {
  if (group === COLLISION_GROUP.INTERACTABLE) return INTERACTABLE_MEMBERSHIP;
  if (group === COLLISION_GROUP.SHIP) return SHIP_MEMBERSHIP;
  if (group === COLLISION_GROUP.NPC) return NPC_MEMBERSHIP;
  return WORLD_MEMBERSHIP;
}

const PLAYER_HALF_SEGMENT = 0.48;
const PLAYER_RADIUS = 0.32;
const PORTAL_RANGE = 45;
const UPRIGHT = { x: 0, y: 0, z: 0, w: 1 };

function capsuleDepth(normal: Vec, up: Vector3) {
  return PLAYER_RADIUS + PLAYER_HALF_SEGMENT * Math.abs(up.dot(normal));
}

export class MovementWorld {
  world = new RAPIER.World({ x: 0, y: -7.5, z: 0 });
  controller = this.world.createCharacterController(0.025);
  bodies = new Map<
    string,
    { body: RAPIER.RigidBody; collider: RAPIER.Collider }
  >();
  shipBodies = new Map<
    SpaceshipKind,
    { body: RAPIER.RigidBody; collider: RAPIER.Collider }
  >();
  resourceColliders = new Map<number, RAPIER.Collider>();
  droneBodies = new Map<
    number,
    { body: RAPIER.RigidBody; collider: RAPIER.Collider }
  >();
  private terrainCollider: RAPIER.Collider;
  private homeGlobeCollider: RAPIER.Collider;
  private portalSurfaces = new Map<number, { center: Vec; halfSize: Vec }>();
  private portalObstacles = LAB_PORTAL_OBSTACLES.map(box => ({
    box,
    shape: new RAPIER.Cuboid(box.sx / 2, box.sy / 2, box.sz / 2),
  }));
  private portalCapsule = new RAPIER.Capsule(PLAYER_HALF_SEGMENT, PLAYER_RADIUS);

  constructor() {
    this.world.timestep = DT;
    this.controller.enableAutostep(0.8, 0.25, false);
    this.controller.enableSnapToGround(0.35);
    this.controller.setMaxSlopeClimbAngle(Math.PI * 0.29);
    this.controller.setMinSlopeSlideAngle(Math.PI * 0.34);

    const m = terrainMesh();
    this.terrainCollider = this.world.createCollider(
      RAPIER.ColliderDesc.trimesh(m.vertices, m.indices).setCollisionGroups(WORLD_MEMBERSHIP),
    );
    const home = HOME_PLANET_SPHERE;
    this.homeGlobeCollider = this.world.createCollider(
      RAPIER.ColliderDesc.ball(home.radius)
        .setTranslation(home.center.x, home.center.y, home.center.z)
        .setCollisionGroups(WORLD_MEMBERSHIP),
    );

    // Rocks (lowered threshold to > 1.2m from shared single source of truth)
    for (const r of ROCK_COLLIDERS) {
      this.world.createCollider(
        RAPIER.ColliderDesc.ball(r.radius)
          .setTranslation(r.x, r.y, r.z)
          .setCollisionGroups(membershipFor(r.group)),
      );
    }

    // Beacons
    for (const b of BEACON_SITES) {
      this.world.createCollider(
        RAPIER.ColliderDesc.cylinder(0.18, 6)
          .setTranslation(b.x, b.y + 0.18, b.z)
          .setCollisionGroups(WORLD_MEMBERSHIP),
      );
      this.world.createCollider(
        RAPIER.ColliderDesc.cylinder(0.6, 0.65)
          .setTranslation(b.x, b.y + 1, b.z + 3)
          .setCollisionGroups(WORLD_MEMBERSHIP),
      );
      for (const side of [-1, 1]) {
        this.world.createCollider(
          RAPIER.ColliderDesc.cuboid(0.63, 2.15, 0.75)
            .setTranslation(b.x + side * 2, b.y + 2.45, b.z)
            .setCollisionGroups(WORLD_MEMBERSHIP),
        );
        this.world.createCollider(
          RAPIER.ColliderDesc.cuboid(0.55, 1.6, 0.6)
            .setTranslation(b.x + side * 1.68, b.y + 6.4, b.z)
            .setCollisionGroups(WORLD_MEMBERSHIP),
        );
      }
    }

    // Ring Observatory arch
    const observatory = BEACON_SITES[1];
    for (let i = 0; i < 18; i++)
      if (![4, 5, 14].includes(i)) {
        const angle = (i / 20) * Math.PI * 2;
        this.world.createCollider(
          RAPIER.ColliderDesc.cuboid(2.6, 1.7, 1.75)
            .setTranslation(
              observatory.x + Math.cos(angle) * 17,
              observatory.y + 18 + Math.sin(angle) * 17,
              observatory.z - 28,
            )
            .setRotation({
              x: 0,
              y: 0,
              z: Math.sin(angle / 2),
              w: Math.cos(angle / 2),
            })
            .setCollisionGroups(WORLD_MEMBERSHIP),
        );
      }

    // Dawn Laboratory walls & roof
    for (const b of LAB_BOXES) {
      const center = { x: LAB.x + b.x, y: LAB.y + b.y, z: LAB.z + b.z };
      const halfSize = { x: b.sx / 2, y: b.sy / 2, z: b.sz / 2 };
      const collider = this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(halfSize.x, halfSize.y, halfSize.z)
          .setTranslation(center.x, center.y, center.z)
          .setCollisionGroups(WORLD_MEMBERSHIP),
      );
      this.portalSurfaces.set(collider.handle, { center, halfSize });
    }

    // Scenic obelisks, lore monoliths, outpost posts, cave walls, and warp gate frames
    for (const box of [
      ...SCENIC_COLLIDERS,
      ...LORE_COLLIDERS,
      ...OUTPOST_COLLIDERS,
      ...CAVE_COLLIDERS,
      ...WARPGATE_FRAME_COLLIDERS,
    ]) {
      this.addStaticBox(box);
    }

    // Echo Grove tree trunks & spawn alien/NPC static volumes
    for (const cyl of [...GROVE_TREE_COLLIDERS, ...SPAWN_NPC_COLLIDERS]) {
      this.world.createCollider(
        RAPIER.ColliderDesc.cylinder(cyl.halfHeight, cyl.radius)
          .setTranslation(cyl.x, cyl.y, cyl.z)
          .setCollisionGroups(membershipFor(cyl.group)),
      );
    }

    // Mineral specimen outcrops
    for (const sphere of MINERAL_COLLIDERS) {
      this.world.createCollider(
        RAPIER.ColliderDesc.ball(sphere.radius)
          .setTranslation(sphere.x, sphere.y, sphere.z)
          .setCollisionGroups(membershipFor(sphere.group)),
      );
    }

    // Dynamic resource node colliders (toggled when harvested / respawned)
    for (const spec of RESOURCE_COLLIDER_SPECS) {
      const col = this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(spec.hx, spec.hy, spec.hz)
          .setTranslation(spec.x, spec.y, spec.z)
          .setCollisionGroups(membershipFor(spec.group)),
      );
      this.resourceColliders.set(spec.id, col);
    }

    // Dynamic kinematic ship hull colliders for both fleet vessels
    for (const kind of Object.keys(SPAWN_FLEET) as SpaceshipKind[]) {
      const spawn = SPAWN_FLEET[kind];
      const spec = SHIP_COLLIDER_SPECS[kind];
      const q = new Quaternion().setFromEuler(new Euler(0, spawn.yaw, 0));
      const body = this.world.createRigidBody(
        RAPIER.RigidBodyDesc.kinematicPositionBased()
          .setTranslation(spawn.position.x, spawn.position.y + spec.yOffset, spawn.position.z)
          .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }),
      );
      const collider = this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(spec.halfWidth, spec.halfHeight, spec.halfLength)
          .setCollisionGroups(SHIP_MEMBERSHIP),
        body,
      );
      this.shipBodies.set(kind, { body, collider });
    }

    // Dynamic kinematic drone colliders
    for (let id = 0; id < 3; id++) {
      const body = this.world.createRigidBody(
        RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, -1000, 0),
      );
      const collider = this.world.createCollider(
        RAPIER.ColliderDesc.ball(1.5).setCollisionGroups(NPC_MEMBERSHIP),
        body,
      );
      this.droneBodies.set(id, { body, collider });
    }

    this.world.step();
  }

  private addStaticBox(box: BoxColliderSpec) {
    const desc = RAPIER.ColliderDesc.cuboid(box.hx, box.hy, box.hz)
      .setTranslation(box.x, box.y, box.z)
      .setCollisionGroups(membershipFor(box.group));
    if (box.qw !== undefined) {
      desc.setRotation({ x: box.qx ?? 0, y: box.qy ?? 0, z: box.qz ?? 0, w: box.qw });
    } else if (box.rotY || box.rotZ) {
      const q = new Quaternion().setFromEuler(new Euler(0, box.rotY ?? 0, box.rotZ ?? 0));
      desc.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
    }
    this.world.createCollider(desc);
  }

  /** Synchronize dynamic ship hulls, resource nodes, and patrol drones into Rapier. */
  syncDynamicEntities(adventure: Adventure, time: number) {
    const activeShip = adventure.ship;
    const activeKind: SpaceshipKind = activeShip.kind ?? "light_fighter";

    for (const kind of Object.keys(SPAWN_FLEET) as SpaceshipKind[]) {
      const entry = this.shipBodies.get(kind);
      if (!entry) continue;
      const spec = SHIP_COLLIDER_SPECS[kind];
      if (kind === activeKind) {
        const q = this.shipQuaternion(activeShip);
        const up = new Vector3(0, 1, 0).applyQuaternion(q);
        const tx = activeShip.x + up.x * spec.yOffset;
        const ty = activeShip.y + up.y * spec.yOffset;
        const tz = activeShip.z + up.z * spec.yOffset;
        entry.body.setTranslation({ x: tx, y: ty, z: tz }, true);
        entry.body.setNextKinematicTranslation({ x: tx, y: ty, z: tz });
        entry.body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
        entry.body.setNextKinematicRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
      } else {
        const spawn = SPAWN_FLEET[kind];
        const q = new Quaternion().setFromEuler(new Euler(0, spawn.yaw, 0));
        entry.body.setTranslation(
          { x: spawn.position.x, y: spawn.position.y + spec.yOffset, z: spawn.position.z },
          true,
        );
        entry.body.setNextKinematicTranslation({
          x: spawn.position.x,
          y: spawn.position.y + spec.yOffset,
          z: spawn.position.z,
        });
        entry.body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
        entry.body.setNextKinematicRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
      }
    }

    for (const node of adventure.nodes) {
      const col = this.resourceColliders.get(node.id);
      if (col) col.setEnabled(node.readyAt <= time);
    }

    for (const d of adventure.drones) {
      const entry = this.droneBodies.get(d.id);
      if (!entry) continue;
      const alive = d.hp > 0;
      entry.collider.setEnabled(alive);
      if (alive) {
        entry.body.setTranslation({ x: d.x, y: d.y, z: d.z }, true);
        entry.body.setNextKinematicTranslation({ x: d.x, y: d.y, z: d.z });
      }
    }

    this.syncQueryPipeline();
  }

  private syncQueryPipeline() {
    this.world.propagateModifiedBodyPositionsToColliders();
    if (typeof (this.world as unknown as { updateSceneQueries?: () => void }).updateSceneQueries === "function") {
      (this.world as unknown as { updateSceneQueries: () => void }).updateSceneQueries();
    }
  }

  /** Shared dash/skate speed calculation and jump/jetpack state transitions for basin & spherical walking. */
  private stepLocomotionState(p: Player, i: Input): { speed: number; shouldJump: boolean } {
    p.dashCooldown = Math.max(0, p.dashCooldown - DT);
    p.dashTime = Math.max(0, p.dashTime - DT);
    if (i.dash && !p.dashHeld && p.dashCooldown === 0 && p.fuel >= 16) {
      p.dashTime = 0.3;
      p.dashCooldown = 1.5;
      p.fuel -= 16;
    }
    p.dashHeld = i.dash;
    p.skate = !!i.skate;
    const speed = p.dashTime > 0 ? 43 : p.skate ? (i.sprint ? 32 : 23) : i.sprint ? 23 : 15;
    const shouldJump = i.jump && !p.jumpHeld && p.grounded;
    p.jumpHeld = i.jump;
    p.jetting = i.jet && p.fuel > 0;
    return { speed, shouldJump };
  }

  private shipQuaternion(ctx?: ShipMotionContext): Quaternion {
    const base = ctx?.flightRotation
      ? new Quaternion(ctx.flightRotation.x, ctx.flightRotation.y, ctx.flightRotation.z, ctx.flightRotation.w).normalize()
      : new Quaternion();
    const local = new Quaternion().setFromEuler(
      new Euler(ctx?.pitch ?? 0, ctx?.yaw ?? 0, -(ctx?.bank ?? 0), "YXZ"),
    );
    return base.multiply(local);
  }

  add(id: string, p: Vec) {
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(p.x, p.y, p.z),
    );
    const collider = this.world.createCollider(
      RAPIER.ColliderDesc.capsule(PLAYER_HALF_SEGMENT, PLAYER_RADIUS).setCollisionGroups(PLAYER_MEMBERSHIP),
      body,
    );
    this.bodies.set(id, { body, collider });
    this.world.step();
  }

  remove(id: string) {
    const p = this.bodies.get(id);
    if (p) this.world.removeRigidBody(p.body);
    this.bodies.delete(id);
  }

  reset(id: string, p: Vec) {
    const b = this.bodies.get(id)?.body;
    b?.setTranslation(p, true);
    b?.setNextKinematicTranslation(p);
    this.syncQueryPipeline();
  }

  private moveOnSphere(p: Player, i: Input, portals?: PortalPair) {
    const planet = SOLAR_SYSTEM[p.planet!];
    const body = this.bodies.get(p.id)!;
    const position = new Vector3(p.x, p.y, p.z);
    const center = new Vector3().copy(planet.position);
    const up = position.clone().sub(center).normalize();
    const frame = surfaceOrientation(p);
    const velocity = new Vector3(p.vx, p.vy, p.vz);
    let radial = velocity.dot(up);
    const tangent = velocity.addScaledVector(up, -radial);
    const wasGrounded = p.grounded;
    const { speed, shouldJump } = this.stepLocomotionState(p, i);
    const len = Math.max(1, Math.hypot(i.forward, i.side));
    const dashForward = p.dashTime > 0 && i.forward === 0 && i.side === 0;
    const target = new Vector3(
      dashForward ? -Math.sin(i.yaw) : (Math.cos(i.yaw) * i.side - Math.sin(i.yaw) * i.forward) / len,
      0,
      dashForward ? -Math.cos(i.yaw) : (-Math.sin(i.yaw) * i.side - Math.cos(i.yaw) * i.forward) / len,
    )
      .applyQuaternion(frame)
      .multiplyScalar(speed);
    tangent.lerp(target, 1 - Math.exp(-(wasGrounded ? 10 : 2) * DT));
    const gravity = new Vector3().copy(sphericalGravity(position, planet).gravityVec);
    radial = Math.max(-40, radial + gravity.dot(up) * DT);
    if (shouldJump) radial = 12;
    if (p.jetting) {
      radial = Math.min(p.level >= 1 ? 24 : 19, radial + (p.level >= 1 ? 25 : 21) * DT);
      p.fuel = Math.max(0, p.fuel - DT * 20);
    } else if (p.grounded) {
      p.fuel = Math.min(fuelCapacity(p.level), p.fuel + DT * 24);
    }
    p.grapple = null;
    p.grappleHeld = i.grapple;
    this.controller.setUp(up);
    body.body.setRotation(frame, true);
    this.world.propagateModifiedBodyPositionsToColliders();
    const movement = tangent.clone().addScaledVector(up, radial).multiplyScalar(DT);
    this.controller.computeColliderMovement(
      body.collider,
      movement,
      undefined,
      ALL_SOLID_FOR_PLAYER,
    );
    const next = position.clone().add(this.controller.computedMovement());
    const landed = radial <= 0 && next.distanceTo(center) <= planet.radius + FOOT_OFFSET + 0.08;
    const resolved = landed ? new Vector3().copy(projectToSphere(next, planet, FOOT_OFFSET)) : next;
    p.vx = movement.x / DT;
    p.vy = movement.y / DT;
    p.vz = movement.z / DT;
    if (this.tryPortals(p, i, position, resolved.clone().sub(position), portals)) return;
    if (landed && !p.grounded && radial < -2) {
      p.landing = -radial;
      p.landingId++;
    }
    p.x = resolved.x;
    p.y = resolved.y;
    p.z = resolved.z;
    const nextUp = resolved.clone().sub(center).normalize();
    const transport = new Quaternion().setFromUnitVectors(up, nextUp);
    const nextVelocity = tangent.applyQuaternion(transport).addScaledVector(nextUp, landed ? 0 : radial);
    p.vx = nextVelocity.x;
    p.vy = nextVelocity.y;
    p.vz = nextVelocity.z;
    p.grounded = landed;
    p.travel += resolved.distanceTo(position);
    const q = transport.multiply(frame).normalize();
    p.surfaceRotation = { x: q.x, y: q.y, z: q.z, w: q.w };
    p.yaw = i.yaw;
    p.pitch = i.pitch;
    body.body.setNextKinematicRotation(q);
    body.body.setNextKinematicTranslation(p);
  }

  aimPortal(p: Player, other?: Portal): Portal | null {
    if (p.seat >= 0) return null;
    const eye = eyePosition(p);
    const direction = viewDirection(p);
    const ray = new RAPIER.Ray(eye, direction);
    const hit = this.world.castRayAndGetNormal(ray, PORTAL_RANGE, true, undefined, ALL_SOLID_FOR_PLAYER);
    const planet = p.planet ? SOLAR_SYSTEM[p.planet] : undefined;
    const center = new Vector3();
    const normal = new Vector3();

    if (planet) {
      const surface = new Sphere(new Vector3().copy(planet.position), planet.radius);
      const point = new Ray(eye, direction).intersectSphere(surface, center);
      if (!point || eye.distanceTo(center) > Math.min(PORTAL_RANGE, hit?.timeOfImpact ?? Infinity)) return null;
      normal.copy(center).sub(surface.center).normalize();
    } else {
      if (!hit || hit.timeOfImpact < 0.15 || hit.collider.parent() ||
          this.portalObstacles.some(({ box, shape }) => shape.intersectsRay(ray, box, UPRIGHT, hit.timeOfImpact))) return null;
      const face = this.portalSurfaces.get(hit.collider.handle);
      normal.copy(hit.normal).normalize();
      center.copy(eye).addScaledVector(direction, hit.timeOfImpact);
      if (face) {
        const vertical = normal.y === 0;
        if (vertical) center.y -= 0.3;
        const radii = { x: PORTAL_RADIUS_X, y: vertical ? PORTAL_RADIUS_Y : 0, z: vertical ? PORTAL_RADIUS_X : PORTAL_RADIUS_Y };
        for (const axis of ["x", "y", "z"] as const) {
          if (normal[axis]) continue;
          const slack = face.halfSize[axis] - radii[axis] - 0.06;
          if (slack < 0 || Math.abs(center[axis] - face.center[axis]) > slack + 0.8) return null;
          center[axis] = Math.max(face.center[axis] - slack, Math.min(face.center[axis] + slack, center[axis]));
        }
      } else if (!this.portalSurfaceFits(center, normal, hit.collider)) return null;
    }
    if (normal.dot(direction) > -0.15) return null;

    if (other && normal.dot(other.normal) > 0.99) {
      const separation = center.clone().sub(other.center).applyQuaternion(portalFrame(normal).invert());
      if (Math.abs(separation.z) < 0.1 &&
          (separation.x / PORTAL_RADIUS_X) ** 2 + (separation.y / PORTAL_RADIUS_Y) ** 2 < 4.2) return null;
    }

    const up = playerUp(p);
    const probe = center.clone().addScaledVector(normal, capsuleDepth(normal, up) + 0.12);
    if (this.portalExitBlocked(probe, up, planet)) return null;
    return { center: { ...center }, normal: { ...normal }, ...(planet && { planet: planet.id }) };
  }

  private portalSurfaceFits(center: Vector3, normal: Vector3, collider: RAPIER.Collider) {
    const frame = portalFrame(normal);
    const sample = new Vector3();
    const inward = normal.clone().negate();
    for (let index = 0; index < 8; index++) {
      const angle = index * Math.PI / 4;
      sample.set(Math.cos(angle) * PORTAL_RADIUS_X, Math.sin(angle) * PORTAL_RADIUS_Y, 0)
        .applyQuaternion(frame).add(center).addScaledVector(normal, 0.4);
      const hit = this.world.castRayAndGetNormal(
        new RAPIER.Ray(sample, inward), 0.54, true, undefined, ALL_SOLID_FOR_PLAYER,
      );
      if (!hit || hit.collider.handle !== collider.handle || hit.timeOfImpact < 0.27 || normal.dot(hit.normal) < 0.93)
        return false;
    }
    return true;
  }

  private portalExitBlocked(position: Vec, up: Vector3, planet?: CelestialBody) {
    if (planet && new Vector3().copy(position).distanceTo(planet.position) < planet.radius + FOOT_OFFSET) return true;
    const orientation = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), up);
    return !!this.world.intersectionWithShape(position, orientation, this.portalCapsule, undefined, ALL_SOLID_FOR_PLAYER) ||
      this.portalObstacles.some(({ box, shape }) =>
        shape.intersectsShape(box, UPRIGHT, this.portalCapsule, position, orientation),
      );
  }

  private tryPortals(p: Player, i: Input, start: Vec, moved: Vec, portals?: PortalPair) {
    return portals?.blue && portals.orange &&
      (this.transitPortal(p, i, start, moved, portals.blue, portals.orange) ||
       this.transitPortal(p, i, start, moved, portals.orange, portals.blue));
  }

  private transitPortal(p: Player, i: Input, start: Vec, moved: Vec, entry: Portal, exit: Portal) {
    if ((p.planet ?? null) !== (entry.planet ?? null)) return false;
    const entryUp = playerUp(p);
    const planet = exit.planet ? SOLAR_SYSTEM[exit.planet] : undefined;
    const exitUp = planet ? new Vector3().copy(exit.center).sub(planet.position).normalize() : new Vector3(0, 1, 0);
    const movement = new Vector3().copy(moved);
    const velocity = new Vector3(p.vx, p.vy, p.vz);
    const approach = -velocity.dot(entry.normal);
    if (approach <= 0.01) return false;
    const from = new Vector3().copy(start).sub(entry.center);
    const reached = from.clone().add(movement);
    const clearance = capsuleDepth(entry.normal, entryUp) + 0.055;
    // Use collision-resolved movement to ensure a wall in front of the portal still blocks it.
    const distance = from.dot(entry.normal);
    const contact = (distance - clearance) / (approach * DT);
    if (distance < 0 || reached.dot(entry.normal) > clearance || contact > 1) return false;

    // At speed, the collision controller may slide along the wall after entry.
    // Test the contact point before the slide, while allowing a step onto a floor portal.
    const crossing = contact > 0 ? from.addScaledVector(velocity, DT * contact) : reached;
    const relative = crossing.clone().applyQuaternion(portalFrame(entry.normal).invert());
    const vertical = Math.abs(entryUp.dot(entry.normal)) < 0.5;
    if ((relative.x / (PORTAL_RADIUS_X - PLAYER_RADIUS)) ** 2 +
        (relative.y / (PORTAL_RADIUS_Y - (vertical ? 0.72 : PLAYER_RADIUS))) ** 2 > 1) return false;

    const rotation = portalRotation(entry, exit);
    const exitCenter = new Vector3().copy(exit.center).addScaledVector(exit.normal, capsuleDepth(exit.normal, exitUp) + 0.12);
    const position = crossing.addScaledVector(entry.normal, -crossing.dot(entry.normal))
      .applyQuaternion(rotation).add(exitCenter);
    if (this.portalExitBlocked(position, exitUp, planet)) {
      if (this.portalExitBlocked(exitCenter, exitUp, planet)) return false;
      // An upright capsule can hit the floor when a floor portal maps to a wall.
      // Nudge that exit toward the nearest clear point inside the aperture.
      const blocked = position.clone();
      position.copy(exitCenter);
      for (let attempt = 0; attempt < 4; attempt++) {
        const probe = position.clone().lerp(blocked, 0.5);
        if (this.portalExitBlocked(probe, exitUp, planet)) blocked.copy(probe);
        else position.copy(probe);
      }
    }

    const facing = viewDirection({ ...p, yaw: i.yaw, pitch: i.pitch }).applyQuaternion(rotation);
    const exitFrame = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), exitUp);
    facing.applyQuaternion(exitFrame.clone().invert());
    velocity.applyQuaternion(rotation);
    Object.assign(p, {
      planet: exit.planet ?? null,
      surfaceRotation: { x: exitFrame.x, y: exitFrame.y, z: exitFrame.z, w: exitFrame.w },
      x: position.x, y: position.y, z: position.z,
      vx: velocity.x, vy: velocity.y, vz: velocity.z,
      yaw: Math.atan2(-facing.x, -facing.z),
      pitch: Math.max(-1.35, Math.min(1.35, Math.asin(Math.max(-1, Math.min(1, facing.y))))),
      grounded: false,
      grapple: null,
      travel: p.travel + movement.length(),
      portalTransit: (p.portalTransit ?? 0) + 1,
    });
    this.reset(p.id, p);
    return true;
  }

  move(p: Player, i: Input, portals?: PortalPair) {
    const body = this.bodies.get(p.id);
    if (!body) return;
    const nearPlanet = Object.values(SOLAR_SYSTEM).find(
      (planet) =>
        planet.landable !== false &&
        Math.hypot(p.x - planet.position.x, p.y - planet.position.y, p.z - planet.position.z) <
          planet.radius + 60,
    );
    if (!p.planet && p.y > groundAt(p.x, p.z) + 80 && (p.jetting || nearPlanet)) {
      const nearby = Object.values(SOLAR_SYSTEM).find(
        (planet) =>
          planet.landable !== false &&
          Math.hypot(p.x - planet.position.x, p.y - planet.position.y, p.z - planet.position.z) <
            planet.radius + 260,
      );
      if (nearby) {
        p.planet = nearby.id;
        const q = surfaceOrientation(p);
        p.surfaceRotation = { x: q.x, y: q.y, z: q.z, w: q.w };
      }
    }
    if (p.planet && SOLAR_SYSTEM[p.planet]) {
      this.moveOnSphere(p, i, portals);
      return;
    }
    this.controller.setUp({ x: 0, y: 1, z: 0 });
    body.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
    if (i.grapple && !p.grappleHeld) {
      if (p.grapple) p.grapple = null;
      else {
        p.grapple = this.aim(p, 85);
        if (p.grapple) {
          p.grappleId++;
          p.grounded = false;
          p.vy = Math.max(p.vy, 5);
        }
      }
    }
    p.grappleHeld = i.grapple;
    const len = Math.max(1, Math.hypot(i.forward, i.side));
    const dx = (Math.cos(i.yaw) * i.side - Math.sin(i.yaw) * i.forward) / len,
      dz = (-Math.sin(i.yaw) * i.side - Math.cos(i.yaw) * i.forward) / len;
    const { speed, shouldJump } = this.stepLocomotionState(p, i);
    const factor = 1 - Math.exp(-(p.grounded && !p.grapple ? (p.skate ? 3.5 : 10) : 0.75) * DT);
    const dashForward = p.dashTime > 0 && len === 1 && i.forward === 0 && i.side === 0;
    p.vx += ((dashForward ? -Math.sin(i.yaw) : dx) * speed - p.vx) * factor;
    p.vz += ((dashForward ? -Math.cos(i.yaw) : dz) * speed - p.vz) * factor;
    if (shouldJump) {
      p.vy = 12;
      p.grounded = false;
    }
    if (p.jetting) {
      p.vy = Math.min(p.level >= 1 ? 24 : 19, p.vy + (p.level >= 1 ? 25 : 21) * DT);
      p.fuel = Math.max(0, p.fuel - DT * 20);
    } else {
      p.vy = Math.max(-40, p.vy - 7.5 * DT);
      if (p.grounded) p.fuel = Math.min(fuelCapacity(p.level), p.fuel + DT * 24);
    }
    if (p.level >= 2)
      for (const t of THERMALS)
        if (distance(p, t) < t.radius && p.y < t.y + t.height && p.y > t.y - 2) {
          p.vy = Math.min(32, p.vy + 42 * DT);
          p.fuel = Math.min(fuelCapacity(p.level), p.fuel + DT * 15);
        }
    if (p.grapple) {
      const a = p.grapple,
        dx = a.x - p.x,
        dy = a.y - p.y,
        dz = a.z - p.z;
      const d = Math.hypot(dx, dy, dz);
      if (d < 3 || d > 100) p.grapple = null;
      else {
        p.vx += (dx / d) * 52 * DT;
        p.vy += (dy / d) * 52 * DT;
        p.vz += (dz / d) * 52 * DT;
        const speed = Math.hypot(p.vx, p.vy, p.vz);
        if (speed > 48) {
          p.vx *= 48 / speed;
          p.vy *= 48 / speed;
          p.vz *= 48 / speed;
        }
      }
    }
    const impact = p.vy,
      wasGrounded = p.grounded;
    this.controller.computeColliderMovement(
      body.collider,
      { x: p.vx * DT, y: p.vy * DT, z: p.vz * DT },
      undefined,
      ALL_SOLID_FOR_PLAYER,
    );
    const d = this.controller.computedMovement(),
      pos = body.body.translation();
    if (this.tryPortals(p, i, pos, d, portals)) return;
    // Preserve the continuous polar shelf: no invisible square boundary.
    // Keep the player on the supported north-cap until radial locomotion is implemented.
    const nextX = pos.x + d.x;
    const nextZ = pos.z + d.z;
    const edge = HOME_COLLAR_RADIUS - 8;
    const radial = Math.hypot(nextX, nextZ);
    const scale = radial > edge ? edge / radial : 1;
    p.x = nextX * scale;
    p.y = pos.y + d.y;
    p.z = nextZ * scale;
    p.travel += Math.hypot(d.x, d.z);
    p.grounded = this.controller.computedGrounded();
    if (p.grounded && p.vy < 0) {
      if (!wasGrounded && impact < -2) {
        p.landing = -impact;
        p.landingId++;
      }
      p.vy = 0;
    }
    p.yaw = i.yaw;
    p.pitch = i.pitch;
    body.body.setNextKinematicTranslation(p);
  }

  step() {
    this.world.step();
  }

  aim(p: Player, range: number, minDistance = 2): Vec | null {
    const origin = eyePosition(p);
    const direction = viewDirection(p);
    const hit = this.world.castRay(
      new RAPIER.Ray(origin, direction),
      range,
      true,
      RAPIER.QueryFilterFlags.EXCLUDE_KINEMATIC,
      WORLD_ONLY_QUERY,
    );
    return hit && hit.timeOfImpact > minDistance
      ? {
          x: origin.x + direction.x * hit.timeOfImpact,
          y: origin.y + direction.y * hit.timeOfImpact,
          z: origin.z + direction.z * hit.timeOfImpact,
        }
      : null;
  }

  /**
   * Exact north-cap terrain query via Rapier, using only the same indexed mesh
   * and globe geometry the renderer displays. Southern landing stays radial.
   */
  homeSurfaceHeight(x: number, z: number): number | null {
    const { center, radius } = HOME_PLANET_SPHERE;
    if (Math.hypot(x - center.x, z - center.z) >= radius) return null;
    const startY = center.y + radius + 2200;
    const hit = this.world.castRay(
      new RAPIER.Ray({ x, y: startY, z }, { x: 0, y: -1, z: 0 }),
      radius * 2 + 2200,
      true,
      RAPIER.QueryFilterFlags.EXCLUDE_KINEMATIC,
      WORLD_ONLY_QUERY,
      undefined,
      undefined,
      (collider) => collider.handle === this.terrainCollider.handle ||
        collider.handle === this.homeGlobeCollider.handle,
    );
    return hit ? startY - hit.timeOfImpact : null;
  }

  /**
   * Oriented Rapier ShapeCast for solid obstacles (walls, obelisks, rocks, trees,
   * warp gate frames, other ships) paired with slope-aware steep terrain sweep
   * and tangential slide resolution.
   */
  shipMotion(a: Vec, delta: Vec, ctx?: ShipMotionContext): ShipMotionResult {
    const length = Math.hypot(delta.x, delta.y, delta.z);
    const horizontal = Math.hypot(delta.x, delta.z);
    if (length < 0.0001) return { ...a, frontalCollision: false, collided: false };

    const kind: SpaceshipKind = ctx?.kind ?? "light_fighter";
    const spec = SHIP_COLLIDER_SPECS[kind];
    const selfHandle = this.shipBodies.get(kind)?.collider.handle;
    const q = this.shipQuaternion(ctx);
    const rot = { x: q.x, y: q.y, z: q.z, w: q.w };
    const shape = new RAPIER.Cuboid(spec.halfWidth * 0.86, spec.halfHeight * 0.85, spec.halfLength * 0.86);
    const dir = { x: delta.x / length, y: delta.y / length, z: delta.z / length };

    let bestFraction = 1;
    let frontalCollision = false;
    let hitNormal: Vec | undefined;
    let collided = false;
    let hitIsTerrain = false;

    // Stage A: Oriented ShapeCast against all non-terrain solid colliders (buildings, rocks, obelisks, trees, warpgate frames, parked ships)
    const hullUp = new Vector3(0, 1, 0).applyQuaternion(q);
    const shapeOrigin = {
      x: a.x + hullUp.x * spec.yOffset,
      y: a.y + hullUp.y * spec.yOffset,
      z: a.z + hullUp.z * spec.yOffset,
    };
    const solidHit = this.world.castShape(
      shapeOrigin,
      rot,
      dir,
      shape,
      0.08,
      length + 0.35,
      true,
      undefined,
      SHIP_SWEEP_GROUPS,
      undefined,
      undefined,
      (col) => col.handle !== this.terrainCollider.handle && col.handle !== selfHandle,
    );

    if (solidHit && solidHit.time_of_impact < length + 0.35) {
      const n = solidHit.normal1;
      const dot = n.x * dir.x + n.y * dir.y + n.z * dir.z;
      const facing =
        dot < -0.15 ||
        (horizontal > 0.0001 && (n.x * delta.x + n.z * delta.z) / horizontal < -0.2);
      if (dot < -0.05 || solidHit.time_of_impact > 0.001) {
        const allowed = Math.max(0, solidHit.time_of_impact - 0.32) / length;
        if (allowed < bestFraction) {
          bestFraction = allowed;
          frontalCollision ||= facing;
          hitNormal = { x: n.x, y: n.y, z: n.z };
          collided = true;
          hitIsTerrain = false;
        }
      }
    }

    // Stage B: Oriented terrain-only cliff/mountain check (leaves gentle walkable slopes to floor contact)
    const xOffsets = [-Math.max(4, spec.halfWidth), 0, Math.max(4, spec.halfWidth)];
    const zOffsets = [-Math.max(5, spec.halfLength), 0, Math.max(5, spec.halfLength)];
    const probeVec = new Vector3();
    for (const ox of xOffsets) {
      for (const oz of zOffsets) {
        probeVec.set(ox, 3.5, oz).applyQuaternion(q);
        const origin = { x: a.x + probeVec.x, y: a.y + probeVec.y, z: a.z + probeVec.z };
        this.world.intersectionsWithRay(
          new RAPIER.Ray(origin, dir),
          length + 0.4,
          true,
          (hit) => {
            if (hit.collider.handle !== this.terrainCollider.handle) return true;
            const facing =
              horizontal > 0.0001 &&
              (hit.normal.x * delta.x + hit.normal.z * delta.z) / horizontal < -0.25;
            if (!facing || hit.normal.y < 0 || hit.normal.y >= 0.55) return true;
            const allowed = Math.max(0, hit.timeOfImpact - 0.4) / length;
            if (allowed < bestFraction) {
              bestFraction = allowed;
              frontalCollision = true;
              hitNormal = { x: hit.normal.x, y: hit.normal.y, z: hit.normal.z };
              collided = true;
              hitIsTerrain = true;
            }
            return true;
          },
          RAPIER.QueryFilterFlags.EXCLUDE_KINEMATIC,
          WORLD_ONLY_QUERY,
        );
      }
    }

    let nextX = a.x + delta.x * bestFraction;
    let nextY = a.y + delta.y * bestFraction;
    let nextZ = a.z + delta.z * bestFraction;

    // Tangential slide resolution on glancing non-terrain obstacle hits so the ship glides past structures smoothly
    if (collided && !hitIsTerrain && hitNormal && bestFraction < 0.99) {
      const rem = 1 - bestFraction;
      const remX = delta.x * rem;
      const remY = delta.y * rem;
      const remZ = delta.z * rem;
      const into = remX * hitNormal.x + remY * hitNormal.y + remZ * hitNormal.z;
      if (into < 0) {
        const slideX = remX - hitNormal.x * into;
        const slideY = remY - hitNormal.y * into;
        const slideZ = remZ - hitNormal.z * into;
        const slideLen = Math.hypot(slideX, slideY, slideZ);
        if (slideLen > 0.02) {
          const slideDir = { x: slideX / slideLen, y: slideY / slideLen, z: slideZ / slideLen };
          const slideHit = this.world.castShape(
            {
              x: nextX + hullUp.x * spec.yOffset,
              y: nextY + hullUp.y * spec.yOffset,
              z: nextZ + hullUp.z * spec.yOffset,
            },
            rot,
            slideDir,
            shape,
            0.05,
            slideLen + 0.2,
            false,
            undefined,
            SHIP_SWEEP_GROUPS,
            undefined,
            undefined,
            (col) => col.handle !== this.terrainCollider.handle && col.handle !== selfHandle,
          );
          const slideFrac = slideHit
            ? Math.max(0, slideHit.time_of_impact - 0.2) / slideLen
            : 1;
          nextX += slideX * Math.min(1, slideFrac);
          nextY += slideY * Math.min(1, slideFrac);
          nextZ += slideZ * Math.min(1, slideFrac);
        }
      }
    }

    return {
      x: nextX,
      y: nextY,
      z: nextZ,
      frontalCollision,
      collided,
      normal: hitNormal,
      impactRatio: collided ? Math.min(1, 1 - bestFraction) : 0,
    };
  }

  visible(a: Vec, b: Vec) {
    const d = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z },
      l = Math.hypot(d.x, d.y, d.z);
    return (
      l < 0.001 ||
      !this.world.castRay(
        new RAPIER.Ray(a, { x: d.x / l, y: d.y / l, z: d.z / l }),
        l,
        true,
        RAPIER.QueryFilterFlags.EXCLUDE_KINEMATIC,
        WORLD_ONLY_QUERY,
      )
    );
  }

  cameraDistance(a: Vec, b: Vec) {
    const d = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z },
      l = Math.hypot(d.x, d.y, d.z);
    if (l < 0.001) return l;
    const hit = this.world.castRay(
      new RAPIER.Ray(a, { x: d.x / l, y: d.y / l, z: d.z / l }),
      l,
      true,
      RAPIER.QueryFilterFlags.EXCLUDE_KINEMATIC,
      WORLD_ONLY_QUERY,
    );
    return hit ? Math.max(0.4, hit.timeOfImpact - 0.35) : l;
  }

  dispose() {
    this.world.free();
  }
}
