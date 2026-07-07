/**
 * 行为树 —— 敌人 AI 的树形装配
 *
 * 一棵树 = 一段声明式 AI。读法(自上而下、从左到右优先):
 *
 *   Selector(                       // 有目标就战斗,否则巡逻
 *     Sequence(                     // 「战斗」子树,前提是能锁定目标
 *       Condition: 探测到目标?,
 *       Selector(                   // 锁定后的优先级决策
 *         Sequence(残血 & 是史莱姆 → 逃跑),   // 1. 怂:slime 残血就跑
 *         Sequence(在攻击距离内 → 攻击),        // 2. 够得着就打(内部走冷却)
 *         追击                                  // 3. 够不着就追(demon 残血自动狂暴)
 *       )
 *     ),
 *     巡逻                          // 没有目标:回到出生点附近游荡
 *   )
 *
 * 想加新行为(如「呼叫增援」「绕后」),只需再插一个分支——这正是 BT 相对 switch 状态机
 * 的价值:行为是**数据/结构**,不是缠在一起的控制流。
 */

import { BTNode } from './types';
import { sel, seq, cond, act } from './nodes';
import { EnemyKind } from '../../core/Enemy';
import {
  acquireTarget,
  isLowHp,
  inAttackRange,
  attack,
  chase,
  flee,
  patrol,
  hasAggroNpc,
  inAggroAttackRange,
  attackAggroNpc,
  chaseAggroNpc,
} from './enemyActions';

/** 按敌人种类构建一棵树(种类差异通过闭包捕获 kind 注入到条件里) */
export function buildEnemyTree(kind: EnemyKind): BTNode {
  return sel(
    // 0. 仇恨转移:被 NPC 帮忙揍时,优先回头死磕那个 NPC(玩家得以脱身)
    //    aggroNpcId 只会被 NPC 的 attackMob 设到普通怪身上,故此分支对 NPC 自身恒 failure
    seq(
      cond('hasAggroNpc', hasAggroNpc),
      sel(
        seq(cond('inAggroRange', inAggroAttackRange), act('attackAggroNpc', attackAggroNpc)),
        act('chaseAggroNpc', chaseAggroNpc)
      )
    ),
    seq(
      cond('acquireTarget', acquireTarget),
      sel(
        // 1. 史莱姆残血逃跑(其它种类此分支恒 failure,自然落到下面)
        seq(cond('slimeLowHp', (c) => kind === 'slime' && isLowHp(c)), act('flee', flee)),
        // 2. 进入攻击距离 → 攻击
        seq(cond('inAttackRange', inAttackRange), act('attack', attack)),
        // 3. 否则追击(demon 残血在 chase 内自动狂暴加速)
        act('chase', chase)
      )
    ),
    // 无目标 → 巡逻
    act('patrol', patrol)
  );
}
