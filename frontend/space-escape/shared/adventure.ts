import {
  DT,
  idleInput,
  type Adventure,
  type AdventureShip,
  type Input,
  type Player,
} from "./types";
import {
  ITEMS,
  emptyInventory,
  REPAIR,
  RESOURCE_SITES,
  FIGHTER_POS,
  SPAWN_FLEET,
  OUTPOST,
  LORE,
  DESTINATION,
  type ItemId,
} from "./adventure-data";
import { groundAt, distance3, distance, HALF, clamp, type Vec } from "./map";
import { eyePosition, viewDirection, FOOT_OFFSET, surfaceOrientation } from "./surface";
import { celestialCapture, geodesicArcDistance, projectToSphere, type SpaceshipKind } from "./celestial";
import { celestialFlightFrame } from "./celestial-flight";
import { Vector3 } from "three";
import type { Simulation } from "./simulation";
export function createAdventure(): Adventure {
  return {
    lore: [],
    completeAt: -1,
    nodes: RESOURCE_SITES.map((n, id) => ({ ...n, id, readyAt: 0, hitId: 0 })),
    drones: [0, 1, 2].map((id) => ({
      ...OUTPOST,
      x: OUTPOST.x + (id - 1) * 14,
      y: OUTPOST.y + 5,
      id,
      hp: 100,
      yaw: 0,
      target: "",
      mode: "patrol",
      timer: 1 + id,
      hitId: 0,
      shotId: 0,
      aim: { ...OUTPOST },
    })),
    ship: {
      ...FIGHTER_POS,
      kind: "light_fighter",
      yaw: 0,
      yawVelocity: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      bank: 0,
      repaired: false,
      progress: 0,
      cargo: emptyInventory(),
      seats: ["", "", "", ""],
      grounded: true,
      thrust: 0,
      flightTime: 0,
      arrived: false,
    },
  };
}
export function adventurePlayer() {
  return {
    grapple: null,
    grappleHeld: false,
    grappleId: 0,
    inventory: { ...emptyInventory(), medgel: 2 },
    health: 100,
    damageId: 0,
    toolCooldown: 0,
    shotId: 0,
    shotEnd: { x: 0, y: 0, z: 0 },
    hitKind: "",
    interactHeld: false,
    lore: -1,
    seat: -1,
    invulnerable: 0,
  };
}
const eye = (p: Player): Vec => eyePosition(p);
const towards = (p: Player, target: Vec) => {
  const e = eye(p),
    x = target.x - e.x,
    y = target.y - e.y,
    z = target.z - e.z,
    d = Math.hypot(x, y, z);
  const aim = viewDirection(p);
  return (
    d < 1 ||
    (x * aim.x + y * aim.y + z * aim.z) /
      d >
      0.965
  );
};
export function tool(sim: Simulation, p: Player) {
  if (p.seat >= 0 || p.toolCooldown > 0) return;
  p.toolCooldown = 0.28;
  p.shotId++;
  p.hitKind = "";
  const a = sim.s.adventure,
    e = eye(p);
  const wall = sim.physics.aim(p, 65);
  const direction = viewDirection(p);
  p.shotEnd = wall || {
    x: e.x + direction.x * 65,
    y: e.y + direction.y * 65,
    z: e.z + direction.z * 65,
  };
  const targets = [
    ...a.drones
      .filter((d) => d.hp > 0 && distance3(e, d) < 65 && towards(p, d))
      .map((d) => ({ type: "drone", target: d })),
    ...a.nodes
      .filter(
        (n) => n.readyAt <= sim.s.time && distance3(e, n) < 11 && towards(p, n),
      )
      .map((n) => ({ type: "node", target: n })),
  ].sort((a, b) => distance3(e, a.target) - distance3(e, b.target));
  const hit = targets.find((t) => sim.physics.visible(e, t.target));
  if (!hit) return;
  p.shotEnd = { x: hit.target.x, y: hit.target.y, z: hit.target.z };
  if (hit.type === "drone") {
    const d = a.drones[hit.target.id];
    d.hp = Math.max(0, d.hp - 25);
    d.hitId++;
    d.mode = d.hp ? "stunned" : "dead";
    d.timer = 0.4;
    p.hitKind = d.hp ? "hit" : "kill";
    if (!d.hp) {
      p.inventory.scrap = Math.min(99, p.inventory.scrap + 1);
      sim.emit(
        a.drones.every((v) => v.hp <= 0)
          ? "封锁解除 · 切割反应堆，取出动力核心"
          : "守卫已摧毁 · 合金废料 +1",
      );
    }
  } else {
    const n = a.nodes[hit.target.id];
    if (n.item === "core" && a.drones.some((d) => d.hp > 0)) {
      p.hitKind = "shield";
      return;
    }
    n.hp--;
    n.hitId++;
    p.hitKind = "mine";
    if (n.hp <= 0) {
      if (p.inventory[n.item] + n.amount > 99) {
        n.hp = 1;
        sim.emit("物品堆叠已满 · 将材料送回飞船");
        return;
      }
      p.inventory[n.item] += n.amount;
      n.readyAt = sim.s.time + (n.item === "core" ? 1e9 : 90);
      n.hp = RESOURCE_SITES[n.id].hp;
      p.hitKind = "collect";
      sim.emit(`${ITEMS[n.item].name} +${n.amount} · Tab 查看物品栏`);
    }
  }
}
type BoardingPlayer = Vec & { planet?: string | null };
type BoardingShip = Vec & Partial<Pick<AdventureShip, "kind" | "seats">>;

