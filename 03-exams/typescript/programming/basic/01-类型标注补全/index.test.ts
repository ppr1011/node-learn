/**
 * 基础 01 - 单元测试(请勿修改)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { isAdult, displayName, sumAges, findById, User } from "./index";

const alice: User = { id: 1, name: "Alice", age: 20, email: "a@x.com" };
const bob: User = { id: 2, name: "Bob", age: 15 };
const users: User[] = [alice, bob];

test("isAdult: 成年/未成年", () => {
  assert.equal(isAdult(alice), true);
  assert.equal(isAdult(bob), false);
  assert.equal(isAdult({ id: 3, name: "C", age: 18 }), true);
});

test("displayName: 有无邮箱", () => {
  assert.equal(displayName(alice), "Alice <a@x.com>");
  assert.equal(displayName(bob), "Bob");
});

test("sumAges: 求和与空数组", () => {
  assert.equal(sumAges(users), 35);
  assert.equal(sumAges([]), 0);
});

test("findById: 命中与未命中", () => {
  assert.equal(findById(users, 1), alice);
  assert.equal(findById(users, 999), undefined);
});
