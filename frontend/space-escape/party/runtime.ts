/**
 * Shared Cloudflare Workers / PartyKit runtime bootstrap for Rapier WASM
 * and wire message framing.
 */
import { initPhysics } from "../shared/physics";

// Polyfill Cloudflare Workers / workerd globals expected by Rapier wasm-bindgen.
export function ensureWorkerdGlobals(): void {
  const g = globalThis as Record<string, unknown>;
  if (typeof g.window === "undefined") {
    g.window = globalThis;
  }
  const perf = g.performance as { now?: () => number } | undefined;
  if (typeof perf === "undefined") {
    g.performance = { now: () => Date.now() };
  } else if (typeof perf.now !== "function") {
    perf.now = () => Date.now();
  }
}

ensureWorkerdGlobals();

export async function initPartyPhysics(): Promise<void> {
  ensureWorkerdGlobals();
  let wasmModule: unknown;
  try {
    const mod = await import("./rapier.wasm");
    wasmModule = (mod as { default?: unknown }).default || mod;
  } catch {
    wasmModule = undefined;
  }
  await initPhysics(wasmModule);
}

export interface WireMessage {
  type?: string;
  data?: unknown;
}

export function parseWireMessage(raw: unknown): WireMessage | null {
  if (typeof raw !== "string") return null;
  try {
    const parsed = JSON.parse(raw) as WireMessage;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export function encodeWireMessage(type: string, data: unknown): string {
  return JSON.stringify({ type, data });
}
