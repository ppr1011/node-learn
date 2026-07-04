/**
 * 生成框架 —— 随机源 + 放置工具
 *
 * 提供两种随机源:
 *   - seededRng(seed) : 确定性伪随机,相同 seed 恒定同序列(多端一致、可复现)
 *   - randomRng()     : 包 Math.random(),用于运行时动态生成
 *
 * 以及 placeMany():把「拒绝采样放置 N 个不重叠物件」这一通用逻辑抽出来,
 * 供敌人/物品等空间物件复用(障碍物为保证布局零变化,仍用 srand 直接复刻旧算法)。
 */

import { SpawnContext, SpatialSpawnable } from './types';

/** 统一随机源接口:next() 返回 [0, 1) */
export interface Rng {
  next(): number;
}

/**
 * 确定性伪随机(与客户端 srand 同思路:Math.sin 取小数)。
 * 纯函数版:相同 seed 恒定返回同一个 [0, 1) 值。
 */
export function srand(seed: number): number {
  const x = Math.sin(seed + 1) * 10000;
  return x - Math.floor(x);
}

/** 基于 srand 的有状态确定性随机源:每次 next() 推进内部计数 */
export function seededRng(seed: number): Rng {
  let counter = 0;
  return {
    next(): number {
      return srand(seed + counter++ * 2.3719);
    },
  };
}

/** 运行时真随机源 */
export function randomRng(): Rng {
  return { next: () => Math.random() };
}

/** placeMany 的选型回调:根据随机源产出一个待放置物件的尺寸/种类等属性 */
export type PickResult = {
  kind: string;
  radius: number;
  /** 附加到产出物件上的任意额外字段(如 size、variant、hp) */
  extra?: Record<string, unknown>;
};

export interface PlaceOptions {
  count: number;
  gap?: number; // 与已占用物件之间额外保留的间隙
  margin?: number; // 距地图边缘的最小距离(默认按 radius 计)
  maxAttemptsPerItem?: number; // 每个物件的最大尝试次数(默认 40)
}

/**
 * 通用拒绝采样放置:在地图内随机撒点,与「已占用集合」重叠(含 gap)则丢弃重试,
 * 成功放置的物件会自动 register 进上下文,供后续类别继续避让。
 *
 * @returns 实际放置成功的空间物件数组(可能少于 count,受 maxAttempts 限制)
 */
export function placeMany(
  ctx: SpawnContext,
  category: SpatialSpawnable['category'],
  opts: PlaceOptions,
  pick: (rng: { next(): number }) => PickResult
): SpatialSpawnable[] {
  const { count, gap = 0, maxAttemptsPerItem = 40 } = opts;
  const placed: SpatialSpawnable[] = [];
  const maxAttempts = count * maxAttemptsPerItem;
  let attempt = 0;

  while (placed.length < count && attempt < maxAttempts) {
    attempt++;
    const { kind, radius, extra } = pick(ctx.rng);
    const margin = opts.margin ?? radius;
    const x = margin + ctx.rng.next() * (ctx.mapWidth - margin * 2);
    const y = margin + ctx.rng.next() * (ctx.mapHeight - margin * 2);

    if (ctx.occupied(x, y, radius + gap)) continue;

    const obj: SpatialSpawnable = { id: ctx.nextId(), category, kind, x, y, radius, ...extra };
    ctx.register(obj);
    placed.push(obj);
  }

  return placed;
}
