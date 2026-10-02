import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const titleEl = document.getElementById('title') as HTMLElement;
const subtitleEl = document.getElementById('subtitle') as HTMLElement;
const statsEl = document.getElementById('stats') as HTMLElement;
const badgeEl = document.getElementById('badge') as HTMLElement;

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: true,
  powerPreference: 'high-performance',
});
renderer.setSize(1280, 720);
renderer.setPixelRatio(1);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1280 / 720, 0.1, 2000);
camera.position.set(0, 2, 6);

// Studio Lighting
const ambient = new THREE.AmbientLight(0xffffff, 0.7);
scene.add(ambient);

const keyLight = new THREE.DirectionalLight(0xfff6e5, 2.5);
keyLight.position.set(6, 10, 8);
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0xa5d8ff, 1.4);
fillLight.position.set(-8, 5, -6);
scene.add(fillLight);

const rimLight = new THREE.DirectionalLight(0x38bdf8, 1.2);
rimLight.position.set(0, -6, -8);
scene.add(rimLight);

const hemiLight = new THREE.HemisphereLight(0xe0f2fe, 0x0f172a, 0.8);
scene.add(hemiLight);

// Subtle sci-fi floor grid
const grid = new THREE.GridHelper(20, 20, 0x38bdf8, 0x1e293b);
grid.position.y = -2;
scene.add(grid);

const modelGroup = new THREE.Group();
scene.add(modelGroup);

const loader = new GLTFLoader();

declare global {
  interface Window {
    __renderModel: (key: string, title: string, subtitle: string, angleY?: number) => Promise<any>;
  }
}

