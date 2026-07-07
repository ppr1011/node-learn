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

  // ── 等级 / 经验(服务端权威;击杀敌人获得经验,满级即升级) ──────────────
  level: number = 1;
  xp: number = 0; // 当前等级内已累积的经验(升级后清零并结转溢出)

  // AOI tracking
  aoiCellX: number = -1;
  aoiCellY: number = -1;
  visiblePlayers: Set<number> = new Set();

  // 迷雾探索
  exploration: ExplorationMap = new ExplorationMap();

  // 全局声望称号(功能8):由 Reputation.recompute 回写,展示在 nameplate / stats
  reputationTitle: string = '';

  constructor(name: string, session: Session, token: string) {
    super();
    this.name = name;
    this.session = session;
    this.token = token;
  }

  canAttack(): boolean {
    return !this.isDead && (Date.now() - this.lastAttackTime) >= this.attackCooldown;
  }

  // ── 等级公式 ────────────────────────────────────────────────────────────
  /** 从 level 升到 level+1 所需经验(随等级线性增长) */
  static xpForLevel(level: number): number {
    return 30 + (level - 1) * 40;
  }
  /** 升到下一级还需的总经验(客户端进度条用) */
  get xpToNext(): number {
    return Player.xpForLevel(this.level);
  }
  /** 当前等级对应的最大生命(每级 +20) */
  private maxHpForLevel(): number {
    return 100 + (this.level - 1) * 20;
  }
  /** 当前等级带来的额外攻击力(每级 +2,叠加在武器基础伤害之上) */
  private levelDamageBonus(): number {
    return (this.level - 1) * 2;
  }
  /** 依据当前武器 + 等级重算攻击力(equip / 升级后调用) */
  private recomputeAttack(): void {
    this.attackDamage = WEAPONS[this.weapon].damage + this.levelDamageBonus();
  }

  /**
   * 获得经验;可能连续升级(溢出结转)。返回本次提升的等级数(0 = 未升级)。
   * 升级奖励:提升上限生命并回满血、增强攻击力。
   */
  gainXp(amount: number): number {
    if (amount <= 0 || this.isDead) return 0;
    this.xp += amount;
    let gained = 0;
    while (this.xp >= this.xpToNext) {
      this.xp -= this.xpToNext;
      this.level++;
      gained++;
    }
    if (gained > 0) {
      this.maxHp = this.maxHpForLevel();
      this.hp = this.maxHp; // 升级回满血
      this.recomputeAttack();
    }
    return gained;
  }

  /** 装备武器:把 Weapon 表的数值拷到玩家身上(叠加等级加成;死亡不清空,复活保留) */
  equip(kind: WeaponKind): void {
    const w = WEAPONS[kind];
    this.weapon = kind;
    this.attackRange = w.range;
    this.attackCooldown = w.cooldown;
    this.recomputeAttack();
  }

  heal(amount: number): number {
    const actual = Math.min(amount, this.maxHp - this.hp);
    this.hp = Math.min(this.maxHp, this.hp + amount);
    return actual;
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
      level: this.level,
      xp: this.xp,
      xpToNext: this.xpToNext,
      ...(this.reputationTitle ? { title: this.reputationTitle } : {}),
    };
  }
}
