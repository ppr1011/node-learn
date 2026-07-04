/**
 * 行为树 —— 通用节点库(与具体游戏逻辑无关,可复用)
 *
 * 组合节点(控制流):
 *   - Selector(fallback):依次 tick 子节点,遇到第一个「非 failure」(success/running)即返回它;
 *                          全部 failure 才返回 failure。→「优先级:能做 A 就做 A,否则退而求其次」。
 *   - Sequence:依次 tick 子节点,遇到第一个「非 success」(failure/running)即返回它;
 *               全部 success 才返回 success。→「按顺序把一串步骤做完」。
 * 装饰节点:
 *   - Inverter:成功↔失败取反(running 透传)。
 * 叶子节点:
 *   - Condition:判定,返回 success/failure。
 *   - Action:执行,返回 success/failure/running。
 */

import { BTNode, BTContext, NodeStatus } from './types';

export class Selector implements BTNode {
  constructor(private readonly children: BTNode[]) {}
  tick(ctx: BTContext): NodeStatus {
    for (const child of this.children) {
      const s = child.tick(ctx);
      if (s !== 'failure') return s; // success 或 running 都直接冒泡返回
    }
    return 'failure';
  }
}

export class Sequence implements BTNode {
  constructor(private readonly children: BTNode[]) {}
  tick(ctx: BTContext): NodeStatus {
    for (const child of this.children) {
      const s = child.tick(ctx);
      if (s !== 'success') return s; // failure 或 running 都中断并冒泡
    }
    return 'success';
  }
}

export class Inverter implements BTNode {
  constructor(private readonly child: BTNode) {}
  tick(ctx: BTContext): NodeStatus {
    const s = this.child.tick(ctx);
    return s === 'success' ? 'failure' : s === 'failure' ? 'success' : 'running';
  }
}

export class Condition implements BTNode {
  constructor(readonly name: string, private readonly fn: (ctx: BTContext) => boolean) {}
  tick(ctx: BTContext): NodeStatus {
    return this.fn(ctx) ? 'success' : 'failure';
  }
}

export class Action implements BTNode {
  constructor(readonly name: string, private readonly fn: (ctx: BTContext) => NodeStatus) {}
  tick(ctx: BTContext): NodeStatus {
    return this.fn(ctx);
  }
}

// 简写工厂:让树的声明读起来接近伪代码
export const sel = (...c: BTNode[]): Selector => new Selector(c);
export const seq = (...c: BTNode[]): Sequence => new Sequence(c);
export const cond = (name: string, fn: (ctx: BTContext) => boolean): Condition => new Condition(name, fn);
export const act = (name: string, fn: (ctx: BTContext) => NodeStatus): Action => new Action(name, fn);
