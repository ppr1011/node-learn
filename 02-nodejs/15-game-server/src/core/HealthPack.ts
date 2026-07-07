import { Entity } from './Entity';

/**
 * 战场生命补给包 —— 定时随机刷新在地图上,玩家走近自动拾取回血。
 * 继承 Entity 复用全局唯一 id;带 TTL,超时未拾取自然消失。
 */
export class HealthPack extends Entity {
  readonly healAmount: number;
  readonly pickableAt: number;
  readonly expiresAt: number;

  constructor(x: number, y: number, healAmount: number, ttlMs: number, graceMs = 0) {
    super(x, y);
    this.healAmount = healAmount;
    const now = Date.now();
    this.pickableAt = now + graceMs;
    this.expiresAt = now + ttlMs;
  }

  toPublicState() {
    return {
      id: this.id,
      x: Math.round(this.position.x),
      y: Math.round(this.position.y),
      healAmount: this.healAmount,
    };
  }
}
