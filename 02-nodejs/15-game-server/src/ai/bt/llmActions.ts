/**
 * 行为树 —— LLM 战术叶子 + NPC 狩猎怪物
 */

import { BTContext, NodeStatus } from './types';
import { LLMIntent } from '../llm/types';
import { NpcSchedule } from '../agent/schedule';
import { GameConfig } from '../../config';
import { MsgType } from '../../network/Protocol';
import { Enemy, EnemyKind } from '../../core/Enemy';
import { NpcMemory } from '../llm/memory';
import { NpcQuests } from '../agent/quest';
import { canNpcAttackPlayer } from '../agent/relation';
import {
  acquireTarget,
  inAttackRange,
  attack,
  chase,
  flee,
  patrol,
  provokeAggro,
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

export function llmWantsGuide(ctx: BTContext): boolean {
  return intent(ctx) === 'guide';
}

export function llmWantsEscort(ctx: BTContext): boolean {
  return intent(ctx) === 'escort';
}

export function llmWantsFollowNpc(ctx: BTContext): boolean {
  return intent(ctx) === 'follow_npc';
}

const FOLLOW_DIST = 58;
const NPC_FOLLOW_DIST = 62;
const GUIDE_PLAYER_WAIT = 520; // 带路时等玩家跟上,超过此距离则缓步等待
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

function findNearestMob(
  enemy: Enemy,
  world: BTContext['world'],
  maxRange: number,
  kindFilter: EnemyKind | null
): Enemy | null {
  let nearest: Enemy | null = null;
  let min = maxRange;
  for (const other of world.enemies.values()) {
    if (other.id === enemy.id || other.isDead || other.llmEnabled) continue;
    if (kindFilter && other.kind !== kindFilter) continue;
    const d = dist(enemy.position.x, enemy.position.y, other.position.x, other.position.y);
    if (d < min) { min = d; nearest = other; }
  }
  return nearest;
}

/** 探测最近普通怪物 → ctx.mobTarget(默认仅在 detectionRange 内) */
export function acquireMobTarget(ctx: BTContext): boolean {
  const { enemy, world } = ctx;
  const nearest = findNearestMob(enemy, world, enemy.detectionRange, enemy.huntMobKind);
  ctx.mobTarget = nearest;
  enemy.targetEnemyId = nearest ? nearest.id : null;
  return !!nearest;
}

/** 委托狩猎:全图搜索指定种类怪物并写入 ctx.mobTarget */
export function acquireMobTargetSeek(ctx: BTContext): boolean {
  const { enemy, world } = ctx;
  const nearest = findNearestMob(enemy, world, GameConfig.LLM_HUNT_SEEK_RANGE, enemy.huntMobKind);
  ctx.mobTarget = nearest;
  enemy.targetEnemyId = nearest ? nearest.id : null;
  return !!nearest;
}

export function shouldSeekMob(ctx: BTContext): boolean {
  const { enemy } = ctx;
  if (!enemy.llmEnabled || llmWantsFlee(ctx)) return false;
  if (enemy.huntForPlayerId === null) return false;
  if (!llmWantsHunt(ctx) && enemy.huntMobKind === null) return false;
  if (acquireMobTarget(ctx)) return false;
  return acquireMobTargetSeek(ctx);
}

/** 朝远处委托目标移动(进入 detectionRange 后由 chaseMob 接管) */
export function seekMob(ctx: BTContext): NodeStatus {
  return chaseMob(ctx);
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
    // NPC 出手帮打 → 怪把仇恨转到 NPC 身上(玩家借机脱身)
    provokeAggro(mobTarget, enemy, now);
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
      let allyPlayer = enemy.huntForPlayerId !== null
        ? world.players.get(enemy.huntForPlayerId)
        : null;
      if (!allyPlayer && enemy.followPlayerId !== null) {
        allyPlayer = world.players.get(enemy.followPlayerId);
      }
      allyName = allyPlayer?.name;
      NpcMemory.onMobKill(enemy, mobTarget.kind, now, allyName);
      if (allyPlayer) {
        NpcQuests.onNpcKillMob(
          world,
          allyPlayer,
          enemy,
          mobTarget.kind,
          mobTarget.position.x,
          mobTarget.position.y,
          now
        );
      }
      ctx.mobTarget = null;
      enemy.targetEnemyId = null;
    }
  }
  return 'success';
}

