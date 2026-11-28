import "./style.css";
import * as THREE from "three";
import { cosmicAudio } from "./sound-engine";
import { LORE } from "../shared/adventure-data";
import { SOLAR_SYSTEM } from "../shared/celestial";
import {
  connectPartyRoom,
  resolveRoomEndpoint,
  roomCode,
  type MultiplayerRoom,
  type RoomEndpoint,
} from "./party-room";
import {
  createIcons,
  Orbit,
  Volume2,
  VolumeX,
  Menu,
  ArrowUpRight,
  LogIn,
  Rocket,
  LogOut,
  Copy,
  Play,
  Maximize,
  RotateCcw,
  ArrowLeft,
  Diamond,
  Wind,
  MapPin,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Hand,
  Camera,
  Navigation,
  Zap,
  Download,
  MessageSquare,
  Send,
  Image,
} from "lucide";
import { distance, WORLD_SIZE } from "../shared/map";
import { DT, type Input, type Player, type Snapshot } from "../shared/types";
import type { Simulation } from "../shared/simulation";
import type { MovementWorld } from "../shared/physics";
import type { PortalAction } from "../shared/portals";
import { GameView, type Equipment } from "./scene";
import {
  exportHoverboardGlb,
  exportTechRifleGlb,
  exportSurveyCameraGlb,
  exportGrappleLauncherGlb,
  takeSnapshot,
} from "./asset-loader";
import { StuntTracker } from "./stunt-tracker";
import { setupFeedbackPanel } from "./feedback-panel";
import { setupChatConsole } from "./chat-console";
import { HudController } from "./hud-controller";

const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const text = (id: string, s: string) => {
  if ($(id).textContent !== s) $(id).textContent = s;
};

const canvas = $<HTMLCanvasElement>("world");
const view = new GameView(canvas);
const keys = new Set<string>();
const pulses = new Set<string>();
const stunts = new StuntTracker();
const hudController = new HudController();

let mode: "practice" | "coop" = "practice";
let sim: Simulation | null = null;
let room: MultiplayerRoom | null = null;
let state: Snapshot | null = null;
let me: Player | null = null;
let predicted: Player | null = null;
let prediction: MovementWorld | null = null;
let lastSpaceTime = 0;
let pending: Input[] = [];
let sequence = 0;
let yaw = 0;
let pitch = 0;
let playerAmmo = 24;
let playerReloadTime = 0;
let accumulator = 0;
let lastFrame = performance.now();
let spaceAt = 0;
let panel:
  | "landing"
  | "lobby"
  | "paused"
  | "result"
  | "inventory"
  | "archive"
  | "feedback"
  | null = "landing";
let endpoint: RoomEndpoint | null = null;
let muted = false;
let loading = true;
let reconnecting = false;
let lastEvent = 0;
let uiAt = 0;
let toastTimer = 0;
let lastLore = -1;
let correction = { x: 0, y: 0, z: 0 };
const portalActions: PortalAction[] = [];

let SimulationCtor: typeof import("../shared/simulation").Simulation | null = null;
let MovementWorldCtor: typeof import("../shared/physics").MovementWorld | null = null;
let initPhysicsFn: typeof import("../shared/physics").initPhysics | null = null;

const mobile = () => matchMedia("(pointer: coarse)").matches || innerWidth <= 760;

function paintIcons() {
  createIcons({
    icons: {
      Orbit,
      Volume2,
      VolumeX,
      Menu,
      ArrowUpRight,
      LogIn,
      Rocket,
      LogOut,
      Copy,
      Play,
      Maximize,
      RotateCcw,
      ArrowLeft,
      Diamond,
      Wind,
      MapPin,
      ChevronUp,
      ChevronDown,
      ChevronLeft,
      ChevronRight,
      Hand,
      Camera,
      Navigation,
      Zap,
      Download,
      MessageSquare,
      Send,
      Image,
    },
  });
}

function notice(message: string) {
  clearTimeout(toastTimer);
  text("toast", message);
  $("toast").hidden = false;
  toastTimer = window.setTimeout(() => {
    $("toast").hidden = true;
  }, 3800);
}

function show(next: typeof panel) {
  panel = next;
  for (const id of [
    "landing",
    "lobby",
    "paused",
    "result",
    "inventory",
    "archive",
    "feedbackSheet",
  ]) {
    $(id).hidden = (next === "feedback" ? "feedbackSheet" : next) !== id;
  }
  $("overlay").hidden = !next;
  $("hud").hidden = !state || state.phase === "lobby";
  document.body.dataset.paused = String(!!next);
  keys.clear();
  pulses.clear();
  spaceAt = 0;
  if (next) document.exitPointerLock();
}

