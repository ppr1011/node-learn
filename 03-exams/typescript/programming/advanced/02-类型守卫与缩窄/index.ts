/**
 * 进阶 02 - 类型守卫与联合缩窄(骨架)
 */

export type Shape =
  | { kind: "circle"; radius: number }
  | { kind: "square"; side: number }
  | { kind: "rectangle"; width: number; height: number };

export function isCircle(s: Shape): s is Extract<Shape, { kind: "circle" }> {
  // TODO
  throw new Error("TODO: 实现 isCircle");
}

export function assertNever(x: never): never {
  // TODO: 抛出错误
  throw new Error("TODO: 实现 assertNever");
}

export function area(s: Shape): number {
  // TODO: 用 switch(s.kind) 缩窄,default 调用 assertNever(s)
  throw new Error("TODO: 实现 area");
}

export function isNonEmptyStringArray(v: unknown): v is string[] {
  // TODO: 非空 && 全为 string
  throw new Error("TODO: 实现 isNonEmptyStringArray");
}
