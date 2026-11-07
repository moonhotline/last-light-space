/**
 * Celestial Bodies, Spherical Gravity, Interplanetary Spaceflight & Mineral Samples.
 * Pure mathematical and behavioral definitions, fully decoupled from DOM & WebGL.
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Body-local spherical coordinates in degrees; longitude zero faces +Z. */
export interface CelestialLandmark {
  id: string;
  name: string;
  kind: "basin" | "mountain" | "canyon" | "storm" | "plateau" | "portal";
  latitude: number;
  longitude: number;
  size: number; // Visual footprint in meters
  color: number;
}

export interface CelestialBody {
  id: string;
  name: string;
  subtitle: string;
  radius: number; // Base spherical radius in meters
  atmosphereRadius: number; // Karman line / atmospheric limit
  gravity: number; // Surface gravity m/s^2
  position: Vec3; // Global space coordinates in solar system
  color: number;
  atmosphereColor: number;
  unlocked: boolean;
  landingSite: Vec3; // Default spherical surface coordinate
  landmarks: readonly CelestialLandmark[];
  rotationSpeed?: number; // Radians/second; negative means retrograde rotation
  landable?: boolean; // Megastructures have no spherical collision surface
  hasRings?: boolean;
  ringInnerRadius?: number;
  ringOuterRadius?: number;
  ringColor?: number;
}

/** Solar system celestial bodies catalog */
export const SOLAR_SYSTEM: Record<string, CelestialBody> = {
  kepler: {
    id: "kepler",
    name: "开普勒-07 (母星)",
    subtitle: "KEPLER / HOME BASIN",
    radius: 420,
    atmosphereRadius: 650,
    gravity: 7.5,
    position: { x: 200, y: 3200, z: -2800 },
    color: 0x243b55,
    atmosphereColor: 0x38bdf8,
    unlocked: true,
    landingSite: { x: 200, y: 3621, z: -2800 },
    landmarks: [{ id: "home-basin", name: "Home Basin", kind: "basin", latitude: 58, longitude: 20, size: 65, color: 0x47758c }],
  },
  mercury: {
    id: "mercury",
    name: "水星 (替换月球)",
    subtitle: "MERCURY BASIN",
    radius: 320,
    atmosphereRadius: 480,
    gravity: 3.7,
    position: { x: -3200, y: 1200, z: -5400 },
    color: 0x8a929a,
    atmosphereColor: 0x475569,
    unlocked: true,
    landingSite: { x: -3200, y: 1525, z: -5400 },
    rotationSpeed: 0.04,
    landmarks: [{ id: "caloris-basin", name: "Caloris Basin", kind: "basin", latitude: 31, longitude: 48, size: 64, color: 0x666a70 }],
  },
  earth: {
    id: "earth",
    name: "蓝星地球",
    subtitle: "TERRA / CRADLE OF MANKIND",
    radius: 680,
    atmosphereRadius: 1050,
    gravity: 9.8,
    position: { x: 4200, y: 2600, z: -7200 },
    color: 0x1d4ed8,
    atmosphereColor: 0x60a5fa,
    unlocked: true,
    landingSite: { x: 4200, y: 3285, z: -7200 },
    landmarks: [{ id: "himalayas", name: "Himalayas", kind: "mountain", latitude: 28, longitude: 86, size: 65, color: 0xdce5eb }],
  },
  venus: {
    id: "venus", name: "金星", subtitle: "VENUS / SULFURIC CLOUDS",
    radius: 640, atmosphereRadius: 920, gravity: 8.87,
    position: { x: -1800, y: 2100, z: -8400 },
    color: 0xd9a441, atmosphereColor: 0xf5c76b, unlocked: true,
    landingSite: { x: -1800, y: 2745, z: -8400 },
    rotationSpeed: -0.025,
    landmarks: [{ id: "ishtar-terra", name: "Ishtar Terra", kind: "plateau", latitude: 65, longitude: 20, size: 145, color: 0xf2cf82 }],
  },
  mars: {
    id: "mars", name: "火星", subtitle: "MARS / IRON OXIDE FRONTIER",
    radius: 380, atmosphereRadius: 550, gravity: 3.72,
    position: { x: 6400, y: 3200, z: -3800 },
    color: 0xb74f30, atmosphereColor: 0xe88a58, unlocked: true,
    landingSite: { x: 6400, y: 3585, z: -3800 },
    rotationSpeed: 0.035,
    landmarks: [
      { id: "olympus-mons", name: "Olympus Mons", kind: "mountain", latitude: 19, longitude: -35, size: 78, color: 0xd78654 },
      { id: "valles-marineris", name: "Valles Marineris", kind: "canyon", latitude: -14, longitude: 24, size: 145, color: 0x612d24 },
    ],
  },
  jupiter: {
    id: "jupiter", name: "木星", subtitle: "JUPITER / GREAT RED SPOT",
    radius: 1350, atmosphereRadius: 1750, gravity: 24.79,
    position: { x: -9200, y: 4800, z: -11800 },
    color: 0xd8ac83, atmosphereColor: 0xf0cba0, unlocked: true,
    landingSite: { x: -9200, y: 6155, z: -11800 },
    rotationSpeed: 0.065,
    landmarks: [{ id: "great-red-spot", name: "Great Red Spot", kind: "storm", latitude: -22, longitude: 25, size: 340, color: 0xb94128 }],
  },
  saturn: {
    id: "saturn", name: "土星", subtitle: "SATURN / RINGED GIANT",
    radius: 1080, atmosphereRadius: 1420, gravity: 10.44,
    position: { x: 12200, y: 5400, z: -14800 },
    color: 0xdcca96, atmosphereColor: 0xf2ddb0, unlocked: true,
    landingSite: { x: 12200, y: 6485, z: -14800 },
    rotationSpeed: 0.055,
    hasRings: true, ringInnerRadius: 1600, ringOuterRadius: 2800, ringColor: 0xe2d9b8,
    landmarks: [{ id: "polar-hexagon", name: "Polar Hexagon", kind: "storm", latitude: 86, longitude: 0, size: 210, color: 0x9e9467 }],
  },
  warpgate: {
    id: "warpgate", name: "古代跃迁星门", subtitle: "ANCIENT GATE / AZURE HORIZON",
    radius: 350, atmosphereRadius: 350, gravity: 0, landable: false,
    position: { x: 0, y: 3900, z: -8800 },
    color: 0x748494, atmosphereColor: 0x38bdf8, unlocked: true,
    landingSite: { x: 0, y: 3900, z: -8400 },
    rotationSpeed: 0,
    landmarks: [{ id: "azure-horizon", name: "Azure Horizon", kind: "portal", latitude: 0, longitude: 0, size: 290, color: 0x38bdf8 }],
  },
  stylized: {
    id: "stylized",
    name: "绿意新星",
    subtitle: "VERDANT EDEN",
    radius: 360,
    atmosphereRadius: 560,
    gravity: 6.2,
    position: { x: -4800, y: 3100, z: 4200 },
    color: 0x10b981,
    atmosphereColor: 0x34d399,
    unlocked: false,
    landingSite: { x: -4800, y: 3465, z: 4200 },
    landmarks: [{ id: "emerald-basin", name: "Emerald Basin", kind: "basin", latitude: 35, longitude: -40, size: 72, color: 0x046c4e }],
  },
};

