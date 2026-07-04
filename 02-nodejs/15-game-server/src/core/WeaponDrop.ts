import { Entity } from './Entity';
import { WeaponKind, WEAPONS, Rarity } from './Weapon';

/**
 * 地面武器掉落物 —— 击杀敌人后落地的可拾取实体。
 * 继承 Entity 复用全局唯一 id;带 TTL,超时未拾取自然消失(避免地图堆满掉落)。
 */
export class WeaponDrop extends Entity {
  readonly kind: WeaponKind;
  readonly rarity: Rarity;
  readonly expiresAt: number; // Date.now() 时间戳,过期即清理

  constructor(kind: WeaponKind, x: number, y: number, ttlMs: number) {
    super(x, y);
    this.kind = kind;
    this.rarity = WEAPONS[kind].rarity;
    this.expiresAt = Date.now() + ttlMs;
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
