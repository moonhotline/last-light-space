import * as THREE from "three";
import { ITEMS, LORE, REPAIR, RESOURCE_SITES, type ItemId } from "../shared/adventure-data";
import { shipBoardingTarget } from "../shared/adventure";
import { celestialCapture } from "../shared/celestial";
import { celestialFlightFrame } from "../shared/celestial-flight";
import { distance, distance3, groundAt, sector } from "../shared/map";
import { missionObjective } from "../shared/objectives";
import type { MovementWorld } from "../shared/physics";
import { nextPortalColor } from "../shared/portals";
import { fuelCapacity, PLAYER_COLORS, type Player, type Snapshot } from "../shared/types";
import type { GameView } from "./scene";
import type { StuntTracker } from "./stunt-tracker";

const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;

const setText = (id: string, value: string) => {
  const el = $(id);
  if (el && el.textContent !== value) el.textContent = value;
};

export const formatClock = (seconds: number) =>
  `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0")}`;

export interface HudRenderContext {
  state: Snapshot;
  me: Player;
  predicted: Player | null;
  mode: "practice" | "coop";
  panel: string | null;
  roomSessionId?: string;
  keys: ReadonlySet<string>;
  yaw: number;
  playerAmmo: number;
  playerReloadTime: number;
  physics: MovementWorld | null;
  view: GameView;
  stunts: StuntTracker;
  openLore: (id: number) => void;
}

export function computeInteractionPrompt(state: Snapshot, me: Player): { label: string; progress: number } {
  const a = state.adventure;
  const ship = a.ship;
  if (me.seat >= 0) {
    return { label: ship.grounded ? "E · 已着陆，可以离舱" : "", progress: 0 };
  }
  const boarding = shipBoardingTarget(me, ship);
  if (boarding) {
    return { label: `E · 登上${boarding.name}`, progress: ship.progress };
  }
  const clue = LORE.find((l) => distance3(me, l) < 8);
  if (clue) return { label: `E · 阅读 ${clue.site}`, progress: 0 };
  const node = a.nodes.find((n) => n.readyAt <= state.time && distance3(me, n) < 11);
  if (node) {
    return {
      label:
        node.item === "core" && a.drones.some((d) => d.hp > 0)
          ? "核心被封锁 · 先清除守卫"
          : `瞄准并长按左键 / T · ${RESOURCE_SITES[node.id].name}`,
      progress: 1 - node.hp / RESOURCE_SITES[node.id].hp,
    };
  }
  const beacon = state.beacons.find(
    (b) => !b.active && distance(me, b) < 10 && Math.abs(me.y - b.y) < 10,
  );
  if (beacon) {
    return {
      label:
        beacon.id > 0 && !state.beacons[beacon.id - 1].active
          ? "先点亮上一座信标"
          : "长按 E · 与信标共鸣（支线升级）",
      progress: beacon.progress,
    };
  }
  return { label: "", progress: 0 };
}

export class HudController {
  private inventorySignature = "";

  reset(): void {
    this.inventorySignature = "";
  }

  renderCrewList(id: string, players: Player[], hostId: string, me: Player): void {
    $(id).replaceChildren(
      ...players.map((p) => {
        const row = document.createElement(id === "crew" ? "li" : "div");
        const name = document.createElement("b");
        const detail = document.createElement("span");
        name.textContent = p.name;
        name.style.color = PLAYER_COLORS[p.color]?.css || PLAYER_COLORS[0].css;
        detail.textContent =
          id === "crew"
            ? p.id === hostId
              ? "队长"
              : "已就绪"
            : `${Math.round(distance(me, p))} m · 背包 ${p.level + 1}`;
        row.append(name, detail);
        return row;
      }),
    );
  }