/** Local position on the spherical crust, shared by scenic geometry and navigation. */
export function landmarkPosition(body: CelestialBody, landmark: CelestialLandmark, height = 0): Vec3 {
  const latitude = landmark.latitude * Math.PI / 180;
  const longitude = landmark.longitude * Math.PI / 180;
  const radius = body.radius + height;
  return {
    x: radius * Math.cos(latitude) * Math.sin(longitude),
    y: radius * Math.sin(latitude),
    z: radius * Math.cos(latitude) * Math.cos(longitude),
  };
}

/** The same capture boundary is used by ships, avatars, rendering and cameras. */
export function celestialCapture(pos: Vec3, bodies: readonly CelestialBody[] = Object.values(SOLAR_SYSTEM)) {
  let nearest: CelestialBody | null = null;
  let nearestDistance = Infinity;
  let bestRelativeDistance = Infinity;
  for (const body of bodies) {
    if (body.landable === false || body.gravity <= 0) continue;
    const distance = Math.hypot(pos.x - body.position.x, pos.y - body.position.y, pos.z - body.position.z);
    const captureRadius = body.atmosphereRadius + 220;
    if (distance < captureRadius && distance / captureRadius < bestRelativeDistance) {
      nearest = body;
      nearestDistance = distance;
      bestRelativeDistance = distance / captureRadius;
    }
  }
  if (!nearest) return null;
  const t = Math.max(0, Math.min(1, (nearest.atmosphereRadius + 220 - nearestDistance) /
    (nearest.atmosphereRadius + 220 - nearest.radius - 2)));
  return {
    body: nearest,
    altitude: nearestDistance - nearest.radius,
    weight: t * t * (3 - 2 * t),
    normal: nearestDistance > 0.0001 ? {
      x: (pos.x - nearest.position.x) / nearestDistance,
      y: (pos.y - nearest.position.y) / nearestDistance,
      z: (pos.z - nearest.position.z) / nearestDistance,
    } : { x: 0, y: 1, z: 0 },
  };
}

