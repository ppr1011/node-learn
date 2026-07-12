/**
 * 避难所(Shelter)—— 每条难度带一个「安全落脚点」的权威定义
 *
 * 玩家踏入避难所的安全圈即「脱敌」:怪物的 acquireTarget 会跳过圈内玩家,
 * 随即丢失目标、回落巡逻(见 ai/bt/enemyActions.ts)。安全圈门口有一堆篝火,
 * 站在篝火半径内每秒回一小段血(见 GameWorld.updateCampfires)。
 *
 * 与 Zone.ts 同一思路:把「一类静态分档数值/坐标」集中成一张表,由 ZONES 派生,
 * 服务端据此清障 + 避让刷怪,并把 shelterPublicState() 下发给客户端渲染。
 */

import { ZONES } from './Zone';

/** 安全圈半径(圈内脱敌;也是清障 / 避让刷怪的范围) */
export const SHELTER_RADIUS = 300;
/** 门口篝火的回血半径 */
export const CAMPFIRE_RADIUS = 110;

export interface Shelter {
  id: number;
  zoneId: number;
  name: string;
  x: number; // 安全圈圆心
  y: number;
  radius: number; // 安全圈半径
  campfire: { x: number; y: number; radius: number }; // 门口篝火:半径内每秒回血
  color: string; // 客户端渲染(沿用所属带的配色)
}

/** 每带一个避难所:圈心置于带内偏下中央(避开顶部大号带名),篝火在圈下沿「门口」 */
export const SHELTERS: Shelter[] = ZONES.map((z) => {
  const x = z.bounds.x + z.bounds.w * 0.5;
  const y = z.bounds.y + z.bounds.h * 0.7;
  return {
    id: z.id,
    zoneId: z.id,
    name: `${z.name}·避难所`,
    x,
    y,
    radius: SHELTER_RADIUS,
    campfire: { x, y: y + SHELTER_RADIUS * 0.72, radius: CAMPFIRE_RADIUS },
    color: z.color,
  };
});

/** 某坐标落在哪个避难所安全圈内(圆距判定);都不在则 null */
export function shelterContaining(x: number, y: number): Shelter | null {
  for (const s of SHELTERS) {
    if (Math.hypot(x - s.x, y - s.y) <= s.radius) return s;
  }
  return null;
}

/** 是否处于任一避难所安全圈内(脱敌 / 清障 / 避让刷怪用) */
export function isInAnyShelter(x: number, y: number): boolean {
  return shelterContaining(x, y) !== null;
}

/** 某坐标是否在某堆篝火的回血半径内;是则返回该避难所,否则 null */
export function nearCampfire(x: number, y: number): Shelter | null {
  for (const s of SHELTERS) {
    const c = s.campfire;
    if (Math.hypot(x - c.x, y - c.y) <= c.radius) return s;
  }
  return null;
}

/** 下发给客户端的视图(渲染所需字段全带上,数据量很小) */
export function shelterPublicState(s: Shelter) {
  return {
    id: s.id,
    zoneId: s.zoneId,
    name: s.name,
    x: s.x,
    y: s.y,
    radius: s.radius,
    campfire: s.campfire,
    color: s.color,
  };
}
