/**
 * 进阶 01 - 手写工具类型(骨架)
 *
 * 类型别名请把 any 换成正确实现;运行时函数替换 TODO。
 */

// TODO: 实现 MyPick(等价内置 Pick)
export type MyPick<T, K extends keyof T> = any;

// TODO: 实现 MyOmit(等价内置 Omit)
export type MyOmit<T, K extends keyof T> = any;

// TODO: 实现 MyReadonly(全部属性只读)
export type MyReadonly<T> = any;

export function pick<T extends object, K extends keyof T>(
  obj: T,
  keys: K[]
): MyPick<T, K> {
  // TODO: 挑出指定键
  throw new Error("TODO: 实现 pick");
}

export function omit<T extends object, K extends keyof T>(
  obj: T,
  keys: K[]
): MyOmit<T, K> {
  // TODO: 去掉指定键(不修改原对象)
  throw new Error("TODO: 实现 omit");
}