function unlockAudio() {
  const vol = muted ? 0 : Number($<HTMLInputElement>("volume").value);
  cosmicAudio.setVolume(vol);
  void view
    .audio(vol)
    .then(() => {
      const currentVol = muted ? 0 : Number($<HTMLInputElement>("volume").value);
      view.listener?.setMasterVolume(currentVol);
      cosmicAudio.setVolume(currentVol);
    })
    .catch(() => notice("音频暂时不可用"));
}

function lock() {
  if (!mobile()) void canvas.requestPointerLock()?.catch(() => undefined);
}

function chooseMode(next: typeof mode) {
  mode = next;
  $("practiceTab").setAttribute("aria-selected", String(mode === "practice"));
  $("coopTab").setAttribute("aria-selected", String(mode === "coop"));
  $("coopForm").hidden = mode !== "coop";
  text("launch", mode === "practice" ? "降落星球" : "创建房间");
  text(
    "entryStatus",
    mode === "practice"
      ? "你的下一步，通向星辰。"
      : endpoint
        ? "邀请伙伴，一起点亮星图。"
        : "联机频道未接通 · 仍可独自探索",
  );
}

const callsign = () => {
  const val = $<HTMLInputElement>("callsign").value.trim().slice(0, 16);
  if (val) {
    try {
      localStorage.setItem("last_light_callsign", val);
    } catch {}
  }
  return val || "探索员";
};

function releaseSession() {
  const old = room;
  room = null;
  if (old) void old.leave();
  sim?.dispose();
  sim = null;
  prediction?.dispose();
  prediction = null;
  state = me = predicted = null;
  portalActions.length = 0;
  pending = [];
  reconnecting = false;
  sequence = 0;
  yaw = 0;
  pitch = 0;
  accumulator = 0;
  correction = { x: 0, y: 0, z: 0 };
  lastEvent = 0;
  lastLore = -1;
  stunts.reset();
  const skateBtn = $("toggleSkate");
  if (skateBtn) skateBtn.textContent = "装备滑板 (K)";
  hudController.reset();
  view.lastMe = "";
  delete document.body.dataset.phase;
  $("journal").hidden = true;
  document.exitPointerLock();
}

async function loadSimulation() {
  if (!SimulationCtor || !MovementWorldCtor || !initPhysicsFn) {
    const [s, p] = await Promise.all([
      import("../shared/simulation"),
      import("../shared/physics"),
    ]);
    SimulationCtor = s.Simulation;
    MovementWorldCtor = p.MovementWorld;
    initPhysicsFn = p.initPhysics;
  }
  await initPhysicsFn();
}

function openLore(id: number) {
  const clue = LORE[id];
  if (!clue) return;
  text("loreSite", clue.site);
  text("loreTitle", clue.title);
  text("loreText", clue.text);
  text("loreNext", clue.short);
  show("archive");
}

function renderResult() {
  if (!state) return;
  hudController.renderResult(state, me, mode, room?.sessionId, stunts.localTrickScore);
}

function receive(next: Snapshot) {
  const previous = state?.phase;
  const previousCompleted = state?.completedAt ?? -1;
  const previousWarp = state?.adventure.ship.warpUntil ?? 0;
  const previousTransit = me?.portalTransit ?? 0;
  state = next;
  me = state.players.find((p) => p.id === (room?.sessionId || "local")) || null;
  if (me && me.seat >= 0 && (next.adventure.ship.warpUntil ?? 0) > previousWarp) {
    yaw = me.yaw;
    pending = [];
    correction = { x: 0, y: 0, z: 0 };
  }
  const portaled = !!me && (me.portalTransit ?? 0) > previousTransit;
  if (me && portaled) {
    view.sound("portal-transit");
    portalActions.length = 0;
    yaw = me.yaw;
    pitch = me.pitch;
    pending = [];
    correction = { x: 0, y: 0, z: 0 };
  }
  if (mode === "coop" && me && next.phase !== "lobby") {
    if (!prediction && MovementWorldCtor) {
      prediction = new MovementWorldCtor();
      prediction.add(me.id, me);
    }
    if (prediction) {
      const before = predicted;
      predicted = structuredClone(me);
      prediction.syncDynamicEntities(next.adventure, next.time);
      prediction.reset(me.id, me);
      pending = pending.filter((i) => i.seq > me!.ack);
      for (const i of pending) {
        if (predicted.seat < 0) prediction.move(predicted, i);
        prediction.step();
      }
      if (!portaled && before && previous !== "lobby" && distance(before, predicted) < 3) {
        correction = {
          x: before.x - predicted.x,
          y: Math.abs(before.y - predicted.y) < 1 ? before.y - predicted.y : 0,
          z: before.z - predicted.z,
        };
      }
    }
  }
  if (mode === "coop" && room) {
    text("linkState", `房间 ${room.roomId} · ${next.players.length}/4 人`);
  }
  if (reconnecting) {
    reconnecting = false;
    text("pauseTitle", "片刻，仰望星空");
  }
  if (next.phase === "active" && panel === "lobby") {
    show(null);
    lock();
    unlockAudio();
  }
  if (next.phase !== previous) {
    if (next.phase === "lobby") {
      prediction?.dispose();
      prediction = null;
      predicted = null;
      pending = [];
      show("lobby");
    } else if (next.phase === "active") {
      yaw = me?.yaw || 0;
      pitch = 0;
      accumulator = 0;
      show(mode === "coop" && !mobile() ? "paused" : null);
    } else if (next.phase === "won") {
      $("journal").hidden = false;
      show("result");
      renderResult();
    }
  }
  if (next.completedAt > 0 && previousCompleted <= 0 && next.phase !== "won") {
    $("journal").hidden = false;
    show("result");
    renderResult();
  }
  if (next.eventId !== lastEvent) {
    lastEvent = next.eventId;
    if (next.eventId) notice(next.event);
  }
  if (me && me.lore !== lastLore) {
    lastLore = me.lore;
    if (lastLore >= 0 && panel !== "result") openLore(lastLore);
  }
  document.body.dataset.phase = state.phase;
  document.body.dataset.players = String(state.players.length);
}

