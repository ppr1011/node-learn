/**
 * 行为树(Behavior Tree)—— 类型契约
 *
 * 三种执行结果(BT 的核心语义,区别于 FSM 的「当前状态」):
 *   - success : 节点完成且成功(如「已到达」「已攻击」)
 *   - failure : 节点无法执行(如「视野内没有目标」)
 *   - running : 节点仍在进行中,下一 tick 继续(如「正在追击/巡逻」)
 *
 * 每 tick 从根节点自顶向下遍历;组合节点(Selector/Sequence)据子节点结果决定走向。
 * 节点本身**无状态**,所有「记忆」放在黑板 BTContext(指向 enemy 上的字段),
 * 因此同一种敌人可共享一棵树实例。
 */

import { Enemy } from '../../core/Enemy';
import { Player } from '../../core/Player';
import { GameWorld } from '../../core/GameWorld';

export type NodeStatus = 'success' | 'failure' | 'running';

/** 黑板:一次 tick 的共享上下文。target / mobTarget 由探测节点写入 */
export interface BTContext {
  enemy: Enemy;
  world: GameWorld;
  dt: number;
  now: number;
  target: Player | null;
  mobTarget: Enemy | null;
}

export interface BTNode {
  tick(ctx: BTContext): NodeStatus;
}
