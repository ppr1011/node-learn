/**
 * 挑战 01 - 单元测试(请勿修改)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { DeepReadonly, DeepPartial, deepFreeze } from "./index";
import { Expect, Equal } from "../../../../_runner/type-assert";

interface Config {
  server: { host: string; port: number };
  debug: boolean;
}

// ===== 类型级断言 =====
type _1 = Expect<
  Equal<
    DeepReadonly<Config>,
    { readonly server: { readonly host: string; readonly port: number }; readonly debug: boolean }
  >
>;
type _2 = Expect<
  Equal<
    DeepPartial<Config>,
    { server?: { host?: string; port?: number }; debug?: boolean }
  >
>;

test("类型级断言通过", () => {
  const _c: [_1, _2] = [true, true];
  assert.deepEqual(_c, [true, true]);
});

test("deepFreeze 递归冻结", () => {
  const cfg = { server: { host: "localhost", port: 8080 }, debug: true };
  const frozen = deepFreeze(cfg);
  assert.equal(Object.isFrozen(frozen), true);
  assert.equal(Object.isFrozen(frozen.server), true); // 嵌套也被冻结
  assert.equal(frozen, cfg); // 返回同一引用
});

test("deepFreeze 后修改抛错(strict mode)", () => {
  const frozen = deepFreeze({ a: { b: 1 } });
  assert.throws(() => {
    (frozen as any).a.b = 999;
  }, TypeError);
});

test("deepFreeze 不对 null 递归", () => {
  assert.doesNotThrow(() => deepFreeze({ x: null, y: 1 }));
});