async function practice() {
  releaseSession();
  mode = "practice";
  text("entryStatus", "正在准备着陆…");
  $<HTMLButtonElement>("launch").disabled = true;
  try {
    await loadSimulation();
    sim = new SimulationCtor!(2087);
    sim.add("local", callsign());
    sim.start("local");
    receive(sim.snapshot());
    show(null);
    lock();
    unlockAudio();
    text("linkState", "独自探索");
  } catch (e) {
    console.error(e);
    text("entryStatus", "着陆失败，请刷新重试");
  } finally {
    $<HTMLButtonElement>("launch").disabled = false;
  }
}

const chatConsole = setupChatConsole({
  canvas,
  getSim: () => sim,
  getRoom: () => room,
  getMe: () => me,
  notice,
  lock,
});

setupFeedbackPanel({
  canvas,
  getAuthor: () => me?.name || "探索员",
  isFeedbackOpen: () => panel === "feedback",
  openFeedback: () => show("feedback"),
  closeFeedback: () => {
    show(null);
    lock();
  },
  notice,
});

async function connect(create: boolean) {
  if (!endpoint) {
    text("entryStatus", "通讯频道暂未接通");
    return;
  }
  const code = $<HTMLInputElement>("roomCode").value.trim().toUpperCase();
  if (!create && !/^[A-F0-9]{6}$/.test(code)) {
    text("entryStatus", "请输入六位房间编号");
    return;
  }
  $<HTMLButtonElement>("launch").disabled = $<HTMLButtonElement>("join").disabled = true;
  text("entryStatus", "正在建立通讯…");
  unlockAudio();
  try {
    const joined = await connectPartyRoom(
      endpoint,
      create ? roomCode() : code,
      callsign(),
      create,
    );
    room = joined;
    joined.onMessage("snapshot", receive);
    joined.onMessage("chat", (data: any) => chatConsole.addMessage(data));
    joined.onError(() => notice("通讯异常，请稍后重试"));
    joined.onLeave(() => {
      if (room === joined && state?.phase !== "lobby") {
        reconnecting = true;
        show("paused");
        text("pauseTitle", "通讯已断开");
      }
    });
    text("roomLabel", joined.roomId);
    text("linkState", `房间 ${joined.roomId}`);
    joined.send("sync");
    show("lobby");
    // Prediction is only needed after the expedition starts. Warm it while the
    // crew gathers so a large physics module never blocks room creation.
    void loadSimulation().catch(() => notice("本地预测暂不可用"));
    history.replaceState({}, "", `?room=${joined.roomId}`);
  } catch {
    text("entryStatus", "房间不可用：检查编号或创建新房间");
  } finally {
    $<HTMLButtonElement>("launch").disabled = $<HTMLButtonElement>("join").disabled = false;
  }
}

function command(action: string) {
  if (panel || !state || state.phase === "lobby" || !me) return;
  sim ? sim.action(me.id, action) : room?.send("action", action);
  if (action === "mark") view.sound("mark");
}

const stuntCallbacks = {
  command,
  playSound: (name: string, pitch?: number) => view.sound(name, pitch),
};

