import { LAB, LAB_BOXES } from "./adventure-data";
import RAPIER from "@dimforge/rapier3d-compat";
import { Quaternion, Vector3 } from "three";
import { FOOT_OFFSET, surfaceOrientation, eyePosition, viewDirection } from "./surface";
import {
  terrainMesh,
  groundAt,
  ROCKS,
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
} from "./celestial";
import { DT, type Input, type Player } from "./types";
let ready: Promise<void> | undefined;
export const initPhysics = (wasmModule?: unknown) =>
  (ready ??= wasmModule ? (RAPIER as any).init(wasmModule) : RAPIER.init());
export const fuelCapacity = (level: number) => (level >= 1 ? 150 : 100);
export class MovementWorld {
  world = new RAPIER.World({ x: 0, y: -7.5, z: 0 });
  controller = this.world.createCharacterController(0.025);
  bodies = new Map<
    string,
    { body: RAPIER.RigidBody; collider: RAPIER.Collider }
  >();
  constructor() {
    this.world.timestep = DT;
    this.controller.enableAutostep(0.8, 0.25, false);
    this.controller.enableSnapToGround(0.35);
    this.controller.setMaxSlopeClimbAngle(Math.PI * 0.29);
    this.controller.setMinSlopeSlideAngle(Math.PI * 0.34);
    const m = terrainMesh();
    this.world.createCollider(
      RAPIER.ColliderDesc.trimesh(m.vertices, m.indices),
    );
    for (const r of ROCKS)
      if (r.size > 3)
        this.world.createCollider(
          RAPIER.ColliderDesc.ball(r.size * 0.66).setTranslation(
            r.x,
            r.y + r.size * 0.48,
            r.z,
          ),
        );
    for (const b of BEACON_SITES) {
      this.world.createCollider(
        RAPIER.ColliderDesc.cylinder(0.18, 6).setTranslation(
          b.x,
          b.y + 0.18,
          b.z,
        ),
      );
      this.world.createCollider(
        RAPIER.ColliderDesc.cylinder(0.6, 0.65).setTranslation(
          b.x,
          b.y + 1,
          b.z + 3,
        ),
      );
      for (const side of [-1, 1]) {
        this.world.createCollider(
          RAPIER.ColliderDesc.cuboid(0.63, 2.15, 0.75).setTranslation(
            b.x + side * 2,
            b.y + 2.45,
            b.z,
          ),
        );
        this.world.createCollider(
          RAPIER.ColliderDesc.cuboid(0.55, 1.6, 0.6).setTranslation(
            b.x + side * 1.68,
            b.y + 6.4,
            b.z,
          ),
        );
      }
    }
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
            }),
        );
      }
    for (const b of LAB_BOXES)
      this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(b.sx / 2, b.sy / 2, b.sz / 2).setTranslation(
          LAB.x + b.x,
          LAB.y + b.y,
          LAB.z + b.z,
        ),
      );
    this.world.step();
  }
  add(id: string, p: Vec) {
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
        p.x,
        p.y,
        p.z,
      ),
    );
    const collider = this.world.createCollider(
      RAPIER.ColliderDesc.capsule(0.48, 0.32),
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
    this.world.propagateModifiedBodyPositionsToColliders();
  }
  private moveOnSphere(p: Player, i: Input) {
    const planet = SOLAR_SYSTEM[p.planet!];
    const body = this.bodies.get(p.id)!;
    const position = new Vector3(p.x, p.y, p.z);
    const center = new Vector3().copy(planet.position);
    const up = position.clone().sub(center).normalize();
    const frame = surfaceOrientation(p);
    const velocity = new Vector3(p.vx, p.vy, p.vz);
    let radial = velocity.dot(up);
    const tangent = velocity.addScaledVector(up, -radial);
    const wasJumpHeld = p.jumpHeld;
    const wasGrounded = p.grounded;
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
    const target = new Vector3(
      Math.cos(i.yaw) * i.side - Math.sin(i.yaw) * i.forward,
      0,
      -Math.sin(i.yaw) * i.side - Math.cos(i.yaw) * i.forward,
    ).divideScalar(Math.max(1, Math.hypot(i.forward, i.side))).applyQuaternion(frame).multiplyScalar(speed);
    tangent.lerp(target, 1 - Math.exp(-(wasGrounded ? 10 : 2) * DT));
    p.jumpHeld = i.jump;
    p.jetting = i.jet && p.fuel > 0;
    const gravity = new Vector3().copy(sphericalGravity(position, planet).gravityVec);
    radial = Math.max(-40, radial + gravity.dot(up) * DT);
    if (i.jump && !wasJumpHeld && wasGrounded) radial = 12;
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
    this.controller.computeColliderMovement(body.collider, movement, RAPIER.QueryFilterFlags.EXCLUDE_KINEMATIC);
    const next = position.clone().add(this.controller.computedMovement());
    const landed = radial <= 0 && next.distanceTo(center) <= planet.radius + FOOT_OFFSET + 0.08;
    const resolved = landed ? new Vector3().copy(projectToSphere(next, planet, FOOT_OFFSET)) : next;
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
  move(p: Player, i: Input) {
    const body = this.bodies.get(p.id);
    if (!body) return;
    const nearPlanet = Object.values(SOLAR_SYSTEM).find(planet =>
      Math.hypot(p.x - planet.position.x, p.y - planet.position.y, p.z - planet.position.z) < planet.radius + 60);
    if (!p.planet && p.y > groundAt(p.x, p.z) + 80 && (p.jetting || nearPlanet)) {
      const nearby = Object.values(SOLAR_SYSTEM).find(planet =>
        Math.hypot(p.x - planet.position.x, p.y - planet.position.y, p.z - planet.position.z) < planet.radius + 260);
      if (nearby) {
        p.planet = nearby.id;
        const q = surfaceOrientation(p);
        p.surfaceRotation = { x: q.x, y: q.y, z: q.z, w: q.w };
      }
    }
    if (p.planet && SOLAR_SYSTEM[p.planet]) {
      this.moveOnSphere(p, i);
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
    const factor = 1 - Math.exp(-(p.grounded && !p.grapple ? (p.skate ? 3.5 : 10) : 0.75) * DT);
    const dashForward =
      p.dashTime > 0 && len === 1 && i.forward === 0 && i.side === 0;
    p.vx += ((dashForward ? -Math.sin(i.yaw) : dx) * speed - p.vx) * factor;
    p.vz += ((dashForward ? -Math.cos(i.yaw) : dz) * speed - p.vz) * factor;
    if (i.jump && !p.jumpHeld && p.grounded) {
      p.vy = 12;
      p.grounded = false;
    }
    p.jumpHeld = i.jump;
    p.jetting = i.jet && p.fuel > 0;
    if (p.jetting) {
      p.vy = Math.min(
        p.level >= 1 ? 24 : 19,
        p.vy + (p.level >= 1 ? 25 : 21) * DT,
      );
      p.fuel = Math.max(0, p.fuel - DT * 20);
    } else {
      p.vy = Math.max(-40, p.vy - 7.5 * DT);
      if (p.grounded)
        p.fuel = Math.min(fuelCapacity(p.level), p.fuel + DT * 24);
    }
    if (p.level >= 2)
      for (const t of THERMALS)
        if (
          distance(p, t) < t.radius &&
          p.y < t.y + t.height &&
          p.y > t.y - 2
        ) {
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
      RAPIER.QueryFilterFlags.EXCLUDE_KINEMATIC,
    );
    const d = this.controller.computedMovement(),
      pos = body.body.translation();
    p.x = Math.max(-HALF + 8, Math.min(HALF - 8, pos.x + d.x));
    p.y = pos.y + d.y;
    p.z = Math.max(-HALF + 8, Math.min(HALF - 8, pos.z + d.z));
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
  aim(p: Player, range: number): Vec | null {
    const origin = eyePosition(p);
    const direction = viewDirection(p);
    const hit = this.world.castRay(
      new RAPIER.Ray(origin, direction),
      range,
      true,
      RAPIER.QueryFilterFlags.EXCLUDE_KINEMATIC,
    );
    return hit && hit.timeOfImpact > 2
      ? {
          x: origin.x + direction.x * hit.timeOfImpact,
          y: origin.y + direction.y * hit.timeOfImpact,
          z: origin.z + direction.z * hit.timeOfImpact,
        }
      : null;
  }
  shipMotion(a: Vec, delta: Vec) {
    // Swept hull samples prevent high-speed flight through terrain and architecture.
    let fraction = 1;
    const length = Math.hypot(delta.x, delta.y, delta.z);
    if (length < 0.0001) return { ...a };
    for (const x of [-4, 0, 4])
      for (const z of [-5, 0, 5]) {
        const origin = { x: a.x + x, y: a.y + 2, z: a.z + z };
        const hit = this.world.castRay(
          new RAPIER.Ray(origin, {
            x: delta.x / length,
            y: delta.y / length,
            z: delta.z / length,
          }),
          length + 0.4,
          true,
          RAPIER.QueryFilterFlags.EXCLUDE_KINEMATIC,
        );
        if (hit)
          fraction = Math.min(
            fraction,
            Math.max(0, hit.timeOfImpact - 0.4) / length,
          );
      }
    return {
      x: a.x + delta.x * fraction,
      y: a.y + delta.y * fraction,
      z: a.z + delta.z * fraction,
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
    );
    return hit ? Math.max(0.4, hit.timeOfImpact - 0.35) : l;
  }
  dispose() {
    this.world.free();
  }
}
