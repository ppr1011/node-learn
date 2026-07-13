/**
 * 基础 02 - 基于 EventEmitter 的计数器(骨架)
 */
import { EventEmitter } from "events";

export class Counter extends EventEmitter {
  // TODO: 维护 value

  get value(): number {
    throw new Error("TODO: 实现 value getter");
  }

  increment(step = 1): void {
    // TODO: 校验 step;累加;发 "change";跨越 10 的倍数时发 "milestone"
    throw new Error("TODO: 实现 increment");
  }

  reset(): void {
    // TODO: 归零并发 "reset"
    throw new Error("TODO: 实现 reset");
  }
}
