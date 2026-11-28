import { Vector3 } from "three";
import { FIGHTER_POS, SPAWN_FLEET } from "./adventure-data";
import { clamp, distance, groundAt, HALF, type Vec } from "./map";
import { DT, type FighterRecall, type Player, type SimulationHost } from "./types";

export type { FighterRecall };

const CLEARANCE = 30;
const PARKING_DISTANCE = 17;
const BASIN_CEILING = 620;
const UPRIGHT = { x: 0, y: 0, z: 0, w: 1 };

function inBasin(p: Vec) {
  return Math.abs(p.x) < HALF - 20 && Math.abs(p.z) < HALF - 20 && p.y < BASIN_CEILING;
}

function occupiedLanding(sim: SimulationHost, landing: Vec) {
  return sim.s.players.some(p => !p.planet && distance(p, landing) < 11);
}

function findLanding(sim: SimulationHost, caller: Player): Vec | undefined {
  const { halfWidth, halfLength } = SPAWN_FLEET.light_fighter;
  for (const radius of [PARKING_DISTANCE, 26, 39]) {
    for (const angle of [0, Math.PI / 2, -Math.PI / 2, Math.PI, Math.PI / 4, -Math.PI / 4, 3 * Math.PI / 4, -3 * Math.PI / 4]) {
      const yaw = caller.yaw + angle;
      const x = caller.x - Math.sin(yaw) * radius;
      const z = caller.z - Math.cos(yaw) * radius;
      const heights = [-halfWidth, 0, halfWidth].flatMap(dx =>
        [-halfLength, 0, halfLength].map(dz => groundAt(x + dx, z + dz)),
      );
      const landing = { x, y: Math.max(...heights), z };
      if (!inBasin(landing) || landing.y - Math.min(...heights) > 3 ||
          occupiedLanding(sim, landing)) continue;
      const down = { x: 0, y: -CLEARANCE, z: 0 };
      const approach = sim.physics.shipMotion({ ...landing, y: landing.y + CLEARANCE }, down, {
        kind: "light_fighter", yaw: sim.s.adventure.ship.yaw,
      });
      if (!approach.collided) return landing;
    }
  }
}

function cruiseAltitude(ship: Vec, landing: Vec) {
  const samples = Math.max(1, Math.ceil(distance(ship, landing) / 12));
  let altitude = Math.max(ship.y, landing.y + CLEARANCE);
  for (let step = 0; step <= samples; step++) {
    const t = step / samples;
    const x = ship.x + (landing.x - ship.x) * t;
    const z = ship.z + (landing.z - ship.z) * t;
    altitude = Math.max(altitude, groundAt(x, z) + CLEARANCE);
  }
  return altitude;
}

export function recallFighter(sim: SimulationHost, caller: Player) {
  const ship = sim.s.adventure.ship;
  if (caller.seat >= 0 || caller.planet || !inBasin(caller)) {
    sim.emit("请在开普勒盆地下船后召回游枭号");
    return;
  }
  if (ship.seats.some(Boolean)) {
    sim.emit("有玩家在飞船上，无法召回");
    return;
  }
  if (ship.recall) {
    sim.emit("游枭号正在飞来");
    return;
  }
  const fighterActive = (ship.kind ?? "light_fighter") === "light_fighter";
  const origin = fighterActive ? ship : FIGHTER_POS;
  if (!inBasin(origin)) {
    sim.emit("游枭号在开普勒盆地之外，无法召回");
    return;
  }
  const landing = findLanding(sim, caller);
  if (!landing) {
    sim.emit("附近没有安全降落点，请移到空旷处再召回");
    return;
  }
  const cruiseY = cruiseAltitude(origin, landing);
  if (cruiseY >= BASIN_CEILING) {
    sim.emit("当前航线没有足够的净空");
    return;
  }
  if (!fighterActive) {
    Object.assign(ship, origin, { kind: "light_fighter", flightTime: 0, arrived: false, warpUntil: 0 });
  }
  Object.assign(ship, {
    vx: 0, vy: 0, vz: 0, bank: 0, pitch: 0, yawVelocity: 0,
    grounded: false, boostPulse: 0, boosting: false, braking: false,
    flightRotation: UPRIGHT,
  });
  ship.recall = { caller: caller.id, phase: "lift", landing, cruiseY, expires: sim.s.time + 65 };
  sim.emit("游枭号正在起飞");
}

