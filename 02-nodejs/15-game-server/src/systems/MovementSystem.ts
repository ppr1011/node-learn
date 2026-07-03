import { Player } from '../core/Player';
import { GameWorld } from '../core/GameWorld';
import { GameConfig } from '../config';

export class MovementSystem {
  constructor(private readonly world: GameWorld) {}

  handleInput(player: Player, data: any): void {
    if (player.isDead) return;

    const { dx, dy } = data;
    if (typeof dx !== 'number' || typeof dy !== 'number') return;

    // 归一化方向向量
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) {
      player.velocity = { x: 0, y: 0 };
      return;
    }

    player.velocity = {
      x: (dx / len) * player.speed,
      y: (dy / len) * player.speed,
    };
  }

  update(player: Player, dt: number): void {
    if (player.velocity.x === 0 && player.velocity.y === 0) return;

    // 期望位移 + 地图边界限制
    let nx = Math.max(0, Math.min(GameConfig.MAP_WIDTH, player.position.x + player.velocity.x * dt));
    let ny = Math.max(0, Math.min(GameConfig.MAP_HEIGHT, player.position.y + player.velocity.y * dt));

    // 障碍物碰撞:push-out 滑动解算(圆 vs 圆)
    // 只对期望到达点做处理 —— 若钻进障碍物,沿法线推回表面,
    // 抵消法向分量、保留切向分量 → 表现为顺着边缘滑过去(详见 collision-demo.html)。
    // 做 2 遍 pass 处理夹在两个障碍物之间的情况。
    const candidates = this.world.obstacleGrid.queryNearby(nx, ny, player.radius);
    if (candidates.length > 0) {
      for (let pass = 0; pass < 2; pass++) {
        for (const o of candidates) {
          const dx = nx - o.x;
          const dy = ny - o.y;
          const minDist = player.radius + o.radius;
          const dist = Math.hypot(dx, dy);
          if (dist < minDist) {
            if (dist === 0) {
              // 圆心完全重合,任选一个方向推出
              nx = o.x + minDist;
              ny = o.y;
            } else {
              const push = minDist - dist;
              nx += (dx / dist) * push;
              ny += (dy / dist) * push;
            }
          }
        }
      }
      // 推出后可能越界,再次 clamp
      nx = Math.max(0, Math.min(GameConfig.MAP_WIDTH, nx));
      ny = Math.max(0, Math.min(GameConfig.MAP_HEIGHT, ny));
    }

    player.position.x = nx;
    player.position.y = ny;

    // 更新 AOI
    this.world.aoi.updatePlayer(player);
  }
}