function toggleHoverboard() {
  if (panel || !state || state.phase === "lobby" || !me) return;
  stunts.isSkating = !stunts.isSkating;
  view.sound(stunts.isSkating ? "jump" : "dash", 1.2);
  notice(stunts.isSkating ? "反重力滑板已装备 (按 K 收起)" : "反重力滑板已收起");
  const btn = $("toggleSkate");
  if (btn) btn.textContent = stunts.isSkating ? "收起滑板 (K)" : "装备滑板 (K)";
}

function makeInput(): Input {
  const active = !panel && !reconnecting;
  const input: Input = {
    seq: ++sequence,
    portalAction: active ? portalActions.shift() : undefined,
    portalTransit: me?.portalTransit ?? 0,
    warpUntil: state?.adventure.ship.warpUntil ?? 0,
    forward: active
      ? Number(keys.has("KeyW") || keys.has("ArrowUp")) -
        Number(keys.has("KeyS") || keys.has("ArrowDown"))
      : 0,
    side: active ? Number(keys.has("KeyD")) - Number(keys.has("KeyA")) : 0,
    yaw,
    pitch,
    sprint: active && (keys.has("ShiftLeft") || keys.has("ShiftRight")),
    jump: active && (keys.has("Space") || pulses.has("Space")),
    jet:
      active &&
      (keys.has("KeyJ") ||
        ((keys.has("Space") || pulses.has("Space")) && performance.now() - spaceAt > 220)),
    dash: active && (keys.has("KeyC") || pulses.has("KeyC")),
    grapple:
      active &&
      (keys.has("KeyQ") ||
        pulses.has("KeyQ") ||
        (view.activeWeapon === "grapple" && keys.has("Mouse0"))),
    fire: active && view.activeWeapon !== "portal" && (keys.has("Mouse0") || keys.has("KeyT")),
    brake: active && keys.has("KeyX"),
    interact: active && (keys.has("KeyE") || pulses.has("KeyE")),
    skate: active && stunts.isSkating,
  };
  pulses.clear();
  if (!active) portalActions.length = 0;
  return input;
}

function step() {
  if (!state || state.phase === "lobby" || !me || reconnecting) return;
  if (!panel) {
    yaw +=
      (Number(keys.has("ArrowLeft") || keys.has("KeyJ")) -
        Number(keys.has("ArrowRight") || keys.has("KeyL"))) *
      DT *
      1.5;
    const pitchDelta =
      (Number(keys.has("KeyI")) -
        Number(keys.has("ArrowDown") && !keys.has("KeyS")) -
        (keys.has("KeyK") ? 3.0 : 0)) *
      DT;
    pitch = Math.max(-1.3, Math.min(1.3, pitch + pitchDelta));
  }
  if (playerReloadTime > 0) {
    playerReloadTime = Math.max(0, playerReloadTime - DT);
    if (playerReloadTime === 0) playerAmmo = 24;
  }
  if (
    view.activeWeapon === "rifle" &&
    (keys.has("Mouse0") || keys.has("KeyT")) &&
    playerReloadTime <= 0
  ) {
    if (playerAmmo > 0) {
      playerAmmo = Math.max(0, playerAmmo - 1);
      if (playerAmmo === 0) playerReloadTime = 2.0;
    }
  }
  if (sim) {
    if (panel) return;
    const input = makeInput();
    const guideFollowing = view.interplanetary.guideDialogue(me, input.interact);
    if (guideFollowing !== null) {
      notice(guideFollowing ? "Blerk 已加入队伍" : "Blerk 暂时停留在原地");
    }
    sim.input(me.id, input);
    sim.tick();
    receive(sim.snapshot());
  } else if (room && predicted && prediction) {
    const i = makeInput();
    const guideFollowing = view.interplanetary.guideDialogue(me, i.interact);
    if (guideFollowing !== null) {
      notice(guideFollowing ? "Blerk 已加入队伍" : "Blerk 暂时停留在原地");
    }
    room.send("input", i);
    pending.push(i);
    if (pending.length > 120) {
      pending = [];
      show("paused");
      notice("网络延迟过高，请等待同步");
    }
    if (predicted.seat < 0) prediction.move(predicted, i);
    prediction.step();
  }
  stunts.update(DT, predicted || me, yaw, stuntCallbacks);
}

function inventory() {
  if (!state || state.phase === "lobby" || !me) return;
  if (panel === "inventory") {
    resumeGame();
    return;
  }
  show("inventory");
  hudController.paintInventory(state, me, mode, openLore);
}

function resumeGame() {
  show(null);
  command("close-lore");
  lock();
  unlockAudio();
}

let measured = 0;
let measureSeconds = 0;
let fps = 60;

