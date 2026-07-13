/**
 * 挑战 02 - 参考答案
 */

export interface LRUOptions {
  maxSize: number;
  ttl?: number;
  now?: () => number;
}

interface Entry<V> {
  value: V;
  expireAt: number;
}

export class LRUCache<K, V> {
  private map = new Map<K, Entry<V>>();
  private maxSize: number;
  private ttl: number;
  private now: () => number;

  constructor(options: LRUOptions) {
    if (!Number.isInteger(options.maxSize) || options.maxSize < 1) {
      throw new RangeError("maxSize 必须为 >= 1 的整数");
    }
    this.maxSize = options.maxSize;
    this.ttl = options.ttl ?? Infinity;
    this.now = options.now ?? Date.now;
  }

  private isExpired(entry: Entry<V>): boolean {
    return this.now() >= entry.expireAt;
  }

  set(key: K, value: V): void {
    if (this.map.has(key)) this.map.delete(key); // 删掉旧位置以便移到末尾
    const expireAt = this.ttl === Infinity ? Infinity : this.now() + this.ttl;
    this.map.set(key, { value, expireAt });
    while (this.map.size > this.maxSize) {
      const oldest = this.map.keys().next().value as K;
      this.map.delete(oldest);
    }
  }

  get(key: K): V | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (this.isExpired(entry)) {
      this.map.delete(key);
      return undefined;
    }
    // 刷新最近使用:删除后重新插入到末尾
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.value;
  }

  has(key: K): boolean {
    const entry = this.map.get(key);
    if (!entry) return false;
    if (this.isExpired(entry)) {
      this.map.delete(key);
      return false;
    }
    return true;
  }

  delete(key: K): boolean {
    return this.map.delete(key);
  }

  get size(): number {
    return this.map.size;
  }

  keys(): K[] {
    return [...this.map.keys()];
  }
}
