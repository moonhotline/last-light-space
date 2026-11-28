import * as THREE from "three";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";
import { hash, type Vec } from "../shared/map";
import { FOOT_OFFSET, playerUp, surfaceOrientation } from "../shared/surface";
import { PLAYER_COLORS, type Player, type Snapshot } from "../shared/types";
import { glowMaterial } from "./world-environment";

export interface AvatarMixerEntry {
  mixer: THREE.AnimationMixer;
  actions: Record<string, THREE.AnimationAction>;
  currentAction: string;
  head?: THREE.Object3D;
  torso?: THREE.Object3D;
  armL?: THREE.Object3D;
  armR?: THREE.Object3D;
}

export interface AvatarAssets {
  astronaut: THREE.Group;
  animations: THREE.AnimationClip[];
  hoverboard: THREE.Group | null;
  rifle: THREE.Group | null;
  camera: THREE.Group | null;
}

const TEAM_HEX = PLAYER_COLORS.map((c) => c.hex);

function createNameplateSprite(name: string, colorHex: number): THREE.Sprite | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.clearRect(0, 0, 256, 64);

  ctx.fillStyle = "rgba(8, 14, 24, 0.78)";
  const x = 12;
  const y = 10;
  const w = 232;
  const h = 44;
  const r = 16;
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(x, y, w, h, r);
  } else {
    ctx.rect(x, y, w, h);
  }
  ctx.fill();

  const hex = "#" + colorHex.toString(16).padStart(6, "0");
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = hex;
  ctx.stroke();

  ctx.fillStyle = hex;
  ctx.beginPath();
  ctx.arc(36, 32, 6, 0, Math.PI * 2);
  ctx.fill();

  ctx.font = "bold 22px ui-sans-serif, system-ui, -apple-system, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ffffff";
  ctx.fillText((name || "探索员").slice(0, 10), 52, 33);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(1.4, 0.35, 1);
  sprite.position.set(0, 2.15, 0);
  sprite.name = "nameplate";
  return sprite;
}

function disposeNameplate(avatar: THREE.Group): void {
  const old = avatar.getObjectByName("nameplate");
  if (!old) return;
  avatar.remove(old);
  if (old instanceof THREE.Sprite) {
    old.material.map?.dispose();
    old.material.dispose();
  }
}

/**
 * Manages player astronaut rigs, skeletal animations, hoverboard tricks,
 * nameplates, and third-person equipment visibility.
 */
