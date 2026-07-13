/**
 * 综合项目 01 - 集成测试:真实 HTTP 服务完整 CRUD(请勿修改)
 * 用 describe 包裹以保证 before/after 钩子在各 Node 版本下都可靠执行。
 */
import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "net";
import type { Server } from "http";
import { createApp } from "../src/app";
import { TodoStore } from "../src/store";

describe("TODO REST API 集成", () => {
  let server: Server;
  let base: string;

  before(async () => {
    const app = createApp(new TodoStore());
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
    const json = text ? JSON.parse(text) : undefined;
    return { status: res.status, json };
  }

  test("完整 CRUD 流程", async () => {
    let r = await api("GET", "/todos");
    assert.equal(r.status, 200);
    assert.deepEqual(r.json, []);

    r = await api("POST", "/todos", { title: "第一件事" });
    assert.equal(r.status, 201);
    assert.equal(r.json.title, "第一件事");
    assert.equal(r.json.completed, false);
    const id = r.json.id;

    r = await api("GET", "/todos");
    assert.equal(r.json.length, 1);

    r = await api("GET", `/todos/${id}`);
    assert.equal(r.status, 200);
    assert.equal(r.json.id, id);

    r = await api("PATCH", `/todos/${id}`, { completed: true });
    assert.equal(r.status, 200);
    assert.equal(r.json.completed, true);

    r = await api("DELETE", `/todos/${id}`);
    assert.equal(r.status, 204);

    r = await api("GET", `/todos/${id}`);
    assert.equal(r.status, 404);
    assert.ok(r.json.error && typeof r.json.error.message === "string");
  });

  test("校验:创建缺少 title 返回 400", async () => {
    const r = await api("POST", "/todos", {});
    assert.equal(r.status, 400);
    assert.ok(r.json.error);
  });

  test("校验:PATCH 非法类型返回 400", async () => {
    const created = await api("POST", "/todos", { title: "x" });
    const r = await api("PATCH", `/todos/${created.json.id}`, { completed: "yes" });
    assert.equal(r.status, 400);
  });

  test("更新不存在的 id 返回 404", async () => {
    const r = await api("PATCH", "/todos/does-not-exist", { title: "y" });
    assert.equal(r.status, 404);
  });
});
