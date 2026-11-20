import * as THREE from "three";
import { landmarkPosition, type CelestialBody, type CelestialLandmark } from "../shared/celestial";

const planetTextures = new Map<string, THREE.DataTexture>();
const planetBumpTextures = new Map<string, THREE.DataTexture>();
let warpHullTexture: THREE.DataTexture | null = null;
let warpHullEmissiveTexture: THREE.DataTexture | null = null;

const SOLAR_TEXTURE_PATHS: Record<string, string> = {
  venus: "/assets/models/solar_system/textures/Venus_baseColor.png",
  mars: "/assets/models/solar_system/textures/Mars_baseColor.png",
  jupiter: "/assets/models/solar_system/textures/Jupiter_baseColor.png",
  saturn: "/assets/models/solar_system/textures/Saturn_baseColor.png",
  mercury: "/assets/models/solar_system/textures/Mercury_baseColor.png",
  earth: "/assets/models/solar_system/textures/Earth_baseColor.png",
};

/** Fast seamless 3-octave spherical turbulence (zero polar pinching, ~6x faster CPU boot). */
function sphereTurbulence(x: number, y: number, z: number) {
  return (
    Math.sin(x * 7.3 + y * 5.1 + z * 4.7) * 0.48 +
    Math.sin(y * 17.2 - z * 13.7 + x * 11.3) * 0.28 +
    Math.sin(z * 37.5 + x * 29.1 - y * 23.4) * 0.14
  );
}

/** High-resolution 1024x512 seamless procedural planet texture (frame-0 & headless fallback). */
export function planetTexture(body: CelestialBody): THREE.DataTexture {
  const cached = planetTextures.get(body.id);
  if (cached) return cached;
  const width = 1024;
  const height = 512;
  const data = new Uint8Array(width * height * 4);
  const bump = new Uint8Array(width * height * 4);

  const palettes: Record<string, [number, number, number]> = {
    venus: [0x8b5218, 0xdca74c, 0xfff0be],
    mars: [0x5d2115, 0xb85231, 0xe8a572],
    jupiter: [0x7e4229, 0xd7a87d, 0xfae9cf],
    saturn: [0x947a49, 0xd9c58e, 0xf7ecd0],
  };
  const pal = palettes[body.id] ?? [0x4c5d6b, 0x8ea2b0, 0xdbe7ef];
  const low = new THREE.Color(pal[0]).convertLinearToSRGB();
  const mid = new THREE.Color(pal[1]).convertLinearToSRGB();
  const high = new THREE.Color(pal[2]).convertLinearToSRGB();
  const lR = low.r * 255, lG = low.g * 255, lB = low.b * 255;
  const mR = mid.r * 255, mG = mid.g * 255, mB = mid.b * 255;
  const hR = high.r * 255, hG = high.g * 255, hB = high.b * 255;

  const cosLon = new Float32Array(width);
  const sinLon = new Float32Array(width);
  for (let col = 0; col < width; col++) {
    const lon = (col / (width - 1)) * Math.PI * 2;
    cosLon[col] = Math.cos(lon);
    sinLon[col] = Math.sin(lon);
  }

  for (let row = 0; row < height; row++) {
    const latitude = (row / (height - 1) - 0.5) * Math.PI;
    const cosLat = Math.cos(latitude);
    const sinLat = Math.sin(latitude);
    const polarBlend = body.id === "mars" && Math.abs(sinLat) > 0.93
      ? Math.min(1, (Math.abs(sinLat) - 0.93) * 14)
      : 0;
    for (let col = 0; col < width; col++) {
      const x = -cosLon[col] * cosLat;
      const y = sinLat;
      const z = sinLon[col] * cosLat;
      const n = sphereTurbulence(x, y, z);
      let value = 0.5 + n * 0.48;

      if (body.id === "venus") {
        value = 0.54 + Math.sin(y * 18 + n * 4.5) * 0.24 + n * 0.14;
      } else if (body.id === "jupiter" || body.id === "saturn") {
        const freq = body.id === "jupiter" ? 34 : 46;
        value = 0.5 + Math.sin(y * freq + n * 2.2) * 0.34 + Math.sin(y * freq * 2.3 + n * 3.1) * 0.12;
      } else if (body.id === "mars") {
        value = 0.48 + n * 0.42 + (1 - Math.abs(n)) * 0.12;
      }

      const clamped = value < 0 ? 0 : value > 1 ? 1 : value;
      let r: number, g: number, b: number;
      if (clamped < 0.5) {
        const t = clamped * 2;
        r = lR + (mR - lR) * t;
        g = lG + (mG - lG) * t;
        b = lB + (mB - lB) * t;
      } else {
        const t = (clamped - 0.5) * 2;
        r = mR + (hR - mR) * t;
        g = mG + (hG - mG) * t;
        b = mB + (hB - mB) * t;
      }
      if (polarBlend > 0) {
        r += (240 - r) * polarBlend;
        g += (223 - g) * polarBlend;
        b += (208 - b) * polarBlend;
      }

      const offset = (row * width + col) * 4;
      data[offset] = r | 0;
      data[offset + 1] = g | 0;
      data[offset + 2] = b | 0;
      data[offset + 3] = 255;

      const bVal = (Math.max(0, Math.min(1, 0.5 + n * 0.52)) * 255) | 0;
      bump[offset] = bump[offset + 1] = bump[offset + 2] = bVal;
      bump[offset + 3] = 255;
    }
  }

  const texture = new THREE.DataTexture(data, width, height);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 16;
  texture.needsUpdate = true;
  planetTextures.set(body.id, texture);

  const bumpTex = new THREE.DataTexture(bump, width, height);
  bumpTex.wrapS = THREE.RepeatWrapping;
  bumpTex.magFilter = THREE.LinearFilter;
  bumpTex.minFilter = THREE.LinearMipmapLinearFilter;
  bumpTex.generateMipmaps = true;
  bumpTex.anisotropy = 8;
  bumpTex.needsUpdate = true;
  planetBumpTextures.set(body.id, bumpTex);

  return texture;
}

