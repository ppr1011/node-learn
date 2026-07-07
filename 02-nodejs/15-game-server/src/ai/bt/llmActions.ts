/**
 * 行为树 —— LLM 战术叶子(读取 enemy.llmDirective,驱动具体动作)
 *
 * LLM 在 LLMBrain 里异步写入 directive;这里只做同步读取与执行,
 * 保证 BT tick 永不阻塞等待网络。
 */

import { BTContext, NodeStatus } from './types';
import { LLMIntent } from '../llm/types';
import { acquireTarget, inAttackRange, attack, chase, flee, patrol } from './enemyActions';

function intent(ctx: BTContext): LLMIntent | null {
  return ctx.enemy.llmDirective?.intent ?? null;
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
  const i = intent(ctx);
  return i === 'patrol' || i === 'taunt';
}

/** taunt:原地站定短暂嘲讽,然后 success 让上层继续 */
export function taunt(ctx: BTContext): NodeStatus {
  const { enemy, dt } = ctx;
  enemy.aiState = 'idle';
  enemy.velocity = { x: 0, y: 0 };
  enemy.idleTimer -= dt;
  if (enemy.idleTimer > 0) return 'running';
  enemy.idleTimer = 1.2 + Math.random() * 0.8;
  return 'success';
}

// 复用战斗叶子,供 LLM 树装配
export { acquireTarget, inAttackRange, attack, chase, flee, patrol };
