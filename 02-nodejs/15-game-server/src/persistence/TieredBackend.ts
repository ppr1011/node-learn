import { PersistenceBackend, PersistedPlayer } from './types';
import { logger } from '../utils/Logger';

/**
 * 冷热双层:热层(Redis)优先,冷层(SQLite)兜底 —— 商业游戏的经典分层。
 *
 * 读(load):先查热层,命中即返回(常态,毫秒级);未命中再查冷层,
 *   命中则「回填热层」(re-warm,fire-and-forget)后返回 —— 覆盖「Redis 被清空
 *   但 SQLite 仍有账本」的灾备场景。
 * 写(save):热冷双写并发(Promise.allSettled),任一层抖动只告警不抛,
 *   保证存储故障绝不冒泡到游戏循环。
 */
export class TieredBackend implements PersistenceBackend {
  constructor(
    private readonly hot: PersistenceBackend,
    private readonly cold: PersistenceBackend,
  ) {}

  async init(): Promise<void> {
    await Promise.all([this.hot.init(), this.cold.init()]);
  }

  async load(token: string): Promise<PersistedPlayer | null> {
    const hot = await this.hot.load(token);
    if (hot) return hot;

    const cold = await this.cold.load(token);
    if (cold) {
      // 回填热层,下次直接命中(不 await,不阻塞 join)
      void this.hot.save([cold]);
    }
    return cold;
  }

  async save(batch: PersistedPlayer[]): Promise<void> {
    if (batch.length === 0) return;
    const results = await Promise.allSettled([this.hot.save(batch), this.cold.save(batch)]);
    for (const r of results) {
      if (r.status === 'rejected') {
        logger.error(`[Persist] 双写异常: ${String(r.reason)}`);
      }
    }
  }

  async close(): Promise<void> {
    await Promise.allSettled([this.hot.close(), this.cold.close()]);
  }
}