export function tickFighterRecall(sim: SimulationHost) {
  const ship = sim.s.adventure.ship;
  const recall = ship.recall;
  if (!recall) return false;
  const caller = sim.player(recall.caller);
  if (!caller || !inBasin(caller) || caller.planet || ship.seats.some(Boolean) || sim.s.time > recall.expires) {
    delete ship.recall;
    Object.assign(ship, { vx: 0, vy: 0, vz: 0, thrust: 0, throttle: 0.08 });
    sim.emit("游枭号召回已取消");
    return false;
  }

  const landingOccupied = occupiedLanding(sim, recall.landing);
  if (landingOccupied || (recall.phase !== "lift" && distance(caller, recall.landing) > 45)) {
    const landing = findLanding(sim, caller);
    const cruiseY = landing ? cruiseAltitude(ship, landing) : BASIN_CEILING;
    if (landing && cruiseY < BASIN_CEILING) {
      recall.landing = landing;
      recall.cruiseY = cruiseY;
      recall.phase = "lift";
    } else if (landingOccupied && recall.phase === "land") {
      // Hold position until there is a clear pad or the recall expires.
      Object.assign(ship, { vx: 0, vy: 0, vz: 0, thrust: 0.28, throttle: 0.28 });
      return true;
    }
  }

  const target = recall.phase === "lift" ? { x: ship.x, y: recall.cruiseY, z: ship.z }
    : recall.phase === "approach" ? { ...recall.landing, y: recall.cruiseY } : recall.landing;
  const offset = new Vector3().copy(target).sub(ship);
  const remaining = offset.length();
  const maxSpeed = recall.phase === "lift" ? 18 : recall.phase === "approach" ? 68 : 12;
  const currentSpeed = recall.phase === "approach" ? Math.hypot(ship.vx, ship.vz) : Math.abs(ship.vy);
  const acceleration = recall.phase === "approach" ? 38 : 25;
  const speed = Math.min(maxSpeed, currentSpeed + acceleration * DT, Math.sqrt(2 * acceleration * remaining), remaining / DT);
  const motion = offset.setLength(speed * DT);
  if (recall.phase === "approach") {
    const heading = Math.atan2(-motion.x, -motion.z);
    const turn = Math.atan2(Math.sin(heading - ship.yaw), Math.cos(heading - ship.yaw));
    ship.yaw += clamp(turn, -2 * DT, 2 * DT);
  }
  const next = sim.physics.shipMotion(ship, motion, { kind: "light_fighter", yaw: ship.yaw });
  Object.assign(ship, {
    vx: (next.x - ship.x) / DT, vy: (next.y - ship.y) / DT, vz: (next.z - ship.z) / DT,
    x: next.x, y: next.y, z: next.z, thrust: 0.7, throttle: 0.7,
  });
  if (next.collided && recall.phase === "approach" && recall.cruiseY + CLEARANCE < BASIN_CEILING) {
    recall.cruiseY += CLEARANCE;
    recall.phase = "lift";
  }
  if (Math.hypot(ship.x - target.x, ship.y - target.y, ship.z - target.z) > 0.12) return true;
  if (recall.phase === "lift") recall.phase = "approach";
  else if (recall.phase === "approach") recall.phase = "land";
  else {
    Object.assign(ship, {
      x: target.x, y: target.y, z: target.z, vx: 0, vy: 0, vz: 0,
      grounded: true, thrust: 0, throttle: 0.08,
    });
    delete ship.recall;
    sim.emit("游枭号已降落 · 靠近后按 E 登船");
  }
  return true;
}
