/**
 * 基础 03 - 单元测试(请勿修改)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { chunk, uniqueBy, groupBy } from "./index";

test("chunk: 正常切块", () => {
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(chunk([1, 2, 3], 3), [[1, 2, 3]]);
  assert.deepEqual(chunk([], 3), []);
});

test("chunk: size<=0 抛 RangeError", () => {
  assert.throws(() => chunk([1, 2], 0), RangeError);
  assert.throws(() => chunk([1, 2], -1), RangeError);
});

test("uniqueBy: 保留首次出现且保持顺序", () => {
  const data = [
    { id: 1, v: "a" },
    { id: 2, v: "b" },
    { id: 1, v: "c" },
  ];
  assert.deepEqual(
    uniqueBy(data, (x) => x.id),
    [
      { id: 1, v: "a" },
      { id: 2, v: "b" },
    ]
  );
  assert.deepEqual(uniqueBy([3, 1, 3, 2, 1], (x) => x), [3, 1, 2]);
});

test("groupBy: 按键分组保持组内顺序", () => {
  const nums = [1, 2, 3, 4, 5, 6];
  assert.deepEqual(
    groupBy(nums, (n) => (n % 2 === 0 ? "even" : "odd")),
    { odd: [1, 3, 5], even: [2, 4, 6] }
  );
});
