import { weatherMaterials } from "./weathering";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import {
  LAB,
  LORE,
  RESOURCE_SITES,
  OUTPOST,
  DESTINATION,
  SHIP_HOME,
} from "../shared/adventure-data";
import { groundAt, hash, type Vec } from "../shared/map";
import type { Player, Snapshot } from "../shared/types";
const v = (p: Vec) => new THREE.Vector3(p.x, p.y, p.z);
const glow = (color: number, opacity = 1) =>
  new THREE.MeshBasicMaterial({
    color,
    transparent: opacity < 1,
    opacity,
    depthWrite: opacity === 1,
  });
// Collapse static siblings by material while keeping articulation and named effects intact.
export function optimizeModel(root: THREE.Object3D) {
  for (const child of [...root.children])
    if (!(child instanceof THREE.Mesh)) optimizeModel(child);
  const groups = new Map<string, THREE.Mesh[]>();
  for (const child of root.children)
    if (
      child instanceof THREE.Mesh &&
      !Array.isArray(child.material) &&
      !child.name.startsWith("engine_glow")
    ) {
      const key =
        child.material.uuid +
        Object.keys(child.geometry.attributes).sort().join(",") +
        String(!!child.geometry.index);
      const list = groups.get(key) || [];
      list.push(child);
      groups.set(key, list);
    }
  for (const meshes of groups.values())
    if (meshes.length > 1) {
      const mat = meshes[0].material;
      const geometries = meshes.map((m) => {
        m.updateMatrix();
        return m.geometry.clone().applyMatrix4(m.matrix);
      });
      const geometry = mergeGeometries(geometries);
      geometries.forEach((g) => g.dispose());
      if (geometry) {
        const m = new THREE.Mesh(geometry, mat);
        m.castShadow = m.receiveShadow = true;
        root.add(m);
        meshes.forEach((m) => root.remove(m));
      }
    }
}
export class AdventureView {
  ship = new THREE.Group();
  nodes: THREE.Group[] = [];
  clues: THREE.Group[] = [];
  drones: THREE.Group[] = [];
  ropes = new Map<string, THREE.Line>();
  lasers = new Map<string, THREE.Line>();
  enemyLasers: THREE.Line[] = [];
  effects = new Map<string, number>();
  constructor(
    public scene: THREE.Scene,
    public burst: (p: Vec, n: number, c: number, s: number) => void,
    public sound: (n: string, p?: number) => void,
  ) {}
  async load() {
    const loader = new GLTFLoader();
    const [ship, lab, drone] = await Promise.all([
      loader.loadAsync("/assets/skiff.glb"),
      loader.loadAsync("/assets/dawn-lab.glb"),
      loader.loadAsync("/assets/drone.glb"),
    ]);
    [ship.scene, lab.scene, drone.scene].forEach((root) => {
      root.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.castShadow = o.receiveShadow = true;
        }
      });
      optimizeModel(root);
      weatherMaterials(root);
    });
    this.ship.add(ship.scene);
    this.ship.position.copy(v(SHIP_HOME));
    this.ship.rotation.y = Math.PI;
    this.scene.add(this.ship);
    lab.scene.position.copy(v(LAB));
    this.scene.add(lab.scene);
    const lamp = new THREE.PointLight(0x83cfcd, 22, 20, 2);
    lamp.position.set(LAB.x, LAB.y + 5, LAB.z - 5);
    this.scene.add(lamp);
    const warm = new THREE.PointLight(0xffb86f, 16, 18, 2);
    warm.position.set(LAB.x, LAB.y + 4, LAB.z + 12);
    this.scene.add(warm);
    for (const c of LORE) {
      const g = new THREE.Group();
      g.position.copy(v(c));
      const stone = new THREE.Mesh(
        new THREE.BoxGeometry(2.1, 3.4, 0.65),
        new THREE.MeshStandardMaterial({
          color: 0x344346,
          roughness: 0.88,
          metalness: 0.2,
        }),
      );
      stone.position.y = 1.7;
      stone.castShadow = true;
      g.add(stone);
      const canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 512;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#17252a";
      ctx.fillRect(0, 0, 256, 512);
      ctx.strokeStyle = "#cfb080";
      ctx.lineWidth = 3;
      ctx.strokeRect(18, 18, 220, 476);
      ctx.fillStyle = "#debf92";
      ctx.textAlign = "center";
      ctx.font = "20px monospace";
      ctx.fillText(`ARCHIVE / 0${c.id + 1}`, 128, 63);
      for (let i = 0; i < 9; i++) {
        ctx.beginPath();
        ctx.moveTo(54, 110 + i * 34);
        ctx.lineTo(190 - (i % 3) * 19, 110 + i * 34);
        ctx.stroke();
        ctx.fillRect(61 + (i % 3) * 30, 101 + i * 34, 3, 18);
      }
      ctx.font = "14px monospace";
      ctx.fillText("E / READ", 128, 459);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      const face = new THREE.Mesh(
        new THREE.PlaneGeometry(1.85, 3.1),
        new THREE.MeshStandardMaterial({
          map: texture,
          emissiveMap: texture,
          emissive: 0xb29158,
          emissiveIntensity: 0.45,
          roughness: 0.7,
        }),
      );
      face.position.set(0, 1.75, 0.334);
      g.add(face);
      const light = new THREE.Mesh(
        new THREE.SphereGeometry(0.1, 12, 8),
        glow(0xf3c789),
      );
      light.position.set(0, 3.6, 0);
      g.add(light);
      this.scene.add(g);
      this.clues.push(g);
    }
    for (const [id, n] of RESOURCE_SITES.entries()) {
      const g = new THREE.Group();
      g.position.copy(v(n));
      const color =
        n.item === "ore"
          ? 0x89d8e4
          : n.item === "core"
            ? 0xffbb61
            : n.item === "cell"
              ? 0x80e4ba
              : n.item === "medgel"
                ? 0xadd1a0
                : 0x9b9388;
      const mat = new THREE.MeshStandardMaterial({
        color,
        metalness: 0.65,
        roughness: 0.42,
        emissive: color,
        emissiveIntensity: n.item === "scrap" ? 0.02 : 0.35,
      });
      if (n.item === "ore")
        for (let j = 0; j < 7; j++) {
          const mesh = new THREE.Mesh(
            new THREE.OctahedronGeometry(0.4 + hash(id, j) * 0.65),
            mat,
          );
          mesh.position.set(
            (hash(j, 2) - 0.5) * 2,
            hash(j, 4) * 0.6,
            (hash(j, 3) - 0.5) * 2,
          );
          mesh.scale.y = 1.4;
          mesh.rotation.set(hash(j, 5), hash(j, 6), 0.3);
          mesh.castShadow = true;
          g.add(mesh);
        }
      else {
        const base = new THREE.Mesh(
          new THREE.BoxGeometry(2.2, 1.4, 1.7),
          new THREE.MeshStandardMaterial({
            color: 0x293c40,
            roughness: 0.7,
            metalness: 0.6,
          }),
        );
        base.castShadow = true;
        g.add(base);
        const strip = new THREE.Mesh(
          new THREE.BoxGeometry(1.7, 0.11, 1.72),
          mat,
        );
        strip.position.y = 0.38;
        g.add(strip);
        if (n.item === "core") {
          const core = new THREE.Mesh(
            new THREE.CylinderGeometry(0.5, 0.5, 2, 16),
            mat,
          );
          core.position.y = 1;
          g.add(core);
          for (let j = 0; j < 3; j++) {
            const ring = new THREE.Mesh(
              new THREE.TorusGeometry(0.65, 0.045, 8, 32),
              glow(color),
            );
            ring.rotation.x = Math.PI / 2;
            ring.position.y = 0.5 + j * 0.45;
            g.add(ring);
          }
        }
      }
      this.scene.add(g);
      this.nodes.push(g);
    }
    for (let i = 0; i < 3; i++) {
      const g = drone.scene.clone(true);
      g.scale.setScalar(2.3);
      this.drones.push(g);
      this.scene.add(g);
      const line = this.line(0xff6950);
      this.enemyLasers.push(line);
    }
    this.buildGrove();
    this.buildOutpost();
  }
  line(color: number) {
    const g = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(),
      new THREE.Vector3(),
    ]);
    const line = new THREE.Line(
      g,
      new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
      }),
    );
    line.frustumCulled = false;
    line.visible = false;
    this.scene.add(line);
    return line;
  }
  setLine(line: THREE.Line, a: Vec, b: Vec) {
    const p = line.geometry.getAttribute("position") as THREE.BufferAttribute;
    p.setXYZ(0, a.x, a.y, a.z);
    p.setXYZ(1, b.x, b.y, b.z);
    p.needsUpdate = true;
    line.visible = true;
  }
  buildOutpost() {
    const mat = new THREE.MeshStandardMaterial({
      color: 0x3c474a,
      roughness: 0.75,
      metalness: 0.6,
    });
    for (let i = 0; i < 9; i++) {
      const angle = (i / 9) * Math.PI * 2,
        x = OUTPOST.x + Math.cos(angle) * 28,
        z = OUTPOST.z + Math.sin(angle) * 28;
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.65, 5, 0.65), mat);
      post.position.set(x, groundAt(x, z) + 2.5, z);
      post.castShadow = true;
      this.scene.add(post);
      const beacon = new THREE.Mesh(
        new THREE.BoxGeometry(0.7, 0.14, 0.7),
        glow(0xf4a37e),
      );
      beacon.position.copy(post.position);
      beacon.position.y += 2.4;
      this.scene.add(beacon);
    }
  }
  buildGrove() {
    const bark = new THREE.MeshStandardMaterial({
      color: 0x304849,
      roughness: 0.92,
    });
    const foliage = new THREE.MeshStandardMaterial({
      color: 0x789d94,
      roughness: 0.78,
      emissive: 0x284436,
      emissiveIntensity: 0.18,
    });
    const trunks = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.3, 0.85, 12, 8),
      bark,
      52,
    );
    const crowns = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(1, 1),
      foliage,
      156,
    );
    const buds = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.15, 8, 6),
      glow(0xc6ddc3),
      156,
    );
    const obj = new THREE.Object3D();
    for (let i = 0; i < 52; i++) {
      const angle = hash(i, 70) * Math.PI * 2,
        r = 30 + hash(i, 71) * 90,
        x = DESTINATION.x + Math.cos(angle) * r,
        z = DESTINATION.z + Math.sin(angle) * r,
        y = groundAt(x, z);
      const scale = 0.7 + hash(i, 72) * 0.9;
      obj.position.set(x, y + 6 * scale, z);
      obj.rotation.set(0, angle, (hash(i, 73) - 0.5) * 0.12);
      obj.scale.setScalar(scale);
      obj.updateMatrix();
      trunks.setMatrixAt(i, obj.matrix);
      for (let j = 0; j < 3; j++) {
        obj.position.set(
          x + Math.cos(j * 2.1) * 2.2 * scale,
          y + (9 + j * 2) * scale,
          z + Math.sin(j * 2.1) * 2.2 * scale,
        );
        obj.scale.set(4 * scale, 1.6 * scale, 4 * scale);
        obj.updateMatrix();
        crowns.setMatrixAt(i * 3 + j, obj.matrix);
        obj.position.y -= 1.7;
        obj.scale.setScalar(scale);
        obj.updateMatrix();
        buds.setMatrixAt(i * 3 + j, obj.matrix);
      }
    }
    trunks.castShadow = crowns.castShadow = true;
    this.scene.add(trunks, crowns, buds);
    const pad = new THREE.Mesh(
      new THREE.RingGeometry(11, 11.18, 80),
      glow(0xb8e0c3),
    );
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(DESTINATION.x, DESTINATION.y + 0.2, DESTINATION.z);
    this.scene.add(pad);
  }
  changed(key: string, value: number) {
    const previous = this.effects.get(key);
    this.effects.set(key, value);
    return previous !== undefined && value > previous;
  }
  update(s: Snapshot | null, me: Player | null, dt: number, t: number) {
    if (!s) return;
    const a = s.adventure,
      ship = a.ship;
    this.ship.position.lerp(v(ship), 1 - Math.exp(-dt * 16));
    this.ship.rotation.set(0, ship.yaw + Math.PI, -ship.bank);
    for (const side of [-1, 1]) {
      const gear = this.ship.getObjectByName("gear_" + side);
      if (gear)
        gear.rotation.z = THREE.MathUtils.damp(
          gear.rotation.z,
          ship.grounded ? 0 : side * 0.65,
          3,
          dt,
        );
      const engine = this.ship.getObjectByName("engine_glow_" + side) as
        | THREE.Mesh
        | undefined;
      if (engine) engine.visible = ship.repaired;
    }
    if (ship.repaired && !ship.grounded && hash(Math.floor(t * 45), 5) > 0.35) {
      const dir = new THREE.Vector3(0, 2, 4.8).applyAxisAngle(
        new THREE.Vector3(0, 1, 0),
        ship.yaw,
      );
      this.burst(
        { x: ship.x + dir.x, y: ship.y + dir.y, z: ship.z + dir.z },
        2,
        0x8edfff,
        4,
      );
    }
    if (!ship.repaired && hash(Math.floor(t * 25), 3) > 0.85)
      this.burst({ x: ship.x, y: ship.y + 3, z: ship.z + 3 }, 2, 0xa78967, 1.6);
    a.nodes.forEach((n, id) => {
      const g = this.nodes[id];
      if (!g) return;
      g.visible = n.readyAt <= s.time;
      if (this.changed("node" + id, n.hitId))
        this.burst(n, 12, n.item === "ore" ? 0x9ce7ed : 0xffc08a, 5);
    });
    a.drones.forEach((d, id) => {
      const g = this.drones[id];
      if (!g) return;
      if (this.changed("drone" + id, d.hitId))
        this.burst(
          d,
          d.hp ? 18 : 50,
          d.hp ? 0xffcc99 : 0xff9857,
          d.hp ? 7 : 18,
        );
      g.visible = d.hp > 0;
      g.position.lerp(v(d), 1 - Math.exp(-dt * 18));
      g.rotation.set(
        Math.sin(t * 3 + id) * 0.05,
        d.yaw + Math.PI,
        d.mode === "stunned" ? Math.sin(t * 45) * 0.2 : 0,
      );
      const line = this.enemyLasers[id];
      line.visible = false;
      if (d.mode === "charge" || d.mode === "fire") {
        this.setLine(line, d, d.aim);
        (line.material as THREE.LineBasicMaterial).opacity =
          d.mode === "fire" ? 1 : 0.25 + 0.35 * (1 - d.timer / 1.15);
      }
      if (this.changed("enemyShot" + id, d.shotId)) {
        this.burst(d.aim, 16, 0xff6851, 5);
        if (me && Math.hypot(me.x - d.x, me.z - d.z) < 100) this.sound("enemy");
      }
    });
    for (const p of s.players) {
      const own = p.id === me?.id,
        data = own ? me! : p;
      let rope = this.ropes.get(p.id);
      if (!rope) {
        rope = this.line(0xb1e6e6);
        this.ropes.set(p.id, rope);
      }
      rope.visible = !!data.grapple;
      if (data.grapple)
        this.setLine(
          rope,
          { x: data.x, y: data.y + 0.35, z: data.z },
          data.grapple,
        );
      let shot = this.lasers.get(p.id);
      if (!shot) {
        shot = this.line(0xa9edff);
        this.lasers.set(p.id, shot);
      }
      shot.visible = p.toolCooldown > 0.2 && p.seat < 0;
      if (shot.visible)
        this.setLine(
          shot,
          { x: data.x, y: data.y + 0.3, z: data.z },
          p.shotEnd,
        );
      if (this.changed("shot" + p.id, p.shotId) && own) {
        this.sound(
          p.hitKind === "kill"
            ? "kill"
            : p.hitKind === "collect"
              ? "pickup"
              : "tool",
        );
        if (p.hitKind) {
          document.getElementById("hitFeedback")?.classList.add("flash");
          setTimeout(
            () =>
              document.getElementById("hitFeedback")?.classList.remove("flash"),
            100,
          );
        }
      }
      if (this.changed("grapple" + p.id, p.grappleId) && own) {
        this.sound("grapple");
        if (p.grapple) this.burst(p.grapple, 16, 0xb1e8eb, 4);
      }
      if (this.changed("damage" + p.id, p.damageId) && own) {
        this.sound("hurt");
        document.getElementById("damageFeedback")?.classList.add("flash");
        setTimeout(
          () =>
            document
              .getElementById("damageFeedback")
              ?.classList.remove("flash"),
          100,
        );
      }
    }
    for (const [id, line] of this.ropes)
      if (!s.players.some((p) => p.id === id)) {
        this.scene.remove(line);
        line.geometry.dispose();
        (line.material as THREE.Material).dispose();
        this.ropes.delete(id);
        const shot = this.lasers.get(id);
        if (shot) {
          this.scene.remove(shot);
          shot.geometry.dispose();
          (shot.material as THREE.Material).dispose();
          this.lasers.delete(id);
        }
      }
  }
}
