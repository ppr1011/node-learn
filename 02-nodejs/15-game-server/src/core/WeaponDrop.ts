import { Entity } from './Entity';
import { WeaponKind, WEAPONS, Rarity } from './Weapon';

/**
 * 地面武器掉落物 —— 击杀敌人后落地的可拾取实体。
 * 继承 Entity 复用全局唯一 id;带 TTL,超时未拾取自然消失(避免地图堆满掉落)。
 * pickableAt:落地后的拾取宽限期 —— 贴身击杀时先让掉落物在地上「露个脸」,再允许被拾取。
 */
export class WeaponDrop extends Entity {
  readonly kind: WeaponKind;
  readonly rarity: Rarity;
  readonly pickableAt: number; // 早于此时间不可拾取(留出可见时间)
  readonly expiresAt: number; // Date.now() 时间戳,过期即清理

  constructor(kind: WeaponKind, x: number, y: number, ttlMs: number, graceMs = 0) {
    super(x, y);
    this.kind = kind;
    this.rarity = WEAPONS[kind].rarity;
    const now = Date.now();
    this.pickableAt = now + graceMs;
    this.expiresAt = now + ttlMs;
  }

  toPublicState() {
    return {
      id: this.id,
      kind: this.kind,
      rarity: this.rarity,
      x: Math.round(this.position.x),
      y: Math.round(this.position.y),
    };
  }
}