function boardingDistance(p: BoardingPlayer, ship: Vec): number {
  const capture = celestialCapture(ship);
  if (capture && capture.altitude < 60) {
    const body = capture.body;
    const playerAltitude = Math.hypot(p.x - body.position.x, p.y - body.position.y, p.z - body.position.z) - body.radius;
    if (playerAltitude < 60) {
      const { arcDistance, heightDiff } = geodesicArcDistance(p, ship, body);
      return arcDistance + Math.max(0, heightDiff - 12);
    }
  }

  return distance3(p, { ...ship, y: ship.y + 1 });
}

function boardingCandidates(p: BoardingPlayer, ship: BoardingShip) {
  const kind = ship.kind ?? "light_fighter";
  const candidates = [{
    ...SPAWN_FLEET[kind], position: ship, active: true,
    distance: boardingDistance(p, ship),
  }];
  // One shared crew controls one active vessel. Other pads are available only
  // when it is empty; the active vessel's old pad must never duplicate it.
  if (!ship.seats?.some(Boolean) && !p.planet) {
    for (const spawn of Object.values(SPAWN_FLEET)) {
      if (spawn.kind === kind) continue;
      candidates.push({
        ...spawn, active: false, distance: boardingDistance(p, spawn.position),
      });
    }
  }
  return candidates.sort((a, b) => a.distance - b.distance);
}

export function shipBoardingDistance(p: BoardingPlayer, ship: BoardingShip): number {
  return boardingCandidates(p, ship)[0].distance;
}

export function shipBoardingTarget(p: BoardingPlayer, ship: BoardingShip) {
  return boardingCandidates(p, ship).find((target) => target.distance < target.boardingRadius) ?? null;
}

