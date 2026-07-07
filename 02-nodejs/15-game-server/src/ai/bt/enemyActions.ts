/**
 * 行为树 —— 敌人专用叶子(条件 + 动作)
 *
 * 逻辑基本是从旧版 EnemyAISystem 的私有方法平移过来的,拆成一个个可组合的叶子:
 * 探测目标 / 判定攻击距离 / 攻击 / 追击 / 逃跑 / 巡逻。
 * 动作里设置 enemy.aiState(客户端据此显示 chase/attack 光环),并只设置 velocity;
 * 真正的位移 + 边界收敛由 EnemyAISystem 在 tick 末尾统一 applyMovement。
 */

import { BTContext, NodeStatus } from './types';
import { Enemy } from '../../core/Enemy';
import { Player } from '../../core/Player';
import { GameWorld } from '../../core/GameWorld';
import { MsgType } from '../../network/Protocol';
import { GameConfig } from '../../config';
import { RumorBoard } from '../agent/rumor';

export const PATROL_RADIUS = 200; // 巡逻游荡的最大半径(距出生点)
const LOW_HP = 0.3; // 残血阈值(逃跑/狂暴触发线)

// ── 仇恨转移(aggro)调参 ─────────────────────────────────────────────
export const AGGRO_DURATION = 6000; // NPC 挑衅后,怪盯着 NPC 打的持续时间(ms),每次被 NPC 命中刷新
const AGGRO_LEASH_MULT = 3; // NPC 逃出 detectionRange × 该倍数则脱离仇恨,回头找玩家

function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

function moveToward(enemy: Enemy, tx: number, ty: number, speed: number): void {
  const dx = tx - enemy.position.x;
  const dy = ty - enemy.position.y;
  const d = Math.hypot(dx, dy);
  if (d < 2) { enemy.velocity = { x: 0, y: 0 }; return; }
  enemy.velocity = { x: (dx / d) * speed, y: (dy / d) * speed };
}

// ── 条件 ────────────────────────────────────────────────────────────
/** 探测范围内最近的存活玩家 → 写入黑板 ctx.target;找到=success */
export function acquireTarget(ctx: BTContext): boolean {
  const { enemy, world } = ctx;
  let nearest: Player | null = null;
  let min = enemy.detectionRange;
  for (const p of world.players.values()) {
    if (p.isDead) continue;
    const d = dist(enemy.position.x, enemy.position.y, p.position.x, p.position.y);
    if (d < min) { min = d; nearest = p; }
  }
  ctx.target = nearest;
  enemy.targetPlayerId = nearest ? nearest.id : null;
  return !!nearest;
}

export function isLowHp(ctx: BTContext): boolean {
  return ctx.enemy.hp / ctx.enemy.maxHp < LOW_HP;
}

export function inAttackRange(ctx: BTContext): boolean {
  const t = ctx.target;
  if (!t) return false;
  return dist(ctx.enemy.position.x, ctx.enemy.position.y, t.position.x, t.position.y) <= ctx.enemy.attackRange;
}

// ── 动作 ────────────────────────────────────────────────────────────
/** 原地攻击目标(冷却门控);命中广播 DAMAGE,击杀委托 CombatSystem 处理复活 */
export function attack(ctx: BTContext): NodeStatus {
  const { enemy, target, world, now } = ctx;
  enemy.aiState = 'attack';
  enemy.velocity = { x: 0, y: 0 };
  if (!target) return 'success';
  if (now - enemy.lastAttackTime >= enemy.attackCooldown) {
    enemy.lastAttackTime = now;
    target.takeDamage(enemy.attackDamage);
    const damageMsg = {
      attackerId: -enemy.id, // 负数表示攻击者是敌人
      targetId: target.id,
      damage: enemy.attackDamage,
      targetHp: target.hp,
    };
    target.session.send(MsgType.DAMAGE, damageMsg);
    for (const other of world.aoi.getNearbyPlayers(target)) {
      if (other.id !== target.id) other.session.send(MsgType.DAMAGE, damageMsg);
    }
    if (target.isDead) world.combat.handlePlayerDeath(target);
  }
  return 'success';
}

/** 追击目标;demon 残血后进入狂暴(enraged),速度提升且不再复原 */
export function chase(ctx: BTContext): NodeStatus {
  const { enemy, target } = ctx;
  if (!target) return 'failure';
  if (enemy.kind === 'demon' && enemy.hp / enemy.maxHp < LOW_HP) enemy.enraged = true;
  const speed = enemy.speed * (enemy.enraged ? 1.4 : 1);
  enemy.aiState = 'chase';
  moveToward(enemy, target.position.x, target.position.y, speed);
  return 'running';
}

/** 逃离目标(slime 残血用):朝反方向加速跑 */
export function flee(ctx: BTContext): NodeStatus {
  const { enemy, target } = ctx;
  if (!target) return 'failure';
  enemy.aiState = 'flee';
  const dx = enemy.position.x - target.position.x;
  const dy = enemy.position.y - target.position.y;
  const d = Math.hypot(dx, dy) || 1;
  enemy.velocity = { x: (dx / d) * enemy.speed * 1.1, y: (dy / d) * enemy.speed * 1.1 };
  return 'running';
}