function frame(now: number) {
  const elapsed = (now - lastFrame) / 1000;
  const dt = Math.min(0.15, elapsed);
  lastFrame = now;
  accumulator += dt;
  while (accumulator >= DT) {
    accumulator -= DT;
    step();
  }
  for (const axis of ["x", "y", "z"] as const) {
    correction[axis] *= Math.exp(-dt * 18);
  }
  const p = predicted || me;
  const cameraPlayer =
    me && p
      ? {
          ...p,
          x: p.x + correction.x,
          y: p.y + correction.y,
          z: p.z + correction.z,
          yaw,
          pitch,
        }
      : null;
  const isPilot = !!(me && me.seat === 0 && state?.adventure.ship.seats?.[0] === me.id);
  const pilotFlight = state?.adventure.ship
    ? isPilot
      ? {
          boosting: (keys.has("ShiftLeft") || keys.has("ShiftRight")) && !keys.has("KeyX"),
          braking: keys.has("KeyX"),
        }
      : {
          boosting: Boolean(state.adventure.ship.boosting),
          braking: Boolean(state.adventure.ship.braking),
        }
    : undefined;
  view.render(
    state,
    state?.phase === "lobby" ? null : cameraPlayer,
    dt,
    now / 1000,
    !panel,
    sim?.physics || prediction,
    pilotFlight,
  );
  measured++;
  measureSeconds += elapsed;
  if (measureSeconds >= 2) {
    fps = measured / measureSeconds;
    measured = 0;
    measureSeconds = 0;
  }
  if (now - uiAt > 90 && state && me) {
    hudController.render({
      state,
      me,
      predicted,
      mode,
      panel,
      roomSessionId: room?.sessionId,
      keys,
      yaw,
      playerAmmo,
      playerReloadTime,
      physics: sim?.physics || prediction,
      view,
      stunts,
      openLore,
    });
    uiAt = now;
  }
  requestAnimationFrame(frame);
}

$("practiceTab").onclick = () => chooseMode("practice");
$("coopTab").onclick = () => chooseMode("coop");
$("launch").onclick = () => {
  if (!loading) mode === "practice" ? void practice() : void connect(true);
};
$("join").onclick = () => {
  if (!loading) void connect(false);
};
$("begin").onclick = () => {
  room?.send("start");
  lock();
  unlockAudio();
};

function leave() {
  releaseSession();
  show("landing");
  chooseMode(mode);
  history.replaceState({}, "", location.pathname);
  text("linkState", "KEPLER / 07");
}

for (const id of ["leave", "leaveLobby", "home"]) $(id).onclick = leave;
$("again").onclick = () => {
  if (sim) void practice();
  else room?.send("restart");
};
$("journal").onclick = () => {
  show("result");
  renderResult();
};
$("explore").onclick = () => {
  show(null);
  lock();
  unlockAudio();
};
$("copy").onclick = async () => {
  try {
    await navigator.clipboard.writeText(`${location.origin}${location.pathname}?room=${room?.roomId}`);
    notice("邀请链接已复制");
  } catch {
    notice(`房间编号 ${room?.roomId}`);
  }
};
$("pause").onclick = () => {
  if (state && state.phase !== "lobby") show("paused");
};
$("resume").onclick = () => {
  if (!reconnecting) {
    show(null);
    lock();
    unlockAudio();
  }
};
$("fullscreen").onclick = () => {
  if (document.fullscreenElement) void document.exitFullscreen();
  else void document.documentElement.requestFullscreen().catch(() => notice("全屏不可用"));
};
$("volume").oninput = () => {
  const vol = muted ? 0 : Number($<HTMLInputElement>("volume").value);
  view.listener?.setMasterVolume(vol);
  cosmicAudio.setVolume(vol);
};
$<HTMLInputElement>("effects").value = String(view.effects);
$("effects").oninput = () => {
  view.effects = Number($<HTMLInputElement>("effects").value);
};
$("sound").onclick = () => {
  muted = !muted;
  unlockAudio();
  const vol = muted ? 0 : Number($<HTMLInputElement>("volume").value);
  cosmicAudio.setVolume(vol);
  const icon = document.createElement("i");
  icon.dataset.lucide = muted ? "volume-x" : "volume-2";
  $("sound").replaceChildren(icon);
  $("sound").setAttribute("aria-label", muted ? "开启声音" : "静音");
  paintIcons();
};

function updateViewfinderVisibility() {
  const vf = document.getElementById("cameraViewfinder");
  if (vf) vf.hidden = view.activeWeapon !== "camera" || view.thirdPerson;
}

function camera() {
  view.toggleCamera();
  text("viewMode", view.thirdPerson ? "第三人称" : "第一人称");
  updateViewfinderVisibility();
}

$("camera").onclick = camera;
$("recall").onclick = () => {
  show(null);
  command("respawn");
  lock();
};

