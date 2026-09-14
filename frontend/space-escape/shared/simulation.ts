import {
  createAdventure,
  adventurePlayer,
  interactAdventure,
  tickShip,
  tickDrones,
  tool,
} from "./adventure";
import { type ItemId } from "./adventure-data";
import { MovementWorld, fuelCapacity } from "./physics";
import {
  SPAWN,
  BEACON_SITES,
  CRYSTALS,
  distance,
  distance3,
  groundAt,
  atGround,
} from "./map";
import {
  DT,
  idleInput,
  parseInput,
  type Input,
  type Player,
  type Snapshot,
} from "./types";
export class Simulation {
  physics = new MovementWorld();
  queues = new Map<string, Input[]>();
  latest = new Map<string, Input>();
  s: Snapshot;
  constructor(seed = Math.floor(Math.random() * 100000)) {
    this.s = {
      phase: "lobby",
      tick: 0,
      time: 0,
      seed,
      host: "",
      players: [],
      beacons: BEACON_SITES.map((b, id) => ({
        ...b,
        id,
        active: false,
        progress: 0,
        activatedAt: -1,
      })),
      crystals: CRYSTALS.map((c) => ({ ...c, readyAt: 0 })),
      markers: [],
      earthAt: -1,
      completedAt: -1,
      event: "星球着陆准备就绪",
      eventId: 0,
      adventure: createAdventure(),
    };
  }
  add(id: string, name = "探索员") {
    if (this.s.players.length >= 4 || this.s.phase !== "lobby")
      throw new Error("房间已满或探索已开始");
    const slot = [0, 1, 2, 3].find(
      (n) => !this.s.players.some((p) => p.color === n),
    )!;
    const p: Player = {
      id,
      name:
        name
          .replace(/[<>\x00-\x1f]/g, "")
          .trim()
          .slice(0, 16) || "探索员",
      color: slot,
      ...SPAWN,
      x: SPAWN.x + slot * 2,
      yaw: 0,
      pitch: 0,
      ack: 0,
      vx: 0,
      vz: 0,
      vy: 0,
      grounded: true,
      fuel: 100,
      level: 0,
      crystals: 0,
      combo: 0,
      comboUntil: 0,
      dashCooldown: 0,
      dashTime: 0,
      jumpHeld: false,
      dashHeld: false,
      jetting: false,
      landing: 0,
      landingId: 0,
      travel: 0,
      checkpoint: 0,
      respawns: 0,
      ...adventurePlayer(),
    };
    p.y = groundAt(p.x, p.z) + 0.85;
    this.s.players.push(p);
    this.physics.add(id, p);
    this.queues.set(id, []);
    if (!this.s.host) this.s.host = id;
    return p;
  }
  remove(id: string) {
    const departed = this.player(id);
    const ship = this.s.adventure.ship;
    if (departed)
      for (const k of Object.keys(departed.inventory) as ItemId[])
        ship.cargo[k] += departed.inventory[k];
    ship.seats = ship.seats.map((v) => (v === id ? "" : v));
    if (!ship.seats[0]) {
      const next = ship.seats.findIndex(Boolean);
      if (next > 0) {
        ship.seats[0] = ship.seats[next];
        ship.seats[next] = "";
        this.player(ship.seats[0])!.seat = 0;
      }
    }
    this.s.players = this.s.players.filter((p) => p.id !== id);
    this.physics.remove(id);
    this.queues.delete(id);
    this.latest.delete(id);
    this.s.markers = this.s.markers.filter((m) => m.owner !== id);
    if (this.s.host === id) this.s.host = this.s.players[0]?.id || "";
  }
  player(id: string) {
    return this.s.players.find((p) => p.id === id);
  }
  emit(message: string) {
    this.s.event = message;
    this.s.eventId++;
  }
  start(id: string) {
    if (id !== this.s.host || this.s.phase !== "lobby") return false;
    this.s.phase = "active";
    this.emit("游隼号失去动力 · 调查刻石，回收坠船废料 · Tab 查看任务");
    return true;
  }
  input(id: string, raw: unknown) {
    const i = parseInput(raw),
      p = this.player(id),
      q = this.queues.get(id);
    if (!i || !p || !q || i.seq <= (q.at(-1)?.seq ?? p.ack) || q.length >= 60)
      return;
    q.push(i);
  }
  respawn(p: Player) {
    if (p.seat >= 0) {
      this.s.adventure.ship.seats[p.seat] = "";
      p.seat = -1;
    }
    p.grapple = null;
    p.invulnerable = 4;
    const b = p.checkpoint ? this.s.beacons[p.checkpoint - 1] : SPAWN;
    Object.assign(p, {
      x: b.x,
      y: groundAt(b.x, b.z + 8) + 0.85,
      z: b.z + 8,
      vx: 0,
      vy: 0,
      vz: 0,
      grounded: false,
      fuel: fuelCapacity(p.level),
      jetting: false,
    });
    p.respawns++;
    this.physics.reset(p.id, p);
    this.emit("已返回最近信标 · 背包充能完成");
  }
  action(id: string, command: unknown) {
    const p = this.player(id);
    if (!p || this.s.phase === "lobby") return;
    if (command === "respawn") this.respawn(p);
    if (command === "heal" && p.inventory.medgel > 0 && p.health < 100) {
      p.inventory.medgel--;
      p.health = Math.min(100, p.health + 55);
      this.emit("修复凝胶已使用 · 护盾恢复");
    }
    if (command === "close-lore") p.lore = -1;
    if (command === "mark") {
      const x = p.x - Math.sin(p.yaw) * 65,
        z = p.z - Math.cos(p.yaw) * 65;
      this.s.markers = this.s.markers.filter((m) => m.owner !== id);
      this.s.markers.push({
        ...atGround(x, z, 4),
        owner: id,
        until: this.s.time + 30,
      });
      this.emit(`${p.name} 标记了探索路线`);
    }
  }
  tick() {
    const s = this.s;
    s.tick++;
    if (s.phase === "lobby") return;
    s.time += DT;
    const interactions = new Set<string>();
    const inputs = new Map<string, Input>();
    for (const p of s.players) {
      const i = this.queues.get(p.id)!.shift();
      if (i) {
        inputs.set(p.id, i);
        this.latest.set(p.id, i);
        p.ack = i.seq;
      } else inputs.set(p.id, { ...idleInput(), yaw: p.yaw, pitch: p.pitch });
    }
    tickShip(this, inputs);
    for (const p of s.players) {
      const i = inputs.get(p.id)!;
      if (p.seat < 0) this.physics.move(p, i);
      interactAdventure(this, p, i);
      if (i.fire) tool(this, p);
      if (i.interact && p.seat < 0) interactions.add(p.id);
    }
    this.physics.step();
    tickDrones(this);
    for (const p of s.players) {
      if (p.seat >= 0) continue;
      if (p.y < groundAt(p.x, p.z) - 8 || p.y < -100) this.respawn(p);
      if (p.comboUntil < s.time) p.combo = 0;
      if (s.earthAt < 0 && p.z < 260) {
        s.earthAt = s.time;
        this.emit("发现 · 地球正在升起");
      }
      for (const c of s.crystals)
        if (c.readyAt <= s.time && distance3(p, c) < 4.2) {
          c.readyAt = s.time + 32;
          p.crystals++;
          p.combo = Math.min(12, p.combo + 1);
          p.comboUntil = s.time + 7;
          p.fuel = Math.min(fuelCapacity(p.level), p.fuel + 34);
        }
    }
    for (const b of s.beacons) {
      if (b.active || (b.id > 0 && !s.beacons[b.id - 1].active)) continue;
      const crew = s.players.filter(
        (p) =>
          interactions.has(p.id) &&
          distance(p, b) < 10 &&
          Math.abs(p.y - b.y) < 10,
      );
      if (crew.length) {
        b.progress = Math.min(1, b.progress + (DT * crew.length) / 3);
        if (b.progress >= 1) {
          b.active = true;
          b.activatedAt = s.time;
          for (const p of s.players) {
            p.level = Math.max(p.level, Math.min(2, b.id + 1));
            p.checkpoint = b.id + 1;
            p.fuel = fuelCapacity(p.level);
          }
          this.emit(`${b.name} 已点亮 · ${BEACON_SITES[b.id].upgrade}`);
          if (b.id === 2) {
            s.completedAt = s.time;
            this.emit("星图已连接 · 修复游隼号，探索回声林地");
          }
        }
      }
    }
    s.markers = s.markers.filter((m) => m.until > s.time);
  }
  snapshot(): Snapshot {
    return structuredClone(this.s);
  }
  dispose() {
    this.physics.dispose();
  }
}
