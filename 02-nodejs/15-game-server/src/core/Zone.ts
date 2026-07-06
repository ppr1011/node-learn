/**
 * 区域(Zone)—— 横向难度带的权威定义
 *
 * 地图沿 x 轴切成若干条等宽竖带,从左到右难度递增:
 *   新手草原 → 幽暗密林 → 熔岩荒原 → 深渊
 *
 * 每条带自带:推荐等级、可刷怪种类、怪物属性倍率(statMult)、掉落幸运倍率(dropLuck)。
 * 服务端据此在带内刷怪(见 GameWorld),并把每带的 toPublicState() 下发给客户端用于
 * 渲染地面着色、带名、推荐等级横幅与小地图竖带。
 *
 * 与 Enemy.KIND_STATS / Weapon.WEAPONS 同一思路:把「一类静态分档数值」集中成一张表,
 * 而不是散进 config —— 这里放的是「地理 + 难度」维度的数值。
 */

import { EnemyKind } from './Enemy';

export interface Zone {
  id: number;
  name: string;
  tier: number;
  recommendedLevel: number;
  bounds: { x: number; y: number; w: number; h: number };
  enemyKinds: EnemyKind[];
  statMult: number; // 缩放该带怪物的 hp / 攻击力 / 经验
  dropLuck: number; // 该带击杀的掉落幸运(越高越易出稀有/史诗/传说)
  color: string; // 客户端地面着色 / 小地图竖带颜色
}

/** 每条带刷多少怪(乘上带数即全图敌人总量) */
export const ZONE_ENEMY_COUNT = 16;

const MAP_HEIGHT = 4000;
const BAND_WIDTH = 3000; // 每条带宽度;带数 × 该宽度 = 地图总宽(见 config.MAP_WIDTH)

/** 4 条横向难度带(x 从左到右) */
export const ZONES: Zone[] = [
  {
    id: 0, name: '新手草原', tier: 1, recommendedLevel: 1,
    bounds: { x: 0, y: 0, w: BAND_WIDTH, h: MAP_HEIGHT },
    enemyKinds: ['slime', 'skeleton'],
    statMult: 1.0, dropLuck: 0.8, color: '#4caf50',
  },
  {
    id: 1, name: '幽暗密林', tier: 2, recommendedLevel: 5,
    bounds: { x: BAND_WIDTH, y: 0, w: BAND_WIDTH, h: MAP_HEIGHT },
    enemyKinds: ['skeleton', 'demon', 'orc'],
    statMult: 1.6, dropLuck: 1.2, color: '#5c6bc0',
  },
  {
    id: 2, name: '熔岩荒原', tier: 3, recommendedLevel: 12,
    bounds: { x: BAND_WIDTH * 2, y: 0, w: BAND_WIDTH, h: MAP_HEIGHT },
    enemyKinds: ['demon', 'orc', 'wraith'],
    statMult: 2.6, dropLuck: 1.8, color: '#e2643a',
  },
  {
    id: 3, name: '深渊', tier: 4, recommendedLevel: 20,
    bounds: { x: BAND_WIDTH * 3, y: 0, w: BAND_WIDTH, h: MAP_HEIGHT },
    enemyKinds: ['wraith', 'golem', 'dragon'],
    statMult: 4.0, dropLuck: 2.6, color: '#6a2c8f',
  },
];

/** 某个世界坐标落在哪条带里(按 x 定位;越界收敛到首/末带) */
export function zoneAt(x: number): Zone {
  for (const z of ZONES) {
    if (x >= z.bounds.x && x < z.bounds.x + z.bounds.w) return z;
  }
  return x < 0 ? ZONES[0]! : ZONES[ZONES.length - 1]!;
}

/** 下发给客户端的精简视图(仅渲染所需字段) */
export function zonePublicState(z: Zone) {
  return {
    id: z.id,
    name: z.name,
    tier: z.tier,
    recommendedLevel: z.recommendedLevel,
    bounds: z.bounds,
    color: z.color,
  };
}
