import "./style.css";
import { Client, type Room } from "@colyseus/sdk";
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
} from "lucide";
import { distance, groundAt, sector, BEACON_SITES } from "../shared/map";
import { DT, type Input, type Player, type Snapshot } from "../shared/types";
import type { Simulation } from "../shared/simulation";
import type { MovementWorld } from "../shared/physics";
import { GameView } from "./scene";
const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const text = (id: string, s: string) => {
  if ($(id).textContent !== s) $(id).textContent = s;
};
const canvas = $<HTMLCanvasElement>("world"),
  view = new GameView(canvas),
  keys = new Set<string>();
const colors = ["#b0edff", "#ffd397", "#ffa994", "#bbc5ff"];
let mode: "practice" | "coop" = "practice",
  sim: Simulation | null = null,
  room: Room | null = null,
  state: Snapshot | null = null,
  me: Player | null = null,
  predicted: Player | null = null,
  prediction: MovementWorld | null = null;
let pending: Input[] = [],
  sequence = 0,
  yaw = 0,
  pitch = 0,
  accumulator = 0,
  lastFrame = performance.now(),
  spaceAt = 0;
let panel: "landing" | "lobby" | "paused" | "result" | null = "landing",
  endpoint = "",
  muted = false,
  loading = true,
  reconnecting = false,
  lastEvent = 0,
  uiAt = 0,
  toastTimer = 0;
let correction = { x: 0, y: 0, z: 0 };
let SimulationCtor: typeof import("../shared/simulation").Simulation | null =
    null,
  MovementWorldCtor: typeof import("../shared/physics").MovementWorld | null =
    null,
  initPhysicsFn: typeof import("../shared/physics").initPhysics | null = null;
const mobile = () =>
  matchMedia("(pointer: coarse)").matches || innerWidth <= 760;
