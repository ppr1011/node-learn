/**
 * 综合项目 02 - 参考实现:TTLCache
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

interface Entry {
  value: unknown;
  expireAt: number;
}

export class TTLCache {
  private map = new Map<string, Entry>();
  private maxSize: number;
  private defaultTtl: number;
  private now: () => number;
  private hits = 0;
  private misses = 0;

  constructor(options: CacheOptions) {
    if (!Number.isInteger(options.maxSize) || options.maxSize < 1) {
      throw new RangeError("maxSize 必须为 >= 1 的整数");
    }
    this.maxSize = options.maxSize;
    this.defaultTtl = options.defaultTtl ?? Infinity;
    this.now = options.now ?? Date.now;
  }

  set(key: string, value: unknown, ttl?: number): void {
    if (this.map.has(key)) this.map.delete(key);
    const effectiveTtl = ttl ?? this.defaultTtl;
    const expireAt = effectiveTtl === Infinity ? Infinity : this.now() + effectiveTtl;
    this.map.set(key, { value, expireAt });
    while (this.map.size > this.maxSize) {
      const oldest = this.map.keys().next().value as string;
      this.map.delete(oldest);
    }
  }

  get(key: string): unknown | undefined {
    const entry = this.map.get(key);
    if (!entry) {
      this.misses++;
      return undefined;
    }
    if (this.now() >= entry.expireAt) {
      this.map.delete(key);
      this.misses++;
      return undefined;
    }
    // 刷新最近使用
    this.map.delete(key);
    this.map.set(key, entry);
    this.hits++;
    return entry.value;
  }

  delete(key: string): boolean {
    return this.map.delete(key);
  }

  get size(): number {
    return this.map.size;
  }

  stats(): CacheStats {
    return {
      size: this.map.size,
      maxSize: this.maxSize,
      hits: this.hits,
      misses: this.misses,
    };
  }
}
