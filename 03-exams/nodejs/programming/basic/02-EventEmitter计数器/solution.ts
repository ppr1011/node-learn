/**
 * 基础 02 - 参考答案
 */
import { EventEmitter } from "events";

export class Counter extends EventEmitter {
  private _value = 0;

  get value(): number {
    return this._value;
  }

  increment(step = 1): void {
    if (!Number.isInteger(step) || step <= 0) {
      throw new RangeError("step 必须为正整数");
    }
    const old = this._value;
    this._value += step;
    this.emit("change", this._value);

    const oldTier = Math.floor(old / 10);
    const newTier = Math.floor(this._value / 10);
    if (newTier > oldTier) {
      // 跨过的最高里程碑
      this.emit("milestone", newTier * 10);
    }
  }

  reset(): void {
    this._value = 0;
    this.emit("reset");
  }
}
