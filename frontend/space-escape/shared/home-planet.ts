/**
 * Physical home globe. The authored Kepler basin lives around this north polar cap;
 * the separate solar-system Kepler landmark uses a different world-space position.
 */
export const HOME_PLANET_SPHERE = {
  center: { x: 0, y: -3808, z: 0 },
  radius: 3800,
  cloudRadius: 3865,
  atmosphereRadius: 4080,
};

/** Circular edge of the shared terrain cap; below it the globe continues unmodified. */
export const HOME_COLLAR_RADIUS = 3530;

export function homeSphereHeight(x: number, z: number): number | null {
  const { center, radius } = HOME_PLANET_SPHERE;
  const distanceSq = (x - center.x) ** 2 + (z - center.z) ** 2;
  return distanceSq < radius * radius
    ? center.y + Math.sqrt(radius * radius - distanceSq)
    : null;
}
