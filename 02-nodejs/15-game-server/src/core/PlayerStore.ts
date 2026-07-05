import { randomUUID } from 'crypto';
import { Player } from './Player';
import { WeaponKind } from './Weapon';
import { ExplorationMap } from './ExplorationMap';

/**
 * 角色存档(持久化)—— 开放世界共享服务器中的「个人进度」。
 *
 * 世界本身(障碍物/敌人/天气/掉落/其他玩家)始终是全局共享且服务端权威的;
 * 这里只额外持久化「某个角色离线时的私有状态」,使掉线重连后能恢复到原位:
 *   token → { 位置, 血量, 武器, 朝向 }
 *
 * token 由客户端在 localStorage 长期保存(首次注册时服务端生成并回传),
 * 作为角色的稳定身份 —— 换设备/清缓存即视为新角色,符合无账号 demo 的定位。
 * 存档为内存态,随服务端进程存活(重启即清空),对教学 demo 足够。
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
  explored: string; // base64 编码的迷雾探索位图
  savedAt: number;
}

export class PlayerStore {
  private store: Map<string, PersistedPlayer> = new Map();

  /** 生成一个新角色的稳定令牌 */
  newToken(): string {
    return randomUUID();
  }

  has(token: string): boolean {
    return this.store.has(token);
  }

  get(token: string): PersistedPlayer | undefined {
    return this.store.get(token);
  }

  /** 快照当前玩家状态(离线/重复登录时调用),供下次重连恢复。
   *  死亡态不落库,改为满血复活,避免玩家一上线就是尸体。 */
  save(player: Player): void {
    this.store.set(player.token, {
      token: player.token,
      name: player.name,
      x: player.position.x,
      y: player.position.y,
      hp: player.isDead ? player.maxHp : Math.max(1, Math.round(player.hp)),
      maxHp: player.maxHp,
      weapon: player.weapon,
      facing: player.facing,
      explored: player.exploration.toBase64(),
      savedAt: Date.now(),
    });
  }

  get size(): number {
    return this.store.size;
  }
}
