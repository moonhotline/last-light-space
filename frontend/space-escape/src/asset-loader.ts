import * as THREE from "three";
import type { GLTF, GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { AdventureShip } from "../shared/types";

export interface PilotFlightFlags {
  boosting: boolean;
  braking: boolean;
}

/** Canonical derivation of active boosting/braking visual & acoustic flags. */
export function resolvePilotFlightState(
  ship: Pick<AdventureShip, "vx" | "vy" | "vz" | "thrust">,
  pilotFlight?: PilotFlightFlags,
): PilotFlightFlags {
  if (pilotFlight) return pilotFlight;
  const speed = Math.hypot(ship.vx ?? 0, ship.vy ?? 0, ship.vz ?? 0);
  return {
    boosting: (ship.thrust || 0) > 1.8 || speed > 42,
    braking: (ship.vy ?? 0) < -15,
  };
}

/** Load a glTF/GLB asset with linear backoff retries. */
export async function loadGltfWithRetry(
  loader: GLTFLoader,
  url: string,
  attempts = 3,
): Promise<GLTF> {
  let error: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await loader.loadAsync(url);
    } catch (e) {
      error = e;
      if (attempt + 1 < attempts) {
        await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
      }
    }
  }
  throw error;
}

/** Soft radial glow texture shared by solar/lunar coronas and weapon muzzle flashes. */
export function createRadialGlowTexture(): THREE.CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, "#ffffff");
  gradient.addColorStop(0.12, "#ffffff70");
  gradient.addColorStop(0.5, "#ffffff12");
  gradient.addColorStop(1, "#ffffff00");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}

export function downloadAsset(url: string, filename: string): void {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export async function exportHoverboardGlb(): Promise<void> {
  downloadAsset("/assets/hoverboard.glb", `kepler-hoverboard-${Date.now()}.glb`);
}

export async function exportTechRifleGlb(): Promise<void> {
  downloadAsset("/assets/kinetic-rifle.glb", `kepler-kinetic-rifle-${Date.now()}.glb`);
}

export async function exportSurveyCameraGlb(): Promise<void> {
  downloadAsset("/assets/survey-camera.glb", `kepler-survey-camera-${Date.now()}.glb`);
}

export async function exportGrappleLauncherGlb(): Promise<void> {
  downloadAsset("/assets/echo-grapple.glb", `kepler-echo-grapple-${Date.now()}.glb`);
}
