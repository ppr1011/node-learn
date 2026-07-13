/**
 * 挑战 02 - 单元测试(请勿修改)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { TypedEmitter } from "./index";

interface MyEvents {
  login: { userId: number };
  message: { from: string; text: string };
  tick: number;
}

test("on / emit 传递正确载荷", () => {
  const em = new TypedEmitter<MyEvents>();
  let received: number | null = null;
  em.on("login", (p) => {
    received = p.userId; // p 应被推断为 { userId: number }
  });
  const had = em.emit("login", { userId: 42 });
  assert.equal(received, 42);
  assert.equal(had, true);
});

test("emit 无监听器返回 false", () => {
  const em = new TypedEmitter<MyEvents>();
  assert.equal(em.emit("tick", 1), false);
});

test("off 移除指定监听器", () => {
  const em = new TypedEmitter<MyEvents>();
  let count = 0;
  const fn = () => {
    count++;
  };
  em.on("tick", fn);
  em.emit("tick", 1);
  em.off("tick", fn);
  em.emit("tick", 2);
  assert.equal(count, 1);
});

test("once 只触发一次", () => {
  const em = new TypedEmitter<MyEvents>();
  let count = 0;
  em.once("tick", () => {
    count++;
  });
  assert.equal(em.listenerCount("tick"), 1);
  em.emit("tick", 1);
  em.emit("tick", 2);
  assert.equal(count, 1);
  assert.equal(em.listenerCount("tick"), 0);
});

test("链式调用返回 this", () => {
  const em = new TypedEmitter<MyEvents>();
  const r = em.on("tick", () => {}).on("login", () => {});
  assert.equal(r, em);
});

test("emit 期间 once 不影响其他监听器", () => {
  const em = new TypedEmitter<MyEvents>();
  const order: string[] = [];
  em.once("tick", () => order.push("once"));
  em.on("tick", () => order.push("on"));
  em.emit("tick", 1);
  assert.deepEqual(order, ["once", "on"]);
});
