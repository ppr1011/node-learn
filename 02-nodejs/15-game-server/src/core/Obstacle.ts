/**
 * 障碍物碰撞数据结构:Obstacle 类型 + 空间分割网格(broad-phase)
 *
 * 世界里所有「实心」物体(树、石)都是障碍物,统一由服务端权威生成、下发,
 * 碰撞解算也只在服务端进行。客户端只按下发数据渲染,不再自己生成实心物。
 * (灌木、花草等纯装饰物仍由客户端本地生成,不参与碰撞。)
 *
 * 碰撞体一律用圆:相比多边形,圆的碰撞判定极便宜(只比较圆心距与半径和)、
 * 旋转无关,非常适合服务端每 tick 高频调用。不同类型用不同碰撞半径:
 *   - tree: 碰撞半径 = 树干(远小于树冠视觉尺寸)→ 只挡树干,树冠盖在玩家头顶
 *   - rock: 碰撞半径 ≈ 视觉半径 → 整块挡人
 *
 * 注:障碍物的「生成」逻辑已迁到统一生成框架 src/spawn/definitions/obstacles.ts,
 * 本文件只保留碰撞相关的数据结构。
 */

export type ObstacleType = 'tree' | 'rock';

export interface Obstacle {
  id: number;
  type: ObstacleType;
  x: number;
  y: number;
  radius: number; // 碰撞半径
  size: number;   // 渲染视觉尺寸(树冠/石体)
  variant: number; // 造型/配色变体(客户端渲染用)
}

/**
 * 障碍物空间网格(broad-phase):把地图切成固定格子,
 * 每个障碍物按其 AABB 覆盖的所有格子登记进去。
 *
 * 碰撞检测时,只需查询玩家所在格子及周围九宫格内的候选障碍物,
 * 把 O(N) 全量遍历降到 O(K)(K = 附近障碍物数),与 AOI 九宫格同思路。
 */
export class ObstacleGrid {
  private readonly cells: Map<string, Obstacle[]> = new Map();

  constructor(
    obstacles: Obstacle[],
    private readonly cellSize: number
  ) {
    for (const o of obstacles) {
      // 按碰撞半径的外接正方形覆盖的格子范围登记(可能跨多格)
      const minCx = Math.floor((o.x - o.radius) / cellSize);
      const maxCx = Math.floor((o.x + o.radius) / cellSize);
      const minCy = Math.floor((o.y - o.radius) / cellSize);
      const maxCy = Math.floor((o.y + o.radius) / cellSize);
      for (let cx = minCx; cx <= maxCx; cx++) {
        for (let cy = minCy; cy <= maxCy; cy++) {
          this.getCell(cx, cy).push(o);
        }
      }
    }
  }

  private cellKey(cx: number, cy: number): string {
    return `${cx},${cy}`;
  }

  private getCell(cx: number, cy: number): Obstacle[] {
    const key = this.cellKey(cx, cy);
    let cell = this.cells.get(key);
    if (!cell) {
      cell = [];
      this.cells.set(key, cell);
    }
    return cell;
  }

  /**
   * 返回查询点周围九宫格内的候选障碍物(已去重)。
   * queryRadius 目前未参与格子扩展(玩家半径远小于格子),保留参数以备将来大体积实体。
   */
  queryNearby(x: number, y: number, _queryRadius: number): Obstacle[] {
    const cx = Math.floor(x / this.cellSize);
    const cy = Math.floor(y / this.cellSize);
    const result: Obstacle[] = [];
    const seen = new Set<number>();

    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const cell = this.cells.get(this.cellKey(cx + dx, cy + dy));
        if (!cell) continue;
        for (const o of cell) {
          if (!seen.has(o.id)) {
            seen.add(o.id);
            result.push(o);
          }
        }
      }
    }

    return result;
  }
}
