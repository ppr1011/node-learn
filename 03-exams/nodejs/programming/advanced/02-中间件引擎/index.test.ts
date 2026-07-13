/**
 * 进阶 02 - 单元测试(请勿修改)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { compose, Middleware } from "./index";

interface Ctx {
  log: string[];
}

test("洋葱模型进入/退出顺序", async () => {
  const ctx: Ctx = { log: [] };
  const fn = compose<Ctx>([
    async (c, next) => {
      c.log.push("m1-in");
      await next();
      c.log.push("m1-out");
    },
    async (c, next) => {
      c.log.push("m2-in");
      await next();
      c.log.push("m2-out");
    },
  ]);
  await fn(ctx);
  assert.deepEqual(ctx.log, ["m1-in", "m2-in", "m2-out", "m1-out"]);
});

test("ctx 共享可修改 + 末尾 next 被调用", async () => {
  const ctx = { value: 0 };
  const fn = compose<{ value: number }>([
    async (c, next) => {
      c.value += 1;
      await next();
    },
    async (c, next) => {
      c.value += 10;
      await next();
    },
  ]);
  let tailCalled = false;
  await fn(ctx, async () => {
    tailCalled = true;
  });
  assert.equal(ctx.value, 11);
  assert.equal(tailCalled, true);
});

test("多次调用 next() 被拒绝", async () => {
  const fn = compose<Ctx>([
    async (_c, next) => {
      await next();
      await next(); // 第二次
    },
  ]);
  await assert.rejects(() => fn({ log: [] }), /next\(\)/);
});

test("中间件错误向外传播", async () => {
  const fn = compose<Ctx>([
    async (_c, next) => {
      await next();
    },
    async () => {
      throw new Error("boom");
    },
  ]);
  await assert.rejects(() => fn({ log: [] }), /boom/);
});

test("空中间件数组也能运行", async () => {
  const fn = compose<Ctx>([]);
  await fn({ log: [] }); // 不应抛错
  assert.ok(true);
});
