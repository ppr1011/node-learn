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

    const newX = player.position.x + player.velocity.x * dt;
    const newY = player.position.y + player.velocity.y * dt;

    // 边界限制
    player.position.x = Math.max(0, Math.min(GameConfig.MAP_WIDTH, newX));
    player.position.y = Math.max(0, Math.min(GameConfig.MAP_HEIGHT, newY));

    // 更新 AOI
    this.world.aoi.updatePlayer(player);
  }
}
