import * as THREE from "three";
import { landmarkPosition, type CelestialBody, type CelestialLandmark } from "../shared/celestial";

const planetTextures = new Map<string, THREE.DataTexture>();

/** Seamless spherical turbulence: every octave samples the same unit sphere. */
function turbulence(x: number, y: number, z: number) {
  return Math.sin(x * 13 + Math.sin(y * 9 + z * 5)) * 0.5 +
    Math.sin(y * 31 + Math.sin(z * 18 + x * 11)) * 0.25 +
    Math.sin(z * 79 + Math.sin(x * 43 + y * 28)) * 0.125;
}

export function planetTexture(body: CelestialBody): THREE.DataTexture {
  const cached = planetTextures.get(body.id);
  if (cached) return cached;
  const width = 512, height = 256;
  const data = new Uint8Array(width * height * 4);
  const low = new THREE.Color(body.id === "venus" ? 0x966121 : body.id === "mars" ? 0x76311f :
    body.id === "jupiter" ? 0x9d583d : 0xb59b64).convertLinearToSRGB();
  const high = new THREE.Color(body.id === "venus" ? 0xffe3a0 : body.id === "mars" ? 0xdd9660 :
    body.id === "jupiter" ? 0xf5dfbb : 0xf3e3b7).convertLinearToSRGB();
  const color = new THREE.Color();
  for (let row = 0; row < height; row++) {
    const latitude = (row / (height - 1) - 0.5) * Math.PI;
    for (let col = 0; col < width; col++) {
      const longitude = col / (width - 1) * Math.PI * 2;
      const x = -Math.cos(longitude) * Math.cos(latitude);
      const y = Math.sin(latitude), z = Math.sin(longitude) * Math.cos(latitude);
      const noise = turbulence(x, y, z);
      let value = 0.5 + noise * 0.42;
      if (body.id === "venus") value = 0.6 + Math.sin(y * 19 + noise * 5) * 0.17 + noise * 0.18;
      if (body.id === "jupiter" || body.id === "saturn") {
        const bands = Math.sin(y * (body.id === "jupiter" ? 38 : 52) + noise * 1.8);
        value = 0.5 + bands * 0.3 + Math.sin(y * 110 + noise * 4) * 0.08;
      }
      color.copy(low).lerp(high, THREE.MathUtils.clamp(value, 0, 1));
      if (body.id === "mars" && Math.abs(y) > 0.96) color.lerp(new THREE.Color(0xe5c7ad), (Math.abs(y) - 0.96) * 20);
      const offset = (row * width + col) * 4;
      data[offset] = Math.round(color.r * 255);
      data[offset + 1] = Math.round(color.g * 255);
      data[offset + 2] = Math.round(color.b * 255);
      data[offset + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, width, height);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  planetTextures.set(body.id, texture);
  return texture;
}

/** Project each landmark's footprint onto the crust instead of floating a label above it. */
export function buildLandmark(body: CelestialBody, landmark: CelestialLandmark) {
  const patch = new THREE.PlaneGeometry(2, 2, 32, 20);
  const vertices = patch.getAttribute("position");
  const normal = new THREE.Vector3().copy(landmarkPosition(body, landmark)).normalize();
  const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
  const width = landmark.size;
  const height = width * (landmark.kind === "canyon" ? 0.18 : landmark.kind === "storm" ? 0.55 : 0.8);
  for (let i = 0; i < vertices.count; i++) {
    const point = new THREE.Vector3(vertices.getX(i) * width, vertices.getY(i) * height, body.radius)
      .applyQuaternion(rotation).normalize().multiplyScalar(body.radius + 0.4);
    vertices.setXYZ(i, point.x, point.y, point.z);
  }
  patch.computeVertexNormals();
  const material = new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(landmark.color) },
      kind: { value: landmark.kind === "storm" ? 1 : landmark.kind === "canyon" ? 2 : 0 } },
    vertexShader: `varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `varying vec2 vUv; uniform vec3 color; uniform float kind;
      void main() {
        vec2 p = (vUv - 0.5) * 2.0;
        float radius = length(p);
        float angle = atan(p.y, p.x);
        float ridge = 0.5 + 0.5 * sin(radius * 32.0 + sin(angle * 4.0) * 1.5);
        if (kind > 1.5) ridge = 0.5 + 0.5 * sin(p.y * 25.0 + sin(p.x * 14.0));
        else if (kind > 0.5) ridge = 0.5 + 0.5 * sin(radius * 28.0 - angle * 3.0);
        float alpha = (1.0 - smoothstep(0.72, 1.0, radius)) * 0.9;
        gl_FragColor = vec4(color * (0.65 + ridge * 0.7), alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1,
  });
  const mesh = new THREE.Mesh(patch, material);
  mesh.name = `landmark-${landmark.id}`;
  mesh.userData.landmark = landmark;
  return mesh;
}

