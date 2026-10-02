/**
 * Celestial Bodies, Spherical Gravity, Interplanetary Spaceflight & Mineral Samples.
 * Pure mathematical and behavioral definitions, fully decoupled from DOM & WebGL.
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
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
    position: { x: 0, y: 0, z: 0 },
    color: 0x243b55,
    atmosphereColor: 0x38bdf8,
    unlocked: true,
    landingSite: { x: -11, y: 425, z: 347 },
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
  },
};

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
  | "cruiser"; // Intergalactic heavy spaceship

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