function keyDown(key: string) {
  if (!keys.has(key) && ["KeyE", "KeyQ", "KeyC", "Space"].includes(key)) {
    pulses.add(key);
  }
  if (key === "Space" && !keys.has(key)) {
    const now = performance.now();
    if (stunts.isSkating && now - lastSpaceTime < 350) {
      command("ollie");
      stunts.recordTrick("OLLIE 360°", 300, stuntCallbacks);
      view.sound("jet", 1.4);
    }
    lastSpaceTime = now;
    spaceAt = now;
  }
  keys.add(key);
}

function selectWeapon(w: Equipment) {
  if (w === "portal" && (!state?.portals || !me || me.seat >= 0)) return;
  keys.delete("Mouse0");
  view.setWeapon(w);
  const slots: Record<Exclude<Equipment, "none">, string> = {
    rifle: "wepRifle",
    grapple: "wepGrapple",
    camera: "wepCamera",
    portal: "wepPortal",
  };
  for (const [key, id] of Object.entries(slots)) {
    const el = document.getElementById(id);
    if (el) el.classList.toggle("active", key === w);
  }
  $("touchPortal").classList.toggle("active", w === "portal");
  if (w === "camera" || w === "portal") view.thirdPerson = false;
  updateViewfinderVisibility();
}

function togglePortalGun() {
  selectWeapon(view.activeWeapon === "portal" ? "none" : "portal");
}

function usePortalGun(action: PortalAction) {
  if (panel || reconnecting || !state?.portals || !me || me.seat >= 0 || view.activeWeapon !== "portal") {
    return;
  }
  if (portalActions.length < 8) portalActions.push(action);
}

addEventListener("keydown", (e) => {
  if ((e.target as HTMLElement)?.matches("input, textarea")) {
    if (e.code === "Escape") {
      (e.target as HTMLElement).blur();
      $("chatForm").hidden = true;
      lock();
    }
    return;
  }
  if (e.code === "Enter" && !panel && state && state.phase !== "lobby") {
    e.preventDefault();
    const chatForm = $("chatForm");
    const chatInput = $<HTMLInputElement>("chatInput");
    if (chatForm.hidden) {
      chatForm.hidden = false;
      chatInput.focus();
      document.exitPointerLock();
    } else {
      chatForm.dispatchEvent(new Event("submit"));
    }
    return;
  }
  if (e.code === "Escape" && state && state.phase !== "lobby") {
    if (panel === "inventory" || panel === "archive" || panel === "feedback") {
      resumeGame();
      return;
    }
    show("paused");
    return;
  }
  if (e.code === "Tab" && state && state.phase !== "lobby") {
    e.preventDefault();
    inventory();
    return;
  }
  if (panel) return;
  if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) {
    e.preventDefault();
  }
  keyDown(e.code);
  if (e.repeat) return;
  if (e.code === "Digit1") selectWeapon(view.activeWeapon === "rifle" ? "none" : "rifle");
  if (e.code === "Digit2") selectWeapon(view.activeWeapon === "grapple" ? "none" : "grapple");
  if (e.code === "Digit3") selectWeapon(view.activeWeapon === "camera" ? "none" : "camera");
  if (e.code === "KeyF") togglePortalGun();
  if (e.code === "KeyY") command("recall-fighter");
  if (e.code === "Digit0" || e.code === "Backquote") selectWeapon("none");
  if (e.code === "KeyQ") selectWeapon(view.activeWeapon === "grapple" ? "none" : "grapple");
  if (e.code === "KeyT") command("mark");
  if (e.code === "KeyV") camera();
  if (e.code === "KeyP") {
    selectWeapon("camera");
    takeSnapshot(view);
  }
  if (e.code === "KeyK") toggleHoverboard();
  if (e.code === "KeyR") {
    if (view.activeWeapon === "rifle" || playerAmmo < 24) playerReloadTime = 2.0;
    else command("mark");
  }
  if (e.code === "KeyB") command("respawn");
  if (e.code === "KeyG") command("heal");
  if (e.code === "KeyH") document.body.classList.toggle("hide-hud");
});

addEventListener("keyup", (e) => keys.delete(e.code));
addEventListener("blur", () => {
  keys.clear();
  if (sim && state?.phase === "active") show("paused");
});
addEventListener(
  "wheel",
  (e) => {
    if (document.pointerLockElement !== canvas || panel) return;
    if (view.activeWeapon === "camera") {
      const delta = e.deltaY > 0 ? -0.2 : 0.2;
      view.cameraZoom = Math.max(1.0, Math.min(4.5, view.cameraZoom + delta));
      return;
    }
    const weapons: Equipment[] = [
      "none",
      "rifle",
      "grapple",
      "camera",
      ...(state?.portals && me && me.seat < 0 ? ["portal" as const] : []),
    ];
    const idx = weapons.indexOf(view.activeWeapon);
    const nextIdx =
      idx === -1
        ? e.deltaY > 0
          ? 1
          : weapons.length - 1
        : e.deltaY > 0
          ? (idx + 1) % weapons.length
          : (idx - 1 + weapons.length) % weapons.length;
    selectWeapon(weapons[nextIdx]);
  },
  { passive: true },
);

