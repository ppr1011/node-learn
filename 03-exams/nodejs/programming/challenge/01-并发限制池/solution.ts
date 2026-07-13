/**
 * 挑战 01 - 参考答案
 */

export function pLimit(concurrency: number): <T>(fn: () => Promise<T>) => Promise<T> {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new RangeError("concurrency 必须为 >= 1 的整数");
  }

  let activeCount = 0;
  const queue: Array<() => void> = [];

  const next = (): void => {
    if (activeCount >= concurrency || queue.length === 0) return;
    activeCount++;
    const run = queue.shift()!;
    run();
  };

  return function limit<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const run = () => {
        Promise.resolve()
          .then(fn)
          .then(resolve, reject)
          .finally(() => {
            activeCount--;
            next();
          });
      };
      queue.push(run);
      next();
    });
  };
}
