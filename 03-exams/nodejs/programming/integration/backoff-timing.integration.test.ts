/**
 * Node 集成测试:退避耗时(请勿修改)
 * 覆盖 进阶 01(withRetry)。使用真实定时器,验证指数退避累计耗时。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { withRetry } from "../advanced/01-withRetry重试/index";

test("集成:指数退避真实耗时约为 minDelay + minDelay*factor", async () => {
  const minDelay = 40;
  const factor = 2;
  const start = Date.now();
  let calls = 0;

  await assert.rejects(() =>
    withRetry(
      async () => {
        calls++;
        throw new Error("always fail");
      },
      { retries: 2, minDelay, factor }
    )
  );

  const elapsed = Date.now() - start;
  // 两次重试前分别等待 40ms 和 80ms,合计约 120ms
  assert.equal(calls, 3);
  assert.ok(elapsed >= 110, `耗时应 >= 110ms,实际 ${elapsed}ms`);
  assert.ok(elapsed < 400, `耗时不应过长,实际 ${elapsed}ms`);
});
