# 进阶 02 - 中间件引擎(洋葱模型)

## 背景

Koa / Express 的核心是「中间件洋葱模型」:多个中间件依次进入,`await next()` 后再逆序退出。本题实现这个 `compose`。

## 要求

在 `index.ts` 中实现:

```ts
type Next = () => Promise<void>;
type Middleware<C> = (ctx: C, next: Next) => Promise<void> | void;

function compose<C>(middlewares: Middleware<C>[]): (ctx: C, next?: Next) => Promise<void>;
```

行为:
1. 返回一个函数,依次执行中间件;每个中间件通过调用 `await next()` 把控制权交给下一个。
2. **洋葱顺序**:`m1` 进入 → `m2` 进入 → …→ 最内层 → 逆序退出。
3. 若传入了最外层的 `next`,则在所有中间件执行完后调用它。
4. **防止同一个中间件里多次调用 `next()`**:第二次调用应让返回的 Promise 拒绝(抛 `Error`,消息含 `next()`)。
5. 任一中间件抛错,应让整体 Promise 拒绝(错误向外传播)。

## 提示

- 经典实现:`dispatch(i)` 递归。用一个 `index` 记录已 dispatch 到的位置,若 `i <= lastIndex` 说明 `next()` 被调用多次 → reject。
- 参考 Koa 的 `koa-compose` 实现思路。

## 评分点

- 进入/退出顺序正确(洋葱模型);
- `ctx` 在中间件间共享、可被修改;
- 多次调用 `next()` 被检测并拒绝;
- 错误正确向外传播。

## 运行

```bash
npx ts-node 03-exams/nodejs/programming/advanced/02-中间件引擎/index.test.ts
```