  paintInventory(
    state: Snapshot,
    me: Player,
    mode: "practice" | "coop",
    onOpenLore: (id: number) => void,
  ): void {
    const signature = JSON.stringify([
      me.inventory,
      me.health,
      state.adventure.ship.cargo,
      state.adventure.ship.repaired,
      state.adventure.lore,
    ]);
    if (signature === this.inventorySignature) return;
    this.inventorySignature = signature;

    const a = state.adventure;
    const entries = (Object.keys(ITEMS) as ItemId[]).filter((k) => me.inventory[k] > 0);
    $("inventoryGrid").replaceChildren(
      ...Array.from({ length: 12 }, (_, index) => {
        const div = document.createElement("div");
        div.className = "inventory-slot";
        const key = entries[index];
        if (key) {
          const item = ITEMS[key];
          div.style.setProperty("--item-color", item.color);
          div.title = item.description;
          const icon = document.createElement("b");
          const label = document.createElement("span");
          const qty = document.createElement("small");
          icon.textContent = item.label;
          label.textContent = item.name;
          qty.textContent = String(me.inventory[key]);
          div.append(icon, label, qty);
        } else {
          div.classList.add("empty");
          div.textContent = String(index + 1).padStart(2, "0");
        }
        return div;
      }),
    );

    const crew =
      mode === "coop" && state.players.length > 0
        ? ` · 远征队 (${state.players.length}/4 人: ` +
          state.players
            .map((p) => (p.id === state.host ? `[队长] ${p.name}` : p.name))
            .join("，") +
          ")"
        : "";
    setText("inventorySubtitle", `${entries.length} / 12 格 · 随身物资${crew}`);

    $("repairRecipe").replaceChildren(
      ...(Object.keys(REPAIR) as ItemId[]).map((k) => {
        const row = document.createElement("div");
        const total = a.ship.cargo[k];
        const needed = REPAIR[k]!;
        row.textContent = `${ITEMS[k].name}   ${Math.min(total, needed)} / ${needed} 已存入 · 携带 ${me.inventory[k]}`;
        row.className = total >= needed ? "supplied" : "";
        return row;
      }),
    );
    setText("repairTitle", a.ship.repaired ? "游隼号 · 已修复" : "游隼号 · 修复清单");

    $("loreList").replaceChildren(
      ...LORE.map((l) => {
        const button = document.createElement("button");
        button.className = "secondary";
        button.disabled = !a.lore.includes(l.id);
        button.textContent = a.lore.includes(l.id) ? l.title : "未发现的记录";
        button.onclick = () => onOpenLore(l.id);
        return button;
      }),
    );

    setText("inventoryHealth", `护盾 ${Math.ceil(me.health)} / 100 · 凝胶 ${me.inventory.medgel}`);
    $<HTMLButtonElement>("heal").disabled = me.health >= 100 || me.inventory.medgel <= 0;
  }

  renderResult(
    state: Snapshot,
    me: Player | null,
    mode: "practice" | "coop",
    roomSessionId: string | undefined,
    localTrickScore: number,
  ): void {
    setText(
      "resultReason",
      "游隼号驶入回声林地。月球缓缓升起，而这片不该存在的森林，仍在呼吸。第一章完成，世界继续开放。",
    );
    const totalTricks =
      state.players.reduce((n, p) => n + (p.trickScore || 0), 0) +
      (me?.trickScore || localTrickScore);
    const statRow = (label: string, value: string) => {
      const box = document.createElement("div");
      const strong = document.createElement("b");
      strong.textContent = value;
      box.append(document.createTextNode(label), strong);
      return box;
    };
    $("resultStats").replaceChildren(
      statRow("探索用时", formatClock(state.time)),
      statRow("能源晶体", String(state.players.reduce((n, p) => n + p.crystals, 0))),
      statRow("特技动作分", String(totalTricks)),
    );
    $<HTMLButtonElement>("again").disabled = mode === "coop" && state.host !== roomSessionId;
  }

