import type { Vec } from "../shared/map";
import type { Player } from "../shared/types";

export interface StuntCallbacks {
  command(action: string): void;
  playSound(name: string, pitch?: number): void;
}

/**
 * Encapsulates client-side grapple swing and hoverboard stunt scoring telemetry.
 */
export class StuntTracker {
  isSkating = false;
  localTrickScore = 0;

  private stuntText = "";
  private stuntUntil = 0;
  private lastGrapplePos: Vec | null = null;
  private swingMinY = Infinity;
  private swingMaxSpeed = 0;
  private swingAirTime = 0;
  private swingTickScore = 0;
  private gravitySwingAwarded = false;
  private apexVaultAwarded = false;
  private skateCruiseTimer = 0;
  private skateAirTime = 0;
  private skateCumulativeYaw = 0;
  private lastPlayerYaw = 0;

  activeBanner(now: number): string | null {
    return this.stuntUntil > now ? this.stuntText : null;
  }

  recordTrick(title: string, points: number, cb: StuntCallbacks): void {
    this.localTrickScore += points;
    cb.command(`trick:${points}`);
    this.stuntText = `[STUNT] ${title} +${points}`;
    this.stuntUntil = performance.now() + 2200;
    cb.playSound("trick", 1.25);
  }

  update(dt: number, player: Player | null, yaw: number, cb: StuntCallbacks): void {
    if (!player || player.seat >= 0) return;
    const speed = Math.hypot(player.vx, player.vy, player.vz);
    const horizSpeed = Math.hypot(player.vx, player.vz);

    // 1. Grapple Swing Stunts
    if (player.grapple) {
      if (!this.lastGrapplePos) {
        this.swingMinY = player.y;
        this.swingMaxSpeed = speed;
        this.swingAirTime = 0;
        this.swingTickScore = 0;
        this.gravitySwingAwarded = false;
        this.apexVaultAwarded = false;
      }
      this.swingMinY = Math.min(this.swingMinY, player.y);
      this.swingMaxSpeed = Math.max(this.swingMaxSpeed, speed);

      if (!player.grounded) {
        this.swingAirTime += dt;
        const comboMult = 1.0 + Math.min(4.0, Math.floor(this.swingAirTime * 1.5) * 0.5);
        const tick = speed * 3.5 * dt * comboMult;
        this.swingTickScore += tick;
        this.localTrickScore += tick;
        this.stuntText = `[SWING] 摆荡滞空 ${this.swingAirTime.toFixed(1)}s · 连击 ×${comboMult.toFixed(1)} · 实时 +${Math.floor(this.swingTickScore)}`;
        this.stuntUntil = performance.now() + 600;
      }

      if (speed > 16 && !this.gravitySwingAwarded) {
        this.gravitySwingAwarded = true;
        this.recordTrick("重力摆荡", 150, cb);
      }

      if (!this.apexVaultAwarded && player.y - this.swingMinY > 6 && player.vy <= 1.5 && speed > 10) {
        this.apexVaultAwarded = true;
        this.recordTrick("弧光飞跃", 250, cb);
      }
    } else if (this.lastGrapplePos) {
      if (this.swingAirTime > 0.4 && this.swingTickScore > 10) {
        const finalScore = Math.min(1000, Math.round(this.swingTickScore));
        cb.command(`trick:${finalScore}`);
      }
      if (this.swingMaxSpeed > 17 && player.vy > 3) {
        this.recordTrick("超空弹射", 350, cb);
      }
    }
    this.lastGrapplePos = player.grapple ? { ...player.grapple } : null;

    // 2. Skateboard Stunts
    if (this.isSkating) {
      if (player.grounded && horizSpeed > 16) {
        this.skateCruiseTimer += dt;
        if (this.skateCruiseTimer >= 1.0) {
          this.skateCruiseTimer -= 1.0;
          this.recordTrick("极速巡航", 50, cb);
        }
      } else {
        this.skateCruiseTimer = Math.max(0, this.skateCruiseTimer - dt * 2);
      }

      if (!player.grounded) {
        this.skateAirTime += dt;
        const dYaw = Math.abs(
          Math.atan2(Math.sin(yaw - this.lastPlayerYaw), Math.cos(yaw - this.lastPlayerYaw)),
        );
        this.skateCumulativeYaw += dYaw;
        if (this.skateCumulativeYaw >= Math.PI * 1.75) {
          this.skateCumulativeYaw = 0;
          this.recordTrick("星芒转体 360°", 500, cb);
        }
      } else {
        if (this.skateAirTime > 0.75 && horizSpeed > 9) {
          this.recordTrick("天际腾空", 200, cb);
        }
        this.skateAirTime = 0;
        this.skateCumulativeYaw = 0;
      }
    } else {
      this.skateCruiseTimer = 0;
      this.skateAirTime = 0;
      this.skateCumulativeYaw = 0;
    }
    this.lastPlayerYaw = yaw;
  }

  reset(): void {
    this.isSkating = false;
    this.localTrickScore = 0;
    this.stuntText = "";
    this.stuntUntil = 0;
    this.lastGrapplePos = null;
    this.swingMinY = Infinity;
    this.swingMaxSpeed = 0;
    this.swingAirTime = 0;
    this.swingTickScore = 0;
    this.gravitySwingAwarded = false;
    this.apexVaultAwarded = false;
    this.skateCruiseTimer = 0;
    this.skateAirTime = 0;
    this.skateCumulativeYaw = 0;
    this.lastPlayerYaw = 0;
  }
}
