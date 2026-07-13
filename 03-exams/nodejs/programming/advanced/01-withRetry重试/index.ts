/**
 * 进阶 01 - withRetry(骨架)
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

export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions): Promise<T> {
  // TODO: 实现"首次 + 指数退避重试 + 单次超时"
  throw new Error("TODO: 实现 withRetry");
}