window.__renderModel = async (key: string, title: string, subtitle: string, angleY: number = 0.45) => {
  titleEl.textContent = title;
  subtitleEl.textContent = subtitle;
  statsEl.textContent = "正在加载 3D 网格与纹理...";
  badgeEl.textContent = "LOADING";
  badgeEl.style.background = "rgba(234, 179, 8, 0.2)";
  badgeEl.style.color = "#facc15";
  badgeEl.style.borderColor = "rgba(234, 179, 8, 0.4)";

  // Clear previous
  while (modelGroup.children.length > 0) {
    modelGroup.remove(modelGroup.children[0]);
  }

  const gltfUrl = `/assets/models/${key}/scene.gltf`;
  const gltf = await loader.loadAsync(gltfUrl);

  let triCount = 0;
  let meshCount = 0;
  let vertCount = 0;

  gltf.scene.traverse((o: any) => {
    if (o.isMesh) {
      meshCount++;
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = false;
      if (o.geometry) {
        vertCount += o.geometry.attributes?.position?.count || 0;
        if (o.geometry.index) {
          triCount += o.geometry.index.count / 3;
        } else if (o.geometry.attributes?.position) {
          triCount += o.geometry.attributes.position.count / 3;
        }
      }
      if (o.material) {
        if (Array.isArray(o.material)) {
          o.material.forEach((m: any) => (m.needsUpdate = true));
        } else {
          o.material.needsUpdate = true;
        }
      }
    }
  });

  // Custom material hydration for models with legacy extensions or environment domes
  const texLoader = new THREE.TextureLoader();
  if (key === 'blerk') {
    const [backpackTex, gunTex, opticTex] = await Promise.all([
      texLoader.loadAsync('/assets/models/blerk/textures/blerk_backpackSG_diffuse.png'),
      texLoader.loadAsync('/assets/models/blerk/textures/gun_bodySG_diffuse.png'),
      texLoader.loadAsync('/assets/models/blerk/textures/gun_opticSG_diffuse.png'),
    ]);
    backpackTex.colorSpace = THREE.SRGBColorSpace;
    gunTex.colorSpace = THREE.SRGBColorSpace;
    opticTex.colorSpace = THREE.SRGBColorSpace;

    gltf.scene.traverse((o: any) => {
      if (o.isMesh && o.material) {
        if (o.material.name?.includes('backpack')) {
          o.material.map = backpackTex;
          o.material.color = new THREE.Color(0xffffff);
          o.material.roughness = 0.65;
          o.material.metalness = 0.1;
        } else if (o.material.name?.includes('gun_body')) {
          o.material.map = gunTex;
          o.material.color = new THREE.Color(0xffffff);
          o.material.roughness = 0.4;
          o.material.metalness = 0.6;
        } else if (o.material.name?.includes('gun_optic')) {
          o.material.map = opticTex;
          o.material.color = new THREE.Color(0xffffff);
        } else if (o.material.name?.includes('visor')) {
          o.material.color = new THREE.Color(0x38bdf8);
          o.material.emissive = new THREE.Color(0x0369a1);
          o.material.roughness = 0.1;
          o.material.metalness = 0.9;
        } else {
          o.material.map = backpackTex;
          o.material.color = new THREE.Color(0xffffff);
          o.material.roughness = 0.65;
          o.material.metalness = 0.1;
        }
        o.material.needsUpdate = true;
      }
    });
  } else if (key === 'sky') {
    const skyTex = await texLoader.loadAsync('/assets/models/sky/textures/Material__25__background_JPG_002_emissive.jpeg');
    skyTex.colorSpace = THREE.SRGBColorSpace;
    gltf.scene.traverse((o: any) => {
      if (o.isMesh) {
        o.material = new THREE.MeshBasicMaterial({
          map: skyTex,
          side: THREE.DoubleSide,
        });
        o.material.needsUpdate = true;
      }
    });
  } else if (key === 'cave') {
    gltf.scene.traverse((o: any) => {
      if (o.isMesh && o.material) {
        o.material.side = THREE.DoubleSide;
        o.material.needsUpdate = true;
      }
    });
  } else if (key === 'alien2') {
    gltf.scene.traverse((o: any) => {
      if (o.isMesh && o.material) {
        o.material.color = new THREE.Color(0x475569);
        o.material.roughness = 0.45;
        o.material.metalness = 0.25;
        o.material.needsUpdate = true;
      }
    });
  }

  // Calculate tight bounding box
  const box = new THREE.Box3().setFromObject(gltf.scene);
  const size = new THREE.Vector3();
  box.getSize(size);
  const center = new THREE.Vector3();
  box.getCenter(center);
  const maxDim = Math.max(size.x, size.y, size.z, 0.001);

  // Center model and scale to comfortable inspection unit (~3.6 units)
  const targetScale = 3.6 / maxDim;
  const pivot = new THREE.Group();
  gltf.scene.position.set(-center.x, -center.y, -center.z);
  pivot.add(gltf.scene);
  pivot.scale.setScalar(targetScale);
  pivot.rotation.y = angleY;

  modelGroup.add(pivot);

  // Position camera
  camera.position.set(2.4, 1.8, 4.8);
  camera.lookAt(0, 0, 0);

  // Render multiple passes to ensure WebGL state & pipeline sync
  for (let i = 0; i < 4; i++) {
    renderer.render(scene, camera);
  }

  const statText = `网格数: ${meshCount} | 顶点数: ${vertCount.toLocaleString()} | 三角面: ${Math.round(triCount).toLocaleString()}
原始尺寸: ${size.x.toFixed(2)}m × ${size.y.toFixed(2)}m × ${size.z.toFixed(2)}m`;
  statsEl.innerText = statText;

  badgeEl.textContent = "READY · 100% LOADED";
  badgeEl.style.background = "rgba(34, 197, 94, 0.2)";
  badgeEl.style.color = "#4ade80";
  badgeEl.style.borderColor = "rgba(34, 197, 94, 0.4)";

  return {
    key,
    title,
    subtitle,
    meshCount,
    vertCount,
    triCount: Math.round(triCount),
    size: { x: +size.x.toFixed(2), y: +size.y.toFixed(2), z: +size.z.toFixed(2) }
  };
};

console.log("Model viewer initialized and ready.");
