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

/** 接委托所需的最低信任(≥30 视为朋友/熟识) */
export const QUEST_FRIEND_TRUST = 30;

export function trustOf(enemy: Enemy, playerName: string): number {
  return enemy.llmRelations[playerName]?.trust ?? 0;
}

/** 是否已是朋友(可接委托) */
export function isNpcFriend(enemy: Enemy, playerName: string): boolean {
  return trustOf(enemy, playerName) >= QUEST_FRIEND_TRUST;
}

/** NPC 是否允许攻击该玩家:默认中立,仅被挑衅或已结仇时才反击 */
export function canNpcAttackPlayer(
  enemy: Enemy,
  playerName: string,
  chatText?: string
): boolean {
  const rel = enemy.llmRelations[playerName];
  if (!rel) return false; // 陌生人:不主动攻击

  if (rel.hits > 0) return true;           // 玩家先动手
  if (rel.trust <= -20) return true;       // 关系敌对
  if (/袭击者|仇人|敌对/.test(rel.label)) return true;

  if (chatText && /打你|杀你|攻击你|揍你|弄死你|去死|滚开|敢打|挑衅|开战/i.test(chatText)) {
    return true;
  }
  return false;
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
