/**
 * 物品生成定义(static 或 dynamic / 空间)—— 扩展骨架,默认不产出(count = 0)
 *
 * 物品(金币、补给、宝箱)是「空间物件」的又一例:可静可动。
 *   - 想让物品布局固定、多端一致 → mode 用 'static'(确定性种子);
 *   - 想让物品定时刷新/被捡走后重生 → mode 用 'dynamic'(运行时随机 + 定时)。
 * 本骨架用 static 作示例;避障同样交给 placeMany(物品不会落进树石里)。
 *
 * ⚠️ 尚未接入:拾取判定(玩家碰到即得)、协议下发、客户端渲染。
 * 打开方式:config 里 count 设为 > 0,并在 GameWorld 注册本定义;static 会在
 * generateStatic 时随障碍物一起生成,dynamic 则由定时器调用 generateDynamic('item')。
 */

import { placeMany } from '../rng';
import { SpatialSpawnable, SpawnContext, SpawnDefinition, SpawnMode } from '../types';

export interface ItemSpawn extends SpatialSpawnable {
  category: 'item';
  value: number;
}

export interface ItemGenConfig {
  count: number; // 默认 0 → 不产出
  gap: number;
  radius: number;
  value: number;
  kinds: readonly string[]; // 物品种类(如 'coin' | 'potion')
  mode?: SpawnMode; // 默认 'static'
}

export function itemDefinition(cfg: ItemGenConfig): SpawnDefinition<ItemSpawn> {
  return {
    category: 'item',
    kind: 'item',
    mode: cfg.mode ?? 'static',
    generate(ctx: SpawnContext): ItemSpawn[] {
      if (cfg.count <= 0) return [];
      const kinds = cfg.kinds.length > 0 ? cfg.kinds : ['coin'];
      const placed = placeMany(ctx, 'item', { count: cfg.count, gap: cfg.gap }, (rng) => ({
        kind: kinds[Math.floor(rng.next() * kinds.length)] ?? 'coin',
        radius: cfg.radius,
        extra: { value: cfg.value },
      }));
      return placed as ItemSpawn[];
    },
  };
}
