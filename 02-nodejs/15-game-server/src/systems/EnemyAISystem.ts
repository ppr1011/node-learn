import { Enemy, EnemyKind } from '../core/Enemy';
import { GameWorld } from '../core/GameWorld';
import { GameConfig } from '../config';
import { BTNode, BTContext } from '../ai/bt/types';
import { buildEnemyTree } from '../ai/bt/enemyTree';

/**
 * 敌人 AI 系统 —— 行为树驱动版
 *
 * 旧版是手写状态机(一串 if-else 决定 attack/chase/patrol)。现在只做三件事:
 *   1. 处理死亡→复活的计时;
 *   2. 为每个存活敌人构建一次性的黑板 BTContext,tick 它所属种类的行为树;
 *   3. tick 末尾统一 applyMovement(把树里设置的 velocity 落到位置并收敛边界)。
 * 所有「怎么决策」的逻辑都搬进了 src/ai/bt/(树结构 + 叶子),这里只是执行器。
 */
export class EnemyAISystem {
  private readonly trees: Partial<Record<EnemyKind, BTNode>> = {};

  constructor(private readonly world: GameWorld) {}

  /** 每种敌人共享一棵无状态树(懒构建 + 缓存) */
  private treeFor(kind: EnemyKind): BTNode {
    return this.trees[kind] ?? (this.trees[kind] = buildEnemyTree(kind));
  }

  update(dt: number): void {
    const now = Date.now();

    for (const enemy of this.world.enemies.values()) {
      // 处理待复活
      if (enemy.isDead) {
        if (enemy.respawnAt > 0 && now >= enemy.respawnAt) {
          const pos = this.world.findSafeSpawn(enemy.radius);
          enemy.respawn(pos.x, pos.y);
        }
        continue;
      }

      const ctx: BTContext = { enemy, world: this.world, dt, now, target: null };
      this.treeFor(enemy.kind).tick(ctx);

      this.applyMovement(enemy, dt);
    }
  }

  /** 应用速度并收敛到地图边界(与旧版一致:敌人不做障碍物 push-out) */
  private applyMovement(enemy: Enemy, dt: number): void {
    if (enemy.velocity.x === 0 && enemy.velocity.y === 0) return;
    enemy.position.x = Math.max(
      enemy.radius,
      Math.min(GameConfig.MAP_WIDTH - enemy.radius, enemy.position.x + enemy.velocity.x * dt)
    );
    enemy.position.y = Math.max(
      enemy.radius,
      Math.min(GameConfig.MAP_HEIGHT - enemy.radius, enemy.position.y + enemy.velocity.y * dt)
    );
  }
}
