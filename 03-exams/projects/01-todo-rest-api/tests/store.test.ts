/**
 * 综合项目 01 - 单元测试:TodoStore(请勿修改)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { TodoStore } from "../src/store";

test("create 生成自增 id 与默认字段", () => {
  const s = new TodoStore();
  const a = s.create("买菜");
  const b = s.create("写作业");
  assert.equal(a.title, "买菜");
  assert.equal(a.completed, false);
  assert.equal(typeof a.createdAt, "number");
  assert.notEqual(a.id, b.id); // id 不同
});

test("list 返回按创建顺序的副本", () => {
  const s = new TodoStore();
  s.create("a");
  s.create("b");
  const list = s.list();
  assert.deepEqual(list.map((t) => t.title), ["a", "b"]);
  list.push({ id: "x", title: "hack", completed: false, createdAt: 0 });
  assert.equal(s.list().length, 2); // 副本,内部不受影响
});

test("get 命中与未命中", () => {
  const s = new TodoStore();
  const a = s.create("a");
  assert.deepEqual(s.get(a.id), a);
  assert.equal(s.get("999"), undefined);
});

test("update 局部更新", () => {
  const s = new TodoStore();
  const a = s.create("a");
  const updated = s.update(a.id, { completed: true });
  assert.equal(updated?.completed, true);
  assert.equal(updated?.title, "a"); // 未改的保持
  assert.equal(s.update("999", { title: "x" }), undefined);
});

test("remove 与 clear", () => {
  const s = new TodoStore();
  const a = s.create("a");
  assert.equal(s.remove(a.id), true);
  assert.equal(s.remove(a.id), false);
  s.create("b");
  s.create("c");
  s.clear();
  assert.equal(s.list().length, 0);
});