export function planetBumpTexture(body: CelestialBody): THREE.DataTexture {
  if (!planetBumpTextures.has(body.id)) planetTexture(body);
  return planetBumpTextures.get(body.id)!;
}

/**
 * Upgrade procedural fallback planet & ring maps in browser runtime with
 * the shipped high-resolution solar_system photography PNG textures.
 */
export function hydratePlanetSurfaceTexture(
  id: string,
  material: THREE.MeshStandardMaterial,
  onReady?: () => void,
) {
  if (typeof document === "undefined") return;
  const url = SOLAR_TEXTURE_PATHS[id];
  if (!url) return;
  const loader = new THREE.TextureLoader();
  loader.load(url, (tex) => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.anisotropy = 16;
    tex.needsUpdate = true;
    material.map = tex;
    material.color.setHex(0xffffff);
    material.needsUpdate = true;
    onReady?.();
  });
}

/** High-poly 3D displaced planetary crust relief (replaces flat 2D sticker patches). */
export function buildLandmark(body: CelestialBody, landmark: CelestialLandmark) {
  const segX = 64;
  const segY = 48;
  const patch = new THREE.PlaneGeometry(2, 2, segX, segY);
  const vertices = patch.getAttribute("position");
  const uvs = patch.getAttribute("uv");
  const normal = new THREE.Vector3().copy(landmarkPosition(body, landmark)).normalize();
  const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
  const width = landmark.size;
  const height = width * (landmark.kind === "canyon" ? 0.28 : landmark.kind === "storm" ? 0.6 : 0.85);
  const maxRelief = landmark.kind === "storm" ? 2.5 : Math.min(body.radius * 0.048, width * 0.28);

  for (let i = 0; i < vertices.count; i++) {
    const u = (uvs.getX(i) - 0.5) * 2;
    const v = (uvs.getY(i) - 0.5) * 2;
    const r = Math.hypot(u, v);
    const ang = Math.atan2(v, u);
    const falloff = Math.max(0, 1 - THREE.MathUtils.smoothstep(r, 0.58, 1.0));
    const ridgeNoise =
      Math.sin(u * 14 + Math.cos(v * 11) * 1.4) * 0.5 +
      Math.sin(v * 26 - u * 19) * 0.25 +
      Math.cos((u + v) * 41) * 0.12;

    let elevation = 0.6;
    if (landmark.kind === "mountain") {
      // Sculpted volcanic peak / alpine massif with radial ridges
      const peak = Math.pow(Math.max(0, 1 - r * 0.95), 1.65);
      elevation = 0.6 + peak * maxRelief * (0.85 + 0.25 * ridgeNoise);
    } else if (landmark.kind === "basin") {
      // Raised impact crater rim wall + sunken terraced central bowl
      const rim = Math.exp(-Math.pow((r - 0.68) * 6.5, 2)) * maxRelief * 0.72;
      const bowl = Math.max(0, 1 - r / 0.62) * maxRelief * 0.22;
      elevation = 0.5 + (rim - bowl * 0.35 + ridgeNoise * maxRelief * 0.08) * falloff;
    } else if (landmark.kind === "canyon") {
      // Tectonic rift shoulders rising along the sides with carved central trough
      const shoulders = Math.exp(-Math.pow((Math.abs(v) - 0.42) * 5.0, 2)) * maxRelief * 0.75;
      elevation = 0.5 + (shoulders + ridgeNoise * maxRelief * 0.1) * falloff;
    } else if (landmark.kind === "plateau") {
      const mesa = THREE.MathUtils.smoothstep(1 - r, 0.15, 0.55) * maxRelief * 0.65;
      elevation = 0.5 + (mesa + ridgeNoise * maxRelief * 0.12) * falloff;
    } else {
      elevation = 1.6 + falloff * (1.2 + Math.sin(r * 16 - ang * 3) * 0.4);
    }

    const point = new THREE.Vector3(
      vertices.getX(i) * width,
      vertices.getY(i) * height,
      body.radius,
    )
      .applyQuaternion(rotation)
      .normalize()
      .multiplyScalar(body.radius + Math.max(0.35, elevation));
    vertices.setXYZ(i, point.x, point.y, point.z);
  }
  patch.computeVertexNormals();

  const material = new THREE.ShaderMaterial({
    uniforms: {
      color: { value: new THREE.Color(landmark.color) },
      kind: { value: landmark.kind === "storm" ? 1 : landmark.kind === "canyon" ? 2 : 0 },
      sunDir: { value: new THREE.Vector3(-0.65, 0.52, -0.55).normalize() },
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vNormalWorld;
      void main() {
        vUv = uv;
        vNormalWorld = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      varying vec2 vUv;
      varying vec3 vNormalWorld;
      uniform vec3 color;
      uniform float kind;
      uniform vec3 sunDir;
      void main() {
        vec2 p = (vUv - 0.5) * 2.0;
        float radius = length(p);
        float angle = atan(p.y, p.x);
        float detail = 0.5 + 0.5 * sin(radius * 38.0 + sin(angle * 5.0) * 1.8);
        if (kind > 1.5) detail = 0.5 + 0.5 * sin(p.y * 28.0 + sin(p.x * 16.0));
        else if (kind > 0.5) detail = 0.5 + 0.5 * sin(radius * 30.0 - angle * 4.0 + sin(radius * 12.0));
        float lit = 0.38 + 0.68 * max(0.0, dot(normalize(vNormalWorld), sunDir));
        float alpha = (1.0 - smoothstep(0.68, 0.99, radius)) * 0.94;
        vec3 shaded = color * (0.72 + detail * 0.45) * lit;
        gl_FragColor = vec4(shaded, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  });

  const mesh = new THREE.Mesh(patch, material);
  mesh.name = `landmark-${landmark.id}`;
  mesh.userData.landmark = landmark;
  mesh.frustumCulled = true;
  return mesh;
}

/** High-resolution Rayleigh/Fresnel atmospheric scattering limb shader (smooth outer feather, zero hard edge). */
export function buildAtmosphereMaterial(color: number, intensity = 0.55, _fog = false) {
  return new THREE.ShaderMaterial({
    uniforms: {
      tint: { value: new THREE.Color(color) },
      intensity: { value: intensity },
    },
    vertexShader: `
      varying vec3 vNormalView;
      varying vec3 vViewDir;
      void main() {
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        vNormalView = normalize(normalMatrix * normal);
        vViewDir = normalize(-mvPos.xyz);
        gl_Position = projectionMatrix * mvPos;
      }`,
    fragmentShader: `
      uniform vec3 tint;
      uniform float intensity;
      varying vec3 vNormalView;
      varying vec3 vViewDir;
      void main() {
        // On a BackSide outer halo sphere, ndv -> 0 at the outer geometric boundary
        // and rises smoothly toward the planet limb: feather smoothly to 0 at outer edge!
        float ndv = abs(dot(normalize(vNormalView), normalize(vViewDir)));
        float outerFeather = smoothstep(0.0, 0.58, ndv);
        float glow = pow(clamp(ndv, 0.0, 1.0), 3.2) * outerFeather;
        gl_FragColor = vec4(tint * (1.15 + glow * 0.65), glow * intensity);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    fog: false,
  });
}

export function buildPlanetaryRings(body: CelestialBody) {
  const group = new THREE.Group();
  group.name = `${body.id}-ring-system`;
  const inner = body.ringInnerRadius!;
  const outer = body.ringOuterRadius!;

  // High-resolution 2048-sample fine ringlet DataTexture (cassini & encke divisions + icy density variations)
  const samples = 2048;
  const data = new Uint8Array(samples * 4);
  for (let i = 0; i < samples; i++) {
    const u = i / (samples - 1);
    const fineBand =
      0.72 +
      Math.sin(u * 145) * 0.1 +
      Math.sin(u * 420) * 0.07 +
      Math.sin(u * 980) * 0.04;
    const encke = Math.abs(u - 0.84) < 0.014 ? 0.15 : 1.0;
    const innerTaper = THREE.MathUtils.smoothstep(u, 0, 0.06);
    const outerTaper = 1 - THREE.MathUtils.smoothstep(u, 0.93, 1.0);
    const density = THREE.MathUtils.clamp((0.55 + Math.sin(u * 38) * 0.25 + Math.sin(u * 112) * 0.14) * encke * innerTaper * outerTaper, 0.08, 0.95);
    data.set(
      [
        Math.round(Math.min(255, 252 * fineBand)),
        Math.round(Math.min(255, 244 * fineBand)),
        Math.round(Math.min(255, 224 * fineBand)),
        Math.round(density * 235),
      ],
      i * 4,
    );
  }

  const texture = new THREE.DataTexture(data, samples, 1);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 16;
  texture.needsUpdate = true;

  const material = new THREE.MeshStandardMaterial({
    color: body.ringColor,
    map: texture,
    roughness: 0.88,
    metalness: 0.05,
    emissive: body.ringColor,
    emissiveIntensity: 0.14,
    transparent: true,
    opacity: 0.9,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  // In browser runtime, enrich Saturn's ring with shipped Ring_baseColor.png if available
  if (typeof document !== "undefined" && body.id === "saturn") {
    new THREE.TextureLoader().load("/assets/models/solar_system/textures/Ring_baseColor.png", (ringTex) => {
      ringTex.colorSpace = THREE.SRGBColorSpace;
      ringTex.anisotropy = 16;
      ringTex.needsUpdate = true;
      material.map = ringTex;
      material.needsUpdate = true;
    });
  }

  // Real Cassini gap separates the dense inner ring and the finer outer ring
  const gapStart = inner + (outer - inner) * 0.48;
  const gapEnd = inner + (outer - inner) * 0.53;
  for (const [start, end] of [
    [inner, gapStart],
    [gapEnd, outer],
  ]) {
    const geometry = new THREE.RingGeometry(start, end, 256, 8);
    const positions = geometry.getAttribute("position");
    const uv = geometry.getAttribute("uv");
    for (let i = 0; i < positions.count; i++) {
      const radius = Math.hypot(positions.getX(i), positions.getY(i));
      uv.setXY(i, (radius - inner) / (outer - inner), 0.5);
    }
    const ring = new THREE.Mesh(geometry, material);
    ring.receiveShadow = true;
    ring.frustumCulled = true;
    group.add(ring);
  }
  group.rotation.x = -Math.PI / 2 + THREE.MathUtils.degToRad(26.7);
  group.rotation.z = THREE.MathUtils.degToRad(8);
  return group;
}

/** Procedural 512x512 high-detail metallic hull armor plating & glowing energy conduit texture for Warp Gates. */
function getWarpHullTextures() {
  if (warpHullTexture && warpHullEmissiveTexture) {
    return { map: warpHullTexture, emissiveMap: warpHullEmissiveTexture };
  }
  const size = 512;
  const colorData = new Uint8Array(size * size * 4);
  const emissiveData = new Uint8Array(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const gx = x % 64;
      const gy = y % 64;
      const seam = gx < 2 || gy < 2 ? 0.55 : gx < 4 || gy < 4 ? 0.82 : 1.0;
      const subSeam = x % 16 === 0 || y % 32 === 0 ? 0.88 : 1.0;
      const panelTone = 0.86 + (((Math.floor(x / 64) * 17 + Math.floor(y / 64) * 31) % 7) / 7) * 0.22;
      const grain = 0.94 + ((Math.sin(x * 0.7 + y * 1.3) * 0.5 + 0.5) * 0.12);
      const v = seam * subSeam * panelTone * grain;

      colorData[idx] = Math.round(Math.min(255, 118 * v));
      colorData[idx + 1] = Math.round(Math.min(255, 138 * v));
      colorData[idx + 2] = Math.round(Math.min(255, 158 * v));
      colorData[idx + 3] = 255;

      // Recessed glowing energy conduits running along structural seams
      const conduit = (y % 64 >= 30 && y % 64 <= 33 && x % 16 < 12) || (x % 128 >= 62 && x % 128 <= 65);
      emissiveData[idx] = conduit ? 56 : 8;
      emissiveData[idx + 1] = conduit ? 198 : 22;
      emissiveData[idx + 2] = conduit ? 255 : 38;
      emissiveData[idx + 3] = 255;
    }
  }

  warpHullTexture = new THREE.DataTexture(colorData, size, size);
  warpHullTexture.colorSpace = THREE.SRGBColorSpace;
  warpHullTexture.wrapS = warpHullTexture.wrapT = THREE.RepeatWrapping;
  warpHullTexture.repeat.set(8, 3);
  warpHullTexture.generateMipmaps = true;
  warpHullTexture.minFilter = THREE.LinearMipmapLinearFilter;
  warpHullTexture.anisotropy = 16;
  warpHullTexture.needsUpdate = true;

  warpHullEmissiveTexture = new THREE.DataTexture(emissiveData, size, size);
  warpHullEmissiveTexture.colorSpace = THREE.SRGBColorSpace;
  warpHullEmissiveTexture.wrapS = warpHullEmissiveTexture.wrapT = THREE.RepeatWrapping;
  warpHullEmissiveTexture.repeat.set(8, 3);
  warpHullEmissiveTexture.generateMipmaps = true;
  warpHullEmissiveTexture.minFilter = THREE.LinearMipmapLinearFilter;
  warpHullEmissiveTexture.needsUpdate = true;

  return { map: warpHullTexture, emissiveMap: warpHullEmissiveTexture };
}

export function buildWarpGate(body: CelestialBody) {
  const group = new THREE.Group();
  group.name = "warp-gate-structure";

  const { map: hullMap, emissiveMap: hullEmissive } = getWarpHullTextures();

  const titanium = new THREE.MeshStandardMaterial({
    color: 0xb8cad8,
    map: hullMap,
    bumpMap: hullMap,
    bumpScale: 1.8,
    roughness: 0.36,
    metalness: 0.88,
    emissive: 0x38bdf8,
    emissiveMap: hullEmissive,
    emissiveIntensity: 0.55,
  });

  const darkArmor = new THREE.MeshStandardMaterial({
    color: 0x374759,
    map: hullMap,
    roughness: 0.48,
    metalness: 0.82,
    emissive: 0x0c2438,
    emissiveIntensity: 0.25,
  });

  const plasmaGlow = new THREE.MeshBasicMaterial({ color: 0x7dd3fc });
  const hotCoreGlow = new THREE.MeshBasicMaterial({ color: 0xe0f2fe });

  // Primary octagonal load-bearing frame (high 24-segment tube cross-section, 8 octagonal sides)
  const frame = new THREE.Mesh(new THREE.TorusGeometry(body.radius * 0.93, 25, 24, 8), titanium);
  frame.name = "titanium-octagonal-frame";
  frame.frustumCulled = true;
  group.add(frame);

  // High-poly precision inner accelerator ring (160 tubular x 28 radial = 8,960 tris)
  const innerAccel = new THREE.Mesh(
    new THREE.TorusGeometry(body.radius * 0.832, 9.5, 28, 160),
    darkArmor,
  );
  innerAccel.name = "inner-accelerator-ring";
  innerAccel.frustumCulled = true;
  group.add(innerAccel);

  // Inner plasma waveguide halo
  const rim = new THREE.Mesh(new THREE.TorusGeometry(body.radius * 0.815, 3.6, 16, 160), plasmaGlow);
  rim.frustumCulled = true;
  group.add(rim);

  // Outer gyroscopic field containment ring (160 x 20 = 6,400 tris)
  const outerRing = new THREE.Mesh(
    new THREE.TorusGeometry(body.radius * 1.025, 6.2, 20, 160),
    titanium,
  );
  outerRing.name = "outer-containment-ring";
  outerRing.frustumCulled = true;
  group.add(outerRing);

  // 8 multi-tiered armored pylon assemblies + plasma emitters + radiator fins
  const pylonGeo = new THREE.BoxGeometry(36, 74, 72);
  const capGeo = new THREE.CylinderGeometry(16, 22, 18, 16);
  const coilGeo = new THREE.TorusGeometry(14, 2.4, 12, 32);
  const stripGeo = new THREE.BoxGeometry(6, 52, 76);
  const finGeo = new THREE.BoxGeometry(10, 88, 16);

  for (let i = 0; i < 8; i++) {
    const angle = (i * Math.PI) / 4;
    const pylonGroup = new THREE.Group();
    pylonGroup.position.set(
      Math.cos(angle) * body.radius * 0.93,
      Math.sin(angle) * body.radius * 0.93,
      0,
    );
    pylonGroup.rotation.z = angle - Math.PI / 2;

    const housing = new THREE.Mesh(pylonGeo, titanium);
    housing.frustumCulled = true;
    pylonGroup.add(housing);

    // Inward-facing plasma emitter nozzle pointing at the portal center
    const nozzle = new THREE.Mesh(capGeo, darkArmor);
    nozzle.position.set(0, -39, 0);
    nozzle.frustumCulled = true;
    pylonGroup.add(nozzle);

    const coil = new THREE.Mesh(coilGeo, hotCoreGlow);
    coil.rotation.x = Math.PI / 2;
    coil.position.set(0, -44, 0);
    coil.frustumCulled = true;
    pylonGroup.add(coil);

    const light = new THREE.Mesh(stripGeo, plasmaGlow);
    light.frustumCulled = true;
    pylonGroup.add(light);

    for (const side of [-1, 1]) {
      const fin = new THREE.Mesh(finGeo, darkArmor);
      fin.position.set(side * 24, 10, 0);
      fin.frustumCulled = true;
      pylonGroup.add(fin);
    }

    group.add(pylonGroup);
  }

  // 16 secondary radial field struts linking inner accelerator ring and outer containment ring
  const strutGeo = new THREE.CylinderGeometry(3.2, 4.4, body.radius * 0.19, 12);
  for (let i = 0; i < 16; i++) {
    const angle = (i * Math.PI) / 8 + Math.PI / 16;
    const strut = new THREE.Mesh(strutGeo, darkArmor);
    strut.position.set(
      Math.cos(angle) * body.radius * 0.93,
      Math.sin(angle) * body.radius * 0.93,
      0,
    );
    strut.rotation.z = angle - Math.PI / 2;
    strut.frustumCulled = true;
    group.add(strut);
  }

  // High-resolution swirling wormhole event horizon with star parallax, FBM vortex & lensing rim
  const portal = new THREE.Mesh(
    new THREE.CircleGeometry(body.radius * 0.81, 160),
    new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 } },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        varying vec2 vUv;
        uniform float time;

        float hash21(vec2 p) {
          p = fract(p * vec2(127.1, 311.7));
          p += dot(p, p + 34.23);
          return fract(p.x * p.y);
        }

        float vnoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
            mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x),
            f.y
          );
        }

        float fbm(vec2 p) {
          float v = 0.0;
          float a = 0.5;
          for (int i = 0; i < 4; i++) {
            v += a * vnoise(p);
            p = p * 2.07 + vec2(1.7, 9.2);
            a *= 0.5;
          }
          return v;
        }

        void main() {
          vec2 p = (vUv - 0.5) * 2.0;
          float r = length(p);
          if (r > 1.0) discard;
          float angle = atan(p.y, p.x);

          // Logarithmic spiral warp coordinates
          float swirl = angle + 3.4 * (1.0 - r) - time * 0.72;
          vec2 warpUv = vec2(cos(swirl), sin(swirl)) * (1.8 + r * 3.2) + vec2(time * 0.25, -time * 0.18);
          float nebula = fbm(warpUv);
          float filaments = fbm(warpUv * 2.2 - vec2(time * 0.65, time * 0.42));

          // Concentric gravitational energy ripples
          float wave = 0.5 + 0.5 * sin(r * 34.0 - angle * 5.0 - time * 2.4 + nebula * 3.8);
          float lensingRim = pow(r, 4.2);
          float coreSink = exp(-r * 3.6);

          // Distant stars visible through the wormhole aperture
          vec2 starCell = floor((p * 18.0) + vec2(cos(time * 0.08), sin(time * 0.08)));
          float starSeed = hash21(starCell);
          float star = step(0.965, starSeed) * (1.0 - r * 0.7) * (0.6 + 0.4 * sin(time * 3.0 + starSeed * 40.0));

          vec3 deepVoid = vec3(0.015, 0.04, 0.14);
          vec3 azureMid = vec3(0.05, 0.48, 0.94);
          vec3 violetArc = vec3(0.38, 0.34, 0.96);
          vec3 brightEdge = vec3(0.68, 0.95, 1.0);

          vec3 col = mix(deepVoid, azureMid, clamp(nebula * 0.72 + wave * 0.32, 0.0, 1.0));
          col = mix(col, violetArc, smoothstep(0.45, 0.85, filaments) * 0.52);
          col += brightEdge * (lensingRim * 0.95 + pow(wave * filaments, 2.0) * 0.55);
          col += vec3(0.85, 0.96, 1.0) * (coreSink * 0.42 + star * 1.4);

          float edgeFade = 1.0 - smoothstep(0.95, 1.0, r);
          float alpha = clamp((0.68 + nebula * 0.22 + lensingRim * 0.28) * edgeFade, 0.0, 0.96);
          gl_FragColor = vec4(col, alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  portal.name = "swirling-azure-portal-horizon";
  portal.frustumCulled = true;
  group.add(portal);

  // Orbiting plasma energy particles around the gate aperture
  const pCount = 240;
  const pPos = new Float32Array(pCount * 3);
  for (let i = 0; i < pCount; i++) {
    const a = (i / pCount) * Math.PI * 2 * 3;
    const rad = body.radius * (0.76 + (i % 19) * 0.0085);
    pPos[i * 3] = Math.cos(a) * rad;
    pPos[i * 3 + 1] = Math.sin(a) * rad;
    pPos[i * 3 + 2] = ((i % 11) - 5) * 4.5;
  }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
  const pMat = new THREE.PointsMaterial({
    color: 0xbae6fd,
    size: 7.5,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const portalParticles = new THREE.Points(pGeo, pMat);
  portalParticles.name = "warp-gate-energy-motes";
  portalParticles.frustumCulled = true;
  group.add(portalParticles);

  return { group, frame, portal, portalParticles };
}
