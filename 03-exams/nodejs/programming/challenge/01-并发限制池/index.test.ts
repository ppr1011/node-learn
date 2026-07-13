/**
 * 挑战 01 - 单元测试(请勿修改)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { pLimit } from "./index";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("concurrency < 1 抛 RangeError", () => {
  assert.throws(() => pLimit(0), RangeError);
});

test("并发数不超过上限", async () => {
  const limit = pLimit(2);
  let active = 0;
  let peak = 0;
  const task = () =>
    limit(async () => {
      active++;
      peak = Math.max(peak, active);
      await sleep(20);
      active--;
      return active;
    });
  await Promise.all(Array.from({ length: 6 }, () => task()));
  assert.equal(peak, 2); // 峰值恰为上限
});

test("结果按调用顺序正确返回", async () => {
  const limit = pLimit(2);
  const results = await Promise.all(
    [1, 2, 3, 4].map((n) => limit(async () => {
      await sleep(5);
      return n * 10;
    }))
  );
  assert.deepEqual(results, [10, 20, 30, 40]);
});

test("失败任务不阻塞队列", async () => {
  const limit = pLimit(1);
  const outcomes: string[] = [];
  const p1 = limit(async () => {
    throw new Error("fail");
  }).catch(() => outcomes.push("p1-rejected"));
  const p2 = limit(async () => {
    outcomes.push("p2-ran");
    return "ok";
  });
  await Promise.all([p1, p2]);
  assert.deepEqual(outcomes, ["p1-rejected", "p2-ran"]);
});
