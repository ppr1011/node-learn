import { Entity } from './Entity';

export type EnemyKind = 'slime' | 'skeleton' | 'demon';
export type EnemyAIState = 'idle' | 'patrol' | 'chase' | 'attack';

interface KindStats {
  hp: number;
  radius: number;
  speed: number;
  attackDamage: number;
  attackRange: number;
  detectionRange: number;
  attackCooldown: number; // ms
}

const KIND_STATS: Record<EnemyKind, KindStats> = {
  slime: {
    hp: 30, radius: 12, speed: 75, attackDamage: 7,
    attackRange: 36, detectionRange: 180, attackCooldown: 2200,
  },
  skeleton: {
    hp: 55, radius: 13, speed: 140, attackDamage: 13,
    attackRange: 45, detectionRange: 260, attackCooldown: 1400,
  },
  demon: {
    hp: 80, radius: 14, speed: 200, attackDamage: 20,
    attackRange: 50, detectionRange: 320, attackCooldown: 1000,
  },
};

export class Enemy extends Entity {
  readonly kind: EnemyKind;
  hp: number;
  readonly maxHp: number;
  readonly radius: number;
  readonly speed: number;
  isDead: boolean = false;
  aiState: EnemyAIState = 'idle';

  // AI internal state
  patrolTarget: { x: number; y: number } | null = null;
  targetPlayerId: number | null = null;
  lastAttackTime: number = 0;
  idleTimer: number = 0; // seconds remaining in current idle pause

  readonly attackDamage: number;
  readonly attackRange: number;
  readonly detectionRange: number;
  readonly attackCooldown: number;

  // remember initial spawn position for patrol range limiting
  readonly spawnX: number;
  readonly spawnY: number;

  // respawn timer (Date.now() value, 0 = not scheduled)
  respawnAt: number = 0;

  constructor(kind: EnemyKind, x: number, y: number) {
    super(x, y);
    this.kind = kind;
    this.spawnX = x;
    this.spawnY = y;

    const s = KIND_STATS[kind];
    this.maxHp = s.hp;
    this.hp = s.hp;
    this.radius = s.radius;
    this.speed = s.speed;
    this.attackDamage = s.attackDamage;
    this.attackRange = s.attackRange;
    this.detectionRange = s.detectionRange;
    this.attackCooldown = s.attackCooldown;
  }

  takeDamage(amount: number): void {
    if (this.isDead) return;
    this.hp = Math.max(0, this.hp - amount);
    if (this.hp <= 0) this.isDead = true;
  }

  respawn(x: number, y: number): void {
    this.hp = this.maxHp;
    this.isDead = false;
    this.aiState = 'idle';
    this.patrolTarget = null;
    this.targetPlayerId = null;
    this.lastAttackTime = 0;
    this.idleTimer = 1 + Math.random() * 2;
    this.respawnAt = 0;
    this.position.x = x;
    this.position.y = y;
    this.velocity = { x: 0, y: 0 };
  }

  toPublicState() {
    return {
      id: this.id,
      kind: this.kind,
      x: Math.round(this.position.x),
      y: Math.round(this.position.y),
      hp: this.hp,
      maxHp: this.maxHp,
      isDead: this.isDead,
      state: this.aiState,
    };
  }
}
