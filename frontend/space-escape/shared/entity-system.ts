/**
 * Lightweight Component-Based Entity Architecture (ECS Lite).
 * Modular, decoupled, reusable entity-component-system framework
 * for game entities (Planets, Ships, NPCs, Minerals, Avatars).
 */

import type { Vec3 } from "./celestial";
import { FrustumCullingEngine, type LODLevel } from "./lod-culling";

export interface Component {
  readonly type: string;
}

export interface TransformComponent extends Component {
  type: "Transform";
  pos: Vec3;
  rot: { yaw: number; pitch: number; roll: number };
  scale: number;
}

export interface PhysicsComponent extends Component {
  type: "Physics";
  vel: Vec3;
  mass: number;
  useGravity: boolean;
  isGrounded: boolean;
}

export interface RenderComponent extends Component {
  type: "Render";
  modelKey: string;
  lodLevel: LODLevel;
  visible: boolean;
  boundingRadius: number;
}

export interface HealthComponent extends Component {
  type: "Health";
  current: number;
  max: number;
}

export class Entity {
  readonly id: string;
  private components = new Map<string, Component>();

  constructor(id: string) {
    this.id = id;
  }

  add<T extends Component>(component: T): this {
    this.components.set(component.type, component);
    return this;
  }

  get<T extends Component>(type: string): T | undefined {
    return this.components.get(type) as T | undefined;
  }

  has(type: string): boolean {
    return this.components.has(type);
  }

  remove(type: string): boolean {
    return this.components.delete(type);
  }
}

export class EntityWorld {
  private entities = new Map<string, Entity>();

  createEntity(id: string): Entity {
    const e = new Entity(id);
    this.entities.set(id, e);
    return e;
  }

  getEntity(id: string): Entity | undefined {
    return this.entities.get(id);
  }

  removeEntity(id: string): boolean {
    return this.entities.delete(id);
  }

  query(...componentTypes: string[]): Entity[] {
    const matches: Entity[] = [];
    for (const [, e] of this.entities) {
      if (componentTypes.every((type) => e.has(type))) {
        matches.push(e);
      }
    }
    return matches;
  }

  /**
   * Physics Integration System:
   * Moves all entities with Transform and Physics components according to velocity.
   */
  updatePhysics(dt: number): void {
    const moving = this.query("Transform", "Physics");
    for (const e of moving) {
      const t = e.get<TransformComponent>("Transform")!;
      const p = e.get<PhysicsComponent>("Physics")!;

      t.pos.x += p.vel.x * dt;
      t.pos.y += p.vel.y * dt;
      t.pos.z += p.vel.z * dt;
    }
  }

  /**
   * LOD & Visibility System:
   * Evaluates LOD levels for entities with Render and Transform components based on camera pos.
   */
  updateLOD(cameraPos: Vec3): void {
    const renderables = this.query("Transform", "Render");
    for (const e of renderables) {
      const t = e.get<TransformComponent>("Transform")!;
      const r = e.get<RenderComponent>("Render")!;

      const sphere = { center: t.pos, radius: r.boundingRadius };
      const lod = FrustumCullingEngine.evaluateLOD(sphere, cameraPos);
      r.lodLevel = lod;
      r.visible = lod !== "culled";
    }
  }
}
