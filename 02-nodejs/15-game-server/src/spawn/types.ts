/**
 * 统一物件生成框架 —— 类型定义
 *
 * 目标:让「障碍物 / 天气 / 敌人 / 物品」等各类物件共用同一套生成契约,
 * 新增一类物件只需实现一个 SpawnDefinition 并注册进 Spawner,无需改动世界逻辑。
 *
 * 两种随机模式:
 *   - static  : 用确定性种子(seededRng),启动时生成一次,多端布局一致可复现(如障碍物、地形)
 *   - dynamic : 用运行时随机(randomRng),可定时/按事件反复生成(如天气、刷怪、掉落)
 */

import { Rng } from './rng';

/** 物件大类。新增大类时在此扩展(字符串联合,保持可扩展) */
export type SpawnCategory = 'obstacle' | 'weather' | 'enemy' | 'item';

/** 生成模式:确定性种子 vs 运行时随机 */
export type SpawnMode = 'static' | 'dynamic';

/** 所有可生成物的基类字段 */
export interface Spawnable {
  id: number;
  category: SpawnCategory;
  kind: string; // 具体种类,如 'tree' | 'rock' | 'rain' | 'slime' | 'coin'
}

/** 带坐标 / 碰撞半径的空间物件(天气这类全局状态不属于此列) */
export interface SpatialSpawnable extends Spawnable {
  x: number;
  y: number;
  radius: number; // 参与占用/避让的半径(纯装饰可为 0)
}

/**
 * 生成上下文:交给每个定义的 generate() 使用。
 * 由 Spawner 构建,封装地图尺寸、随机源,以及跨类别的「占用集合」查询/登记。
 */
export interface SpawnContext {
  mapWidth: number;
  mapHeight: number;
  /** 随机源:static 定义拿到 seededRng,dynamic 定义拿到 randomRng */
  rng: Rng;
  /** 该点半径 r 的圆是否与已生成的空间物件重叠(用于避让,如物品不落进树里) */
  occupied(x: number, y: number, r: number): boolean;
  /** 把一个空间物件登记进占用集合,供后续生成的类别避让 */
  register(s: SpatialSpawnable): void;
  /** 领取一个全局唯一 id */
  nextId(): number;
}

/**
 * 一类物件的生成定义。
 * @typeParam T 该定义产出的物件类型
 */
export interface SpawnDefinition<T extends Spawnable = Spawnable> {
  category: SpawnCategory;
  kind: string; // 用于日志/查询的定义名(一个大类可注册多个 kind 定义)
  mode: SpawnMode;
  /** 生成一批物件。static 通常一次性生成多个;dynamic 每次调用生成当前批次 */
  generate(ctx: SpawnContext): T[];
}
