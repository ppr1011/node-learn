/**
 * 挑战 02 - 带 TTL 的 LRU 缓存(骨架)
 */

export interface LRUOptions {
  maxSize: number;
  ttl?: number;
  now?: () => number;
}

export class LRUCache<K, V> {
  constructor(options: LRUOptions) {
    // TODO: 校验 maxSize;保存配置;初始化内部 Map
    throw new Error("TODO: 实现构造函数");
  }

  set(key: K, value: V): void {
    throw new Error("TODO: 实现 set");
  }

  get(key: K): V | undefined {
    throw new Error("TODO: 实现 get");
  }

  has(key: K): boolean {
    throw new Error("TODO: 实现 has");
  }

  delete(key: K): boolean {
    throw new Error("TODO: 实现 delete");
  }

  get size(): number {
    throw new Error("TODO: 实现 size");
  }

  keys(): K[] {
    throw new Error("TODO: 实现 keys");
  }
}
