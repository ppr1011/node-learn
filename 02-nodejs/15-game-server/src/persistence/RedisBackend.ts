import Redis from 'ioredis';
import { PersistenceBackend, PersistedPlayer } from './types';
import { logger } from '../utils/Logger';

/**
 * 热层:Redis(ioredis)。
 *
 * 进程外热存储,毫秒级读写、AOF 落盘(Redis 自身重启不丢)、多实例可共享 ——
 * 游戏后台的事实标准。key 形如 `game:player:{token}` 存整条存档 JSON。
 *
 * 优雅降级:Redis 连不上时不拖垮游戏 —— 捕获错误、告警一次、置 degraded,
 * 之后 load 返回 null / save 直接 resolve,由上层的冷层(SQLite)独自兜底。
 */
export class RedisBackend implements PersistenceBackend {
  private redis: Redis;
  private degraded = false;
  private warned = false;

  constructor(
    private readonly url: string,
    private readonly keyPrefix: string,
    private readonly ttlSec: number,
  ) {
    this.redis = new Redis(this.url, {
      lazyConnect: true,          // 手动 connect,便于在 init 里明确成功/降级
      maxRetriesPerRequest: 1,    // 不无限重试拖慢请求
      enableOfflineQueue: false,  // 断线时命令立即失败而非堆积
      retryStrategy: (times) => (times > 3 ? null : 200), // 有限重连
    });
    this.redis.on('error', (err) => this.degrade(err.message));
  }

  private degrade(msg: string): void {
    this.degraded = true;
    if (!this.warned) {
      this.warned = true;
      logger.warn(`[Persist] Redis 不可用,降级为纯 SQLite:${msg}`);
    }
  }

  private key(token: string): string {
    return this.keyPrefix + token;
  }

  async init(): Promise<void> {
    try {
      await this.redis.connect();
      await this.redis.ping();
      logger.info(`[Persist] Redis connected @ ${this.url} (prefix "${this.keyPrefix}")`);
    } catch (err) {
      this.degrade((err as Error).message);
    }
  }

  async load(token: string): Promise<PersistedPlayer | null> {
    if (this.degraded) return null;
    try {
      const raw = await this.redis.get(this.key(token));
      return raw ? (JSON.parse(raw) as PersistedPlayer) : null;
    } catch (err) {
      this.degrade((err as Error).message);
      return null;
    }
  }

  async save(batch: PersistedPlayer[]): Promise<void> {
    if (this.degraded || batch.length === 0) return;
    try {
      const pipe = this.redis.pipeline();
      for (const p of batch) {
        const val = JSON.stringify(p);
        if (this.ttlSec > 0) pipe.set(this.key(p.token), val, 'EX', this.ttlSec);
        else pipe.set(this.key(p.token), val);
      }
      await pipe.exec();
    } catch (err) {
      this.degrade((err as Error).message);
    }
  }

  async close(): Promise<void> {
    try {
      await this.redis.quit();
    } catch {
      this.redis.disconnect();
    }
  }
}
