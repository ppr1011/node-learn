/**
 * 基础 02 - 单元测试(请勿修改)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Counter } from "./index";

test("increment 累加并发 change 事件", () => {
  const c = new Counter();
  const changes: number[] = [];
  c.on("change", (v: number) => changes.push(v));
  c.increment();
  c.increment(2);
  assert.equal(c.value, 3);
  assert.deepEqual(changes, [1, 3]);
});

test("非正整数 step 抛 RangeError", () => {
  const c = new Counter();
  assert.throws(() => c.increment(0), RangeError);
  assert.throws(() => c.increment(-1), RangeError);
  assert.throws(() => c.increment(1.5), RangeError);
});

test("跨越 10 的倍数发 milestone", () => {
  const c = new Counter();
  const milestones: number[] = [];
  c.on("milestone", (m: number) => milestones.push(m));
  for (let i = 0; i < 9; i++) c.increment(); // value=9,未跨越
  assert.deepEqual(milestones, []);
  c.increment(); // value=10,跨越 10
  assert.deepEqual(milestones, [10]);
  c.increment(15); // value=25,跨过 20(最高里程碑 20)
  assert.deepEqual(milestones, [10, 20]);
});

test("reset 归零并发 reset 事件", () => {
  const c = new Counter();
  let resetFired = false;
  c.on("reset", () => (resetFired = true));
  c.increment(5);
  c.reset();
  assert.equal(c.value, 0);
  assert.equal(resetFired, true);
});