export function buildPlanetaryRings(body: CelestialBody) {
  const group = new THREE.Group();
  group.name = `${body.id}-ring-system`;
  const inner = body.ringInnerRadius!, outer = body.ringOuterRadius!;
  const data = new Uint8Array(512 * 4);
  for (let i = 0; i < 512; i++) {
    const band = 0.7 + Math.sin(i * 0.63) * 0.12 + Math.sin(i * 2.3) * 0.09;
    data.set([255 * band, 249 * band, 224 * band, 160 + Math.sin(i * 0.35) * 55], i * 4);
  }
  const texture = new THREE.DataTexture(data, 512, 1);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  const material = new THREE.MeshStandardMaterial({
    color: body.ringColor, map: texture, roughness: 1, emissive: body.ringColor,
    emissiveIntensity: 0.12, transparent: true, opacity: 0.85,
    side: THREE.DoubleSide, depthWrite: false,
  });
  // A real gap separates the dense inner ring and the finer outer ring.
  const gapStart = inner + (outer - inner) * 0.48;
  const gapEnd = inner + (outer - inner) * 0.53;
  for (const [start, end] of [[inner, gapStart], [gapEnd, outer]]) {
    const geometry = new THREE.RingGeometry(start, end, 192, 4);
    const positions = geometry.getAttribute("position"), uv = geometry.getAttribute("uv");
    for (let i = 0; i < positions.count; i++) {
      const radius = Math.hypot(positions.getX(i), positions.getY(i));
      uv.setXY(i, (radius - inner) / (outer - inner), 0.5);
    }
    const ring = new THREE.Mesh(geometry, material);
    ring.receiveShadow = true;
    group.add(ring);
  }
  group.rotation.x = -Math.PI / 2 + THREE.MathUtils.degToRad(26.7);
  group.rotation.z = THREE.MathUtils.degToRad(8);
  return group;
}

export function buildWarpGate(body: CelestialBody) {
  const group = new THREE.Group();
  group.name = "warp-gate-structure";
  const titanium = new THREE.MeshStandardMaterial({ color: 0x8294a3, roughness: 0.42, metalness: 0.9,
    emissive: 0x152c40, emissiveIntensity: 0.3 });
  // An octagonal load-bearing frame surrounds a circular, traversable horizon.
  const frame = new THREE.Mesh(new THREE.TorusGeometry(body.radius * 0.91, 27, 6, 8), titanium);
  frame.name = "titanium-octagonal-frame";
  group.add(frame);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(body.radius * 0.82, 4, 8, 128),
    new THREE.MeshBasicMaterial({ color: 0x6bdcff }));
  group.add(rim);
  for (let i = 0; i < 8; i++) {
    const angle = i * Math.PI / 4;
    const anchor = new THREE.Mesh(new THREE.BoxGeometry(35, 65, 70), titanium);
    anchor.position.set(Math.cos(angle) * body.radius * 0.91, Math.sin(angle) * body.radius * 0.91, 0);
    anchor.rotation.z = angle - Math.PI / 2;
    group.add(anchor);
    const light = new THREE.Mesh(new THREE.BoxGeometry(7, 38, 72), rim.material);
    light.position.copy(anchor.position);
    light.rotation.copy(anchor.rotation);
    group.add(light);
  }
  const portal = new THREE.Mesh(new THREE.CircleGeometry(body.radius * 0.81, 128), new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 } },
    vertexShader: `varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `varying vec2 vUv; uniform float time;
      void main() {
        vec2 p = (vUv - 0.5) * 2.0;
        float radius = length(p);
        float angle = atan(p.y, p.x);
        float curl = sin(radius * 33.0 - angle * 4.0 - time * 1.6 + sin(angle * 3.0 + radius * 9.0));
        float waves = 0.5 + 0.5 * curl;
        float edge = pow(radius, 5.0);
        vec3 azure = mix(vec3(0.005, 0.025, 0.12), vec3(0.03, 0.5, 0.95), waves * 0.65 + edge * 0.35);
        azure += vec3(0.25, 0.65, 0.8) * edge;
        gl_FragColor = vec4(azure, (0.58 + waves * 0.25) * (1.0 - smoothstep(0.98, 1.0, radius)));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  }));
  portal.name = "swirling-azure-portal-horizon";
  group.add(portal);
  return { group, frame, portal };
}
