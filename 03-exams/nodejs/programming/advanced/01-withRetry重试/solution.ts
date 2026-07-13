/**
 * 进阶 01 - 参考答案
 */

export interface RetryOptions {
  retries: number;
  minDelay: number;
  factor?: number;
  timeout?: number;
  onRetry?: (error: unknown, attempt: number) => void;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout<T>(promise: Promise<T>, timeout: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), timeout);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions): Promise<T> {
  const { retries, minDelay, factor = 2, timeout, onRetry } = options;
  let lastError: unknown;

  for (let i = 0; i <= retries; i++) {
    if (i > 0) {
      onRetry?.(lastError, i);
      await sleep(minDelay * Math.pow(factor, i - 1));
    }
    try {
      const attempt = timeout != null ? withTimeout(fn(), timeout) : fn();
      return await attempt;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}
