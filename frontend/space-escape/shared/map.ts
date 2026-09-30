/** One authored 3.58 km basin. Rendering and Rapier use the exact same triangles. */
export interface Vec {
  x: number;
  y: number;
  z: number;
}
// The v0.2 basin was 1.6 km across. This release expands the walkable square
// to 3.58 km, which is 5x the explorable area while keeping the authored route
// and mission landmarks close enough to remain readable.
export const WORLD_SIZE = 3580;
export const SEGMENTS = 512;
export const CELL = WORLD_SIZE / SEGMENTS;
export const HALF = WORLD_SIZE / 2;
export const clamp = (v: number, lo = 0, hi = 1) =>
  Math.max(lo, Math.min(hi, v));
export const smooth = (v: number) => {
  const t = clamp(v);
  return t * t * (3 - 2 * t);
};
export const distance = (
  a: { x: number; z: number },
  b: { x: number; z: number },
) => Math.hypot(a.x - b.x, a.z - b.z);
export const distance3 = (a: Vec, b: Vec) =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
export function hash(x: number, z: number) {
  const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return n - Math.floor(n);
}
export function noise(x: number, z: number) {
  const ix = Math.floor(x),
    iz = Math.floor(z),
    fx = smooth(x - ix),
    fz = smooth(z - iz);
  return (
    (hash(ix, iz) * (1 - fx) + hash(ix + 1, iz) * fx) * (1 - fz) +
    (hash(ix, iz + 1) * (1 - fx) + hash(ix + 1, iz + 1) * fx) * fz
  );
}
export const ROUTE = [
  { x: 0, z: 370, h: 8 },
  { x: 0, z: 285, h: 10 },
  { x: -40, z: 160, h: 18 },
  { x: -10, z: 95, h: 25 },
  { x: 100, z: 50, h: 34 },
  { x: 180, z: -90, h: 68 },
  { x: 130, z: -170, h: 83 },
  { x: 20, z: -235, h: 109 },
  { x: -110, z: -370, h: 260 },
];
export function routeInfo(x: number, z: number) {
  let d = Infinity,
    h = 0;
  for (let i = 0; i < ROUTE.length - 1; i++) {
    const a = ROUTE[i],
      b = ROUTE[i + 1],
      dx = b.x - a.x,
      dz = b.z - a.z;
    const t = clamp(((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz));
    const dist = Math.hypot(x - a.x - dx * t, z - a.z - dz * t);
    if (dist < d) {
      d = dist;
      h = a.h + (b.h - a.h) * smooth(t);
    }
  }
  return { d, h };
}
const hill = (
  x: number,
  z: number,
  cx: number,
  cz: number,
  sx: number,
  sz: number,
  h: number,
) => h * Math.exp(-(((x - cx) / sx) ** 2) - ((z - cz) / sz) ** 2);
export function terrainRaw(x: number, z: number) {
  const broad = noise(x * 0.005 + 12, z * 0.005 - 20),
    detail = noise(x * 0.045, z * 0.045);
  let y = 14 + 24 * broad + 5 * detail + 1.5 * noise(x * 0.16, z * 0.16);
  y += hill(x, z, -220, 240, 95, 240, 165) + hill(x, z, 180, 280, 95, 210, 142);
  y +=
    hill(x, z, -370, -50, 190, 250, 240) + hill(x, z, 420, -250, 170, 260, 295);
  y +=
    hill(x, z, -125, -425, 210, 155, 180) +
    hill(x, z, -430, -560, 115, 180, 275);
  y +=
    hill(x, z, 210, -620, 210, 100, 285) + hill(x, z, 570, 270, 150, 300, 170);
  y +=
    hill(x, z, -980, 850, 310, 520, 360) +
    hill(x, z, -420, 1260, 430, 260, 430) +
    hill(x, z, 610, 1160, 350, 310, 390) +
    hill(x, z, 1180, 540, 280, 620, 330);
  y +=
    hill(x, z, -1210, -510, 390, 310, 280) +
    hill(x, z, -860, -1190, 520, 260, 350) +
    hill(x, z, 520, -1310, 440, 250, 380) +
    hill(x, z, 1280, -570, 290, 520, 320);
  y +=
    45 *
    (1 - Math.abs(noise(x * 0.012 + 4, z * 0.012) * 2 - 1)) *
    smooth((Math.hypot(x, z) - 220) / 400);
  // Broad biome signatures make the added land readable from the air instead
  // of turning the extra area into a uniform procedural carpet.
  const northSnow = smooth((z - 520) / 420);
  const westRed = smooth((-x - 520) / 520) * smooth((-z - 60) / 620);
  const eastIce = smooth((x - 520) / 560) * smooth((z + 180) / 720);
  y += northSnow * (18 * noise(x * 0.008, z * 0.008) + 8);
  y += westRed * (12 * noise(x * 0.014, z * 0.014) - 3);
  y += eastIce * (22 * noise(x * 0.006, z * 0.006) + 6);
  // A crater to the west rewards leaving the main path with an energy-rich rim.
  const crater = Math.hypot((x + 310) * 0.95, z + 210);
  y +=
    28 * Math.exp(-(((crater - 100) / 24) ** 2)) -
    38 * Math.exp(-((crater / 74) ** 4));
  const route = routeInfo(x, z),
    blend = 1 - smooth((route.d - 17) / 48);
  y += (1 - blend) * 17 * (noise(x * 0.038 + 27, z * 0.038) - 0.5);
  y = y * (1 - blend) + (route.h + detail * 0.8) * blend;
  // The crystal arch crosses this 22 m wide, shallow ravine; walking around remains possible.
  y -= 30 * Math.exp(-(((x - 77) / 17) ** 4) - ((z - 59) / 40) ** 4);
  const labBlend =
    1 -
    smooth((Math.max(Math.abs(x - 12) / 18, Math.abs(z - 192) / 18) - 1) / 0.7);
  y = y * (1 - labBlend) + 17.2 * labBlend;
  const grovePad = 1 - smooth((Math.hypot(x + 310, z + 210) - 25) / 18);
  y = y * (1 - grovePad) + 170 * grovePad;
  return y;
}
let terrainCache: { vertices: Float32Array; indices: Uint32Array } | undefined;
export function terrainMesh() {
  if (terrainCache) return terrainCache;
  const vertices = new Float32Array((SEGMENTS + 1) ** 2 * 3),
    indices = new Uint32Array(SEGMENTS ** 2 * 6);
  for (let iz = 0; iz <= SEGMENTS; iz++)
    for (let ix = 0; ix <= SEGMENTS; ix++) {
      const p = (iz * (SEGMENTS + 1) + ix) * 3,
        x = ix * CELL - HALF,
        z = iz * CELL - HALF;
      vertices[p] = x;
      vertices[p + 1] = terrainRaw(x, z);
      vertices[p + 2] = z;
    }
  let n = 0;
  for (let z = 0; z < SEGMENTS; z++)
    for (let x = 0; x < SEGMENTS; x++) {
      const a = z * (SEGMENTS + 1) + x,
        b = a + 1,
        c = a + SEGMENTS + 1,
        d = c + 1;
      indices.set([a, c, b, b, c, d], n);
      n += 6;
    }
  return (terrainCache = { vertices, indices });
}
export function groundAt(x: number, z: number) {
  const fx = clamp((x + HALF) / CELL, 0, SEGMENTS - 0.00001),
    fz = clamp((z + HALF) / CELL, 0, SEGMENTS - 0.00001);
  const ix = Math.floor(fx),
    iz = Math.floor(fz),
    tx = fx - ix,
    tz = fz - iz,
    v = terrainMesh().vertices;
  const a = (iz * (SEGMENTS + 1) + ix) * 3 + 1,
    b = a + 3,
    c = a + (SEGMENTS + 1) * 3,
    d = c + 3;
  return tx + tz <= 1
    ? v[a] + tx * (v[b] - v[a]) + tz * (v[c] - v[a])
    : v[d] + (1 - tx) * (v[c] - v[d]) + (1 - tz) * (v[b] - v[d]);
}
export const atGround = (x: number, z: number, offset = 0): Vec => ({
  x,
  z,
  y: groundAt(x, z) + offset,
});
export const SPAWN = atGround(0, 355, 0.85);
export const BEACON_SITES = [
  {
    ...atGround(-40, 160),
    name: "曙光之门",
    subtitle: "EARTHRISE",
    upgrade: "背包 II · 更持久的飞行",
  },
  {
    ...atGround(180, -90),
    name: "星环观测台",
    subtitle: "THE RINGS",
    upgrade: "上升气流 · 通往高地",
  },
  {
    ...atGround(-110, -370),
    name: "月升之巅",
    subtitle: "MOONRISE",
    upgrade: "星图已连接 · 自由探索",
  },
];
export const THERMALS = [
  { ...atGround(110, -170), radius: 24, height: 115 },
  { ...atGround(-20, -285), radius: 26, height: 145 },
];
export const CRYSTALS: (Vec & { id: number })[] = [];
for (let i = 0; i < ROUTE.length - 1; i++) {
  const a = ROUTE[i],
    b = ROUTE[i + 1],
    count = Math.floor(distance(a, b) / 17);
  for (let j = 1; j <= count; j++) {
    const t = j / (count + 1),
      x = a.x + (b.x - a.x) * t,
      z = a.z + (b.z - a.z) * t;
    const h = groundAt(x, z),
      arch = i === 3 ? Math.sin(t * Math.PI) * 13 + 4 : j % 4 === 0 ? 8 : 2;
    if (distance({ x, z }, SPAWN) > 9)
      CRYSTALS.push({
        id: CRYSTALS.length,
        x,
        z,
        y: Math.max(h + arch, i === 3 ? 36 : 0),
      });
  }
}
for (let i = 0; i < 16; i++) {
  const a = (i / 16) * Math.PI * 2;
  CRYSTALS.push({
    id: CRYSTALS.length,
    ...atGround(-310 + Math.cos(a) * 105, -210 + Math.sin(a) * 105, 3),
  });
}

// 1. Thermal Geyser Sky Updraft Spirals (热气流高空升腾光环)
for (const t of THERMALS) {
  for (let k = 0; k < 12; k++) {
    const ang = (k / 12) * Math.PI * 2;
    const r = t.radius * 0.72;
    CRYSTALS.push({
      id: CRYSTALS.length,
      x: t.x + Math.cos(ang) * r,
      z: t.z + Math.sin(ang) * r,
      y: t.y + 16 + k * 8.5,
    });
  }
}

// 2. Canyon Aerial Glide Arches (大峡谷滑翔与断崖飞跃抛物拱门)
for (let j = 1; j <= 10; j++) {
  const t = j / 11;
  const x = 50 + (105 - 50) * t;
  const z = 59 + Math.sin(t * Math.PI) * 12;
  const h = groundAt(x, z);
  CRYSTALS.push({
    id: CRYSTALS.length,
    x,
    z,
    y: h + 8 + Math.sin(t * Math.PI) * 18,
  });
}
for (let j = 1; j <= 8; j++) {
  const t = j / 9;
  const x = -40 + (12 - -40) * t;
  const z = 160 + (192 - 160) * t;
  const h = groundAt(x, z);
  CRYSTALS.push({
    id: CRYSTALS.length,
    x,
    z,
    y: h + 4 + Math.sin(t * Math.PI) * 14,
  });
}

// 3. High Ridge Trail (西北高山脊穿梭路线)
for (let j = 1; j <= 14; j++) {
  const t = j / 15;
  const x = -220 + (-370 - -220) * t;
  const z = 240 + (-50 - 240) * t;
  const h = groundAt(x, z);
  CRYSTALS.push({
    id: CRYSTALS.length,
    x,
    z,
    y: h + 3.5 + (j % 3 === 0 ? 6 : 0),
  });
}

// 4. Crater Orbital Rim Ring (终点陨石坑外圈双层光环)
for (let i = 0; i < 20; i++) {
  const a = (i / 20) * Math.PI * 2;
  CRYSTALS.push({
    id: CRYSTALS.length,
    ...atGround(-310 + Math.cos(a) * 155, -210 + Math.sin(a) * 155, 6),
  });
}
export const ROCKS: (Vec & { size: number; angle: number })[] = [];
for (let i = 0; i < 1400; i++) {
  const x = (hash(i, 3) * 2 - 1) * (HALF - 55),
    z = (hash(i, 9) * 2 - 1) * (HALF - 55),
    size = 1.1 + hash(i, 20) ** 3 * 12;
  if (
    routeInfo(x, z).d < 19 + size ||
    BEACON_SITES.some((b) => distance(b, { x, z }) < 28) ||
    distance({ x, z }, { x: 12, z: 192 }) < 42 ||
    distance({ x, z }, { x: -11, z: 347 }) < 35 ||
    distance({ x, z }, { x: 176, z: -68 }) < 48 ||
    distance({ x, z }, { x: -310, z: -210 }) < 48
  )
    continue;
  ROCKS.push({ ...atGround(x, z), size, angle: hash(i, 4) * Math.PI * 2 });
}
export const SCENIC_SITES = [
  { ...atGround(-470, -1010), kind: "tower" as const, scale: 1.25 },
  { ...atGround(660, 980), kind: "tower" as const, scale: 0.86 },
  { ...atGround(-1120, 580), kind: "spire" as const, scale: 1.45 },
  { ...atGround(1160, -390), kind: "spire" as const, scale: 1.1 },
  { ...atGround(890, 1260), kind: "arch" as const, scale: 1.25 },
] as const;
export function sector(z: number, x = 0) {
  if (z > 700) return "06 / 极昼雪原";
  if (x < -700 && z < 180) return "07 / 赤岩裂谷";
  if (x > 700 && z < 220) return "08 / 冰环台地";
  if (x < -200 && z < 0) return "04 / 回声陨石坑";
  if (z > 235) return "01 / 寂静峡谷";
  if (z > 35) return "02 / 曙光平原";
  if (z > -210) return "03 / 星环观测台";
  return "05 / 月升高地";
}
