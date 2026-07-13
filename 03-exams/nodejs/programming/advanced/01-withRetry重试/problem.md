# 进阶 01 - withRetry:超时 + 指数退避

## 背景

网络请求等易失败操作常需"失败重试 + 退避 + 单次超时"。实现一个通用的 `withRetry`。

## 要求

在 `index.ts` 中实现:

```ts
interface RetryOptions {
  retries: number;                          // 最大重试次数(不含首次尝试)
  minDelay: number;                         // 首次退避毫秒数
  factor?: number;                          // 退避因子,默认 2
  timeout?: number;                         // 单次尝试超时(ms),可选
  onRetry?: (error: unknown, attempt: number) => void; // 每次重试前回调,attempt 从 1 开始
}

async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions): Promise<T>;
```

行为:
1. 先执行第 0 次尝试(首次)。成功则直接返回结果。
2. 失败后,若已用尽 `retries` 次重试,则**抛出最后一次的错误**。
3. 否则等待退避时间 `minDelay * factor^i`(`i` 为已失败的次数,从 0 开始:第 1 次重试前等 `minDelay`,第 2 次等 `minDelay*factor`……),然后重试。
4. 每次重试前调用 `onRetry(error, attempt)`,`attempt` 从 `1` 开始计数。
5. 若设置了 `timeout`,则每次尝试与一个"超时拒绝"竞速(`Promise.race`);超时视为该次尝试失败(会触发重试)。

## 提示

- `sleep(ms)`:`new Promise(r => setTimeout(r, ms))`。
- 超时:`Promise.race([fn(), new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), timeout))])`,记得 `clearTimeout`。
- 用 `for` 循环 `0..retries`,捕获错误决定是否继续。

## 评分点

- 首次成功、失败重试后成功、用尽重试抛错三种路径正确;
- `onRetry` 调用次数与 `attempt` 编号正确;
- `timeout` 生效(超时触发重试);
- 退避时间随次数指数增长(集成测试会测真实耗时)。

## 运行

```bash
npx ts-node 03-exams/nodejs/programming/advanced/01-withRetry重试/index.test.ts
```
