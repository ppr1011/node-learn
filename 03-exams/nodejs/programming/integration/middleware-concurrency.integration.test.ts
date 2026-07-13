/**
 * Node 集成测试:中间件管线 + 并发限制(请勿修改)
 * 覆盖 进阶 02(compose)+ 挑战 01(pLimit)。
 * 场景:用中间件洋葱模型处理一批"请求",处理器通过并发池限制同时执行数。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { compose, Middleware } from "../advanced/02-中间件引擎/index";
import { pLimit } from "../challenge/01-并发限制池/index";

interface Ctx {
  path: string;
  user?: string;
  status: number;
  trace: string[];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("集成:中间件管线处理请求 + 并发池限制处理器峰值", async () => {
  let active = 0;
  let peak = 0;
  const limit = pLimit(2);

  const logger: Middleware<Ctx> = async (ctx, next) => {
    ctx.trace.push("logger-in");
    await next();
    ctx.trace.push("logger-out");
  };
  const auth: Middleware<Ctx> = async (ctx, next) => {
    if (!ctx.user) {
      ctx.status = 401;
      return; // 不放行
    }
    await next();
  };
  const handler: Middleware<Ctx> = async (ctx) => {
    await limit(async () => {
      active++;
      peak = Math.max(peak, active);
      await sleep(15);
      active--;
      ctx.status = 200;
    });
  };

  const app = compose<Ctx>([logger, auth, handler]);

  // 并发处理 6 个已登录请求
  const requests: Ctx[] = Array.from({ length: 6 }, (_, i) => ({
    path: `/api/${i}`,
    user: "u",
    status: 0,
    trace: [],
  }));
  await Promise.all(requests.map((ctx) => app(ctx)));

  assert.ok(requests.every((r) => r.status === 200), "所有已登录请求应成功");
  assert.deepEqual(requests[0].trace, ["logger-in", "logger-out"]);
  assert.equal(peak, 2, `处理器并发峰值应为 2,实际 ${peak}`);

  // 未登录请求应被 auth 拦截为 401
  const anon: Ctx = { path: "/api/x", status: 0, trace: [] };
  await app(anon);
  assert.equal(anon.status, 401);
});
