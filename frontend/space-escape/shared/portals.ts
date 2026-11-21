import { Matrix4, Quaternion, Vector3 } from "three";
import type { Vec } from "./map";

export const PORTAL_RADIUS_X = 1.16;
export const PORTAL_RADIUS_Y = 1.68;
export const PORTAL_COLORS = ["blue", "orange"] as const;
export type PortalColor = (typeof PORTAL_COLORS)[number];
export interface Portal {
  center: Vec;
  normal: Vec;
  planet?: string;
}
export type PortalPair = Partial<Record<PortalColor, Portal>>;
export type PortalAction = "fire" | "undo";

export function nextPortalColor(pair: PortalPair, last?: PortalColor): PortalColor {
  if (!pair.blue) return "blue";
  if (!pair.orange) return "orange";
  return last === "blue" ? "orange" : "blue";
}

const HALF_TURN = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI);

export function portalFrame(normal: Vec) {
  const forward = new Vector3().copy(normal).normalize();
  const up = Math.abs(normal.y) > 0.5 ? new Vector3(0, 0, 1) : new Vector3(0, 1, 0);
  const right = new Vector3().crossVectors(up, forward).normalize();
  up.crossVectors(forward, right);
  return new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(right, up, forward));
}

export function portalRotation(entry: Portal, exit: Portal) {
  return portalFrame(exit.normal).multiply(HALF_TURN).multiply(portalFrame(entry.normal).invert());
}
