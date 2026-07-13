/**
 * 综合项目 02 - 集成测试:真实 HTTP + 真实 TTL(请勿修改)
 * 用 describe 包裹以保证 before/after 钩子在各 Node 版本下都可靠执行。
 */
import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "net";
import type { Server } from "http";
import { createApp } from "../src/app";
import { TTLCache } from "../src/cache";

describe("KV 缓存服务集成", () => {
  let server: Server;
  let base: string;

  before(async () => {
    const app = createApp(new TTLCache({ maxSize: 100 }));
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => resolve());
    });
    server.unref();
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  async function api(method: string, path: string, body?: unknown) {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    return { status: res.status, json: text ? JSON.parse(text) : undefined };
  }

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  test("PUT/GET/DELETE 基本流程", async () => {
    let r = await api("PUT", "/kv/foo", { value: { n: 1 } });
    assert.equal(r.status, 204);

    r = await api("GET", "/kv/foo");
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.value, { n: 1 });

    r = await api("DELETE", "/kv/foo");
    assert.equal(r.status, 204);

    r = await api("GET", "/kv/foo");
    assert.equal(r.status, 404);
    assert.ok(r.json.error);
  });

  test("缺少 value 返回 400;非法 ttl 返回 400", async () => {
    let r = await api("PUT", "/kv/k", {});
    assert.equal(r.status, 400);
    r = await api("PUT", "/kv/k", { value: 1, ttl: -5 });
    assert.equal(r.status, 400);
  });

  test("允许存储假值", async () => {
    await api("PUT", "/kv/zero", { value: 0 });
    const r = await api("GET", "/kv/zero");
    assert.equal(r.status, 200);
    assert.equal(r.json.value, 0);
  });

  test("TTL 真实过期", async () => {
    await api("PUT", "/kv/temp", { value: "bye", ttl: 50 });
    let r = await api("GET", "/kv/temp");
    assert.equal(r.status, 200);
    await sleep(80);
    r = await api("GET", "/kv/temp");
    assert.equal(r.status, 404);
  });

  test("GET /stats 返回统计", async () => {
    const r = await api("GET", "/stats");
    assert.equal(r.status, 200);
    assert.equal(typeof r.json.hits, "number");
    assert.equal(typeof r.json.misses, "number");
    assert.equal(typeof r.json.size, "number");
    assert.equal(r.json.maxSize, 100);
  });
});
