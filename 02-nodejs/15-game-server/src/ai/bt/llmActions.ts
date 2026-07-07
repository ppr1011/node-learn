/**
 * 行为树 —— LLM 战术叶子 + NPC 狩猎怪物
 */

import { BTContext, NodeStatus } from './types';
import { LLMIntent } from '../llm/types';
import { GameConfig } from '../../config';
import { MsgType } from '../../network/Protocol';
import { Enemy } from '../../core/Enemy';
import { NpcMemory } from '../llm/memory';
import {
  acquireTarget,
  inAttackRange,
  attack,
  chase,
  flee,
  patrol,
} from './enemyActions';

function intent(ctx: BTContext): LLMIntent | null {
  return ctx.enemy.llmDirective?.intent ?? null;
}

function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

function moveToward(self: Enemy, tx: number, ty: number, speed: number): void {
  const dx = tx - self.position.x;
  const dy = ty - self.position.y;
  const d = Math.hypot(dx, dy);
  if (d < 2) { self.velocity = { x: 0, y: 0 }; return; }
  self.velocity = { x: (dx / d) * speed, y: (dy / d) * speed };
}

function broadcastNear(
  ctx: BTContext,
  x: number,
  y: number,
  type: MsgType,
  data: unknown,
  range: number
): void {
  for (const p of ctx.world.players.values()) {
    if (p.isDead) continue;
    if (dist(p.position.x, p.position.y, x, y) <= range) {
      p.session.send(type, data);
    }
  }
}

export function hasLlmDirective(ctx: BTContext): boolean {
  return ctx.enemy.llmDirective !== null;
}

export function llmWantsFlee(ctx: BTContext): boolean {
  return intent(ctx) === 'flee';
}

export function llmWantsAttack(ctx: BTContext): boolean {
  return intent(ctx) === 'attack';
}

export function llmWantsPatrol(ctx: BTContext): boolean {
  return intent(ctx) === 'patrol';
}

export function llmWantsTaunt(ctx: BTContext): boolean {
  return intent(ctx) === 'taunt';
}

export function llmWantsHunt(ctx: BTContext): boolean {
  return intent(ctx) === 'hunt';
}

export function llmWantsFollow(ctx: BTContext): boolean {
  return intent(ctx) === 'follow';
}

const FOLLOW_DIST = 58;
const FOLLOW_MAX_DIST = 900;

/** 解析跟随目标 → ctx.target */
export function acquireFollowTarget(ctx: BTContext): boolean {
  const { enemy, world } = ctx;
  if (enemy.followPlayerId === null) return false;
  const player = world.players.get(enemy.followPlayerId);
  if (!player || player.isDead) {
    enemy.followPlayerId = null;
    ctx.target = null;
    return false;
  }
  ctx.target = player;
  return true;
}

/** 是否处于跟随模式(持久状态,不随 LLM 周期刷新丢失) */
export function shouldFollow(ctx: BTContext): boolean {
  return ctx.enemy.llmEnabled && ctx.enemy.followPlayerId !== null && acquireFollowTarget(ctx);
}

/** 跟随玩家:保持 FOLLOW_DIST 间距,过远则解除跟随 */
export function followPlayer(ctx: BTContext): NodeStatus {
  const { enemy, target, dt } = ctx;
  if (!target) return 'failure';

  if (enemy.followBoostTimer > 0) {
    enemy.followBoostTimer -= dt;
  }

  const d = dist(enemy.position.x, enemy.position.y, target.position.x, target.position.y);
  if (d > FOLLOW_MAX_DIST) {
    enemy.followPlayerId = null;
    return 'failure';
  }

  if (d <= FOLLOW_DIST) {
    enemy.aiState = 'idle';
    enemy.velocity = { x: 0, y: 0 };
    return 'running';
  }

  const speedMul = enemy.followBoostTimer > 0 ? 1.3 : 0.95;
  enemy.aiState = 'patrol';
  moveToward(enemy, target.position.x, target.position.y, enemy.speed * speedMul);
  return 'running';
}

/** 视野内有普通怪物(非 LLM NPC) */
export function hasNearbyMob(ctx: BTContext): boolean {
  return acquireMobTarget(ctx);
}

/** 探测最近普通怪物 → ctx.mobTarget */
export function acquireMobTarget(ctx: BTContext): boolean {
  const { enemy, world } = ctx;
  let nearest: Enemy | null = null;
  let min = enemy.detectionRange;
  for (const other of world.enemies.values()) {
    if (other.id === enemy.id || other.isDead || other.llmEnabled) continue;
    const d = dist(enemy.position.x, enemy.position.y, other.position.x, other.position.y);
    if (d < min) { min = d; nearest = other; }
  }
  ctx.mobTarget = nearest;
  enemy.targetEnemyId = nearest ? nearest.id : null;
  return !!nearest;
}

