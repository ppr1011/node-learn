/**
 * 进阶 02 - 单元测试(请勿修改)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Shape, isCircle, area, isNonEmptyStringArray } from "./index";

const circle: Shape = { kind: "circle", radius: 2 };
const square: Shape = { kind: "square", side: 3 };
const rect: Shape = { kind: "rectangle", width: 2, height: 5 };

test("isCircle 类型守卫", () => {
  assert.equal(isCircle(circle), true);
  assert.equal(isCircle(square), false);
  // 守卫缩窄后应能访问 radius
  if (isCircle(circle)) {
    assert.equal(circle.radius, 2);
  }
});

test("area 计算各形状面积", () => {
  assert.ok(Math.abs(area(circle) - Math.PI * 4) < 1e-9);
  assert.equal(area(square), 9);
  assert.equal(area(rect), 10);
});

test("isNonEmptyStringArray 运行时守卫", () => {
  assert.equal(isNonEmptyStringArray(["a", "b"]), true);
  assert.equal(isNonEmptyStringArray([]), false); // 空数组不算
  assert.equal(isNonEmptyStringArray(["a", 1]), false); // 混入非字符串
  assert.equal(isNonEmptyStringArray("abc"), false); // 不是数组
  assert.equal(isNonEmptyStringArray(null), false);
});
