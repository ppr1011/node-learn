/**
 * 敌人生成定义(dynamic / 空间)—— 扩展骨架,默认不产出(count = 0)
 *
 * 这是「动态 + 空间 + 避障」这条路径的模板:敌人有坐标和碰撞半径,由服务端在运行时
 * (如按波次定时刷新)生成,并借助 placeMany 自动避开障碍物与彼此。
 *
 * ⚠️ 本次只搭生成骨架,尚未接入以下环节(要真正让敌人「活」起来需补齐):
 *   1. 实体化:把 EnemySpawn 转成带 AI 状态的实体,存进 GameWorld(类似 players 的一张表);
 *   2. tick 更新:在 GameWorld.tick 里驱动敌人移动/追击/攻击(参考 systems/MovementSystem);
 *   3. 战斗接入:让 CombatSystem 能命中敌人、敌人能命中玩家;
 *   4. 协议 + 广播:新增 ENEMY 相关消息,按 AOI 下发给附近玩家;
 *   5. 客户端渲染:在 client/index.html 里画出敌人及血条。
 *
 * 打开方式:把 config 里的 count 设为 > 0,并在 GameWorld 里注册本定义 + 定时调用
 * spawner.generateDynamic('enemy')。
 */

import { placeMany } from '../rng';
import { SpatialSpawnable, SpawnContext, SpawnDefinition } from '../types';

export interface EnemySpawn extends SpatialSpawnable {
  category: 'enemy';
  hp: number;
  speed: number;
}

export interface EnemyGenConfig {
  count: number; // 每次生成的数量;默认 0 → 不产出
  gap: number; // 与障碍物/其他敌人的最小间隙
  radius: number; // 碰撞半径
  hp: number;
  speed: number;
  kinds: readonly string[]; // 敌人种类(如 'slime' | 'wolf')
}

export function enemyDefinition(cfg: EnemyGenConfig): SpawnDefinition<EnemySpawn> {
  return {
    category: 'enemy',
    kind: 'enemy',
    mode: 'dynamic',
    generate(ctx: SpawnContext): EnemySpawn[] {
      if (cfg.count <= 0) return [];
      const kinds = cfg.kinds.length > 0 ? cfg.kinds : ['slime'];
      // 复用通用拒绝采样:自动避开已登记的障碍物(占用集合)
      const placed = placeMany(ctx, 'enemy', { count: cfg.count, gap: cfg.gap }, (rng) => ({
        kind: kinds[Math.floor(rng.next() * kinds.length)] ?? 'slime',
        radius: cfg.radius,
        extra: { hp: cfg.hp, speed: cfg.speed },
      }));
      return placed as EnemySpawn[];
    },
  };
}