export function inMobAttackRange(ctx: BTContext): boolean {
  const mob = ctx.mobTarget;
  if (!mob) return false;
  return dist(ctx.enemy.position.x, ctx.enemy.position.y, mob.position.x, mob.position.y) <= ctx.enemy.attackRange;
}

/** NPC 攻击普通怪物 */
export function attackMob(ctx: BTContext): NodeStatus {
  const { enemy, mobTarget, world, now } = ctx;
  enemy.aiState = 'attack';
  enemy.velocity = { x: 0, y: 0 };
  if (!mobTarget || mobTarget.isDead) return 'success';

  if (now - enemy.lastAttackTime >= enemy.attackCooldown) {
    enemy.lastAttackTime = now;
    mobTarget.takeDamage(enemy.attackDamage);
    const hitMsg = {
      enemyId: mobTarget.id,
      attackerId: -enemy.id,
      damage: enemy.attackDamage,
      enemyHp: mobTarget.hp,
    };
    broadcastNear(ctx, enemy.position.x, enemy.position.y, MsgType.ENEMY_HIT, hitMsg, enemy.detectionRange * 2);

    if (mobTarget.isDead) {
      const deadMsg = { enemyId: mobTarget.id, killerId: -enemy.id };
      broadcastNear(ctx, enemy.position.x, enemy.position.y, MsgType.ENEMY_DEAD, deadMsg, enemy.detectionRange * 2);
      mobTarget.respawnAt = Date.now() + GameConfig.ENEMY_RESPAWN_TIME;
      let allyName: string | undefined;
      if (enemy.followPlayerId !== null) {
        const ally = world.players.get(enemy.followPlayerId);
        allyName = ally?.name;
      }
      NpcMemory.onMobKill(enemy, mobTarget.kind, now, allyName);
      ctx.mobTarget = null;
      enemy.targetEnemyId = null;
    }
  }
  return 'success';
}

/** NPC 追击普通怪物 */
export function chaseMob(ctx: BTContext): NodeStatus {
  const { enemy, mobTarget } = ctx;
  if (!mobTarget || mobTarget.isDead) return 'failure';
  enemy.aiState = 'chase';
  moveToward(enemy, mobTarget.position.x, mobTarget.position.y, enemy.speed);
  return 'running';
}

/** taunt:短暂站定(用 llmPoseTimer,不占用 patrol 的 idleTimer) */
export function taunt(ctx: BTContext): NodeStatus {
  const { enemy, dt } = ctx;
  if (enemy.llmPoseTimer <= 0) {
    enemy.llmPoseTimer = 0.8;
  }
  enemy.aiState = 'idle';
  enemy.velocity = { x: 0, y: 0 };
  enemy.llmPoseTimer -= dt;
  if (enemy.llmPoseTimer > 0) return 'running';
  enemy.llmPoseTimer = 0;
  return 'success';
}

/** 信任足够高时拒绝攻击(记忆驱动) */
export function shouldAttackPlayer(ctx: BTContext): boolean {
  if (!hasLlmDirective(ctx) || !llmWantsAttack(ctx)) return false;
  const { enemy, world } = ctx;
  for (const p of world.players.values()) {
    if (p.isDead) continue;
    const d = dist(enemy.position.x, enemy.position.y, p.position.x, p.position.y);
    if (d > enemy.detectionRange * 1.2) continue;
    const rel = enemy.llmRelations[p.name];
    if (!rel) continue;
    if (rel.trust >= 25 && /承诺不攻击|挚友|友善/.test(rel.label)) return false;
    if (rel.trust >= 50) return false;
  }
  return true;
}

/** 应主动狩猎:显式 hunt / 跟随途中顺路清怪 / 巡逻时附近刷怪 */
export function shouldHuntMob(ctx: BTContext): boolean {
  if (!ctx.enemy.llmEnabled) return false;
  if (llmWantsFlee(ctx)) return false;
  if (llmWantsHunt(ctx) || ctx.enemy.followPlayerId !== null) {
    return acquireMobTarget(ctx);
  }
  const i = intent(ctx);
  if (i === 'patrol' || i === 'taunt' || i === null) {
    return acquireMobTarget(ctx);
  }
  return false;
}

export { acquireTarget, inAttackRange, attack, chase, flee, patrol };
