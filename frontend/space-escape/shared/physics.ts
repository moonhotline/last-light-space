import RAPIER from "@dimforge/rapier3d-compat";
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
import { DT, type Input, type Player } from "./types";
let ready: Promise<void> | undefined;
export const initPhysics = () => (ready ??= RAPIER.init());
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
  move(p: Player, i: Input) {
    const body = this.bodies.get(p.id);
    if (!body) return;
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
    const speed = p.dashTime > 0 ? 43 : i.sprint ? 23 : 15;
    const factor = 1 - Math.exp(-(p.grounded ? 14 : 5) * DT);
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