/** 无目标时的巡逻游荡:在出生点附近随机选点,走到→停顿→再选点 */
export function patrol(ctx: BTContext): NodeStatus {
  const { enemy, dt } = ctx;
  enemy.idleTimer -= dt;

  if (!enemy.patrolTarget || enemy.idleTimer <= 0) {
    const angle = Math.random() * Math.PI * 2;
    const d = 40 + Math.random() * PATROL_RADIUS;
    enemy.patrolTarget = {
      x: Math.max(0, Math.min(GameConfig.MAP_WIDTH, enemy.spawnX + Math.cos(angle) * d)),
      y: Math.max(0, Math.min(GameConfig.MAP_HEIGHT, enemy.spawnY + Math.sin(angle) * d)),
    };
    enemy.idleTimer = 1.5 + Math.random() * 3;
    enemy.aiState = 'patrol';
  }

  if (enemy.patrolTarget) {
    const dx = enemy.patrolTarget.x - enemy.position.x;
    const dy = enemy.patrolTarget.y - enemy.position.y;
    if (Math.hypot(dx, dy) < 12) {
      enemy.patrolTarget = null;
      enemy.idleTimer = 1 + Math.random() * 2;
      enemy.aiState = 'idle';
      enemy.velocity = { x: 0, y: 0 };
    } else {
      moveToward(enemy, enemy.patrolTarget.x, enemy.patrolTarget.y, enemy.speed * 0.4);
    }
  } else {
    enemy.aiState = 'idle';
    enemy.velocity = { x: 0, y: 0 };
  }
  return 'running';
}

// ── 仇恨转移(aggro)：普通怪被帮忙打它的 NPC「拉仇恨」，回头改打 NPC ────────
function broadcastNearPlayers(
  world: GameWorld,
  x: number,
  y: number,
  type: MsgType,
  data: unknown,
  range: number
): void {
  for (const p of world.players.values()) {
    if (p.isDead) continue;
    if (dist(p.position.x, p.position.y, x, y) <= range) p.session.send(type, data);
  }
}

function clearAggro(enemy: Enemy): void {
  enemy.aggroNpcId = null;
  enemy.aggroUntil = 0;
}

/** NPC 命中普通怪时调用:把仇恨转到该 NPC 身上并刷新持续时间 */
export function provokeAggro(mob: Enemy, npc: Enemy, now: number): void {
  if (mob.llmEnabled || mob.isDead) return; // 只对普通怪生效
  mob.aggroNpcId = npc.id;
  mob.aggroUntil = now + AGGRO_DURATION;
}

/**
 * 是否仍锁定着 NPC 仇恨目标 → 写入 ctx.aggroNpc。
 * 过期 / NPC 已死或消失 / 被 NPC 甩出牵引范围,任一命中都清空仇恨并回头找玩家。
 */
export function hasAggroNpc(ctx: BTContext): boolean {
  const { enemy, world, now } = ctx;
  if (enemy.aggroNpcId === null) return false;
  if (now >= enemy.aggroUntil) { clearAggro(enemy); return false; }
  const npc = world.enemies.get(enemy.aggroNpcId);
  if (!npc || npc.isDead || !npc.llmEnabled) { clearAggro(enemy); return false; }
  const d = dist(enemy.position.x, enemy.position.y, npc.position.x, npc.position.y);
  if (d > enemy.detectionRange * AGGRO_LEASH_MULT) { clearAggro(enemy); return false; }
  ctx.aggroNpc = npc;
  enemy.targetPlayerId = null; // 明确放弃玩家目标(调试/客户端可见)
  return true;
}

export function inAggroAttackRange(ctx: BTContext): boolean {
  const n = ctx.aggroNpc;
  if (!n) return false;
  return dist(ctx.enemy.position.x, ctx.enemy.position.y, n.position.x, n.position.y) <= ctx.enemy.attackRange;
}

/** 攻击仇恨 NPC(结构同 attack,但目标是 Enemy,走 ENEMY_HIT / ENEMY_DEAD 广播) */
export function attackAggroNpc(ctx: BTContext): NodeStatus {
  const { enemy, aggroNpc, world, now } = ctx;
  enemy.aiState = 'attack';
  enemy.velocity = { x: 0, y: 0 };
  if (!aggroNpc || aggroNpc.isDead) return 'success';
  if (now - enemy.lastAttackTime >= enemy.attackCooldown) {
    enemy.lastAttackTime = now;
    aggroNpc.takeDamage(enemy.attackDamage);
    const hitMsg = {
      enemyId: aggroNpc.id,
      attackerId: -enemy.id, // 负数表示攻击者是敌人
      damage: enemy.attackDamage,
      enemyHp: aggroNpc.hp,
    };
    broadcastNearPlayers(world, enemy.position.x, enemy.position.y, MsgType.ENEMY_HIT, hitMsg, enemy.detectionRange * 2);

    if (aggroNpc.isDead) {
      const deadMsg = { enemyId: aggroNpc.id, killerId: -enemy.id };
      broadcastNearPlayers(world, enemy.position.x, enemy.position.y, MsgType.ENEMY_DEAD, deadMsg, enemy.detectionRange * 2);
      aggroNpc.respawnAt = now + GameConfig.ENEMY_RESPAWN_TIME;
      RumorBoard.add(
        world,
        aggroNpc.zoneId,
        `${aggroNpc.displayName || 'NPC'}为掩护同伴,倒在了${enemy.kind}的爪下`,
        now
      );
      clearAggro(enemy);
    }
  }
  return 'success';
}

/** 追击仇恨 NPC(demon 残血同样自动狂暴加速) */
export function chaseAggroNpc(ctx: BTContext): NodeStatus {
  const { enemy, aggroNpc } = ctx;
  if (!aggroNpc || aggroNpc.isDead) return 'failure';
  if (enemy.kind === 'demon' && enemy.hp / enemy.maxHp < LOW_HP) enemy.enraged = true;
  const speed = enemy.speed * (enemy.enraged ? 1.4 : 1);
  enemy.aiState = 'chase';
  moveToward(enemy, aggroNpc.position.x, aggroNpc.position.y, speed);
  return 'running';
}
