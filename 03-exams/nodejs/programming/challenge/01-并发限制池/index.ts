/**
 * 挑战 01 - 并发限制池 pLimit(骨架)
 */

export function pLimit(concurrency: number): <T>(fn: () => Promise<T>) => Promise<T> {
  // TODO: 校验 concurrency;维护 activeCount 与队列;实现 next()
  throw new Error("TODO: 实现 pLimit");
}
