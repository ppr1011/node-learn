import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { PersistenceBackend, PersistedPlayer } from './types';
import { logger } from '../utils/Logger';

/**
 * 冷层:SQLite 永久账本(better-sqlite3)。
 *
 * 单文件即持久,无需外部服务,进程/机器重启不丢 —— 灾备兜底。
 * better-sqlite3 是同步 API(设计如此),对几行/批量 upsert 是微秒~毫秒级,
 * 放在 write-behind 定时器里完全够用,不影响游戏循环。
 */
export class SqliteBackend implements PersistenceBackend {
  private db: Database.Database | null = null;
  private upsertStmt!: Database.Statement;
  private selectStmt!: Database.Statement;

  constructor(private readonly dbPath: string) {}

  async init(): Promise<void> {
    // 建目录(dbPath 可能是 data/players.db 这类相对路径)
    const dir = path.dirname(path.resolve(this.dbPath));
    fs.mkdirSync(dir, { recursive: true });

    this.db = new Database(this.dbPath);
    // WAL:并发读 + 崩溃安全,写不阻塞读
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS players (
        token    TEXT PRIMARY KEY,
        name     TEXT NOT NULL,
        x        REAL NOT NULL,
        y        REAL NOT NULL,
        hp       REAL NOT NULL,
        maxHp    REAL NOT NULL,
        weapon   TEXT NOT NULL,
        facing   REAL NOT NULL,
        level    INTEGER NOT NULL,
        xp       INTEGER NOT NULL,
        explored TEXT NOT NULL,
        savedAt  INTEGER NOT NULL
      )
    `);

    this.upsertStmt = this.db.prepare(`
      INSERT INTO players (token, name, x, y, hp, maxHp, weapon, facing, level, xp, explored, savedAt)
      VALUES (@token, @name, @x, @y, @hp, @maxHp, @weapon, @facing, @level, @xp, @explored, @savedAt)
      ON CONFLICT(token) DO UPDATE SET
        name=@name, x=@x, y=@y, hp=@hp, maxHp=@maxHp, weapon=@weapon,
        facing=@facing, level=@level, xp=@xp, explored=@explored, savedAt=@savedAt
    `);
    this.selectStmt = this.db.prepare('SELECT * FROM players WHERE token = ?');

    const count = (this.db.prepare('SELECT COUNT(*) AS n FROM players').get() as { n: number }).n;
    logger.info(`[Persist] SQLite ready @ ${this.dbPath} (${count} 条存档)`);
  }

  async load(token: string): Promise<PersistedPlayer | null> {
    if (!this.db) return null;
    const row = this.selectStmt.get(token) as PersistedPlayer | undefined;
    return row ?? null;
  }

  async save(batch: PersistedPlayer[]): Promise<void> {
    if (!this.db || batch.length === 0) return;
    // 事务批量 upsert:N 行一次落盘,快且原子
    const tx = this.db.transaction((rows: PersistedPlayer[]) => {
      for (const r of rows) this.upsertStmt.run(r);
    });
    try {
      tx(batch);
    } catch (err) {
      logger.error(`[Persist] SQLite 写入失败: ${(err as Error).message}`);
    }
  }

  async close(): Promise<void> {
    this.db?.close();
    this.db = null;
  }
}