/** Space flight cruise states */
export type FlightFlightMode =
  | "surface" // On spherical surface or walking
  | "ascent" // Breaking through atmosphere
  | "cruise" // Deep space solar system cruise
  | "reentry" // Approaching planet & landing
  | "interior"; // Inside spaceship corridor

/** Spaceship types */
export type SpaceshipKind =
  | "skiff" // Original Peregrine Skiff
  | "light_fighter" // High speed light fighter
  | "cruiser" // Heavy, stable cruiser
  | "intergalactic"; // Long-range warp-drive starship

export interface FlightSystemState {
  mode: FlightFlightMode;
  shipKind: SpaceshipKind;
  currentPlanet: string;
  targetPlanet: string;
  warpPower: number; // 0..100 Warp charge
  throttle: number; // 0..1
  velocity: Vec3;
  altitude: number; // Distance above current planet surface
  inCorridor: boolean; // Inside spaceship interior
}

/** Mineral specimen classification (Based on Slovenian Natural History Museum) */
export interface MineralSpecimen {
  id: string;
  name: string;
  formula: string;
  crystalSystem: string;
  color: string;
  hardness: number; // Mohs scale
  rarity: "common" | "rare" | "epic" | "legendary";
  description: string;
  planetId: string;
  xpReward: number;
}

export const MINERAL_SAMPLES: Record<string, MineralSpecimen> = {
  calcite: {
    id: "calcite",
    name: "冰洲石 (方解石)",
    formula: "CaCO₃",
    crystalSystem: "三方晶系",
    color: "#e0f2fe",
    hardness: 3.0,
    rarity: "common",
    description: "具备极强双折射率的透明方解石晶体，常用于精密光学取景器透镜偏光校准。",
    planetId: "kepler",
    xpReward: 60,
  },
  pyrite: {
    id: "pyrite",
    name: "晶立方黄铁矿",
    formula: "FeS₂",
    crystalSystem: "等轴晶系",
    color: "#fef08a",
    hardness: 6.5,
    rarity: "rare",
    description: "具有完美立方体几何结晶与金属光泽的天然硫铁矿，是耐高温电磁线圈的优质超导掺杂剂。",
    planetId: "mercury",
    xpReward: 120,
  },
  amethyst: {
    id: "amethyst",
    name: "星核紫水晶",
    formula: "SiO₂:Fe³⁺",
    crystalSystem: "三方晶系 (六方柱)",
    color: "#c084fc",
    hardness: 7.0,
    rarity: "epic",
    description: "受外星高能宇宙射线激发着色的深紫石英晶簇，内部蕴含高密度离子共振腔。",
    planetId: "stylized",
    xpReward: 250,
  },
  celestite: {
    id: "celestite",
    name: "天青石能源核",
    formula: "SrSO₄",
    crystalSystem: "斜方晶系",
    color: "#38bdf8",
    hardness: 3.5,
    rarity: "legendary",
    description: "呈现梦幻天蓝色的板状重晶石族矿物，高纯度锶同位素可作为曲率引擎等离子催化剂。",
    planetId: "earth",
    xpReward: 500,
  },
};

/** Alien Fauna & Mob Archetypes */
export interface AlienArchetype {
  id: string;
  name: string;
  faction: "friendly" | "hostile";
  maxHp: number;
  speed: number;
  attackRange: number;
  attackDamage: number;
  attackKind: "melee_leap" | "acid_spit" | "laser_drone";
  modelUrl: string;
}

export const ALIEN_ROSTER: Record<string, AlienArchetype> = {
  blerk: {
    id: "blerk",
    name: "Blerk (外星向导)",
    faction: "friendly",
    maxHp: 200,
    speed: 6.5,
    attackRange: 0,
    attackDamage: 0,
    attackKind: "melee_leap",
    modelUrl: "/assets/alien-blerk.glb",
  },
  another_alien: {
    id: "another_alien",
    name: "异星潜行者 (Another Alien)",
    faction: "hostile",
    maxHp: 80,
    speed: 9.2,
    attackRange: 3.5,
    attackDamage: 22,
    attackKind: "melee_leap",
    modelUrl: "/assets/alien-crawler.glb",
  },
  reptillian_alien: {
    id: "reptillian_alien",
    name: "重装蜥蜴卫士 (Reptillian Alien)",
    faction: "hostile",
    maxHp: 160,
    speed: 4.8,
    attackRange: 24,
    attackDamage: 35,
    attackKind: "acid_spit",
    modelUrl: "/assets/alien-reptillian.glb",
  },
};