document.addEventListener("mousemove", (e) => {
  if (document.pointerLockElement !== canvas || panel) return;
  const s = Number($<HTMLInputElement>("sensitivity").value) * 0.0022;
  yaw -= e.movementX * s;
  pitch = Math.max(-1.35, Math.min(1.35, pitch - e.movementY * s));
});
canvas.addEventListener("contextmenu", (e) => {
  if (!panel && view.activeWeapon === "portal") e.preventDefault();
});
canvas.addEventListener("mousedown", (e) => {
  if (panel) return;
  if (view.activeWeapon === "portal" && (e.button === 0 || e.button === 2)) {
    e.preventDefault();
    usePortalGun(e.button === 0 ? "fire" : "undo");
    if (e.button === 0 && !mobile() && document.pointerLockElement !== canvas) lock();
    return;
  }
  if (e.button === 0) {
    if (view.activeWeapon === "none" && !view.thirdPerson) selectWeapon("rifle");
    if (view.activeWeapon === "camera") takeSnapshot(view);
    else keys.add("Mouse0");
    if (!mobile() && document.pointerLockElement !== canvas) lock();
  }
});
addEventListener("mouseup", () => keys.delete("Mouse0"));
document.addEventListener(
  "click",
  (e) => {
    const target = (e.target as HTMLElement)?.closest("button, .wep-slot, [role='tab'], .icon");
    if (target) cosmicAudio.playUIClick();
  },
  { passive: true },
);

function holdKey(el: HTMLElement, key: string) {
  el.onpointerdown = (e) => {
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    keyDown(key);
  };
  el.onpointerup = el.onpointercancel = () => keys.delete(key);
}

document.querySelectorAll<HTMLElement>("[data-move]").forEach((b) =>
  holdKey(
    b,
    (
      {
        forward: "KeyW",
        back: "KeyS",
        left: "KeyA",
        right: "KeyD",
      } as Record<string, string>
    )[b.dataset.move!],
  ),
);
holdKey($("touchInteract"), "KeyE");
holdKey($("touchJet"), "Space");
holdKey($("touchDash"), "KeyQ");
$("touchMark").onclick = () => command("mark");
holdKey($("touchFire"), "KeyT");
holdKey($("touchDown"), "KeyX");
holdKey($("touchBrake"), "ShiftLeft");
$("inventoryButton").onclick = inventory;
$("closeInventory").onclick = resumeGame;
$("closeLore").onclick = resumeGame;
$("heal").onclick = () => {
  if (!me) return;
  sim ? sim.action(me.id, "heal") : room?.send("action", "heal");
};

function switchSpacecraft() {
  notice(
    me && me.seat >= 0
      ? "请先降落离舱，再靠近另一艘飞船按 E 登船"
      : "靠近停机坪上的飞船，按 E 登船并切换舰种",
  );
}

$("snapshot") && ($("snapshot").onclick = () => takeSnapshot(view));
$("snapPhoto") && ($("snapPhoto").onclick = () => takeSnapshot(view));
$("toggleSkate") && ($("toggleSkate").onclick = toggleHoverboard);
$("btnSwitchShip") && ($("btnSwitchShip").onclick = switchSpacecraft);
$("wepPortal").onclick = togglePortalGun;
$("touchPortal").onclick = togglePortalGun;
$("touchPortalFire").onclick = () => usePortalGun("fire");
$("touchPortalUndo").onclick = () => usePortalGun("undo");
$("touchRecallFighter").onclick = () => command("recall-fighter");
$("wepRifle") &&
  ($("wepRifle").onclick = () => selectWeapon(view.activeWeapon === "rifle" ? "none" : "rifle"));
$("wepGrapple") &&
  ($("wepGrapple").onclick = () =>
    selectWeapon(view.activeWeapon === "grapple" ? "none" : "grapple"));
$("wepCamera") &&
  ($("wepCamera").onclick = () => selectWeapon(view.activeWeapon === "camera" ? "none" : "camera"));

$("downloadBoard") && ($("downloadBoard").onclick = exportHoverboardGlb);
$("downloadRifle") && ($("downloadRifle").onclick = exportTechRifleGlb);
$("downloadCamera") && ($("downloadCamera").onclick = exportSurveyCameraGlb);
$("downloadGrapple") && ($("downloadGrapple").onclick = exportGrappleLauncherGlb);

