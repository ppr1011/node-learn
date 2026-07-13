/**
 * 挑战 02 - 单元测试(请勿修改)
 * 用可控时钟(fake clock)测试 TTL,保证确定性。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { LRUCache } from "./index";

test("maxSize < 1 抛 RangeError", () => {
  assert.throws(() => new LRUCache<string, number>({ maxSize: 0 }), RangeError);
});

test("基本 set/get/size", () => {
  const c = new LRUCache<string, number>({ maxSize: 3 });
  c.set("a", 1);
  c.set("b", 2);
  assert.equal(c.get("a"), 1);
  assert.equal(c.get("missing"), undefined);
  assert.equal(c.size, 2);
});

test("超过容量淘汰最久未使用", () => {
  const c = new LRUCache<string, number>({ maxSize: 2 });
  c.set("a", 1);
  c.set("b", 2);
  c.get("a"); // 访问 a,使 b 变成最久未使用
  c.set("c", 3); // 触发淘汰 -> 淘汰 b
  assert.equal(c.has("b"), false);
  assert.equal(c.get("a"), 1);
  assert.equal(c.get("c"), 3);
  assert.deepEqual(c.keys(), ["a", "c"]);
});

test("keys 顺序为 最久->最近", () => {
  const c = new LRUCache<string, number>({ maxSize: 3 });
  c.set("a", 1);
  c.set("b", 2);
  c.set("c", 3);
  c.get("a"); // a 变最近
  assert.deepEqual(c.keys(), ["b", "c", "a"]);
});

test("TTL 过期(fake clock)", () => {
  let t = 1000;
  const c = new LRUCache<string, number>({ maxSize: 5, ttl: 100, now: () => t });
  c.set("x", 42);
  assert.equal(c.get("x"), 42);
  t = 1099; // 未到期
  assert.equal(c.has("x"), true);
  t = 1100; // 到期(>=expireAt)
  assert.equal(c.get("x"), undefined);
  assert.equal(c.size, 0); // 过期条目已被清理
});

test("has 不刷新最近使用顺序", () => {
  const c = new LRUCache<string, number>({ maxSize: 2 });
  c.set("a", 1);
  c.set("b", 2);
  c.has("a"); // has 不应把 a 变最近
  c.set("c", 3); // 应淘汰最久未使用的 a
  assert.equal(c.has("a"), false);
  assert.equal(c.has("b"), true);
});