/**
 * Mathematical Spherical Gravity calculation:
 * Returns the gravity acceleration vector pointing directly toward planet center.
 */
export function sphericalGravity(
  pos: Vec3,
  planet: CelestialBody,
): { gravityVec: Vec3; altitude: number; upNormal: Vec3 } {
  const dx = pos.x - planet.position.x;
  const dy = pos.y - planet.position.y;
  const dz = pos.z - planet.position.z;
  const dist = Math.hypot(dx, dy, dz) || 1;

  const nx = dx / dist;
  const ny = dy / dist;
  const nz = dz / dist;

  const altitude = dist - planet.radius;

  // Atmospheric falloff: inside atmosphere full gravity, outside tapers smoothly
  let factor = 1.0;
  if (dist > planet.atmosphereRadius) {
    const spaceDist = dist - planet.atmosphereRadius;
    factor = Math.max(0, 1.0 - spaceDist / (planet.atmosphereRadius * 0.8));
  }

  const g = planet.gravity * factor;

  return {
    gravityVec: { x: -nx * g, y: -ny * g, z: -nz * g },
    altitude,
    upNormal: { x: nx, y: ny, z: nz },
  };
}

/**
 * Spherical coordinate wrapping (Columbus "The world is round"):
 * When player moves around a sphere, wraps Great Circle coordinates seamlessly.
 */
export function projectToSphere(
  pos: Vec3,
  planet: CelestialBody,
  heightOffset = 0,
): Vec3 {
  const dx = pos.x - planet.position.x;
  const dy = pos.y - planet.position.y;
  const dz = pos.z - planet.position.z;
  const dist = Math.hypot(dx, dy, dz) || 1;
  const targetDist = planet.radius + heightOffset;

  return {
    x: planet.position.x + (dx / dist) * targetDist,
    y: planet.position.y + (dy / dist) * targetDist,
    z: planet.position.z + (dz / dist) * targetDist,
  };
}

/**
 * Dynamic Atmospheric & Deep Cosmic Fog Parameters.
 * Smoothly interpolates between atmospheric boundary haze and vacuum blackness
 * so distant planets remain crisp while ground maintains atmospheric depth.
 */
export function computeAtmosphericFog(altitude: number): { color: number; density: number } {
  const clampedAlt = Math.max(0, altitude);
  if (clampedAlt < 200) {
    return { color: 0x0c141d, density: 0.000045 };
  } else if (clampedAlt < 850) {
    const t = (clampedAlt - 200) / 650;
    const density = 0.000045 * (1 - t * 0.8);
    return { color: 0x070c14, density };
  } else {
    return { color: 0x020408, density: 0.000008 };
  }
}

/**
 * Spherical Geodesic Arc Distance:
 * Calculates the great-circle surface distance across a high-curvature sphere (e.g. Mercury radius 320m):
 * d = R * arccos(clamp(u_player · u_ship, -1, 1))
 */
export function geodesicArcDistance(
  posA: Vec3,
  posB: Vec3,
  planet: CelestialBody,
): { arcDistance: number; heightDiff: number } {
  const dxA = posA.x - planet.position.x;
  const dyA = posA.y - planet.position.y;
  const dzA = posA.z - planet.position.z;
  const distA = Math.hypot(dxA, dyA, dzA) || 1;

  const dxB = posB.x - planet.position.x;
  const dyB = posB.y - planet.position.y;
  const dzB = posB.z - planet.position.z;
  const distB = Math.hypot(dxB, dyB, dzB) || 1;

  const uAx = dxA / distA, uAy = dyA / distA, uAz = dzA / distA;
  const uBx = dxB / distB, uBy = dyB / distB, uBz = dzB / distB;

  const dot = Math.max(-1, Math.min(1, uAx * uBx + uAy * uBy + uAz * uBz));
  const arcAngle = Math.acos(dot);
  const arcDistance = planet.radius * arcAngle;
  const heightDiff = Math.abs(distA - distB);

  return { arcDistance, heightDiff };
}
