import { PersistenceBackend, PersistedPlayer } from './types';
import { logger } from '../utils/Logger';

/**
 * 空后端:PERSIST_ENABLED=0 时使用 —— 退回「纯内存态」旧行为
 * (掉线重连可恢复,重启即清空)。用于教学对照或临时关闭持久化。
 */
export class NullBackend implements PersistenceBackend {
  async init(): Promise<void> {
    logger.warn('[Persist] 持久化已关闭(PERSIST_ENABLED=0),状态仅存内存,重启即丢失');
  }
  async load(_token: string): Promise<PersistedPlayer | null> {
    return null;
  }
  async save(_batch: PersistedPlayer[]): Promise<void> {
    /* no-op */
  }
  async close(): Promise<void> {
    /* no-op */
  }
}
