/**
 * 天气生成定义(dynamic / 运行时随机,非空间全局状态)
 *
 * 天气是本框架里「动态 + 非空间」这条路径的完整示例:
 *   - 不落在地图坐标上,是一份全局状态;
 *   - 用运行时随机源(randomRng)决定,由服务端定时重掷并广播给所有客户端;
 *   - 服务端权威 → 多端天气一致。
 *
 * 生成/广播的接线见 core/GameWorld(定时器 + WEATHER 消息),渲染见 client/index.html。
 */

import { Spawnable, SpawnContext, SpawnDefinition } from '../types';

/** 全局天气状态 */
export interface WeatherState extends Spawnable {
  category: 'weather';
  kind: string; // 'clear' | 'rain' | 'fog' | 'snow' ...
  intensity: number; // 0(无)~ 1(最强),clear 恒为 0
}

export interface WeatherGenConfig {
  kinds: readonly string[]; // 可选天气种类,第一个约定为 'clear'
  minIntensity: number;
  maxIntensity: number;
}

export function weatherDefinition(cfg: WeatherGenConfig): SpawnDefinition<WeatherState> {
  return {
    category: 'weather',
    kind: 'weather',
    mode: 'dynamic',
    generate(ctx: SpawnContext): WeatherState[] {
      const kinds = cfg.kinds.length > 0 ? cfg.kinds : ['clear'];
      const kind = kinds[Math.floor(ctx.rng.next() * kinds.length)] ?? 'clear';
      const intensity =
        kind === 'clear'
          ? 0
          : cfg.minIntensity + ctx.rng.next() * (cfg.maxIntensity - cfg.minIntensity);
      return [{ id: ctx.nextId(), category: 'weather', kind, intensity }];
    },
  };
}
