import { Entity } from './Entity';
import { LLMDirective } from '../ai/llm/types';
import { NpcMemoryEntry, NpcPlayerRelation } from '../ai/llm/memory';

export type EnemyKind = 'slime' | 'skeleton' | 'demon' | 'orc' | 'wraith' | 'golem' | 'dragon';
export type EnemyAIState = 'idle' | 'patrol' | 'chase' | 'attack' | 'flee';

interface KindStats {
  hp: number;
  radius: number;
  speed: number;
  attackDamage: number;
  attackRange: number;
  detectionRange: number;
  attackCooldown: number; // ms
  xpReward: number; // 击杀该敌人给予的经验值(越强给得越多)
}

const KIND_STATS: Record<EnemyKind, KindStats> = {
  slime: {
    hp: 30, radius: 12, speed: 75, attackDamage: 7,
    attackRange: 36, detectionRange: 180, attackCooldown: 2200, xpReward: 12,
  },
  skeleton: {
    hp: 55, radius: 13, speed: 140, attackDamage: 13,
    attackRange: 45, detectionRange: 260, attackCooldown: 1400, xpReward: 24,
  },
  demon: {
    hp: 80, radius: 14, speed: 200, attackDamage: 20,
    attackRange: 50, detectionRange: 320, attackCooldown: 1000, xpReward: 45,
  },
  // ── 深层带专属强敌(以下为「基础」数值,构造时再乘区域 statMult) ────────────
  orc: { // 坦克型:血厚、伤害高、动作偏慢
    hp: 110, radius: 15, speed: 110, attackDamage: 22,
    attackRange: 50, detectionRange: 260, attackCooldown: 1500, xpReward: 40,
  },
  wraith: { // 高速刺客:速度快、探测远、出手频繁
    hp: 90, radius: 13, speed: 230, attackDamage: 26,
    attackRange: 46, detectionRange: 340, attackCooldown: 900, xpReward: 60,
  },
  golem: { // 超肉:极高血量、极慢、重击
    hp: 260, radius: 18, speed: 70, attackDamage: 34,
    attackRange: 56, detectionRange: 220, attackCooldown: 1900, xpReward: 90,
  },
  dragon: { // Boss 级:大体型、高血高伤、丰厚经验
    hp: 420, radius: 22, speed: 150, attackDamage: 44,
    attackRange: 70, detectionRange: 420, attackCooldown: 1200, xpReward: 160,
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
  targetEnemyId: number | null = null; // LLM NPC 狩猎普通怪物
  lastAttackTime: number = 0;
  idleTimer: number = 0; // seconds remaining in current idle pause
  llmPoseTimer: number = 0; // taunt 站定计时(与 patrol 的 idleTimer 分离)
  enraged: boolean = false; // demon 残血狂暴:一旦触发保持,速度提升(行为树 chase 分支设置)

  // LLM 战术层(仅 llmEnabled 的 NPC 使用)
  llmEnabled: boolean = false;
  displayName: string = '';
  personality: string = '';
  llmDirective: LLMDirective | null = null;
  llmLastRefresh: number = 0;
  llmChatPending: { from: string; text: string; at: number } | null = null;
  followPlayerId: number | null = null; // 跟随模式:持久绑定玩家 id
  followBoostTimer: number = 0; // 「走快点」临时加速(秒)
  /** Agent 记忆: episodic 事件流 + 玩家关系(每 NPC 独立) */
  llmMemory: NpcMemoryEntry[] = [];
  llmRelations: Record<string, NpcPlayerRelation> = {};

  readonly attackDamage: number;
  readonly attackRange: number;
  readonly detectionRange: number;
  readonly attackCooldown: number;
  readonly xpReward: number; // 被击杀时给予击杀者的经验

  // remember initial spawn position for patrol range limiting
  readonly spawnX: number;
  readonly spawnY: number;

  // 所属难度带(见 core/Zone.ts):控制复活落点与掉落幸运
  readonly zoneId: number;
  // 区域属性倍率(hp / 攻击力 / 经验已按此缩放,记录下来便于调试/复活)
  readonly statMult: number;

  // respawn timer (Date.now() value, 0 = not scheduled)
  respawnAt: number = 0;

  /**
   * @param statMult 区域属性倍率:缩放 hp / 攻击力 / 经验(深层带更硬更值钱)。默认 1。
   * @param zoneId   所属难度带 id(见 core/Zone.ts.ZONES)。默认 0(新手草原)。
   */
  constructor(kind: EnemyKind, x: number, y: number, statMult: number = 1, zoneId: number = 0) {
    super(x, y);
    this.kind = kind;
    this.spawnX = x;
    this.spawnY = y;
    this.zoneId = zoneId;
    this.statMult = statMult;

    const s = KIND_STATS[kind];
    // hp / 攻击力 / 经验 随区域倍率放大(取整);半径与速度、射程等手感属性保持不变
    this.maxHp = Math.round(s.hp * statMult);
    this.hp = this.maxHp;
    this.radius = s.radius;
    this.speed = s.speed;
    this.attackDamage = Math.round(s.attackDamage * statMult);
    this.attackRange = s.attackRange;
    this.detectionRange = s.detectionRange;
    this.attackCooldown = s.attackCooldown;
    this.xpReward = Math.round(s.xpReward * statMult);
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
    this.targetEnemyId = null;
    this.lastAttackTime = 0;
    this.enraged = false;
    this.llmDirective = null;
    this.llmChatPending = null;
    this.llmPoseTimer = 0;
    this.followPlayerId = null;
    this.followBoostTimer = 0;
    this.idleTimer = 1 + Math.random() * 2;
    this.respawnAt = 0;
    this.position.x = x;
    this.position.y = y;
    this.velocity = { x: 0, y: 0 };
  }

  toPublicState() {
    const state: Record<string, unknown> = {
      id: this.id,
      kind: this.kind,
      x: Math.round(this.position.x),
      y: Math.round(this.position.y),
      hp: this.hp,
      maxHp: this.maxHp,
      isDead: this.isDead,
      state: this.aiState,
    };
    if (this.llmEnabled && this.displayName) {
      state.displayName = this.displayName;
      state.llmEnabled = true;
    }
    return state;
  }
}
