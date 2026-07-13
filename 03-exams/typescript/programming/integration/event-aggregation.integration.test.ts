/**
 * TypeScript 集成测试(请勿修改)
 *
 * 组合两道题的产物:
 *   - 挑战 02:TypedEmitter(类型安全事件发射器)
 *   - 基础 03:groupBy(泛型分组)
 * 场景:用事件总线收集"用户操作"事件,结束后按操作类型聚合统计。
 * 需要这两道题都完成后才能通过。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { TypedEmitter } from "../challenge/02-类型安全EventEmitter/index";
import { groupBy } from "../basic/03-泛型数组工具/index";

interface BusEvents {
  action: { type: "click" | "view" | "buy"; user: string };
}

test("集成:事件收集 + 分组聚合", () => {
  const bus = new TypedEmitter<BusEvents>();
  const collected: { type: string; user: string }[] = [];

  bus.on("action", (e) => collected.push(e));

  // 模拟一串用户操作事件
  bus.emit("action", { type: "click", user: "alice" });
  bus.emit("action", { type: "view", user: "bob" });
  bus.emit("action", { type: "click", user: "carol" });
  bus.emit("action", { type: "buy", user: "alice" });
  bus.emit("action", { type: "click", user: "bob" });

  // 用 groupBy 按操作类型聚合
  const grouped = groupBy(collected, (e) => e.type);

  assert.equal(grouped["click"].length, 3);
  assert.equal(grouped["view"].length, 1);
  assert.equal(grouped["buy"].length, 1);

  // 统计每种操作的用户
  const clickUsers = grouped["click"].map((e) => e.user);
  assert.deepEqual(clickUsers, ["alice", "carol", "bob"]);
});
