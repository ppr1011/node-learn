import { randomUUID } from 'crypto';
import { Player } from './Player';
import { PersistenceBackend, PersistedPlayer } from '../persistence/types';
import { GameConfig } from '../config';
import { logger } from '../utils/Logger';

// 存档结构定义已迁至 persistence 层;此处 re-export 保持既有导入路径不破。
export type { PersistedPlayer } from '../persistence/types';

/**
 * 角色存档管理:内存 L1 缓存 + 可插拔的持久化后端。
 *
 * - L1(`store` Map):tick 期不触碰;仅在 join 读档、写回快照时用作最近状态缓存,
 *   命中可省一次后端往返。
 * - 后端(Redis 热层 + SQLite 冷层):进程外存活 —— 服务端重启后仍能恢复玩家进度。
 *
 * 写策略为 write-behind:游戏循环从不同步写库;由定时器每 PERSIST_FLUSH_MS
 * 快照在线玩家批量写回,另在下线 / 关服时各触发一次即时写回。
 */
export class PlayerStore {
  private store: Map<string, PersistedPlayer> = new Map();
  private flushTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly backend: PersistenceBackend) {}

  /** 生成一个新角色的稳定令牌 */
  newToken(): string {
    return randomUUID();
  }

  /** 连接/初始化后端(建表、连 Redis);失败由后端自行降级,不抛。 */
  async init(): Promise<void> {
    await this.backend.init();
  }

  has(token: string): boolean {
    return this.store.has(token);
  }

  get(token: string): PersistedPlayer | undefined {
    return this.store.get(token);
  }

  /** 读档:先查 L1 缓存,未命中再查持久层(热→冷)并回填缓存。 */
  async load(token: string): Promise<PersistedPlayer | null> {
    const cached = this.store.get(token);
    if (cached) return cached;
    const loaded = await this.backend.load(token);
    if (loaded) this.store.set(token, loaded);
    return loaded;
  }

  /**
   * 把玩家当前状态快照进 L1 缓存(纯内存,不落库)。
   * 死亡态不落库,改为满血复活,避免玩家一上线就是尸体。
   */
  snapshot(player: Player): void {
    this.store.set(player.token, {
      token: player.token,
      name: player.name,
      x: player.position.x,
      y: player.position.y,
      hp: player.isDead ? player.maxHp : Math.max(1, Math.round(player.hp)),
      maxHp: player.maxHp,
      weapon: player.weapon,
      facing: player.facing,
      level: player.level,
      xp: player.xp,
      explored: player.exploration.toBase64(),
      savedAt: Date.now(),
    });
  }

  /** 写回:把给定 token(默认缓存内全部)从 L1 批量写到持久层。 */
  async flush(tokens?: string[]): Promise<void> {
    const keys = tokens ?? [...this.store.keys()];
    const batch: PersistedPlayer[] = [];
    for (const t of keys) {
      const rec = this.store.get(t);
      if (rec) batch.push(rec);
    }
    if (batch.length) await this.backend.save(batch);
  }

  /** 启动 write-behind 定时器:周期快照在线玩家并批量写回。 */
  startFlushLoop(online: () => Iterable<Player>): void {
    if (this.flushTimer) return;
    this.flushTimer = setInterval(() => {
      const tokens: string[] = [];
      for (const p of online()) {
        this.snapshot(p);
        tokens.push(p.token);
      }
      if (tokens.length) {
        this.flush(tokens).catch((err) =>
          logger.error(`[Persist] 定时写回失败: ${(err as Error).message}`)
        );
      }
    }, GameConfig.PERSIST_FLUSH_MS);
    logger.info(`[Persist] write-behind 已启动,每 ${GameConfig.PERSIST_FLUSH_MS}ms 快照写回`);
  }

  stopFlushLoop(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  async close(): Promise<void> {
    await this.backend.close();
  }

  get size(): number {
    return this.store.size;
  }
}