  render(ctx: HudRenderContext): void {
    const { state, me, predicted, mode, panel, roomSessionId, keys, yaw, playerAmmo, playerReloadTime, physics, view, stunts } = ctx;
    if (panel === "lobby") {
      this.renderCrewList("crew", state.players, state.host, me);
      $<HTMLButtonElement>("begin").disabled = state.host !== roomSessionId;
    }
    const p = predicted || me;
    const target = missionObjective(state, me);
    const cap = fuelCapacity(p.level);

    setText("clock", formatClock(state.time));
    setText("sector", sector(p.z, p.x));
    setText("fuel", String(Math.ceil(p.fuel)));
    $<HTMLProgressElement>("fuelBar").max = cap;
    $<HTMLProgressElement>("fuelBar").value = p.fuel;
    setText("healthValue", `${Math.ceil(me.health)}`);
    $<HTMLProgressElement>("healthBar").value = me.health;
    document.body.classList.toggle("aboard", me.seat >= 0);

    if (panel === "inventory") {
      this.paintInventory(state, me, mode, ctx.openLore);
    }

    setText("packLevel", `ION PACK ${p.level >= 1 ? "II" : "I"}`);
    setText("speed", Math.round(Math.hypot(p.vx, p.vz)).toString().padStart(2, "0"));
    const alt = Math.round(Math.max(0, p.y - groundAt(p.x, p.z) - 0.85));
    setText("altitude", `${alt} m`);

    const layerEl = document.getElementById("layerBadge");
    if (layerEl) {
      if (p.y > 6000) layerEl.textContent = "DEEP SPACE // 深空";
      else if (p.y > 2500) layerEl.textContent = "ORBIT // 轨道";
      else if (p.y > 850) layerEl.textContent = "STRATO // 平流层";
      else if (p.y > 350) layerEl.textContent = "TROPO // 对流层";
      else layerEl.textContent = "BASIN // 地表";
    }

    const flightModeEl = document.getElementById("flightModeBadge");
    if (flightModeEl && me.seat >= 0) {
      const ship = state.adventure.ship;
      const isPilot = me.seat === 0 && ship.seats?.[0] === me.id;
      const isBraking = isPilot ? keys.has("KeyX") : Boolean(ship.braking);
      const isBoosting = isPilot
        ? (keys.has("ShiftLeft") || keys.has("ShiftRight")) && !keys.has("KeyX")
        : Boolean(ship.boosting);
      if (isBraking) {
        flightModeEl.textContent = "RETRO-BRAKE // 逆喷制动";
        flightModeEl.className = "flight-mode-badge brake";
      } else if (isBoosting) {
        flightModeEl.textContent = "AFTERBURNER // 超燃加力";
        flightModeEl.className = "flight-mode-badge boost";
      } else {
        flightModeEl.textContent = "CRUISE // 巡航推进";
        flightModeEl.className = "flight-mode-badge cruise";
      }
    }

    setText("cargo", `${me.crystals.toString().padStart(2, "0")} 晶体 · 特技 ${me.trickScore || stunts.localTrickScore}`);
    const banner = stunts.activeBanner(performance.now());
    if (banner) {
      setText("combo", banner);
      $("combo").classList.add("visible", "stunt");
    } else {
      $("combo").classList.remove("stunt");
      setText("combo", me.combo >= 2 ? `×${me.combo} 连续收集` : "");
      $("combo").classList.toggle("visible", me.combo >= 2);
    }

    setText("dashStatus", p.grapple ? "牵引中 · Q 松开" : "瞄准岩壁");
    const canEquipPortal = p.seat < 0 && !!state.portals;
    const portalHeld = canEquipPortal && view.activeWeapon === "portal";
    $("wepPortal").hidden = !canEquipPortal;
    $("touchPortal").hidden = !canEquipPortal;
    $("touchPortalFire").hidden = !portalHeld;
    $("touchPortalUndo").hidden = !portalHeld;
    $("touchFire").hidden = portalHeld;
    $("touchRecallFighter").hidden = p.seat >= 0;
    $("portalHint").hidden = !portalHeld;
    $("toolHint").hidden = portalHeld;
    if (portalHeld) {
      const color = nextPortalColor(state.portals!, state.lastPortalColor);
      view.setPortalColor(color);
      setText("portalNext", color === "blue" ? "放蓝门" : "放红门");
    }

    setText("weaponAmmo", playerReloadTime > 0 ? "换弹中... (R)" : `${playerAmmo} / 24`);
    const anchor = p.seat < 0 ? physics?.aim(p, 85) : null;
    const reticleEl = document.querySelector(".reticle");
    reticleEl?.classList.toggle("grapple-ready", !!anchor);

    const ship = state.adventure.ship;
    const nearbyBody = celestialCapture(me);
    const isOnPlanet = !!nearbyBody && nearbyBody.altitude < 60;
    const boarding = shipBoardingTarget(me, ship);
    let isAimingAtShip = false;
    const boardingPos = boarding?.position ?? ship;
    const targetPos = new THREE.Vector3(boardingPos.x, boardingPos.y, boardingPos.z)
      .addScaledVector(celestialFlightFrame(boardingPos, ship.yaw).up, 1.2);
    const toShip = targetPos.clone().sub(view.camera.position);
    if (toShip.length() > 0.1) {
      toShip.normalize();
      const camDir = new THREE.Vector3();
      view.camera.getWorldDirection(camDir);
      isAimingAtShip = camDir.dot(toShip) > 0.52;
    }
    const boardReady =
      me.seat < 0 && !!boarding && (!boarding.active || ship.grounded || isOnPlanet) && isAimingAtShip;
    reticleEl?.classList.toggle("board-ready", boardReady);

    if (!p.grapple && anchor) {
      setText("dashStatus", `${Math.round(distance3(p, anchor))} m 可挂接`);
    }
    setText("viewMode", view.thirdPerson ? "第三人称" : "第一人称");
    setText("thermalStatus", me.level >= 2 ? "上升气流已开启" : "晶体补充燃料");
    this.renderCrewList("team", state.players.filter((v) => v.id !== me.id), state.host, me);

    if (target) {
      setText("objectiveIndex", target.index);
      setText("objective", target.title);
      setText("objectiveDetail", target.detail);
      const isShipTarget =
        target.title.includes("游隼号") ||
        target.title.includes("飞船") ||
        target.title.includes("战舰") ||
        target.title.includes("巡航") ||
        target.title.toLowerCase().includes("cruiser") ||
        target.title.toLowerCase().includes("fighter") ||
        target.title.includes("登舰");
      const point = !isShipTarget ? view.project(target.p) : null;
      $("targetMarker").hidden = !point;
      if (point) {
        $("targetMarker").style.left = `${point.x}px`;
        $("targetMarker").style.top = `${point.y}px`;
        setText("targetDistance", `${Math.round(distance(p, target.p))} m`);
      }
    }

    $("enemyLabels").replaceChildren(
      ...state.adventure.drones
        .filter((d) => d.hp > 0 && distance(p, d) < 80)
        .flatMap((d) => {
          const point = view.project({ ...d, y: d.y - 5 });
          if (!point) return [];
          const label = document.createElement("div");
          label.className = "enemy-label";
          label.style.left = point.x + "px";
          label.style.top = point.y + "px";
          label.textContent = `守卫 ${d.hp} / 100${d.mode === "charge" ? " · 已锁定，移动闪避" : ""}`;
          return [label];
        }),
    );

    const near = computeInteractionPrompt(state, me);
    $("interaction").hidden = !near.label;
    setText("interactionText", near.label);
    $<HTMLProgressElement>("interactionProgress").value = near.progress;

    view.minimap($<HTMLCanvasElement>("map"), state, { ...me, ...p });
    $("controlsHint").hidden = state.time > 90;
    document.body.dataset.camera = view.thirdPerson ? "third" : "first";

    if (view.activeWeapon === "camera") {
      const vfZoom = document.getElementById("vfZoomLabel");
      if (vfZoom) {
        const focalMm = Math.round(50 * view.cameraZoom);
        vfZoom.textContent = `${focalMm}mm · ${view.cameraZoom.toFixed(1)}x OPTICAL`;
      }
      const vfHeading = document.getElementById("vfHeading");
      if (vfHeading) {
        let deg = Math.round(((-yaw * 180) / Math.PI) % 360);
        if (deg < 0) deg += 360;
        vfHeading.textContent = `HDG ${deg.toString().padStart(3, "0")}°`;
      }
    }
  }
}
