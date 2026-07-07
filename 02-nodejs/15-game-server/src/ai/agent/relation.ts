/**
 * 关系解锁 —— 信任阈值 → 玩法能力
 */

import { Enemy } from '../../core/Enemy';
import { NpcMemory } from '../llm/memory';

export interface TrustUnlock {
  trust: number;
  id: string;
  title: string;
  perk: string;
}

export const TRUST_UNLOCKS: TrustUnlock[] = [
  { trust: 30, id: 'ally', title: '熟识', perk: '高信任免疫靠近误判攻击' },
  { trust: 60, id: 'partner', title: '伙伴', perk: '委托经验×1.5,优先协助狩猎' },
  { trust: 90, id: 'bond', title: '羁绊', perk: '委托经验×2,额外信任奖励' },
];

export function trustOf(enemy: Enemy, playerName: string): number {
  return enemy.llmRelations[playerName]?.trust ?? 0;
}

export function unlockedFor(enemy: Enemy, playerName: string): TrustUnlock[] {
  const t = trustOf(enemy, playerName);
  return TRUST_UNLOCKS.filter((u) => t >= u.trust);
}

export function questXpMultiplier(enemy: Enemy, playerName: string): number {
  const t = trustOf(enemy, playerName);
  if (t >= 90) return 2;
  if (t >= 60) return 1.5;
  return 1;
}

export function formatUnlocks(enemy: Enemy, playerName: string): string[] {
  const list = unlockedFor(enemy, playerName);
  if (list.length === 0) return ['暂无解锁'];
  return list.map((u) => `${u.title}:${u.perk}`);
}

export function onQuestComplete(enemy: Enemy, playerName: string, now: number): void {
  NpcMemory.bumpTrust(enemy, playerName, 10, now);
  const t = trustOf(enemy, playerName);
  if (t >= 90) NpcMemory.bumpTrust(enemy, playerName, 5, now);
}
