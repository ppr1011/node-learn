/**
 * 综合项目 02 - TTLCache(骨架)
 */

export interface CacheOptions {
  maxSize: number;
  defaultTtl?: number;
  now?: () => number;
}

export interface CacheStats {
  size: number;
  maxSize: number;
  hits: number;
  misses: number;
}

export class TTLCache {
  constructor(options: CacheOptions) {
    // TODO: 校验 maxSize;保存配置;初始化 Map 与 hits/misses
    throw new Error("TODO: 实现构造函数");
  }

  set(key: string, value: unknown, ttl?: number): void {
    throw new Error("TODO: 实现 set");
  }

  get(key: string): unknown | undefined {
    throw new Error("TODO: 实现 get");
  }

  delete(key: string): boolean {
    throw new Error("TODO: 实现 delete");
  }

  get size(): number {
    throw new Error("TODO: 实现 size");
  }

  stats(): CacheStats {
    throw new Error("TODO: 实现 stats");
  }
}
