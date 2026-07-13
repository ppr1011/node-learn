/**
 * 综合项目 02 - 单元测试:TTLCache(请勿修改)
 * 使用可控时钟保证确定性。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { TTLCache } from "../src/cache";

test("maxSize < 1 抛 RangeError", () => {
  assert.throws(() => new TTLCache({ maxSize: 0 }), RangeError);
});

test("set/get 与命中统计", () => {
  const c = new TTLCache({ maxSize: 3 });
  c.set("a", 1);
  assert.equal(c.get("a"), 1); // hit
  assert.equal(c.get("missing"), undefined); // miss
  const s = c.stats();
  assert.equal(s.hits, 1);
  assert.equal(s.misses, 1);
  assert.equal(s.size, 1);
  assert.equal(s.maxSize, 3);
});

test("允许存储假值(0/false/null/空串)", () => {
  const c = new TTLCache({ maxSize: 5 });
  c.set("zero", 0);
  c.set("no", false);
  c.set("nil", null);
  assert.equal(c.get("zero"), 0);
  assert.equal(c.get("no"), false);
  assert.equal(c.get("nil"), null);
});

test("LRU 淘汰最久未使用", () => {
  const c = new TTLCache({ maxSize: 2 });
  c.set("a", 1);
  c.set("b", 2);
  c.get("a"); // b 变最久未使用
  c.set("c", 3); // 淘汰 b
  assert.equal(c.get("b"), undefined);
  assert.equal(c.get("a"), 1);
  assert.equal(c.get("c"), 3);
});

test("TTL 过期(fake clock)", () => {
  let t = 0;
  const c = new TTLCache({ maxSize: 5, defaultTtl: 100, now: () => t });
  c.set("x", "v");
  t = 99;
  assert.equal(c.get("x"), "v");
  t = 100;
  assert.equal(c.get("x"), undefined); // 过期
  assert.equal(c.size, 0);
});

test("set 的 ttl 覆盖默认 ttl", () => {
  let t = 0;
  const c = new TTLCache({ maxSize: 5, defaultTtl: 1000, now: () => t });
  c.set("short", "v", 10); // 覆盖为 10ms
  t = 10;
  assert.equal(c.get("short"), undefined);
});

test("defaultTtl 未设时永不过期", () => {
  let t = 0;
  const c = new TTLCache({ maxSize: 5, now: () => t });
  c.set("forever", "v");
  t = 10 ** 12;
  assert.equal(c.get("forever"), "v");
});
