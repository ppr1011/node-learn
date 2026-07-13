/**
 * 进阶 01 - 单元测试(请勿修改)
 * 既检验类型(编译期),又检验运行时行为。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { MyPick, MyOmit, MyReadonly, pick, omit } from "./index";
import { Expect, Equal } from "../../../../_runner/type-assert";

interface Person {
  id: number;
  name: string;
  age: number;
}

// ===== 类型级断言:不成立则编译失败 =====
type _1 = Expect<Equal<MyPick<Person, "id" | "name">, { id: number; name: string }>>;
type _2 = Expect<Equal<MyOmit<Person, "age">, { id: number; name: string }>>;
type _3 = Expect<
  Equal<MyReadonly<Person>, { readonly id: number; readonly name: string; readonly age: number }>
>;

const person: Person = { id: 1, name: "Alice", age: 20 };

test("pick: 挑出指定键", () => {
  assert.deepEqual(pick(person, ["id", "name"]), { id: 1, name: "Alice" });
});

test("omit: 去掉指定键且不改原对象", () => {
  const result = omit(person, ["age"]);
  assert.deepEqual(result, { id: 1, name: "Alice" });
  assert.deepEqual(person, { id: 1, name: "Alice", age: 20 }); // 原对象不变
});

test("类型级断言通过(能编译即通过)", () => {
  const _check: [_1, _2, _3] = [true, true, true];
  assert.deepEqual(_check, [true, true, true]);
});
