/**
 * 挑战 01 - 递归类型体操(骨架)
 */

// TODO: 递归只读
export type DeepReadonly<T> = any;

// TODO: 递归可选
export type DeepPartial<T> = any;

export function deepFreeze<T>(obj: T): DeepReadonly<T> {
  // TODO: 递归冻结 obj 及其嵌套对象,返回同一引用
  throw new Error("TODO: 实现 deepFreeze");
}
