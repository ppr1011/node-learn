/**
 * 进阶 01 - 单元测试(请勿修改)
 * 用极小的 minDelay 保证测试快速。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { withRetry } from "./index";

test("首次成功:只调用一次", async () => {
  let calls = 0;
  const result = await withRetry(async () => {
    calls++;
    return "ok";
  }, { retries: 3, minDelay: 1 });
  assert.equal(result, "ok");
  assert.equal(calls, 1);
});

test("失败两次后成功", async () => {
  let calls = 0;
  const retryAttempts: number[] = [];
  const result = await withRetry(
    async () => {
      calls++;
      if (calls < 3) throw new Error(`fail ${calls}`);
      return calls;
    },
    { retries: 5, minDelay: 1, onRetry: (_e, a) => retryAttempts.push(a) }
  );
  assert.equal(result, 3);
  assert.equal(calls, 3);
  assert.deepEqual(retryAttempts, [1, 2]); // 两次重试
});

test("用尽重试后抛出最后一次错误", async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      withRetry(
        async () => {
          calls++;
          throw new Error(`fail ${calls}`);
        },
        { retries: 2, minDelay: 1 }
      ),
    /fail 3/ // 首次 + 2 次重试 = 第 3 次
  );
  assert.equal(calls, 3);
});

test("超时视为失败并触发重试", async () => {
  let calls = 0;
  const result = await withRetry(
    async () => {
      calls++;
      if (calls === 1) {
        // 第一次故意拖过超时
        await new Promise((r) => setTimeout(r, 50));
        return "too-late";
      }
      return "fast";
    },
    { retries: 2, minDelay: 1, timeout: 15 }
  );
  assert.equal(result, "fast");
  assert.equal(calls, 2);
});
