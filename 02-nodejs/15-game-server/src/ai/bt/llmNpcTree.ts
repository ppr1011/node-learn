/**
 * 行为树 —— LLM 支撑的 NPC 树
 *
 * 架构:「LLM 大脑写意图 → BT 身体执行」
 *
 *   Selector(
 *     Sequence(LLM 说 flee → 探测目标 → 逃跑),
 *     Sequence(LLM 说 attack → 标准战斗子树),
 *     Sequence(LLM 说 patrol/taunt → 嘲讽停顿 → 巡逻),
 *     标准敌人树(兜底:LLM 未就绪或失败时仍能动)
 *   )
 *
 * LLM 不跑在 tick 里:EnemyAISystem 先调 LLMBrain.tick 异步刷新 directive,
 * 本树每帧只读 enemy.llmDirective,与 20Hz 主循环完全解耦。
 */

import { BTNode } from './types';
import { sel, seq, cond, act } from './nodes';
import { EnemyKind } from '../../core/Enemy';
import { buildEnemyTree } from './enemyTree';
import {
  acquireTarget,
  inAttackRange,
  attack,
  chase,
  flee,
  patrol,
  taunt,
  hasLlmDirective,
  llmWantsFlee,
  llmWantsAttack,
  llmWantsPatrol,
} from './llmActions';

/** LLM NPC 专用树:在标准战斗树上叠加 LLM 意图优先级 */
export function buildLlmNpcTree(kind: EnemyKind): BTNode {
  const combat = sel(
    seq(cond('acquireTarget', acquireTarget), sel(
      seq(cond('inAttackRange', inAttackRange), act('attack', attack)),
      act('chase', chase)
    )),
    act('patrol', patrol)
  );

  return sel(
    seq(cond('llmFlee', (c) => hasLlmDirective(c) && llmWantsFlee(c)),
        cond('acquireTarget', acquireTarget),
        act('flee', flee)),
    seq(cond('llmAttack', (c) => hasLlmDirective(c) && llmWantsAttack(c)), combat),
    seq(cond('llmPatrol', (c) => hasLlmDirective(c) && llmWantsPatrol(c)),
        act('taunt', taunt),
        act('patrol', patrol)),
    buildEnemyTree(kind)
  );
}
