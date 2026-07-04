/**
 * 障碍物生成定义(static / 确定性种子)
 *
 * 从旧的 core/Obstacle.ts::generateObstacles 原样迁移而来 —— 种子算法、拒绝采样、
 * 尺寸/变体计算完全保持不变,保证迁移前后地图布局**逐像素一致**、多端可复现。
 * 这里只是把它包装成统一框架的 SpawnDefinition。
 *
 * 障碍物为「实心物」,由服务端权威生成并下发,参与碰撞(见 systems/MovementSystem)。
 */

import { Obstacle, ObstacleType } from '../../core/Obstacle';
import { srand } from '../rng';
import { SpatialSpawnable, SpawnContext, SpawnDefinition } from '../types';

/** 产出物件:既是领域内的 Obstacle,又满足框架的 SpatialSpawnable */
export type ObstacleSpawn = Obstacle & SpatialSpawnable;

export interface ObstacleGenConfig {
  seed: number;
  gap: number;
  tree: { count: number; minSize: number; maxSize: number; trunkRatio: number };
  rock: { count: number; minRadius: number; maxRadius: number };
}

/**
 * 构造障碍物生成定义。
 * 注意:障碍物为了与旧版布局逐像素一致,使用自带 seed 的 srand 直接复刻旧算法,
 * 不使用 ctx.rng(其余动态类别才用 ctx.rng)。仍通过 ctx 领取 id、登记占用集合。
 */
export function obstacleDefinition(cfg: ObstacleGenConfig): SpawnDefinition<ObstacleSpawn> {
  return {
    category: 'obstacle',
    kind: 'obstacle',
    mode: 'static',
    generate(ctx: SpawnContext): ObstacleSpawn[] {
      const { seed, gap } = cfg;
      const results: ObstacleSpawn[] = [];
      // seq: 已成功放置数(参与种子计算,跨 tree/rock 共享),与旧版一致
      let seq = 0;

      const place = (
        type: ObstacleType,
        count: number,
        pick: (s: number) => { radius: number; size: number; variant: number }
      ): void => {
        let attempt = 0;
        const maxAttempts = count * 40;
        let placed = 0;
        while (placed < count && attempt < maxAttempts) {
          const s = seed + seq * 7 + attempt * 3;
          const { radius, size, variant } = pick(s);
          // 用视觉尺寸做边距,避免树冠/石体压在地图边界外
          const margin = Math.max(radius, size * 0.5);
          const x = margin + srand(s + 1) * (ctx.mapWidth - margin * 2);
          const y = margin + srand(s + 2) * (ctx.mapHeight - margin * 2);
          attempt++;
          // 与已占用物件按「碰撞半径 + 间隙」做重叠检测
          if (ctx.occupied(x, y, radius + gap)) continue;
          const obj: ObstacleSpawn = {
            id: ctx.nextId(),
            category: 'obstacle',
            kind: type,
            type,
            x,
            y,
            radius,
            size,
            variant,
          };
          ctx.register(obj);
          results.push(obj);
          seq++;
          placed++;
        }
      };

      place('tree', cfg.tree.count, (s) => {
        const size = cfg.tree.minSize + srand(s) * (cfg.tree.maxSize - cfg.tree.minSize);
        return { radius: size * cfg.tree.trunkRatio, size, variant: Math.floor(srand(s + 5) * 3) };
      });

      place('rock', cfg.rock.count, (s) => {
        const radius = cfg.rock.minRadius + srand(s) * (cfg.rock.maxRadius - cfg.rock.minRadius);
        return { radius, size: radius, variant: Math.floor(srand(s + 5) * 3) };
      });

      return results;
    },
  };
}
