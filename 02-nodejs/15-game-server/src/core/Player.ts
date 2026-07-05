import { Entity } from './Entity';
import { Session } from '../network/Session';
import { GameConfig } from '../config';
import { WeaponKind, WEAPONS } from './Weapon';
import { ExplorationMap } from './ExplorationMap';

export class Player extends Entity {
  readonly name: string;
  readonly token: string; // 稳定角色身份(客户端本地保存),用于掉线重连恢复存档
  session: Session;
  hp: number = 100;
  maxHp: number = 100;
  radius: number = GameConfig.PLAYER_RADIUS; // 碰撞半径
  speed: number = 200; // pixels per second
  // 攻击属性由当前武器决定(见 equip);初始为 fist,与旧版写死值一致
  attackRange: number = WEAPONS.fist.range;
  attackDamage: number = WEAPONS.fist.damage;
  attackCooldown: number = WEAPONS.fist.cooldown; // ms
  lastAttackTime: number = 0;
  isDead: boolean = false;

  // 装备与朝向
  weapon: WeaponKind = 'fist';
  facing: number = 0; // 弧度;移动时更新,攻击时朝向目标 → 驱动客户端方向性动画

  // AOI tracking
  aoiCellX: number = -1;
  aoiCellY: number = -1;
  visiblePlayers: Set<number> = new Set();

  // 迷雾探索
  exploration: ExplorationMap = new ExplorationMap();

  constructor(name: string, session: Session, token: string) {
    super();
    this.name = name;
    this.session = session;
    this.token = token;
  }

  canAttack(): boolean {
    return !this.isDead && (Date.now() - this.lastAttackTime) >= this.attackCooldown;
  }

  /** 装备武器:把 Weapon 表的数值拷到玩家身上(死亡不清空,复活保留) */
  equip(kind: WeaponKind): void {
    const w = WEAPONS[kind];
    this.weapon = kind;
    this.attackDamage = w.damage;
    this.attackRange = w.range;
    this.attackCooldown = w.cooldown;
  }

  takeDamage(damage: number): void {
    if (this.isDead) return;
    this.hp = Math.max(0, this.hp - damage);
    if (this.hp <= 0) {
      this.isDead = true;
    }
  }

  respawn(x: number, y: number): void {
    this.hp = this.maxHp;
    this.isDead = false;
    this.position = { x, y };
    this.velocity = { x: 0, y: 0 };
  }

  toPublicState() {
    return {
      id: this.id,
      name: this.name,
      x: Math.round(this.position.x),
      y: Math.round(this.position.y),
      hp: this.hp,
      maxHp: this.maxHp,
      isDead: this.isDead,
      weapon: this.weapon,
      facing: Math.round(this.facing * 100) / 100,
    };
  }
}