export class AvatarSystem {
  readonly avatars = new Map<string, THREE.Group>();
  readonly mixers = new Map<string, AvatarMixerEntry>();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly burst: (pos: Vec, count: number, color: number, power?: number) => void,
  ) {}

  resetUnarmedPose(): void {
    for (const anim of this.mixers.values()) {
      if (anim.armR) anim.armR.quaternion.identity();
      if (anim.armL) anim.armL.quaternion.identity();
      if (anim.torso) anim.torso.quaternion.identity();
    }
  }

  update(params: {
    snapshot: Snapshot | null;
    me: Player | null;
    assets: AvatarAssets;
    activeWeapon: string;
    thirdPerson: boolean;
    cameraRange: number;
    dt: number;
    t: number;
    worldTime: number;
  }): void {
    const { snapshot, me, assets, activeWeapon, thirdPerson, cameraRange, dt, t, worldTime } =
      params;

    const ids = new Set(snapshot?.players.map((p) => p.id) || []);
    for (const [id, avatar] of this.avatars) {
      if (!ids.has(id)) {
        disposeNameplate(avatar);
        this.scene.remove(avatar);
        this.avatars.delete(id);
        const anim = this.mixers.get(id);
        if (anim) {
          anim.mixer.stopAllAction();
          this.mixers.delete(id);
        }
      }
    }

    for (const remote of snapshot?.players || []) {
      const own = remote.id === me?.id;
      const p = own ? me! : remote;
      let avatar = this.avatars.get(p.id);
      let anim = this.mixers.get(p.id);

      if (!avatar) {
        const created = this.spawnAvatar(p, own, assets);
        avatar = created.avatar;
        anim = created.anim;
      }

      if (avatar.userData.name !== p.name) {
        disposeNameplate(avatar);
        const nameplate = createNameplateSprite(p.name, TEAM_HEX[p.color] ?? TEAM_HEX[0]);
        if (nameplate) {
          if (own) nameplate.visible = false;
          avatar.add(nameplate);
        }
        avatar.userData.name = p.name;
      }

      avatar.visible = p.seat < 0 && !(own && (!thirdPerson || cameraRange < 0.4));

      const portaled = (p.portalTransit ?? 0) !== (avatar.userData.portalTransit ?? 0);
      avatar.userData.portalTransit = p.portalTransit;
      if (p.planet) {
        avatar.position.set(p.x, p.y, p.z).addScaledVector(playerUp(p), -FOOT_OFFSET);
      } else if (own || portaled) {
        avatar.position.set(p.x, p.y - 0.82, p.z);
      } else {
        avatar.position.lerp(new THREE.Vector3(p.x, p.y - 0.82, p.z), 1 - Math.exp(-dt * 14));
      }

      const targetYaw = p.yaw + Math.PI;
      if (portaled) {
        avatar.rotation.y = targetYaw;
      } else if (!p.planet) {
        avatar.rotation.y +=
          Math.atan2(
            Math.sin(targetYaw - avatar.rotation.y),
            Math.cos(targetYaw - avatar.rotation.y),
          ) *
          (1 - Math.exp(-dt * 12));
      }

      const speed = Math.hypot(p.vx, p.vz);
      const targetPitch =
        p.skate || p.jetting || p.grounded ? 0 : Math.min(0.12, speed * 0.01);
      avatar.rotation.x = THREE.MathUtils.damp(avatar.rotation.x, targetPitch, 8, dt);
      avatar.rotation.z = THREE.MathUtils.damp(
        avatar.rotation.z,
        p.grapple ? Math.sin(t * 3) * 0.08 : 0,
        8,
        dt,
      );

      if (p.skate) {
        const turnDelta = Math.atan2(
          Math.sin(targetYaw - avatar.rotation.y),
          Math.cos(targetYaw - avatar.rotation.y),
        );
        avatar.rotation.z = THREE.MathUtils.damp(
          avatar.rotation.z,
          Math.max(-0.25, Math.min(0.25, -turnDelta * 0.35)),
          8,
          dt,
        );
      }

      if (p.planet) {
        avatar.quaternion
          .copy(surfaceOrientation(p))
          .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), targetYaw));
      }

      if (anim) {
        this.updateAnimation(avatar, anim, p, own, activeWeapon, speed, dt);
      }

      for (const side of [-1, 1]) {
        const jet = avatar.getObjectByName("jet-" + side);
        if (jet) {
          jet.visible = p.jetting && !p.skate;
          const flicker = 0.8 + Math.sin(t * 60 + side * 1.5) * 0.2;
          jet.scale.set(1, flicker, 1);
        }
      }

      const board = avatar.getObjectByName("hoverboard");
      if (board) {
        board.visible = !!p.skate;
        if (p.skate) {
          const isOllie = !!(p.ollieUntil && p.ollieUntil > worldTime);
          if (isOllie) {
            const remain = Math.max(0, (p.ollieUntil ?? 0) - worldTime);
            const progress = Math.max(0, Math.min(1, 1 - remain / 0.8));
            board.rotation.z = progress < 1 ? progress * Math.PI * 2 : 0;
            const popPitch = -Math.sin(progress * Math.PI) * 0.22;
            board.rotation.x = THREE.MathUtils.damp(board.rotation.x, popPitch, 12, dt);
            board.rotation.y = THREE.MathUtils.damp(board.rotation.y, 0, 10, dt);
            const clearance = -0.44 - Math.sin(progress * Math.PI) * 0.12;
            board.position.set(0, clearance, 0.0);
          } else {
            board.rotation.x = THREE.MathUtils.damp(board.rotation.x, 0, 12, dt);
            board.rotation.z = THREE.MathUtils.damp(board.rotation.z, 0, 12, dt);
            board.rotation.y = THREE.MathUtils.damp(board.rotation.y, 0, 12, dt);
            board.position.set(0, -0.38 + Math.sin(t * 8) * 0.008, 0.0);
          }
        }
      }

      if (p.skate && p.jetting && hash(Math.floor(t * 30), p.color) > 0.25) {
        this.burst({ x: p.x, y: p.y - 0.78, z: p.z }, 3, 0x00f0ff, 2.4);
      }
      if (p.jetting && !p.skate && !own && hash(Math.floor(t * 30), p.color) > 0.4) {
        this.burst(
          { x: p.x, y: p.y + 0.35, z: p.z },
          2,
          TEAM_HEX[p.color] ?? TEAM_HEX[0],
          1.5,
        );
      }
    }
  }

  private spawnAvatar(p: Player, own: boolean, assets: AvatarAssets) {
    const cloned = SkeletonUtils.clone(assets.astronaut);
    const avatar = new THREE.Group();
    avatar.add(cloned);

    const teamColor = TEAM_HEX[p.color] ?? TEAM_HEX[0];
    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 12, 8),
      new THREE.MeshBasicMaterial({ color: teamColor }),
    );
    lamp.position.set(0, 1.76, 0.14);
    avatar.add(lamp);

    const nameplate = createNameplateSprite(p.name, teamColor);
    if (nameplate) {
      if (own) nameplate.visible = false;
      avatar.add(nameplate);
    }
    avatar.userData.name = p.name;
    avatar.position.set(p.x, p.y - 0.82, p.z);

    for (const side of [-1, 1]) {
      const coneGeo = new THREE.ConeGeometry(0.045, 0.35, 12, 1, true);
      coneGeo.rotateZ(Math.PI);
      coneGeo.translate(0, -0.175, 0);
      const jet = new THREE.Mesh(coneGeo, glowMaterial(0x62dbff, 0.85));
      jet.name = "jet-" + side;
      jet.position.set(side * 0.22, 1.18, -0.26);
      jet.rotation.x = 0.14;
      avatar.add(jet);
    }

    const board = assets.hoverboard ? assets.hoverboard.clone(true) : new THREE.Group();
    board.position.set(0, -0.38, 0.0);
    board.name = "hoverboard";
    board.visible = false;
    avatar.add(board);

    const upperBack =
      cloned.getObjectByName("mixamorig:Spine2") ||
      cloned.getObjectByName("mixamorig:Spine1");
    const hips = cloned.getObjectByName("mixamorig:Hips") || cloned.getObjectByName("Hips");

    if (assets.rifle && upperBack) {
      const backRifle = assets.rifle.clone(true);
      backRifle.name = "backRifle";
      backRifle.scale.setScalar(17.2);
      backRifle.position.set(0.12, 0.15, -0.22);
      backRifle.rotation.set(0.2, 0.1, 2.35);
      backRifle.visible = false;
      upperBack.add(backRifle);
    }

    if (assets.camera && hips) {
      const hipCamera = assets.camera.clone(true);
      hipCamera.name = "hipCamera";
      hipCamera.scale.setScalar(100);
      hipCamera.position.set(0.18, -0.06, 0.08);
      hipCamera.rotation.set(0.2, -0.3, 0.1);
      hipCamera.visible = false;
      hips.add(hipCamera);
    }

    const mixer = new THREE.AnimationMixer(cloned);
    const findClip = (name: string, fallbackIdx = 0) =>
      THREE.AnimationClip.findByName(assets.animations, name) ||
      assets.animations.find((c) => c.name.toLowerCase().includes(name.toLowerCase())) ||
      assets.animations[fallbackIdx] ||
      new THREE.AnimationClip(name, 1, []);

    const actions: Record<string, THREE.AnimationAction> = {
      idle: mixer.clipAction(findClip("idle", 0)),
      walk: mixer.clipAction(findClip("walk", 1)),
      run: mixer.clipAction(findClip("run", 2)),
      floating: mixer.clipAction(findClip("floating", 3)),
    };
    actions.idle.play();

    const anim: AvatarMixerEntry = {
      mixer,
      actions,
      currentAction: "idle",
      head:
        cloned.getObjectByName("mixamorig:Head") ||
        cloned.getObjectByName("Head") ||
        cloned.getObjectByName("head"),
      torso:
        cloned.getObjectByName("mixamorig:Spine1") ||
        cloned.getObjectByName("Spine1") ||
        cloned.getObjectByName("Spine"),
      armL:
        cloned.getObjectByName("mixamorig:LeftArm") ||
        cloned.getObjectByName("LeftArm") ||
        cloned.getObjectByName("arm_L"),
      armR: cloned.getObjectByName("mixamorig:RightArm") || cloned.getObjectByName("RightArm"),
    };

    this.mixers.set(p.id, anim);
    this.avatars.set(p.id, avatar);
    this.scene.add(avatar);
    return { avatar, anim };
  }

  private updateAnimation(
    avatar: THREE.Group,
    anim: AvatarMixerEntry,
    p: Player,
    own: boolean,
    activeWeapon: string,
    speed: number,
    dt: number,
  ): void {
    anim.mixer.update(dt);
    let target = "idle";
    if (p.skate) {
      target = "idle";
    } else if (p.jetting || !p.grounded) {
      target = "floating";
    } else if (speed > 5.0) {
      target = "run";
      anim.actions.run.timeScale = Math.max(0.75, Math.min(1.25, speed * 0.085));
    } else if (speed > 0.35) {
      target = "walk";
      anim.actions.walk.timeScale = Math.max(0.6, Math.min(1.15, speed * 0.22));
    }

    if (anim.currentAction !== target) {
      const prev = anim.actions[anim.currentAction];
      const next = anim.actions[target];
      if (prev && next) {
        prev.fadeOut(0.2);
        next.reset().fadeIn(0.2).play();
        anim.currentAction = target;
      }
    }

    if (anim.head) {
      anim.head.rotation.x = THREE.MathUtils.damp(anim.head.rotation.x, -p.pitch * 0.35, 10, dt);
    }

    const inShip = p.seat >= 0;
    const activeWep = own ? activeWeapon : p.grapple ? "grapple" : "none";
    const backRifle = avatar.getObjectByName("backRifle");
    const hipCamera = avatar.getObjectByName("hipCamera");

    if (backRifle) backRifle.visible = !inShip && activeWep === "rifle";
    if (hipCamera) hipCamera.visible = !inShip && activeWep === "camera";

    if (p.skate) {
      if (anim.torso) {
        anim.torso.rotation.y = THREE.MathUtils.damp(anim.torso.rotation.y, 0.38, 8, dt);
      }
      if (anim.armL && !p.grapple) {
        anim.armL.rotation.z = THREE.MathUtils.damp(anim.armL.rotation.z, -0.4, 8, dt);
        anim.armL.rotation.x = THREE.MathUtils.damp(anim.armL.rotation.x, 0.2, 8, dt);
      }
      if (anim.armR) {
        anim.armR.rotation.z = THREE.MathUtils.damp(anim.armR.rotation.z, 0.4, 8, dt);
        anim.armR.rotation.x = THREE.MathUtils.damp(anim.armR.rotation.x, -0.2, 8, dt);
      }
    }
    if (p.grapple && anim.armL) {
      anim.armL.rotation.x = -1.35 - p.pitch * 0.5;
    }
  }
}
