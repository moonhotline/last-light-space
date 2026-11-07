import { Euler, Quaternion, Vector3 } from "three";
import { celestialCapture, type CelestialBody, type Vec3 } from "./celestial";

type FlightPosition = Vec3 & { flightRotation?: { x: number; y: number; z: number; w: number } };

/** Transport the previous frame across poles, then blend back to world up at the capture boundary. */
export function celestialFlightFrame(position: FlightPosition, yaw: number, bodies?: readonly CelestialBody[]) {
  const capture = celestialCapture(position, bodies);
  const worldUp = new Vector3(0, 1, 0);
  const previous = new Quaternion().copy(position.flightRotation ?? new Quaternion()).normalize();
  const radialRotation = new Quaternion().setFromUnitVectors(worldUp.clone().applyQuaternion(previous),
    capture ? new Vector3().copy(capture.normal) : worldUp).multiply(previous);
  const surfaceRotation = new Quaternion().slerp(radialRotation, capture?.weight ?? 0);
  const quaternion = surfaceRotation.clone().multiply(new Quaternion().setFromEuler(new Euler(0, yaw, 0)));
  return {
    capture,
    surfaceRotation,
    quaternion,
    up: worldUp.applyQuaternion(surfaceRotation),
    forward: new Vector3(0, 0, -1).applyQuaternion(quaternion),
    right: new Vector3(1, 0, 0).applyQuaternion(quaternion),
  };
}

/** Cockpit seat and free-look orientation in the same frame as the ship controls. */
export function celestialCockpitPose(position: FlightPosition, shipYaw: number, lookYaw: number, lookPitch: number) {
  const frame = celestialFlightFrame(position, shipYaw);
  return {
    position: new Vector3().copy(position).addScaledVector(frame.up, 3.9).addScaledVector(frame.forward, 4.7),
    up: frame.up,
    quaternion: frame.surfaceRotation.clone().multiply(
      new Quaternion().setFromEuler(new Euler(lookPitch, lookYaw, 0, "YXZ")),
    ),
  };
}
