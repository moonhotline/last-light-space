import * as THREE from "three";
import { HOME_PLANET_SPHERE } from "../shared/colliders";
import {
  clamp,
  groundAt,
  HALF,
  hash,
  noise,
  ROCKS,
  smooth,
  terrainMesh,
  THERMALS,
} from "../shared/map";
import { buildAtmosphereMaterial } from "./celestial-visuals";
import { createRadialGlowTexture } from "./asset-loader";

export const BASIC_VERTEX_SHADER = `varying vec2 vUv; varying vec3 vNormal; varying vec3 vPosition; void main(){vUv=uv;vNormal=normal;vPosition=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;

export const glowMaterial = (color: number, opacity = 0.5) =>
  new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });

export interface BasinEnvironmentResult {
  terrain: THREE.Mesh;
  rocks: THREE.InstancedMesh;
  homePlanetGroup: THREE.Group;
  cloudUniforms: { time: { value: number }; opacity: { value: number } };
  atmoUniforms: { intensity: { value: number } };
}

/** Build the playable 3.58 km basin mesh, instanced rocks, and converged spherical home planet. */
export function buildBasinEnvironment(): BasinEnvironmentResult {
  const dummy = new THREE.Object3D();
  const { vertices, indices } = terrainMesh();
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
  g.setIndex(new THREE.BufferAttribute(indices, 1));
  g.computeVertexNormals();

  const normals = g.getAttribute("normal");
  const colors = new Float32Array(vertices.length);
  const uv = new Float32Array((vertices.length / 3) * 2);
  const dark = new THREE.Color(0x364e61);
  const ice = new THREE.Color(0x9aafb5);
  const sand = new THREE.Color(0x8d9290);
  const snow = new THREE.Color(0xdce9ee);
  const redRock = new THREE.Color(0x8d4d3d);
  const blueIce = new THREE.Color(0x9fc4cf);
  const temp = new THREE.Color();

  for (let i = 0; i < vertices.length / 3; i++) {
    const x = vertices[i * 3];
    const y = vertices[i * 3 + 1];
    const z = vertices[i * 3 + 2];
    const flat = normals.getY(i);
    temp
      .copy(dark)
      .lerp(
        ice,
        smooth((flat - 0.62) / 0.37) * (0.38 + noise(x * 0.015, z * 0.015) * 0.48),
      );
    temp.lerp(sand, noise(x * 0.009 + 12, z * 0.009) * 0.22);
    temp.multiplyScalar(0.8 + noise(x * 0.11, z * 0.11) * 0.28);
    if (y > 170) temp.lerp(ice, smooth((y - 170) / 100) * Math.max(0, flat) * 0.52);
    const north = smooth((z - 520) / 420);
    const west = smooth((-x - 520) / 520) * smooth((-z - 60) / 620);
    const east = smooth((x - 520) / 560) * smooth((z + 180) / 720);
    temp.lerp(snow, north * 0.32);
    temp.lerp(redRock, west * 0.34);
    temp.lerp(blueIce, east * 0.28);
    temp.toArray(colors, i * 3);
    uv[i * 2] = x / 35;
    uv[i * 2 + 1] = z / 35;
  }
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));

  const n = 512;
  const data = new Uint8Array(n * n * 4);
  for (let z = 0; z < n; z++) {
    for (let x = 0; x < n; x++) {
      const i = (z * n + x) * 4;
      const strata = Math.sin(z * 0.14 + Math.sin(x * 0.05) * 2.2) * 14;
      const v = clamp(
        Math.round(
          128 +
            strata +
            48 * noise(x * 0.032, z * 0.032) +
            28 * noise(x * 0.12, z * 0.12) +
            18 * noise(x * 0.36, z * 0.36) +
            14 * hash(x, z),
        ),
        30,
        255,
      );
      data[i] = data[i + 1] = data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, n, n);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 16;

  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.89,
    metalness: 0.09,
    map: tex,
    bumpMap: tex,
    bumpScale: 0.28,
  });
  const terrain = new THREE.Mesh(g, mat);
  terrain.receiveShadow = true;

  const rockGeo = new THREE.IcosahedronGeometry(1, 3);
  const rp = rockGeo.getAttribute("position");
  for (let i = 0; i < rp.count; i++) {
    const x = rp.getX(i);
    const y = rp.getY(i);
    const z = rp.getZ(i);
    const k = 0.86 + noise(x * 8 + 11, z * 8 + y * 2) * 0.24;
    rp.setXYZ(i, x * k, y * k, z * k);
  }
  rockGeo.computeVertexNormals();

  const rocks = new THREE.InstancedMesh(
    rockGeo,
    new THREE.MeshStandardMaterial({
      color: 0x586977,
      roughness: 0.9,
      map: tex,
      bumpMap: tex,
      bumpScale: 0.28,
    }),
    ROCKS.length,
  );
  ROCKS.forEach((r, i) => {
    dummy.position.set(r.x, r.y + r.size * 0.3, r.z);
    dummy.scale.set(r.size, r.size * 0.8, r.size * 0.72);
    dummy.rotation.set(r.angle * 0.23, r.angle, r.angle * 0.12);
    dummy.updateMatrix();
    rocks.setMatrixAt(i, dummy.matrix);
  });
  rocks.castShadow = true;
  rocks.receiveShadow = true;

  // Converge the playable basin seamlessly into a complete high-poly spherical home planet.
  const homePlanetGroup = new THREE.Group();
  homePlanetGroup.name = "converged-home-planet";
  const { center: hpCenter, radius: hpRadius, cloudRadius: hpCloudR, atmosphereRadius: hpAtmoR } =
    HOME_PLANET_SPHERE;

  // 1. Curved planetary continental shelf bridging the square basin onto the spherical globe
  const angular = 256;
  const rings = 48;
  const skirtPos = new Float32Array((angular + 1) * (rings + 1) * 3);
  const skirtCol = new Float32Array((angular + 1) * (rings + 1) * 3);
  const skirtUv = new Float32Array((angular + 1) * (rings + 1) * 2);
  const skirtIndices: number[] = [];
  const skirtTemp = new THREE.Color();

  for (let row = 0; row <= rings; row++) {
    const u = row / rings;
    const uSmooth = u * u * (3 - 2 * u);
    for (let col = 0; col <= angular; col++) {
      const angle = (col / angular) * Math.PI * 2;
      const dx = Math.sin(angle);
      const dz = Math.cos(angle);
      const sqEdge = HALF / Math.max(Math.abs(dx), Math.abs(dz));
      const edgeX = dx * sqEdge;
      const edgeZ = dz * sqEdge;
      const edgeY = groundAt(clamp(edgeX, -HALF + 1, HALF - 1), clamp(edgeZ, -HALF + 1, HALF - 1));

      const outerR = Math.min(hpRadius * 0.94, Math.max(sqEdge + 1100, 3250));
      const r = sqEdge + (outerR - sqEdge) * Math.pow(u, 0.92);
      const x = dx * r;
      const z = dz * r;

      const sphereY = hpCenter.y + Math.sqrt(Math.max(1, hpRadius * hpRadius - r * r));
      const ridge = 1 - Math.abs(noise(x * 0.0024 + 70, z * 0.0024 - 40) * 2 - 1);
      const crag = 1 - Math.abs(noise(x * 0.008 + 12, z * 0.008) * 2 - 1);
      const mountainEnvelope = Math.sin(u * Math.PI) * (1 - u * 0.55);
      const mountainBump =
        mountainEnvelope * (75 * Math.pow(ridge, 2.4) + 28 * Math.pow(crag, 3.5));
      const y = edgeY * (1 - uSmooth) + (sphereY + 1.5) * uSmooth + mountainBump;

      const vIdx = row * (angular + 1) + col;
      const vi = vIdx * 3;
      skirtPos[vi] = x;
      skirtPos[vi + 1] = y;
      skirtPos[vi + 2] = z;
      skirtUv[vIdx * 2] = x / 35;
      skirtUv[vIdx * 2 + 1] = z / 35;

      skirtTemp.setHex(0x3a5264).lerp(new THREE.Color(0x6e8596), ridge * 0.52);
      if (z > 400) skirtTemp.lerp(new THREE.Color(0xcde0ea), smooth((z - 400) / 800) * 0.38);
      if (x < -400 && z < 200)
        skirtTemp.lerp(new THREE.Color(0x884c3d), smooth((-x - 400) / 800) * 0.34);
      if (x > 400) skirtTemp.lerp(new THREE.Color(0x8ab3c2), smooth((x - 400) / 800) * 0.28);
      skirtTemp.lerp(new THREE.Color(0x284054), uSmooth * 0.55);
      skirtTemp.toArray(skirtCol, vi);

      if (row < rings && col < angular) {
        const a = vIdx;
        const b = a + 1;
        const c = a + angular + 1;
        skirtIndices.push(a, c, b, b, c, c + 1);
      }
    }
  }

  const skirtGeo = new THREE.BufferGeometry();
  skirtGeo.setAttribute("position", new THREE.BufferAttribute(skirtPos, 3));
  skirtGeo.setAttribute("color", new THREE.BufferAttribute(skirtCol, 3));
  skirtGeo.setAttribute("uv", new THREE.BufferAttribute(skirtUv, 2));
  skirtGeo.setIndex(skirtIndices);
  skirtGeo.computeVertexNormals();

  const sNorm = skirtGeo.getAttribute("normal");
  const tmpN = new THREE.Vector3();
  const radN = new THREE.Vector3();
  for (let row = 0; row <= rings; row++) {
    const blend = Math.pow(row / rings, 1.4);
    for (let col = 0; col <= angular; col++) {
      const idx = row * (angular + 1) + col;
      tmpN.fromBufferAttribute(sNorm, idx);
      radN
        .set(
          skirtPos[idx * 3] - hpCenter.x,
          skirtPos[idx * 3 + 1] - hpCenter.y,
          skirtPos[idx * 3 + 2] - hpCenter.z,
        )
        .normalize();
      tmpN.lerp(radN, blend).normalize();
      sNorm.setXYZ(idx, tmpN.x, tmpN.y, tmpN.z);
    }
  }

  const skirtMesh = new THREE.Mesh(
    skirtGeo,
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.9,
      metalness: 0.08,
      map: tex,
      bumpMap: tex,
      bumpScale: 0.24,
    }),
  );
  skirtMesh.name = "home-planet-horizon-skirt";
  homePlanetGroup.add(skirtMesh);

  // 2. Full spherical home planet globe with multi-biome crust texture
  const globeW = 512;
  const globeH = 256;
  const globeData = new Uint8Array(globeW * globeH * 4);
  const globeBump = new Uint8Array(globeW * globeH * 4);
  const cOcean = new THREE.Color(0x162b3d).convertLinearToSRGB();
  const cSlate = new THREE.Color(0x3a5266).convertLinearToSRGB();
  const cRed = new THREE.Color(0x7c4536).convertLinearToSRGB();
  const cIce = new THREE.Color(0xcadfe8).convertLinearToSRGB();
  const gc = new THREE.Color();

  for (let row = 0; row < globeH; row++) {
    const lat = (row / (globeH - 1) - 0.5) * Math.PI;
    const cosLat = Math.cos(lat);
    const sinLat = Math.sin(lat);
    for (let col = 0; col < globeW; col++) {
      const lon = (col / (globeW - 1)) * Math.PI * 2;
      const sx = -Math.cos(lon) * cosLat;
      const sy = sinLat;
      const sz = Math.sin(lon) * cosLat;
      const cont =
        Math.sin(sx * 4.5 + sy * 3.8 + sz * 3.1) * 0.45 +
        Math.sin(sy * 11.2 - sz * 9.5 + sx * 7.8) * 0.25 +
        Math.sin(sz * 27.0 + sx * 21.0 - sy * 17.0) * 0.14;
      const elev = 0.5 + cont * 0.54;
      if (elev < 0.44) {
        gc.copy(cOcean).lerp(cSlate, clamp(elev / 0.44, 0, 1) * 0.45);
      } else if (elev < 0.72) {
        gc.copy(cSlate).lerp(cRed, clamp((sx + 0.4) * 0.65, 0, 1) * 0.45);
      } else {
        gc.copy(cSlate).lerp(cIce, clamp((elev - 0.72) / 0.28, 0, 1));
      }
      if (Math.abs(sy) > 0.78) {
        gc.lerp(cIce, clamp((Math.abs(sy) - 0.78) / 0.18, 0, 1) * 0.85);
      }
      const off = (row * globeW + col) * 4;
      globeData[off] = (gc.r * 255) | 0;
      globeData[off + 1] = (gc.g * 255) | 0;
      globeData[off + 2] = (gc.b * 255) | 0;
      globeData[off + 3] = 255;
      const bVal = (clamp(elev, 0, 1) * 255) | 0;
      globeBump[off] = globeBump[off + 1] = globeBump[off + 2] = bVal;
      globeBump[off + 3] = 255;
    }
  }
  const globeTex = new THREE.DataTexture(globeData, globeW, globeH);
  globeTex.colorSpace = THREE.SRGBColorSpace;
  globeTex.wrapS = THREE.RepeatWrapping;
  globeTex.generateMipmaps = true;
  globeTex.minFilter = THREE.LinearMipmapLinearFilter;
  globeTex.anisotropy = 16;
  globeTex.needsUpdate = true;

  const globeBumpTex = new THREE.DataTexture(globeBump, globeW, globeH);
  globeBumpTex.wrapS = THREE.RepeatWrapping;
  globeBumpTex.generateMipmaps = true;
  globeBumpTex.minFilter = THREE.LinearMipmapLinearFilter;
  globeBumpTex.needsUpdate = true;

  const planetGlobe = new THREE.Mesh(
    new THREE.SphereGeometry(hpRadius, 144, 96),
    new THREE.MeshStandardMaterial({
      map: globeTex,
      bumpMap: globeBumpTex,
      bumpScale: 12,
      roughness: 0.88,
      metalness: 0.08,
      emissive: 0x0b1926,
      emissiveIntensity: 0.22,
    }),
  );
  planetGlobe.position.set(hpCenter.x, hpCenter.y, hpCenter.z);
  planetGlobe.name = "home-planet-globe";
  homePlanetGroup.add(planetGlobe);

  // 3. Animated Orbital Cloud Deck
  const cloudUniforms = { time: { value: 0 }, opacity: { value: 0 } };
  const cloudShell = new THREE.Mesh(
    new THREE.SphereGeometry(hpCloudR, 128, 96),
    new THREE.ShaderMaterial({
      uniforms: cloudUniforms,
      vertexShader: `
        varying vec3 vUnit;
        void main() {
          vUnit = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform float time;
        uniform float opacity;
        varying vec3 vUnit;
        void main() {
          float polarClear = smoothstep(0.82, 0.52, vUnit.y);
          float swirl = sin(vUnit.x * 11.0 + time * 0.04 + sin(vUnit.z * 9.0)) * 0.5
                      + sin(vUnit.y * 19.0 + vUnit.z * 14.0 - time * 0.03) * 0.3
                      + sin(vUnit.x * 31.0 - vUnit.y * 23.0 + time * 0.06) * 0.2;
          float cloud = smoothstep(0.08, 0.72, swirl * 0.5 + 0.5);
          float alpha = cloud * opacity * (0.28 + 0.72 * polarClear);
          gl_FragColor = vec4(vec3(0.84, 0.92, 0.98), alpha);
        }`,
      transparent: true,
      depthWrite: false,
    }),
  );
  cloudShell.position.set(hpCenter.x, hpCenter.y, hpCenter.z);
  cloudShell.name = "home-planet-clouds";
  homePlanetGroup.add(cloudShell);

  // 4. Fresnel Rayleigh Atmosphere Limb Shell
  const homeAtmoMat = buildAtmosphereMaterial(0x52b6f0, 0, false);
  const atmoUniforms = homeAtmoMat.uniforms as { intensity: { value: number } };
  const homeAtmo = new THREE.Mesh(new THREE.SphereGeometry(hpAtmoR, 128, 96), homeAtmoMat);
  homeAtmo.position.set(hpCenter.x, hpCenter.y, hpCenter.z);
  homeAtmo.name = "home-planet-atmosphere";
  homePlanetGroup.add(homeAtmo);

  return { terrain, rocks, homePlanetGroup, cloudUniforms, atmoUniforms };
}

export interface CosmicSkyResult {
  skyDomeUniforms: { spaceFactor: { value: number } };
  skyStarUniforms: { time: { value: number } };
}

/** Populate the dedicated sky scene dome, starfields, distant sun, and lunar terminator mesh. */
export function buildCosmicSky(
  sky: THREE.Group,
  moon: THREE.Group,
  makeRadialTexture: () => THREE.Texture | null = createRadialGlowTexture,
): CosmicSkyResult {
  const skyDomeUniforms = { spaceFactor: { value: 0 } };
  const skyMat = new THREE.ShaderMaterial({
    uniforms: skyDomeUniforms,
    side: THREE.BackSide,
    depthWrite: false,
    vertexShader: BASIC_VERTEX_SHADER,
    fragmentShader: `
      uniform float spaceFactor;
      varying vec3 vPosition;
      float gyroid(vec3 p) {
        return dot(sin(p), cos(p.yzx));
      }
      void main() {
        vec3 d = normalize(vPosition);
        vec3 deepCosmos = vec3(0.004, 0.008, 0.018);
        float horizonBand = exp(-pow(abs(d.y) * 5.2, 1.6)) * (1.0 - spaceFactor * 0.92);
        vec3 horizonTint = vec3(0.09, 0.16, 0.24) * horizonBand;
        vec3 c = deepCosmos + horizonTint;

        vec3 galNormal = normalize(vec3(0.36, 0.62, -0.69));
        float galLat = abs(dot(d, galNormal));
        float band = exp(-pow(galLat * 4.2, 2.0));
        float g1 = gyroid(d * 5.2) * 0.35 + 0.5;
        float g2 = gyroid(d * 12.8 + vec3(1.7, -2.3, 0.9)) * 0.32 + 0.5;
        float dustRift = smoothstep(0.46, 0.82, gyroid(d * 9.4 - vec3(2.4, 1.1, 3.2)) * 0.35 + 0.5);

        vec3 galCore = mix(vec3(0.03, 0.09, 0.22), vec3(0.22, 0.14, 0.34), g1);
        vec3 galGold = vec3(0.26, 0.18, 0.11) * smoothstep(0.5, 0.88, g2);
        vec3 tealNebula = vec3(0.025, 0.16, 0.24) * smoothstep(0.55, 0.92, g1 * g2 * 1.4);
        float visibility = mix(smoothstep(-0.1, 0.22, d.y) * 0.72 + 0.28, 1.0, spaceFactor);
        c += (galCore * (0.42 + g1 * 0.88) + galGold * 0.52) * band * (1.0 - dustRift * 0.62) * visibility;
        c += tealNebula * 0.2 * visibility;

        float s = pow(max(0.0, dot(d, normalize(vec3(-0.65, 0.19, -0.5)))), 28.0);
        c += vec3(0.26, 0.15, 0.055) * s;
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(18000, 64, 48), skyMat);
  dome.renderOrder = -10;
  sky.add(dome);

  const starCount = 14000;
  const stars = new Float32Array(starCount * 3);
  const colors = new Float32Array(starCount * 3);
  const spectralColors: [number, number, number][] = [
    [0.68, 0.82, 1.0],
    [0.86, 0.92, 1.0],
    [1.0, 0.98, 0.95],
    [1.0, 0.92, 0.76],
    [1.0, 0.76, 0.54],
  ];
  const galU = new THREE.Vector3(0.86, -0.18, 0.48).normalize();
  const galV = new THREE.Vector3(-0.34, 0.75, 0.56).normalize();
  const galN = new THREE.Vector3().crossVectors(galU, galV).normalize();
  for (let i = 0; i < starCount; i++) {
    let sx: number;
    let sy: number;
    let sz: number;
    if (i < starCount * 0.42) {
      const theta = hash(i, 1) * Math.PI * 2;
      const spread = (hash(i, 2) + hash(i, 13) - 1.0) * 0.34;
      const cosS = Math.cos(spread);
      const sinS = Math.sin(spread);
      const dir = new THREE.Vector3()
        .addScaledVector(galU, Math.cos(theta) * cosS)
        .addScaledVector(galV, Math.sin(theta) * cosS)
        .addScaledVector(galN, sinS)
        .normalize();
      sx = dir.x;
      sy = dir.y;
      sz = dir.z;
    } else {
      const a = hash(i, 1) * Math.PI * 2;
      const y = hash(i, 2) * 2 - 1;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      sx = Math.cos(a) * r;
      sy = y;
      sz = Math.sin(a) * r;
    }
    const dist = 13800 + hash(i, 5) * 1400;
    const b = 0.2 + Math.pow(hash(i, 8), 5) * 1.15;
    const spec = spectralColors[Math.floor(hash(i, 17) * spectralColors.length)];
    stars.set([sx * dist, sy * dist, sz * dist], i * 3);
    colors.set([spec[0] * b, spec[1] * b, spec[2] * b], i * 3);
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute("position", new THREE.BufferAttribute(stars, 3));
  sg.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const starfield = new THREE.Points(
    sg,
    new THREE.PointsMaterial({
      size: 14,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    }),
  );
  sky.add(starfield);

  const heroCount = 900;
  const heroPos = new Float32Array(heroCount * 3);
  const heroCol = new Float32Array(heroCount * 3);
  const heroSize = new Float32Array(heroCount);
  const heroPhase = new Float32Array(heroCount);
  for (let i = 0; i < heroCount; i++) {
    const a = hash(i + 5000, 1) * Math.PI * 2;
    const y = hash(i + 5000, 2) * 2 - 1;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const dist = 13500;
    heroPos.set([Math.cos(a) * r * dist, y * dist, Math.sin(a) * r * dist], i * 3);
    const spec = spectralColors[Math.floor(hash(i + 5000, 11) * spectralColors.length)];
    const lum = 0.7 + hash(i + 5000, 14) * 0.7;
    heroCol.set([spec[0] * lum, spec[1] * lum, spec[2] * lum], i * 3);
    heroSize[i] = 2.6 + Math.pow(hash(i + 5000, 19), 2) * 4.2;
    heroPhase[i] = hash(i + 5000, 23) * Math.PI * 2;
  }
  const heroGeo = new THREE.BufferGeometry();
  heroGeo.setAttribute("position", new THREE.BufferAttribute(heroPos, 3));
  heroGeo.setAttribute("color", new THREE.BufferAttribute(heroCol, 3));
  heroGeo.setAttribute("aSize", new THREE.BufferAttribute(heroSize, 1));
  heroGeo.setAttribute("aPhase", new THREE.BufferAttribute(heroPhase, 1));
  const skyStarUniforms = { time: { value: 0 } };
  const heroStars = new THREE.Points(
    heroGeo,
    new THREE.ShaderMaterial({
      uniforms: skyStarUniforms,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
      vertexShader: `
        attribute float aSize;
        attribute float aPhase;
        uniform float time;
        varying vec3 vColor;
        varying float vTwinkle;
        void main() {
          vColor = color;
          vTwinkle = 0.78 + 0.22 * sin(time * 2.1 + aPhase);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = clamp(aSize * vTwinkle, 1.5, 9.0);
        }`,
      fragmentShader: `
        varying vec3 vColor;
        varying float vTwinkle;
        void main() {
          vec2 p = (gl_PointCoord - 0.5) * 2.0;
          float d = length(p);
          if (d > 1.0) discard;
          float core = exp(-d * d * 7.5);
          float crossSpike = (exp(-abs(p.x) * 14.0) * exp(-abs(p.y) * 2.8) + exp(-abs(p.y) * 14.0) * exp(-abs(p.x) * 2.8)) * 0.32;
          gl_FragColor = vec4(vColor * (1.2 + core * 0.8), clamp((core + crossSpike) * vTwinkle, 0.0, 1.0));
        }`,
    }),
  );
  sky.add(heroStars);

  const sun = new THREE.Mesh(
    new THREE.SphereGeometry(75, 32, 24),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(4, 3, 1.8),
      fog: false,
    }),
  );
  sun.position.set(-7800, 2250, -6200);
  sky.add(sun);

  const sunHaloTex = makeRadialTexture();
  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      ...(sunHaloTex ? { map: sunHaloTex } : {}),
      color: 0xffd39b,
      transparent: true,
      opacity: 0.52,
      depthWrite: false,
      fog: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  halo.position.copy(sun.position);
  halo.scale.set(2400, 2400, 1);
  sky.add(halo);

  moon.name = "moon-sky";
  moon.position.set(-3600, 1400, -8500);
  const texLoader = typeof document !== "undefined" ? new THREE.TextureLoader() : null;
  const moonTex = texLoader ? texLoader.load("/assets/moon.jpg") : null;
  if (moonTex) {
    moonTex.colorSpace = THREE.SRGBColorSpace;
    moonTex.anisotropy = 16;
  }
  const moonShaderUniforms = {
    map: { value: moonTex },
    hasMap: { value: moonTex ? 1.0 : 0.0 },
    sunDir: { value: new THREE.Vector3(-0.68, 0.35, -0.64).normalize() },
  };
  if (texLoader) {
    texLoader.load("/assets/models/solar_system/textures/Moon_baseColor.png", (hdMoon) => {
      hdMoon.colorSpace = THREE.SRGBColorSpace;
      hdMoon.anisotropy = 16;
      moonShaderUniforms.map.value = hdMoon;
      moonShaderUniforms.hasMap.value = 1.0;
    });
  }
  const moonMesh = new THREE.Mesh(
    new THREE.SphereGeometry(180, 96, 64),
    new THREE.ShaderMaterial({
      uniforms: moonShaderUniforms,
      fog: false,
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vNormalWorld;
        void main() {
          vUv = uv;
          vNormalWorld = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform sampler2D map;
        uniform float hasMap;
        uniform vec3 sunDir;
        varying vec2 vUv;
        varying vec3 vNormalWorld;
        void main() {
          vec3 albedo = hasMap > 0.5 ? texture2D(map, vUv).rgb : vec3(0.76, 0.78, 0.82);
          float ndl = dot(normalize(vNormalWorld), normalize(sunDir));
          float phase = smoothstep(-0.18, 0.85, ndl);
          vec3 earthshine = vec3(0.06, 0.11, 0.18) * (1.0 - phase);
          vec3 col = albedo * (0.14 + phase * 1.12) + earthshine;
          gl_FragColor = vec4(col, 1.0);
        }`,
    }),
  );
  moon.add(moonMesh);

  const moonHaloTex = makeRadialTexture();
  if (moonHaloTex) {
    const moonHalo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: moonHaloTex,
        color: 0x93c5fd,
        transparent: true,
        opacity: 0.32,
        depthWrite: false,
        fog: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    moonHalo.scale.set(1150, 1150, 1);
    moon.add(moonHalo);
  }
  sky.add(moon);

  return { skyDomeUniforms, skyStarUniforms };
}

/** Build the unlockable thermal updraft particle columns and base rings. */
export function buildThermalUpdrafts(scene: THREE.Scene): THREE.Group[] {
  const groups: THREE.Group[] = [];
  for (const t of THERMALS) {
    const g = new THREE.Group();
    g.position.set(t.x, t.y, t.z);
    const positions = new Float32Array(300 * 3);
    for (let i = 0; i < 300; i++) {
      const a = hash(i, 44) * Math.PI * 2;
      const r = hash(i, 19) * t.radius;
      positions.set([Math.cos(a) * r, hash(i, 12) * t.height, Math.sin(a) * r], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 }, height: { value: t.height } },
      vertexShader: `uniform float time;uniform float height;varying float alpha;void main(){vec3 p=position;float a=time*.4+p.y*.04;mat2 rot=mat2(cos(a),-sin(a),sin(a),cos(a));p.xz=rot*p.xz;p.y=mod(p.y+time*16.,height);alpha=sin(p.y/height*3.14159);vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp(130./max(1.,-mv.z),1.,5.);}`,
      fragmentShader: `varying float alpha;void main(){float d=length(gl_PointCoord-.5)*2.;gl_FragColor=vec4(.6,.88,1.,(1.-d)*alpha*.7);}`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    g.add(new THREE.Points(geo, mat));
    const base = new THREE.Mesh(
      new THREE.RingGeometry(t.radius - 1, t.radius, 96),
      glowMaterial(0x8cefff, 0.3),
    );
    base.rotation.x = -Math.PI / 2;
    base.position.y = 0.4;
    g.add(base);
    g.visible = false;
    groups.push(g);
    scene.add(g);
  }
  return groups;
}
