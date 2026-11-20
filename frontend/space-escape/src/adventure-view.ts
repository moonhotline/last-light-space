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
  FIGHTER_POS,
  SPAWN_FLEET,
} from "../shared/adventure-data";
import { alignShipToGround, clean3DEntityText, normalizeModelContainer, updateShipTransform } from "./interplanetary";
import { ShipPropulsionFX } from "./thruster-fx";
import { cosmicAudio } from "./sound-engine";
import { GROVE_TREES, OUTPOST_POSTS } from "../shared/colliders";
import { hash, type Vec } from "../shared/map";
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
      !(child instanceof THREE.SkinnedMesh) &&
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
  private lastShipKind: string | null = null;
  ship = new THREE.Group();
  nodes: THREE.Group[] = [];
  clues: THREE.Group[] = [];
  drones: THREE.Group[] = [];
  ropes = new Map<string, THREE.Line>();
  bulletModel: THREE.Group | null = null;
  projectiles: {
    model: THREE.Group;
    start: THREE.Vector3;
    end: THREE.Vector3;
    age: number;
    duration: number;
    color: number;
  }[] = [];
  effects = new Map<string, number>();
  propulsionFX: ShipPropulsionFX | null = null;
  intergalacticPropulsionFX: ShipPropulsionFX | null = null;
  constructor(
    public scene: THREE.Scene,
    public burst: (p: Vec, n: number, c: number, s: number) => void,
    public sound: (n: string, p?: number) => void,
  ) {}
  async load() {
    const loader = new GLTFLoader();
    const load = async (url: string) => {
      let error: unknown;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          return await loader.loadAsync(url);
        } catch (e) {
          error = e;
          await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
        }
      }
      throw error;
    };
    const [ship, lab, drone, bullet, crateGltf, coreGltf, obeliskGltf, mineralGltf] = await Promise.all([
      load(SPAWN_FLEET.light_fighter.asset),
      load("/assets/dawn-lab.glb"),
      load("/assets/drone.glb"),
      load("/assets/kinetic-bullet.glb"),
      load("/assets/crate.glb").catch(() => null),
      load("/assets/core.glb").catch(() => null),
      load("/assets/obelisk.glb").catch(() => null),
      load("/assets/models/minerals/scene.gltf").catch(() => null),
    ]);
    this.bulletModel = bullet.scene;
    this.bulletModel.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.castShadow = true;
        o.receiveShadow = false;
      }
    });
    [lab.scene, drone.scene, crateGltf?.scene, coreGltf?.scene, obeliskGltf?.scene, mineralGltf?.scene].forEach((root) => {
      if (!root) return;
      root.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.castShadow = o.receiveShadow = true;
        }
      });
      optimizeModel(root);
      weatherMaterials(root);
    });
    const crateAsset = crateGltf?.scene ? normalizeModelContainer(crateGltf.scene, 2.2) : null;
    const coreAsset = coreGltf?.scene ? normalizeModelContainer(coreGltf.scene, 2.6) : null;
    const obeliskAsset = obeliskGltf?.scene ? normalizeModelContainer(obeliskGltf.scene, 3.8) : null;
    const mineralAsset = mineralGltf?.scene ? normalizeModelContainer(mineralGltf.scene, 2.5) : null;
    clean3DEntityText(ship.scene);
    const fighter = normalizeModelContainer(ship.scene, SPAWN_FLEET.light_fighter.modelSize, Math.PI);
    this.ship.userData.chassisClearance = fighter.userData.chassisClearance;
    this.ship.add(fighter);
    this.propulsionFX = new ShipPropulsionFX("light_fighter");
    this.ship.add(this.propulsionFX.rootGroup);
    this.intergalacticPropulsionFX = new ShipPropulsionFX("intergalactic");
    this.scene.add(this.intergalacticPropulsionFX.rootGroup);
    this.intergalacticPropulsionFX.rootGroup.visible = false;
    clean3DEntityText(this.ship);
    this.scene.add(this.ship);
    alignShipToGround(this.ship, FIGHTER_POS.x, FIGHTER_POS.z, SPAWN_FLEET.light_fighter.yaw,
      SPAWN_FLEET.light_fighter.halfWidth, SPAWN_FLEET.light_fighter.halfLength, SPAWN_FLEET.light_fighter.clearance);
    this.ship.visible = true;
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
      if (obeliskAsset) {
        const monolith = obeliskAsset.clone(true);
        monolith.position.y = 1.9;
        g.add(monolith);
      } else {
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
      }
      const canvas = document.createElement("canvas");
      canvas.width = 512;
      canvas.height = 1024;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#122128";
      ctx.fillRect(0, 0, 512, 1024);
      ctx.strokeStyle = "#d4b483";
      ctx.lineWidth = 5;
      ctx.strokeRect(28, 28, 456, 968);
      ctx.fillStyle = "#e8cc9c";
      ctx.textAlign = "center";
      ctx.font = "bold 36px monospace";
      ctx.fillText(`ARCHIVE / 0${c.id + 1}`, 256, 118);
      for (let i = 0; i < 9; i++) {
        ctx.beginPath();
        ctx.moveTo(96, 210 + i * 68);
        ctx.lineTo(396 - (i % 3) * 38, 210 + i * 68);
        ctx.stroke();
        ctx.fillRect(116 + (i % 3) * 60, 194 + i * 68, 6, 34);
      }
      ctx.font = "bold 28px monospace";
      ctx.fillText("E / READ ARCHIVE", 256, 916);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      const face = new THREE.Mesh(
        new THREE.PlaneGeometry(1.35, 2.55),
        new THREE.MeshStandardMaterial({
          map: texture,
          emissiveMap: texture,
          emissive: 0xc29e62,
          emissiveIntensity: 0.6,
          roughness: 0.55,
          transparent: true,
          opacity: 0.92,
        }),
      );
      face.position.set(0, 1.85, 0.56);
      g.add(face);
      const light = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 16, 12),
        glow(0xf3c789),
      );
      light.position.set(0, 3.85, 0);
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
        emissiveIntensity: n.item === "scrap" ? 0.08 : 0.42,
      });
      if (n.item === "ore" && mineralAsset) {
        const oreMesh = mineralAsset.clone(true);
        oreMesh.position.y = 0.65;
        oreMesh.rotation.y = hash(id, 5) * Math.PI * 2;
        g.add(oreMesh);
      } else if (n.item === "core" && coreAsset) {
        const coreMesh = coreAsset.clone(true);
        coreMesh.position.y = 1.1;
        g.add(coreMesh);
      } else if (crateAsset) {
        const crateMesh = crateAsset.clone(true);
        crateMesh.position.y = 0.55;
        crateMesh.rotation.y = hash(id, 3) * Math.PI * 2;
        g.add(crateMesh);
        const indicator = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.09, 0.9), mat);
        indicator.position.y = 1.25;
        g.add(indicator);
      } else {
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
      }
      this.scene.add(g);
      this.nodes.push(g);
    }
    for (let i = 0; i < 3; i++) {
      const g = drone.scene.clone(true);
      g.scale.setScalar(2.3);
      this.drones.push(g);
      this.scene.add(g);
    }
    this.buildGrove();
    this.buildOutpost();
  }
  spawnProjectile(start: THREE.Vector3, end: THREE.Vector3, color = 0x00f0ff, speed = 175) {
    const dist = start.distanceTo(end);
    if (dist < 0.2) return;
    const model = this.bulletModel ? this.bulletModel.clone(true) : new THREE.Group();
    model.position.copy(start);
    model.lookAt(end);
    model.scale.setScalar(0.7);
    if (color !== 0x00f0ff) {
      model.traverse((o) => {
        if (o instanceof THREE.Mesh && o.material) {
          const m = o.material.clone();
          if ("color" in m) m.color.setHex(color);
          if ("emissive" in m) m.emissive.setHex(color);
          o.material = m;
        }
      });
    }
    this.scene.add(model);
    const duration = Math.max(0.04, Math.min(0.4, dist / speed));
    this.projectiles.push({ model, start, end, age: 0, duration, color });
    this.burst({ x: start.x, y: start.y, z: start.z }, 4, color, 1.8);
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
      roughness: 0.68,
      metalness: 0.65,
    });
    for (const p of OUTPOST_POSTS) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.46, 5, 12), mat);
      post.position.set(p.x, p.y + 2.5, p.z);
      post.castShadow = true;
      post.receiveShadow = true;
      this.scene.add(post);
      const beacon = new THREE.Mesh(
        new THREE.TorusGeometry(0.38, 0.07, 10, 24),
        glow(0xf4a37e),
      );
      beacon.rotation.x = Math.PI / 2;
      beacon.position.set(p.x, p.y + 4.9, p.z);
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
      new THREE.CylinderGeometry(0.32, 0.86, 12, 14),
      bark,
      GROVE_TREES.length,
    );
    const crowns = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(1, 2),
      foliage,
      GROVE_TREES.length * 3,
    );
    const buds = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.15, 10, 8),
      glow(0xc6ddc3),
      GROVE_TREES.length * 3,
    );
    const obj = new THREE.Object3D();
    GROVE_TREES.forEach((tree, i) => {
      const { x, y, z, angle, tilt, scale } = tree;
      obj.position.set(x, y + 6 * scale, z);
      obj.rotation.set(0, angle, tilt);
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
    });
    trunks.castShadow = crowns.castShadow = true;
    this.scene.add(trunks, crowns, buds);
    const pad = new THREE.Mesh(
      new THREE.RingGeometry(11, 11.24, 96),
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
  update(
    s: Snapshot | null,
    me: Player | null,
    dt: number,
    t: number,
    pilotFlight?: { boosting: boolean; braking: boolean },
  ) {
    if (!s) return;
    const a = s.adventure,
      ship = a.ship;
    const isFighter = (ship.kind ?? "light_fighter") === "light_fighter";
    const spawn = SPAWN_FLEET.light_fighter;
    const kind = ship.kind ?? "light_fighter";
    const switched = this.lastShipKind !== null && this.lastShipKind !== kind;
    this.lastShipKind = kind;
    updateShipTransform(this.ship, isFighter ? ship : {
      ...FIGHTER_POS, kind: "light_fighter", yaw: spawn.yaw, bank: 0,
      vx: 0, vy: 0, vz: 0, grounded: true, seats: [],
    }, switched ? Infinity : dt);
    this.ship.visible = true;
    for (const side of [-1, 1]) {
      const gear = this.ship.getObjectByName("gear_" + side);
      if (gear)
        gear.rotation.z = THREE.MathUtils.damp(
          gear.rotation.z,
          !isFighter || ship.grounded ? 0 : side * 0.65,
          3,
          dt,
        );
      const engine = this.ship.getObjectByName("engine_glow_" + side) as
        | THREE.Mesh
        | undefined;
      if (engine) engine.visible = isFighter && ship.repaired;
    }
    const speed = Math.hypot(ship.vx ?? 0, ship.vy ?? 0, ship.vz ?? 0);
    const isBoosting = pilotFlight
      ? pilotFlight.boosting
      : (ship.thrust || 0) > 1.8 || speed > 42;
    const isBraking = pilotFlight
      ? pilotFlight.braking
      : (ship.vy ?? 0) < -15;
    if (isFighter) {
      if (this.propulsionFX) this.propulsionFX.rootGroup.visible = true;
      this.propulsionFX?.update(dt, ship, null, isBoosting, isBraking);
      if (this.intergalacticPropulsionFX) this.intergalacticPropulsionFX.rootGroup.visible = false;
    } else {
      if (this.propulsionFX) this.propulsionFX.rootGroup.visible = false;
      if (this.intergalacticPropulsionFX) {
        const hull = this.scene.getObjectByName("intergalactic-ship");
        if (!ship.grounded && ship.repaired && hull) {
          this.intergalacticPropulsionFX.rootGroup.visible = true;
          // The nozzle frame follows the hull in the same render tick, as on the fighter.
          if (this.intergalacticPropulsionFX.rootGroup.parent !== hull) {
            hull.add(this.intergalacticPropulsionFX.rootGroup);
            this.intergalacticPropulsionFX.rootGroup.position.set(0, 0, 0);
            this.intergalacticPropulsionFX.rootGroup.quaternion.identity();
          }
          this.intergalacticPropulsionFX.update(dt, ship, null, isBoosting, isBraking);
        } else {
          this.intergalacticPropulsionFX.rootGroup.visible = false;
        }
      }
    }

    if (this.changed("shipCollision", ship.collisionId ?? 0)) {
      const intensity = ship.collisionIntensity ?? 0.5;
      this.burst(
        { x: ship.x, y: ship.y + 2, z: ship.z },
        Math.round(12 + intensity * 24),
        0xffc88a,
        6 + intensity * 12,
      );
      cosmicAudio.playShipCollision(intensity);
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
      if (this.changed("enemyShot" + id, d.shotId)) {
        const start = new THREE.Vector3(d.x, d.y + 0.2, d.z);
        const end = new THREE.Vector3(d.aim.x, d.aim.y, d.aim.z);
        this.spawnProjectile(start, end, 0xff5533, 140);
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
      if (this.changed("shot" + p.id, p.shotId)) {
        const start = new THREE.Vector3(data.x, data.y + 0.35, data.z);
        const end = new THREE.Vector3(p.shotEnd.x, p.shotEnd.y, p.shotEnd.z);
        this.spawnProjectile(start, end, 0x00f0ff, 180);
      }
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
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const proj = this.projectiles[i];
      proj.age += dt;
      const progress = Math.min(1, proj.age / proj.duration);
      proj.model.position.lerpVectors(proj.start, proj.end, progress);
      if (progress < 1 && Math.random() < 0.35) {
        this.burst(
          { x: proj.model.position.x, y: proj.model.position.y, z: proj.model.position.z },
          1,
          proj.color,
          1.0,
        );
      }
      if (progress >= 1) {
        this.burst({ x: proj.end.x, y: proj.end.y, z: proj.end.z }, 10, proj.color, 3.2);
        this.scene.remove(proj.model);
        proj.model.traverse((o) => {
          if (o instanceof THREE.Mesh) {
            o.geometry?.dispose();
            if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
            else o.material?.dispose();
          }
        });
        this.projectiles.splice(i, 1);
      }
    }
    for (const [id, line] of this.ropes)
      if (!s.players.some((p) => p.id === id)) {
        this.scene.remove(line);
        line.geometry.dispose();
        (line.material as THREE.Material).dispose();
        this.ropes.delete(id);
      }
  }
}
