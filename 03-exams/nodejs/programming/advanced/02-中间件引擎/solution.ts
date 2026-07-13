/**
 * 进阶 02 - 参考答案(参考 koa-compose 思路)
 */

export type Next = () => Promise<void>;
export type Middleware<C> = (ctx: C, next: Next) => Promise<void> | void;

export function compose<C>(
  middlewares: Middleware<C>[]
): (ctx: C, next?: Next) => Promise<void> {
  return function composed(ctx: C, next?: Next): Promise<void> {
    let lastIndex = -1;

    function dispatch(i: number): Promise<void> {
      if (i <= lastIndex) {
        return Promise.reject(new Error("同一个中间件里 next() 被多次调用"));
      }
      lastIndex = i;

      const fn = i === middlewares.length ? next : middlewares[i];
      if (!fn) return Promise.resolve();

      try {
        return Promise.resolve(fn(ctx, () => dispatch(i + 1)));
      } catch (err) {
        return Promise.reject(err);
      }
    }

    return dispatch(0);
  };
}
