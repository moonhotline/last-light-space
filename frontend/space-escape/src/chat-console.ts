import { SOLAR_SYSTEM } from "../shared/celestial";
import type { Simulation } from "../shared/simulation";
import { PLAYER_COLORS, type Player } from "../shared/types";
import type { MultiplayerRoom } from "./party-room";

export interface ChatConsoleDeps {
  canvas: HTMLCanvasElement;
  getSim: () => Simulation | null;
  getRoom: () => MultiplayerRoom | null;
  getMe: () => Player | null;
  notice: (message: string) => void;
  lock: () => void;
}

export interface ChatMessagePayload {
  name: string;
  color?: number;
  text: string;
}

/**
 * Owns multiplayer chat log rendering (safe DOM, zero `innerHTML`) and local
 * solo slash-command execution.
 */
export function setupChatConsole(deps: ChatConsoleDeps) {
  const addMessage = (data: ChatMessagePayload) => {
    if (!data || typeof data !== "object") return;
    const list = document.getElementById("chatMessages");
    if (!list) return;
    const item = document.createElement("div");
    item.className = "chat-item";
    const color = PLAYER_COLORS[data.color ?? 0]?.css || "var(--mint)";
    const author = document.createElement("span");
    author.className = "chat-author";
    author.style.color = color;
    author.textContent = `[${String(data.name || "探索员")}]:`;
    const body = document.createElement("span");
    body.textContent = String(data.text || "");
    item.append(author, body);
    list.appendChild(item);
    list.scrollTop = list.scrollHeight;
    setTimeout(() => item.classList.add("fading"), 6000);
    setTimeout(() => item.remove(), 7000);
  };

  const runCommand = (cmdText: string) => {
    const parts = cmdText.trim().split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const sim = deps.getSim();
    const me = deps.getMe();

    if (cmd === "/boost" || cmd === "/warp" || cmd === "/speed") {
      if (sim) {
        const s = sim.s.adventure.ship;
        s.repaired = true;
        s.progress = 1;
        s.thrust = 1.5;
        const isPiloting = (me && me.seat >= 0) || s.seats.some(Boolean);
        if (isPiloting) {
          s.grounded = false;
          const speed = Math.hypot(s.vx, s.vy, s.vz);
          if (speed < 2) {
            s.vz = -120;
          } else {
            s.vx *= 2.5;
            s.vy *= 2.5;
            s.vz *= 2.5;
          }
          deps.notice("战舰曲率引擎过载加速");
        } else if (me) {
          me.vx *= 2.5;
          me.vz *= 2.5;
          deps.notice("喷气推进动力超频");
        }
      } else {
        deps.notice("联机模式暂仅房主可调试");
      }
      return;
    }

    if (cmd === "/mercury" || cmd === "/goal") {
      if (sim) {
        const merc = SOLAR_SYSTEM.mercury;
        const s = sim.s.adventure.ship;
        s.x = merc.position.x;
        s.y = merc.position.y + merc.radius + 0.3;
        s.z = merc.position.z;
        s.vx = 0;
        s.vy = 0;
        s.vz = 0;
        s.repaired = true;
        s.progress = 1;
        s.grounded = true;
        if (me) {
          if (me.seat >= 0) {
            me.x = s.x;
            me.y = s.y;
            me.z = s.z;
            me.planet = null;
          } else {
            me.x = merc.position.x + 6;
            me.y = merc.position.y + merc.radius + 0.85;
            me.z = merc.position.z;
            me.planet = "mercury";
            sim.physics.reset(me.id, me);
          }
        }
        deps.notice("已降落停靠至水星表面高曲率空域");
      }
      return;
    }

    if (cmd === "/repair") {
      if (sim) {
        sim.s.adventure.ship.repaired = true;
        sim.s.adventure.ship.progress = 1;
        deps.notice("飞船已完成修复与动力检定");
      }
      return;
    }

    if (cmd === "/help") {
      deps.notice("可用指令: /boost (加速), /mercury (跃迁水星), /repair (修复飞船)");
      return;
    }

    deps.notice(`未知指令: ${cmd} · 输入 /help 查看`);
  };

  const sendMessage = (raw: string) => {
    const trimmed = raw.trim().slice(0, 100);
    if (!trimmed) return;
    if (trimmed.startsWith("/")) {
      runCommand(trimmed);
      return;
    }
    const room = deps.getRoom();
    if (room) {
      room.send("chat", { text: trimmed });
    } else {
      const me = deps.getMe();
      addMessage({
        name: me?.name || "探索员",
        color: me?.color ?? 0,
        text: trimmed,
      });
    }
  };

  const chatForm = document.getElementById("chatForm");
  if (chatForm) {
    chatForm.onsubmit = (e) => {
      e.preventDefault();
      const input = document.getElementById("chatInput") as HTMLInputElement | null;
      if (input) {
        sendMessage(input.value);
        input.value = "";
      }
      chatForm.hidden = true;
      deps.canvas.focus();
      deps.lock();
    };
  }

  return { addMessage, runCommand };
}