/** 找到本小队的 striker(leader) */
function squadLeader(ctx: BTContext): Enemy | null {
  const { enemy, world } = ctx;
  if (enemy.squadId === null) return null;
  for (const other of world.enemies.values()) {
    if (other.squadId === enemy.squadId && other.squadRole === 'striker') return other;
  }
  return null;
}

/** NPC 追击普通怪物;在小队中按分工改移动目标点(flanker 包抄 / bait 拉仇恨,功能9) */
export function chaseMob(ctx: BTContext): NodeStatus {
  const { enemy, mobTarget, now } = ctx;
  if (!mobTarget || mobTarget.isDead) return 'failure';
  enemy.aiState = 'chase';

  let tx = mobTarget.position.x;
  let ty = mobTarget.position.y;

  if (enemy.squadRole === 'flanker') {
    // 绕到怪相对 leader 的「远侧」:沿 leader→怪 方向延伸到怪身后,形成两翼包抄
    const leader = squadLeader(ctx);
    if (leader && leader.id !== enemy.id) {
      const dx = mobTarget.position.x - leader.position.x;
      const dy = mobTarget.position.y - leader.position.y;
      const d = Math.hypot(dx, dy) || 1;
      const FLANK = 72;
      tx = mobTarget.position.x + (dx / d) * FLANK;
      ty = mobTarget.position.y + (dy / d) * FLANK;
    }
  } else if (enemy.squadRole === 'bait') {
    // bait 直冲并主动拉仇恨,替队友吸引怪的注意
    provokeAggro(mobTarget, enemy, now);
  }

  moveToward(enemy, tx, ty, enemy.speed);
  return 'running';
}

/** 夜晚回巢:远离出生点且非跟随/逃跑时,朝出生点缓步撤回(功能7) */
export function shouldReturnHome(ctx: BTContext): boolean {
  const { enemy, world } = ctx;
  if (!enemy.llmEnabled) return false;
  if (enemy.followPlayerId !== null) return false;
  if (enemy.a2aRole !== null || enemy.followNpcId !== null) return false;
  if (enemy.llmDirective?.intent === 'flee') return false;
  if (!NpcSchedule.biasFor(world.dayPhase).homebound) return false;
  const d = dist(enemy.position.x, enemy.position.y, enemy.spawnX, enemy.spawnY);
  return d > GameConfig.NIGHT_HOME_RADIUS;
}