export function interactAdventure(sim: Simulation, p: Player, i: Input) {
  const a = sim.s.adventure,
    ship = a.ship;
  const pressed = i.interact && !p.interactHeld;
  p.interactHeld = i.interact;
  if (p.seat >= 0) {
    if (pressed) {
      if (!ship.grounded || Math.hypot(ship.vx, ship.vy, ship.vz) > 3) {
        sim.emit("先降落并刹停，再按 E 离舱");
        return;
      }
      const frame = celestialFlightFrame(ship, ship.yaw);
      if (frame.capture) {
        const body = frame.capture.body;
        ship.seats[p.seat] = "";
        p.seat = -1;
        const exitRaw = new Vector3(ship.x, ship.y, ship.z).addScaledVector(frame.right, 6);
        const exit = projectToSphere(exitRaw, body, FOOT_OFFSET);
        Object.assign(p, {
          x: exit.x,
          y: exit.y,
          z: exit.z,
          planet: body.id,
          vx: 0,
          vy: 0,
          vz: 0,
          grounded: true,
        });
        const q = surfaceOrientation(p);
        p.surfaceRotation = { x: q.x, y: q.y, z: q.z, w: q.w };
        sim.physics.reset(p.id, p);
        sim.emit(`已离舱 · ${body.name}地表已捕获`);
        return;
      }
      ship.seats[p.seat] = "";
      p.seat = -1;
      // Choose a clear side exit, validating height and line of sight.
      const exit = [-1, 1]
        .map((side) => ({
          x: ship.x + Math.cos(ship.yaw) * side * 9,
          z: ship.z - Math.sin(ship.yaw) * side * 9,
        }))
        .find(
          (v) =>
            Math.abs(groundAt(v.x, v.z) - ship.y) < 5 &&
            sim.physics.visible(
              { x: ship.x, y: ship.y + 3, z: ship.z },
              { ...v, y: groundAt(v.x, v.z) + 1.5 },
            ),
        );
      if (!exit) {
        p.seat = ship.seats.findIndex((v) => !v);
        ship.seats[p.seat] = p.id;
        sim.emit("出口被挡住 · 请换一个平坦位置降落");
        return;
      }
      Object.assign(p, {
        ...exit,
        y: groundAt(exit.x, exit.z) + 0.85,
        vx: 0,
        vy: 0,
        vz: 0,
        grounded: true,
      });
      sim.physics.reset(p.id, p);
      sim.emit("已离舱 · 飞船在此等待");
    }
    return;
  }
  const boarding = shipBoardingTarget(p, ship);
  if (boarding && i.interact) {
    const canContribute = (Object.keys(REPAIR) as ItemId[]).some(
      (k) => (p.inventory[k] || 0) > 0 && ship.cargo[k] < REPAIR[k]!,
    );
    const allMaterialsGathered = (Object.keys(REPAIR) as ItemId[]).every(
      (k) => ship.cargo[k] >= REPAIR[k]!,
    );
    const inRepairFlow = !ship.repaired && boarding.active && boarding.kind === "light_fighter" && (canContribute || allMaterialsGathered);
    if (inRepairFlow) {
      for (const key of Object.keys(REPAIR) as ItemId[]) {
        const transfer = Math.min(
          p.inventory[key],
          Math.max(0, REPAIR[key]! - ship.cargo[key]),
        );
        p.inventory[key] -= transfer;
        ship.cargo[key] += transfer;
      }
      const ready = (Object.keys(REPAIR) as ItemId[]).every(
        (k) => ship.cargo[k] >= REPAIR[k]!,
      );
      if (ready) {
        ship.progress = Math.min(1, ship.progress + DT / 4);
        if (ship.progress >= 1) {
          ship.repaired = true;
          sim.emit("轻型战机重新点火 · 松开 E，再按 E 登船");
        }
      } else if (pressed) sim.emit("材料已存入飞船 · Tab 查看剩余修复需求");
    } else if (pressed && (!boarding.active || ((ship.grounded || (p.planet && celestialCapture(ship)?.body.id === p.planet)) && Math.hypot(ship.vx, ship.vy, ship.vz) < 3))) {
      const seat = ship.seats.findIndex((v) => !v);
      if (seat >= 0) {
        if (!boarding.active) {
          Object.assign(ship, boarding.position, {
            yaw: boarding.yaw, yawVelocity: 0, bank: 0,
            flightRotation: undefined,
            vx: 0, vy: 0, vz: 0, grounded: true,
            thrust: 0, flightTime: 0, arrived: false,
          });
        }
        ship.kind = boarding.kind;
        p.seat = seat;
        ship.seats[seat] = p.id;
        p.grapple = null;
        p.planet = null;
        // Direct boarding ready for flight ignition
        ship.repaired = true;
        ship.progress = 1;
        sim.emit(
          seat === 0
            ? `${boarding.name}已点火 · WASD 推进 / 空格升空 / X 刹停下降 / Shift 加力`
            : "乘客就位 · E 在着陆后离舱",
        );
      }
    }
    return;
  }
  if (!pressed) return;
  const clue = LORE.find(
    (l) =>
      distance3(p, l) < 8 &&
      sim.physics.visible(eye(p), { ...l, y: l.y + 1.5 }),
  );
  if (clue) {
    p.lore = clue.id;
    if (!a.lore.includes(clue.id)) {
      a.lore.push(clue.id);
      if (clue.id === 1) {
        p.inventory.circuit++;
        for (const member of sim.s.players) {
          member.level = Math.max(member.level, 1);
          member.fuel = 150;
        }
      }
      sim.emit(`${clue.title} · ${clue.short}`);
    }
  }
}
interface FlightTuning {
  turnRate: number;
  turnResponse: number;
  maxBank: number;
  rollResponse: number;
  acceleration: number;
  drag: number;
  surfaceSpeed: number;
  surfaceBoost: number;
  cruiseSpeed: number;
  cruiseBoost: number;
  climbForce: number;
}

