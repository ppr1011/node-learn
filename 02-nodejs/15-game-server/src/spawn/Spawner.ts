/**
 * 统一物件生成器(注册表)
 *
 * 用法:
 *   const spawner = new Spawner(mapWidth, mapHeight);
 *   spawner.register(obstacleDefinition(cfg));
 *   spawner.register(weatherDefinition(cfg));
 *   const initial = spawner.generateStatic(seed);   // 启动:生成所有 static 定义
 *   const weather = spawner.generateDynamic('weather'); // 运行时/定时:生成某个 dynamic 定义
 *
 * 设计要点:
 *   - 维护一个跨类别的「占用集合」——先生成的空间物件(障碍物)会被后生成的类别
 *     (物品、敌人)自动避让,做到「物品不落进树里」。
 *   - id 由 Spawner 统一发放,全局唯一,static / dynamic 之间不会冲突。
 */

import { Rng, seededRng, randomRng } from './rng';
import { SpawnCategory, SpawnContext, SpawnDefinition, Spawnable, SpatialSpawnable } from './types';

export class Spawner {
  private readonly defs: SpawnDefinition[] = [];
  /** 已生成的空间物件占用集合(障碍物在此,供后续类别避让) */
  private occupied: SpatialSpawnable[] = [];
  private idCounter = 0;

  constructor(
    private readonly mapWidth: number,
    private readonly mapHeight: number
  ) {}

  register(def: SpawnDefinition): this {
    this.defs.push(def);
    return this;
  }

  /** 构建一个生成上下文,绑定给定随机源 */
  private makeContext(rng: Rng): SpawnContext {
    return {
      mapWidth: this.mapWidth,
      mapHeight: this.mapHeight,
      rng,
      occupied: (x, y, r) =>
        this.occupied.some((o) => Math.hypot(o.x - x, o.y - y) < o.radius + r),
      register: (s) => this.occupied.push(s),
      nextId: () => ++this.idCounter,
    };
  }

  /**
   * 生成所有 static 定义(启动时调用一次)。
   * 按注册顺序依次生成,占用集合逐步累积 → 后面的类别避开前面的。
   * @returns 按大类归组的结果
   */
  generateStatic(seed: number): Map<SpawnCategory, Spawnable[]> {
    this.occupied = [];
    this.idCounter = 0;
    const result = new Map<SpawnCategory, Spawnable[]>();

    for (const def of this.defs) {
      if (def.mode !== 'static') continue;
      // 每个 static 定义用同一 seed 派生的独立子序列,保证整体确定可复现
      const ctx = this.makeContext(seededRng(seed + def.category.length * 1000 + def.kind.length));
      const batch = def.generate(ctx);
      const list = result.get(def.category) ?? [];
      list.push(...batch);
      result.set(def.category, list);
    }

    return result;
  }

  /**
   * 生成某个 dynamic 定义(运行时 / 定时调用)。
   * 使用运行时随机源;若产出空间物件,会一并登记进占用集合(避让后续动态生成)。
   * @param kind 目标定义的 kind
   */
  generateDynamic(kind: string): Spawnable[] {
    const def = this.defs.find((d) => d.mode === 'dynamic' && d.kind === kind);
    if (!def) return [];
    const ctx = this.makeContext(randomRng());
    return def.generate(ctx);
  }
}
