/**
 * 区域传闻 —— 同难度带 LLM NPC 共享八卦板
 */

import { GameWorld } from '../../core/GameWorld';
import { GameConfig } from '../../config';

export interface RumorEntry {
  at: number;
  text: string;
}

export class RumorBoard {
  private static board(world: GameWorld): Map<number, RumorEntry[]> {
    if (!world.rumorBoard) {
      world.rumorBoard = new Map();
    }
    return world.rumorBoard;
  }

  static add(world: GameWorld, zoneId: number, text: string, now: number): void {
    const b = this.board(world);
    const list = b.get(zoneId) ?? [];
    list.push({ at: now, text: text.slice(0, 60) });
    const max = GameConfig.LLM_RUMOR_MAX;
    while (list.length > max) list.shift();
    b.set(zoneId, list);
  }

  static forZone(world: GameWorld, zoneId: number, now: number): string[] {
    const list = this.board(world).get(zoneId) ?? [];
    return list.slice(-5).map((r) => {
      const min = Math.floor((now - r.at) / 60000);
      const ago = min < 1 ? '刚刚' : `${min}分钟前`;
      return `[${ago}] ${r.text}`;
    });
  }
}
