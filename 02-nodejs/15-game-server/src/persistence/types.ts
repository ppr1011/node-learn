import { WeaponKind } from '../core/Weapon';

/**
 * 角色存档(持久化)—— 开放世界共享服务器中的「个人进度」。
 *
 * 世界本身(障碍物/敌人/天气/掉落/其他玩家)始终是全局共享且服务端权威的,
 * 且用确定性种子在启动时重建;这里只持久化「某个角色的私有进度」,
 * 使掉线重连、甚至服务端重启后都能恢复到原位:
 *   token → { 位置, 血量, 武器, 朝向, 等级, 经验, 迷雾 }
 *
 * token 由客户端在 localStorage 长期保存(首次注册时服务端生成并回传),
 * 作为角色的稳定身份 —— 换设备/清缓存即视为新角色,符合无账号 demo 的定位。
 */
export interface PersistedPlayer {
  token: string;
  name: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  weapon: WeaponKind;
  facing: number;
  level: number;
  xp: number;
  explored: string; // base64 编码的迷雾探索位图
  savedAt: number;
}

/**
 * 可插拔的持久化后端。热路径(20Hz tick)永远读写内存态,
 * 只有 join 读档、下线/定时/关服 写回时才触碰后端 —— 故接口全异步。
 *
 * 实现:
 *  - {@link SqliteBackend} 冷层:单文件永久账本,进程外存活。
 *  - {@link RedisBackend}  热层:毫秒级,AOF 落盘,多实例共享。
 *  - {@link TieredBackend} 组合冷热两层(热优先读,双写)。
 */
export interface PersistenceBackend {
  /** 连接/建表;失败应自行降级而非抛出,保证游戏可启动。 */
  init(): Promise<void>;
  /** 读档;无存档返回 null。 */
  load(token: string): Promise<PersistedPlayer | null>;
  /** 批量写回(write-behind);实现应吞掉存储抖动,只告警不抛。 */
  save(batch: PersistedPlayer[]): Promise<void>;
  /** 关闭连接,释放资源。 */
  close(): Promise<void>;
}