const FLIGHT_TUNING: Record<SpaceshipKind, FlightTuning> = {
  light_fighter: {
    turnRate: 1.8, turnResponse: 12, maxBank: 0.52, rollResponse: 12,
    acceleration: 46, drag: 0.28, surfaceSpeed: 96, surfaceBoost: 160,
    cruiseSpeed: 280, cruiseBoost: 360, climbForce: 100,
  },
  intergalactic: {
    turnRate: 0.8, turnResponse: 4, maxBank: 0.4, rollResponse: 5,
    acceleration: 24, drag: 0.11, surfaceSpeed: 64, surfaceBoost: 110,
    cruiseSpeed: 260, cruiseBoost: 400, climbForce: 75,
  },
};

export function tickShip(sim: Simulation, inputs: Map<string, Input>) {
  const s = sim.s.adventure.ship;
  const pilot = sim.player(s.seats[0]);
  const i = pilot ? inputs.get(pilot.id) || idleInput() : idleInput();
  if (s.repaired) {
    const kind = s.kind ?? "light_fighter";
    const tuning = FLIGHT_TUNING[kind];
    const inDeepSpace = s.y > 650 || Math.abs(s.x) > HALF - 10 || Math.abs(s.z) > HALF - 10;
    const boosting = !!pilot && i.sprint && !i.brake;
    const turn = pilot
      ? Math.atan2(Math.sin(i.yaw - s.yaw), Math.cos(i.yaw - s.yaw))
      : 0;
    const targetYawVelocity = clamp(turn * 4, -tuning.turnRate, tuning.turnRate);
    const yawVelocity = (s.yawVelocity ?? 0) +
      (targetYawVelocity - (s.yawVelocity ?? 0)) * (1 - Math.exp(-tuning.turnResponse * DT));
    const yawStep = clamp(yawVelocity * DT, -Math.abs(turn), Math.abs(turn));
    s.yaw += yawStep;
    s.yawVelocity = yawStep / DT;
    const targetBank = clamp(
      -s.yawVelocity / tuning.turnRate * tuning.maxBank - i.side * 0.08,
      -tuning.maxBank, tuning.maxBank,
    );
    s.bank += (targetBank - s.bank) * (1 - Math.exp(-tuning.rollResponse * DT));
    const damping = i.brake || !pilot ? 3.5 : tuning.drag;
    const drag = Math.exp(-damping * DT);
    const frame = celestialFlightFrame(s, s.yaw);
    s.flightRotation = { x: frame.surfaceRotation.x, y: frame.surfaceRotation.y,
      z: frame.surfaceRotation.z, w: frame.surfaceRotation.w };
    const velocity = new Vector3(s.vx, s.vy, s.vz);
    const radialSpeed = velocity.dot(frame.up);
    const tangent = velocity.clone().addScaledVector(frame.up, -radialSpeed);
    const previousSpeed = tangent.length();
    // Shift ignites forward afterburners even without W. Braking takes priority.
    const boostMultiplier = inDeepSpace && kind === "intergalactic" ? 4 : 2.5;
    const forward = boosting ? Math.max(0, i.forward) + boostMultiplier - 1 : i.forward;
    const acceleration = tuning.acceleration * (inDeepSpace && boosting ? 1.5 : 1);
    tangent.multiplyScalar(drag)
      .addScaledVector(frame.right, i.side * acceleration * DT)
      .addScaledVector(frame.forward, forward * acceleration * DT);
    const isClimbing = (i.jump || i.jet) && !!pilot;
    const climbForce = isClimbing ? tuning.climbForce : 0;
    const vyDamping = i.brake ? 4 : (isClimbing ? 0.9 : 1.8);
    const gravity = frame.capture
      ? frame.capture.body.gravity * frame.capture.weight : 3;
    let radial = radialSpeed * Math.exp(-vyDamping * DT) +
      (climbForce - (i.brake ? 28 : 0) - (frame.capture ? 0 : gravity)) * DT;
    const speed = tangent.length();
    const speedLimit = inDeepSpace
      ? (boosting ? tuning.cruiseBoost : tuning.cruiseSpeed)
      : (boosting ? tuning.surfaceBoost : tuning.surfaceSpeed);
    // Releasing boost lets momentum bleed away instead of snapping to cruise speed.
    const maxSpeed = Math.max(speedLimit, previousSpeed * drag);
    if (speed > maxSpeed) tangent.multiplyScalar(maxSpeed / speed);
    const maxVy = inDeepSpace || (s.thrust || 0) > 0.8 || isClimbing ? 160 : 65;
    radial = clamp(radial, -maxVy, maxVy);
    velocity.copy(tangent).addScaledVector(frame.up, radial);
    if (frame.capture) velocity.addScaledVector(new Vector3().copy(frame.capture.normal), -gravity * DT);
    s.vx = velocity.x;
    s.vy = velocity.y;
    s.vz = velocity.z;
    const proposed = sim.physics.shipMotion(s, {
      x: s.vx * DT,
      y: s.vy * DT,
      z: s.vz * DT,
    });
    if (proposed.frontalCollision) {
      const collisionDrag = Math.exp(-12 * DT);
      s.vx *= collisionDrag;
      s.vz *= collisionDrag;
    }
    const capture = celestialCapture(proposed);
    if (capture) {
      const body = capture.body;
      const norm = capture.normal;
      const distance = capture.altitude + body.radius;
      const surfaceFloor = body.radius + 0.2;
      if (distance <= surfaceFloor) {
        s.grounded = true;
        s.x = body.position.x + norm.x * surfaceFloor;
        s.y = body.position.y + norm.y * surfaceFloor;
        s.z = body.position.z + norm.z * surfaceFloor;
        const radialV = s.vx * norm.x + s.vy * norm.y + s.vz * norm.z;
        if (radialV < 0) {
          s.vx -= norm.x * radialV;
          s.vy -= norm.y * radialV;
          s.vz -= norm.z * radialV;
        }
      } else {
        s.x = proposed.x;
        s.y = proposed.y;
        s.z = proposed.z;
        s.grounded = false;
      }
    } else if (proposed.y > 650 || Math.abs(proposed.x) > HALF - 10 || Math.abs(proposed.z) > HALF - 10) {
      // Deep space / interplanetary navigation
      s.x = proposed.x;
      s.y = proposed.y;
      s.z = proposed.z;
      s.grounded = false;
    } else {
      // Kepler local basin
      s.x = clamp(proposed.x, -HALF + 20, HALF - 20);
      s.z = clamp(proposed.z, -HALF + 20, HALF - 20);
      const floor = Math.max(
        ...[-4, 0, 4].flatMap((x) =>
          [-5, 0, 5].map((z) => groundAt(s.x + x, s.z + z)),
        ),
      );
      s.y = clamp(proposed.y, floor, 650);
      s.grounded = s.y <= floor + 0.15;
      if (s.grounded && s.vy < 0) s.vy = 0;
    }
    s.thrust =
      Math.abs(forward) + Math.abs(i.side) + (isClimbing ? 1.5 : 0);
    if (!s.grounded && pilot) s.flightTime += DT;
    if (
      !s.arrived &&
      pilot &&
      s.flightTime > 3 &&
      distance(s, DESTINATION) < 65 &&
      s.grounded
    ) {
      s.arrived = true;
      sim.s.adventure.completeAt = sim.s.time;
      sim.s.completedAt = sim.s.time;
      sim.s.phase = "won";
      sim.emit("抵达回声林地 · 在不该有生命的地方，树木仍在呼吸");
    }
  }
  const passengerFrame = celestialFlightFrame(s, s.yaw);
  s.flightRotation = { x: passengerFrame.surfaceRotation.x, y: passengerFrame.surfaceRotation.y,
    z: passengerFrame.surfaceRotation.z, w: passengerFrame.surfaceRotation.w };
  for (const p of sim.s.players)
    if (p.seat >= 0) {
      Object.assign(p, {
        x: s.x + passengerFrame.up.x * 2.2,
        y: s.y + passengerFrame.up.y * 2.2,
        z: s.z + passengerFrame.up.z * 2.2,
        planet: passengerFrame.capture?.body.id ?? null,
        surfaceRotation: { x: passengerFrame.surfaceRotation.x, y: passengerFrame.surfaceRotation.y,
          z: passengerFrame.surfaceRotation.z, w: passengerFrame.surfaceRotation.w },
        vx: s.vx,
        vy: s.vy,
        vz: s.vz,
        grounded: s.grounded,
        jetting: false,
      });
      const input = inputs.get(p.id);
      if (input) {
        p.yaw = input.yaw;
        p.pitch = input.pitch;
      }
      sim.physics.reset(p.id, p);
    }
}
export function tickDrones(sim: Simulation) {
  const a = sim.s.adventure;
  for (const p of sim.s.players) {
    p.toolCooldown = Math.max(0, p.toolCooldown - DT);
    p.invulnerable = Math.max(0, p.invulnerable - DT);
  }
  for (const d of a.drones) {
    if (d.hp <= 0) continue;
    d.timer -= DT;
    if (d.mode === "stunned") {
      if (d.timer <= 0) {
        d.mode = "patrol";
        d.timer = 0.6;
      }
      continue;
    }
    if (d.mode === "charge") {
      if (d.timer <= 0) {
        d.mode = "fire";
        d.timer = 0.32;
        d.shotId++;
        for (const p of sim.s.players)
          if (
            p.seat < 0 &&
            p.invulnerable <= 0 &&
            distance3(eye(p), d.aim) < 3.2 &&
            sim.physics.visible(d, eye(p))
          ) {
            p.health = Math.max(0, p.health - 18);
            p.damageId++;
            p.invulnerable = 0.45;
            if (!p.health) {
              sim.respawn(p);
              p.health = 100;
              p.invulnerable = 4;
              sim.emit("护盾过载 · 已救援至信标，物品保留");
            }
          }
      }
      continue;
    }
    if (d.mode === "fire") {
      if (d.timer <= 0) {
        d.mode = "patrol";
        d.timer = 1.2;
      }
      continue;
    }
    const angle = sim.s.time * 0.19 + (d.id * Math.PI * 2) / 3;
    d.x = OUTPOST.x + Math.cos(angle) * 19;
    d.z = OUTPOST.z + Math.sin(angle) * 19;
    d.y = groundAt(d.x, d.z) + 5 + Math.sin(sim.s.time + d.id) * 1.2;
    const target = sim.s.players
      .filter(
        (p) =>
          p.seat < 0 && distance3(p, d) < 58 && sim.physics.visible(d, eye(p)),
      )
      .sort((p, q) => distance3(p, d) - distance3(q, d))[0];
    if (target && d.timer <= 0) {
      d.target = target.id;
      d.aim = eye(target);
      d.mode = "charge";
      d.timer = 1.15;
      d.yaw = Math.atan2(d.x - target.x, d.z - target.z);
    }
  }
}
