/**
 * 基础 02 - 单元测试(请勿修改)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Stack } from "./index";

test("空栈行为", () => {
  const s = new Stack<number>();
  assert.equal(s.isEmpty(), true);
  assert.equal(s.size(), 0);
  assert.equal(s.pop(), undefined);
  assert.equal(s.peek(), undefined);
});

test("LIFO 顺序", () => {
  const s = new Stack<string>();
  s.push("a");
  s.push("b");
  s.push("c");
  assert.equal(s.size(), 3);
  assert.equal(s.isEmpty(), false);
  assert.equal(s.peek(), "c");
  assert.equal(s.pop(), "c");
  assert.equal(s.pop(), "b");
  assert.equal(s.size(), 1);
});

test("toArray 从栈底到栈顶且为副本", () => {
  const s = new Stack<number>();
  s.push(1);
  s.push(2);
  s.push(3);
  const arr = s.toArray();
  assert.deepEqual(arr, [1, 2, 3]);
  arr.push(999); // 修改副本
  assert.equal(s.size(), 3); // 内部不受影响
});