let touch: { id: number; x: number; y: number } | null = null;
canvas.onpointerdown = (e) => {
  if (e.pointerType !== "mouse" && !panel) {
    touch = { id: e.pointerId, x: e.clientX, y: e.clientY };
    canvas.setPointerCapture(e.pointerId);
  }
};
canvas.onpointermove = (e) => {
  if (touch?.id === e.pointerId) {
    yaw -= (e.clientX - touch.x) * 0.005;
    pitch = Math.max(-1.35, Math.min(1.35, pitch - (e.clientY - touch.y) * 0.005));
    touch.x = e.clientX;
    touch.y = e.clientY;
  }
};
canvas.onpointerup = canvas.onpointercancel = () => (touch = null);

paintIcons();
show("landing");
requestAnimationFrame(frame);

void Promise.all([
  view.load(),
  loadSimulation().catch(() => {}),
  fetch("/connection.json")
    .then((r) => r.json())
    .catch(() => ({ url: "" })),
])
  .then(([, , config]: [unknown, unknown, any]) => {
    endpoint = resolveRoomEndpoint(config, import.meta.env.VITE_ROOM_URL);
    loading = false;
    $<HTMLButtonElement>("launch").disabled = false;
    canvas.dataset.ready = "true";
    try {
      const savedCallsign = localStorage.getItem("last_light_callsign");
      if (savedCallsign) $<HTMLInputElement>("callsign").value = savedCallsign;
    } catch {}
    $<HTMLInputElement>("callsign").addEventListener("input", (e) => {
      try {
        localStorage.setItem("last_light_callsign", (e.target as HTMLInputElement).value);
      } catch {}
    });
    const code = new URLSearchParams(location.search).get("room");
    if (code) {
      $<HTMLInputElement>("roomCode").value = code.slice(0, 6).toUpperCase();
      chooseMode("coop");
    } else {
      chooseMode("practice");
    }
  })
  .catch((e) => {
    console.error(e);
    text("entryStatus", "星球加载失败，请刷新重试");
  });

Object.assign(window, {
  __lastLight: {
    command: (cmd: string) => chatConsole.runCommand(cmd),
    sim: () => sim,
    setViewRotation: (y: number, p: number) => {
      yaw = y;
      pitch = p;
    },
    snapshot: () => (state ? structuredClone(state) : null),
    player: () =>
      me
        ? {
            ...me,
            weapon: view.activeWeapon,
            ammo: playerAmmo,
            reloadTime: playerReloadTime,
            hook: me.grapple,
          }
        : null,
    position: () => (predicted ? { ...predicted } : me ? { ...me } : null),
    room: () => room?.roomId,
    endpoint: () => endpoint?.url ?? "",
    view: () => view,
    solarSystem: SOLAR_SYSTEM,
    rendering: () => ({
      frames: view.frames,
      fps: Math.round(fps),
      calls: view.renderer.info.render.calls,
      triangles: view.renderer.info.render.triangles,
      assets: view.ready,
      audio: view.listener?.context.state,
      camera: view.thirdPerson ? "third" : "first",
      cameraPosition: {
        x: view.camera.position.x,
        y: view.camera.position.y,
        z: view.camera.position.z,
      },
      cameraObstructed: view.cameraObstructed,
      cameraRange: view.cameraRange,
      ownAvatarVisible: me ? view.avatars.get(me.id)?.visible : false,
      worldSize: WORLD_SIZE,
      rigBones: (() => {
        const names: string[] = [];
        view.astronaut.traverse((object) => {
          if ((object as { isBone?: boolean }).isBone) names.push(object.name);
        });
        return names;
      })(),
      joints: (() => {
        const a = me ? view.avatars.get(me.id) : null;
        const leg = a?.getObjectByName("mixamorig:LeftUpLeg") || a?.getObjectByName("LeftUpLeg");
        const shin = a?.getObjectByName("mixamorig:LeftLeg") || a?.getObjectByName("LeftLeg");
        const getRotX = (bone: THREE.Object3D | null | undefined) => {
          if (!bone) return 0;
          const e = new THREE.Euler().setFromQuaternion(bone.quaternion);
          return Math.abs(e.x) > 0.0001 ? e.x : bone.rotation.x;
        };
        return {
          leg_L: getRotX(leg),
          shin_L: getRotX(shin),
        };
      })(),
      equipment: {
        firstPerson: !view.thirdPerson,
        cables: me?.grapple ? 1 : 0,
      },
      earthY: view.earth.position.y,
      moonY: view.moon.position.y,
      thermalCount: view.thermalGroups.filter((g) => g.visible).length,
      downloadedModels: view.interplanetary.downloadedAssets.size,
      assetErrors: [...view.interplanetary.assetErrors],
    }),
  },
});