const clock = (n: number) =>
  `${Math.floor(n / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(n % 60)
    .toString()
    .padStart(2, "0")}`;
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
  for (const id of ["landing", "lobby", "paused", "result"])
    $(id).hidden = next !== id;
  $("overlay").hidden = !next;
  $("hud").hidden = !state || state.phase === "lobby";
  document.body.dataset.paused = String(!!next);
  keys.clear();
  spaceAt = 0;
  if (next) document.exitPointerLock();
}
function unlockAudio() {
  void view
    .audio()
    .then(() =>
      view.listener?.setMasterVolume(
        muted ? 0 : Number($<HTMLInputElement>("volume").value),
      ),
    )
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
const callsign = () =>
  $<HTMLInputElement>("callsign").value.trim().slice(0, 16) || "探索员";
function releaseSession() {
  const old = room;
  room = null;
  if (old) void old.leave();
  sim?.dispose();
  sim = null;
  prediction?.dispose();
  prediction = null;
  state = me = predicted = null;
  pending = [];
  reconnecting = false;
  sequence = 0;
  yaw = 0;
  pitch = 0;
  accumulator = 0;
  correction = { x: 0, y: 0, z: 0 };
  lastEvent = 0;
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
function receive(next: Snapshot) {
  const previous = state?.phase;
  state = next;
  me = state.players.find((p) => p.id === (room?.sessionId || "local")) || null;
  if (mode === "coop" && me) {
    if (!prediction) {
      if (!MovementWorldCtor) return;
      prediction = new MovementWorldCtor();
      prediction.add(me.id, me);
    }
    const before = predicted;
    predicted = { ...me };
    prediction.reset(me.id, me);
    pending = pending.filter((i) => i.seq > me!.ack);
    if (state.phase !== "lobby")
      for (const i of pending) {
        prediction.move(predicted, i);
        prediction.step();
      }
    if (before && previous !== "lobby" && distance(before, predicted) < 3)
      correction = {
        x: before.x - predicted.x,
        y: Math.abs(before.y - predicted.y) < 1 ? before.y - predicted.y : 0,
        z: before.z - predicted.z,
      };
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
  if (next.eventId !== lastEvent) {
    lastEvent = next.eventId;
    if (next.eventId) notice(next.event);
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
  $<HTMLButtonElement>("launch").disabled = $<HTMLButtonElement>(
    "join",
  ).disabled = true;
  text("entryStatus", "正在建立通讯…");
  unlockAudio();
  try {
    await loadSimulation();
    const client = new Client(endpoint);
    const joined = create
      ? await client.create("escape", { name: callsign() })
      : await client.joinById(code, { name: callsign() });
    room = joined;
    joined.onMessage("snapshot", receive);
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
    history.replaceState({}, "", `?room=${joined.roomId}`);
  } catch {
    text("entryStatus", "房间不可用：检查编号或创建新房间");
  } finally {
    $<HTMLButtonElement>("launch").disabled = $<HTMLButtonElement>(
      "join",
    ).disabled = false;
  }
}
function command(action: string) {
  if (panel || !state || state.phase === "lobby" || !me) return;
  sim ? sim.action(me.id, action) : room?.send("action", action);
  if (action === "mark") view.sound("mark");
}
function makeInput(): Input {
  const active = !panel && !reconnecting;
  return {
    seq: ++sequence,
    forward: active
      ? Number(keys.has("KeyW") || keys.has("ArrowUp")) -
        Number(keys.has("KeyS") || keys.has("ArrowDown"))
      : 0,
    side: active ? Number(keys.has("KeyD")) - Number(keys.has("KeyA")) : 0,
    yaw,
    pitch,
    sprint: active && (keys.has("ShiftLeft") || keys.has("ShiftRight")),
    jump: active && keys.has("Space"),
    jet:
      active &&
      (keys.has("KeyF") ||
        (keys.has("Space") && performance.now() - spaceAt > 220)),
    dash: active && keys.has("KeyQ"),
    interact: active && keys.has("KeyE"),
  };
}
function step() {
  if (!state || state.phase === "lobby" || !me || reconnecting) return;
  if (!panel) {
    yaw +=
      (Number(keys.has("ArrowLeft") || keys.has("KeyJ")) -
        Number(keys.has("ArrowRight") || keys.has("KeyL"))) *
      DT *
      1.5;
    pitch = Math.max(
      -1.3,
      Math.min(
        1.3,
        pitch + (Number(keys.has("KeyI")) - Number(keys.has("KeyK"))) * DT,
      ),
    );
  }
  if (sim) {
    if (panel) return;
    sim.input(me.id, makeInput());
    sim.tick();
    receive(sim.snapshot());
  } else if (room && predicted && prediction) {
    const i = makeInput();
    room.send("input", i);
    pending.push(i);
    if (pending.length > 120) {
      pending = [];
      show("paused");
      notice("网络延迟过高，请等待同步");
    }
    prediction.move(predicted, i);
    prediction.step();
  }
}
function objective() {
  if (!state) return null;
  const b = state.beacons.find((b) => !b.active);
  return b
    ? {
        p: b,
        index: `0${b.id + 1} / 03`,
        title: b.name,
        detail:
          b.id === 0
            ? "沿晶体光点穿过峡谷"
            : b.id === 1
              ? "背包已升级 · 越过裂谷"
              : "乘上升气流，抵达最高处",
      }
    : {
        p: state.beacons[2],
        index: "03 / 03",
        title: "星图已点亮",
        detail: "月球正在升起 · 自由探索",
      };
}
function prompt() {
  if (!state || !me) return { label: "", progress: 0 };
  const b = state.beacons.find(
    (b) => !b.active && distance(me!, b) < 10 && Math.abs(me!.y - b.y) < 10,
  );
  if (b)
    return {
      label:
        b.id > 0 && !state.beacons[b.id - 1].active
          ? "先点亮上一座信标"
          : "长按 E · 与信标共鸣",
      progress: b.progress,
    };
  return { label: "", progress: 0 };
}
function crewList(id: string, players: Player[]) {
  $(id).replaceChildren(
    ...players.map((p) => {
      const row = document.createElement(id === "crew" ? "li" : "div"),
        name = document.createElement("b"),
        detail = document.createElement("span");
      name.textContent = p.name;
      name.style.color = colors[p.color];
      detail.textContent =
        id === "crew"
          ? p.id === state?.host
            ? "队长"
            : "已就绪"
          : `${Math.round(distance(me!, p))} m · 背包 ${p.level + 1}`;
      row.append(name, detail);
      return row;
    }),
  );
}
function renderResult() {
  if (!state) return;
  text("resultReason", "三座信标连接成星图。抬头，等待月球越过地平线。");
  $("resultStats").innerHTML =
    `<div>探索用时<b>${clock(state.time)}</b></div><div>能源晶体<b>${state.players.reduce((n, p) => n + p.crystals, 0)}</b></div>`;
  $<HTMLButtonElement>("again").disabled =
    mode === "coop" && state.host !== room?.sessionId;
}
function hud() {
  if (!state || !me) return;
  if (panel === "lobby") {
    crewList("crew", state.players);
    $<HTMLButtonElement>("begin").disabled = state.host !== room?.sessionId;
  }
  const p = predicted || me,
    target = objective(),
    cap = p.level >= 1 ? 150 : 100;
  text("clock", clock(state.time));
  text("sector", sector(p.z, p.x));
  text("fuel", String(Math.ceil(p.fuel)));
  $<HTMLProgressElement>("fuelBar").max = cap;
  $<HTMLProgressElement>("fuelBar").value = p.fuel;
  text("packLevel", `ION PACK ${p.level >= 1 ? "II" : "I"}`);
  text("speed", Math.round(Math.hypot(p.vx, p.vz)).toString().padStart(2, "0"));
  text(
    "altitude",
    `${Math.round(Math.max(0, p.y - groundAt(p.x, p.z) - 0.85))} m`,
  );
  text("cargo", `${me.crystals.toString().padStart(2, "0")} 晶体`);
  text("combo", me.combo >= 2 ? `×${me.combo} 连续收集` : "");
  $("combo").classList.toggle("visible", me.combo >= 2);
  text(
    "dashStatus",
    p.dashCooldown > 0 ? `${p.dashCooldown.toFixed(1)} s` : "就绪",
  );
  text("viewMode", view.thirdPerson ? "第三人称" : "第一人称");
  text("thermalStatus", me.level >= 2 ? "上升气流已开启" : "晶体补充燃料");
  crewList(
    "team",
    state.players.filter((p) => p.id !== me!.id),
  );
  if (target) {
    text("objectiveIndex", target.index);
    text("objective", target.title);
    text("objectiveDetail", target.detail);
    const point = view.project(target.p);
    $("targetMarker").hidden = !point;
    if (point) {
      $("targetMarker").style.left = `${point.x}px`;
      $("targetMarker").style.top = `${point.y}px`;
      text("targetDistance", `${Math.round(distance(p, target.p))} m`);
    }
  }
  const near = prompt();
  $("interaction").hidden = !near.label;
  text("interactionText", near.label);
  $<HTMLProgressElement>("interactionProgress").value = near.progress;
  view.minimap($<HTMLCanvasElement>("map"), state, { ...me, ...p });
  $("controlsHint").hidden = state.time > 90;
  document.body.dataset.camera = view.thirdPerson ? "third" : "first";
}
let measured = 0,
  measureSeconds = 0,
  fps = 60;
function frame(now: number) {
  const elapsed = (now - lastFrame) / 1000,
    dt = Math.min(0.15, elapsed);
  lastFrame = now;
  accumulator += dt;
  while (accumulator >= DT) {
    accumulator -= DT;
    step();
  }
  for (const axis of ["x", "y", "z"] as const)
    correction[axis] *= Math.exp(-dt * 18);
  const p = predicted || me,
    cameraPlayer =
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
  view.render(
    state,
    state?.phase === "lobby" ? null : cameraPlayer,
    dt,
    now / 1000,
    !panel,
    sim?.physics || prediction,
  );
  measured++;
  measureSeconds += elapsed;
  if (measureSeconds >= 2) {
    fps = measured / measureSeconds;
    measured = 0;
    measureSeconds = 0;
  }
  if (now - uiAt > 90) {
    hud();
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
    await navigator.clipboard.writeText(
      `${location.origin}${location.pathname}?room=${room?.roomId}`,
    );
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
  else
    void document.documentElement
      .requestFullscreen()
      .catch(() => notice("全屏不可用"));
};
$("volume").oninput = () =>
  view.listener?.setMasterVolume(
    muted ? 0 : Number($<HTMLInputElement>("volume").value),
  );
$<HTMLInputElement>("effects").value = String(view.effects);
$("effects").oninput = () => {
  view.effects = Number($<HTMLInputElement>("effects").value);
};
$("sound").onclick = () => {
  muted = !muted;
  unlockAudio();
  $("sound").innerHTML =
    `<i data-lucide="${muted ? "volume-x" : "volume-2"}"></i>`;
  $("sound").setAttribute("aria-label", muted ? "开启声音" : "静音");
  paintIcons();
};
function camera() {
  view.toggleCamera();
  text("viewMode", view.thirdPerson ? "第三人称" : "第一人称");
}
$("camera").onclick = camera;
$("recall").onclick = () => {
  show(null);
  command("respawn");
  lock();
};
function keyDown(key: string) {
  if (key === "Space" && !keys.has(key)) spaceAt = performance.now();
  keys.add(key);
}
addEventListener("keydown", (e) => {
  if ((e.target as HTMLElement)?.matches("input")) return;
  if (e.code === "Escape" && state && state.phase !== "lobby") {
    show("paused");
    return;
  }
  if (panel) return;
  if (
    ["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(
      e.code,
    )
  )
    e.preventDefault();
  keyDown(e.code);
  if (e.repeat) return;
  if (e.code === "KeyV") camera();
  if (e.code === "KeyR") command("mark");
  if (e.code === "KeyB") command("respawn");
  if (e.code === "KeyH") {
    document.body.classList.toggle("hide-hud");
  }
});
addEventListener("keyup", (e) => keys.delete(e.code));
addEventListener("blur", () => {
  keys.clear();
  if (sim && state?.phase === "active") show("paused");
});
document.addEventListener("mousemove", (e) => {
  if (document.pointerLockElement !== canvas || panel) return;
  const s = Number($<HTMLInputElement>("sensitivity").value) * 0.0022;
  yaw -= e.movementX * s;
  pitch = Math.max(-1.35, Math.min(1.35, pitch - e.movementY * s));
});
canvas.addEventListener("mousedown", (e) => {
  if (
    e.button === 0 &&
    !panel &&
    !mobile() &&
    document.pointerLockElement !== canvas
  )
    lock();
});
function holdKey(el: HTMLElement, key: string) {
  el.onpointerdown = (e) => {
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    keyDown(key);
  };
  el.onpointerup = el.onpointercancel = () => keys.delete(key);
}
document
  .querySelectorAll<HTMLElement>("[data-move]")
  .forEach((b) =>
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
    pitch = Math.max(
      -1.35,
      Math.min(1.35, pitch - (e.clientY - touch.y) * 0.005),
    );
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
  fetch("/connection.json")
    .then((r) => r.json())
    .catch(() => ({ url: "" })),
])
  .then(([, config]) => {
    const url =
      import.meta.env.VITE_ROOM_URL ||
      config.url ||
      (config.sameOrigin
        ? `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}`
        : "") ||
      (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)
        ? "ws://127.0.0.1:2567"
        : "");
    try {
      const p = new URL(url);
      if (["ws:", "wss:"].includes(p.protocol) && !p.username && !p.password)
        endpoint = url;
    } catch {
      /* Solo stays available offline after assets load. */
    }
    loading = false;
    $<HTMLButtonElement>("launch").disabled = false;
    canvas.dataset.ready = "true";
    const code = new URLSearchParams(location.search).get("room");
    if (code) {
      $<HTMLInputElement>("roomCode").value = code.slice(0, 6).toUpperCase();
      chooseMode("coop");
    } else chooseMode("practice");
  })
  .catch((e) => {
    console.error(e);
    text("entryStatus", "星球加载失败，请刷新重试");
  });
Object.assign(window, {
  __lastLight: {
    snapshot: () => (state ? structuredClone(state) : null),
    player: () => (me ? { ...me } : null),
    position: () => (predicted ? { ...predicted } : me ? { ...me } : null),
    room: () => room?.roomId,
    endpoint: () => endpoint,
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
      earthY: view.earth.position.y,
      moonY: view.moon.position.y,
      thermalCount: view.thermalGroups.filter((g) => g.visible).length,
    }),
  },
});