export function returnHome(ctx: BTContext): NodeStatus {
  const { enemy } = ctx;
  enemy.aiState = 'patrol';
  moveToward(enemy, enemy.spawnX, enemy.spawnY, enemy.speed * 0.6);
  const d = dist(enemy.position.x, enemy.position.y, enemy.spawnX, enemy.spawnY);
  if (d <= GameConfig.NIGHT_HOME_RADIUS * 0.5) {
    enemy.aiState = 'idle';
    enemy.velocity = { x: 0, y: 0 };
  }
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

/** 默认中立:仅 LLM 意图为 attack 且附近存在可攻击(已结仇/被挑衅)的玩家 */
export function shouldAttackPlayer(ctx: BTContext): boolean {
  if (!hasLlmDirective(ctx) || !llmWantsAttack(ctx)) return false;
  const { enemy, world } = ctx;
  const chatText = enemy.llmChatPending?.text;

  for (const p of world.players.values()) {
    if (p.isDead) continue;
    const d = dist(enemy.position.x, enemy.position.y, p.position.x, p.position.y);
    if (d > enemy.detectionRange * 1.2) continue;
    if (canNpcAttackPlayer(enemy, p.name, chatText)) return true;
  }
  return false;
}

/** 应狩猎:仅在被玩家委托清怪时才打怪(说「帮我去打」等) */
export function shouldHuntMob(ctx: BTContext): boolean {
  if (!ctx.enemy.llmEnabled) return false;
  if (llmWantsFlee(ctx)) return false;
  if (ctx.enemy.a2aRole === 'guide' || ctx.enemy.a2aRole === 'escort') return false;
  if (ctx.enemy.followNpcId !== null) return false;
  // 核心:无玩家委托时不主动打怪
  if (ctx.enemy.huntForPlayerId === null) return false;
  if (!NpcSchedule.biasFor(ctx.world.dayPhase).huntAllowed) return false;
  return llmWantsHunt(ctx) || ctx.enemy.huntMobKind !== null || intent(ctx) === 'hunt';
}

/** 是否处于带路模式 */
export function shouldGuide(ctx: BTContext): boolean {
  const { enemy } = ctx;
  return enemy.llmEnabled && enemy.a2aRole === 'guide' && enemy.guideTargetNpcId !== null;
}

/** 带路:走向目标 NPC,玩家落后时缓步等待 */
export function guideToNpc(ctx: BTContext): NodeStatus {
  const { enemy, world } = ctx;
  const target = enemy.guideTargetNpcId !== null
    ? world.enemies.get(enemy.guideTargetNpcId)
    : null;
  if (!target || target.isDead) return 'failure';

  const player = enemy.guideForPlayerId !== null
    ? world.players.get(enemy.guideForPlayerId)
    : null;
  if (player && !player.isDead) {
    const pd = dist(enemy.position.x, enemy.position.y, player.position.x, player.position.y);
    const td = dist(enemy.position.x, enemy.position.y, target.position.x, target.position.y);
    if (pd > GUIDE_PLAYER_WAIT && td > GameConfig.A2A_GUIDE_ARRIVE_DIST * 2) {
      enemy.aiState = 'idle';
      enemy.velocity = { x: 0, y: 0 };
      return 'running';
    }
  }

  enemy.aiState = 'patrol';
  moveToward(enemy, target.position.x, target.position.y, enemy.speed * 0.9);
  return 'running';
}

/** 是否处于护送模式 */
export function shouldEscort(ctx: BTContext): boolean {
  const { enemy } = ctx;
  return enemy.llmEnabled && enemy.a2aRole === 'escort' && enemy.escortTargetNpcId !== null;
}

export function isEscortSeek(ctx: BTContext): boolean {
  return ctx.enemy.escortPhase === 'seek';
}

/** 护送阶段1:前往目标 NPC */
export function escortSeek(ctx: BTContext): NodeStatus {
  const { enemy, world } = ctx;
  const target = enemy.escortTargetNpcId !== null
    ? world.enemies.get(enemy.escortTargetNpcId)
    : null;
  if (!target || target.isDead) return 'failure';
  enemy.aiState = 'patrol';
  moveToward(enemy, target.position.x, target.position.y, enemy.speed);
  return 'running';
}

/** 护送阶段2:带目标 NPC 返回目的地 */
export function escortLead(ctx: BTContext): NodeStatus {
  const { enemy } = ctx;
  enemy.aiState = 'patrol';
  moveToward(enemy, enemy.escortDestX, enemy.escortDestY, enemy.speed * 0.85);
  return 'running';
}

/** 是否跟随另一 NPC(A2A 被护送方) */
export function shouldFollowNpc(ctx: BTContext): boolean {
  const { enemy } = ctx;
  return enemy.llmEnabled && enemy.followNpcId !== null;
}

/** 跟随另一 NPC,保持间距 */
export function followNpc(ctx: BTContext): NodeStatus {
  const { enemy, world } = ctx;
  if (enemy.followNpcId === null) return 'failure';
  const leader = world.enemies.get(enemy.followNpcId);
  if (!leader || leader.isDead) {
    enemy.followNpcId = null;
    enemy.a2aRole = null;
    return 'failure';
  }

  const d = dist(enemy.position.x, enemy.position.y, leader.position.x, leader.position.y);
  if (d <= NPC_FOLLOW_DIST) {
    enemy.aiState = 'idle';
    enemy.velocity = { x: 0, y: 0 };
    return 'running';
  }

  enemy.aiState = 'patrol';
  moveToward(enemy, leader.position.x, leader.position.y, enemy.speed * 0.92);
  return 'running';
}

export { acquireTarget, inAttackRange, attack, chase, flee, patrol };
