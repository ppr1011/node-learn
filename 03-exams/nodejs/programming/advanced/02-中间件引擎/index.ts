/**
 * 进阶 02 - 中间件引擎(骨架)
 */

export type Next = () => Promise<void>;
export type Middleware<C> = (ctx: C, next: Next) => Promise<void> | void;

export function compose<C>(
  middlewares: Middleware<C>[]
): (ctx: C, next?: Next) => Promise<void> {
  // TODO: 实现洋葱模型 compose,并检测重复调用 next()
  throw new Error("TODO: 实现 compose");
}
