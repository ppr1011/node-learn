/**
 * 行为树 —— LLM 支撑的 NPC 树
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
  llmWantsTaunt,
  shouldAttackPlayer,
  shouldFollow,
  followPlayer,
  shouldHuntMob,
  acquireMobTarget,
  inMobAttackRange,
  attackMob,
  chaseMob,
  shouldReturnHome,
  returnHome,
} from './llmActions';

/** LLM NPC 专用树 */
export function buildLlmNpcTree(kind: EnemyKind): BTNode {
  const playerCombat = sel(
    seq(cond('acquireTarget', acquireTarget), sel(
      seq(cond('inAttackRange', inAttackRange), act('attack', attack)),
      act('chase', chase)
    )),
    act('patrol', patrol)
  );

  const mobCombat = sel(
    seq(cond('acquireMob', acquireMobTarget), sel(
      seq(cond('inMobRange', inMobAttackRange), act('attackMob', attackMob)),
      act('chaseMob', chaseMob)
    )),
    act('patrol', patrol)
  );

  const followSubtree = sel(
    seq(cond('huntWhileFollow', shouldHuntMob), mobCombat),
    act('followPlayer', followPlayer)
  );

  return sel(
    seq(cond('llmFlee', (c) => hasLlmDirective(c) && llmWantsFlee(c)),
        cond('acquireTarget', acquireTarget),
        act('flee', flee)),
    seq(cond('shouldFollow', shouldFollow), followSubtree),
    seq(cond('returnHome', shouldReturnHome), act('returnHome', returnHome)),
    seq(cond('shouldHunt', shouldHuntMob), mobCombat),
    seq(cond('llmAttack', shouldAttackPlayer), playerCombat),
    seq(cond('llmPatrol', (c) => hasLlmDirective(c) && llmWantsPatrol(c)), act('patrol', patrol)),
    seq(cond('llmTaunt', (c) => hasLlmDirective(c) && llmWantsTaunt(c)),
        act('taunt', taunt),
        act('patrol', patrol)),
    buildEnemyTree(kind)
  );
}
