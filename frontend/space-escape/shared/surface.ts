import { Euler, Quaternion, Vector3 } from "three";
import { SOLAR_SYSTEM } from "./celestial";
import type { Player } from "./types";

export const FOOT_OFFSET = 0.825;
const Y = new Vector3(0, 1, 0);

// Transport the existing local frame instead of picking a new "north" at a pole.
export function surfaceOrientation(p: Player): Quaternion {
  if (!p.planet || !SOLAR_SYSTEM[p.planet]) return new Quaternion();
  const center = SOLAR_SYSTEM[p.planet].position;
  const up = new Vector3(p.x - center.x, p.y - center.y, p.z - center.z).normalize();
  const q = new Quaternion().copy(p.surfaceRotation || new Quaternion());
  return new Quaternion().setFromUnitVectors(Y.clone().applyQuaternion(q), up).multiply(q).normalize();
}

export function playerUp(p: Player) {
  return Y.clone().applyQuaternion(surfaceOrientation(p));
}

export function viewOrientation(p: Player) {
  return surfaceOrientation(p).multiply(new Quaternion().setFromEuler(new Euler(p.pitch, p.yaw, 0, "YXZ")));
}

export function eyePosition(p: Player) {
  return new Vector3(p.x, p.y, p.z).addScaledVector(playerUp(p), 0.9);
}

export function viewDirection(p: Player) {
  return new Vector3(0, 0, -1).applyQuaternion(viewOrientation(p));
}
