# 挑战 01 - 并发限制池 pLimit

## 背景

批量发起异步任务时,常需限制**同时进行**的数量(如最多 3 个并发请求),多余的排队等待。实现一个 `pLimit`。

## 要求

在 `index.ts` 中实现:

```ts
function pLimit(concurrency: number): <T>(fn: () => Promise<T>) => Promise<T>;
```

- `pLimit(n)` 返回一个「限流器」函数 `limit`。
- 调用 `limit(fn)` 会把 `fn` 排入队列并返回一个 Promise;该 Promise 在 `fn` 完成后以其结果 resolve /以其错误 reject。
- 任意时刻正在运行的 `fn` 不超过 `concurrency` 个;有空位时立即从队首取下一个执行。
- `concurrency` 必须 ≥ 1,否则抛 `RangeError`。
- 某个 `fn` 失败**不能**卡住队列(要正常释放名额,后续任务继续)。

## 提示

- 维护 `activeCount` 与一个等待队列 `queue`。
- `limit(fn)` 返回 `new Promise`,把「运行 fn 并 settle 这个 promise」的动作包装成一个 `run` 放入队列,然后 `next()`。
- `run` 结束(无论成功失败)后 `activeCount--` 并 `next()`。
- `next()`:当 `activeCount < concurrency` 且队列非空时,出队一个并执行。

## 评分点

- 结果/错误正确透传;
- **并发数从不超过上限**(集成测试会记录峰值并断言);
- 失败任务不阻塞队列;
- 参数校验。

## 运行

```bash
npx ts-node 03-exams/nodejs/programming/challenge/01-并发限制池/index.test.ts
```
