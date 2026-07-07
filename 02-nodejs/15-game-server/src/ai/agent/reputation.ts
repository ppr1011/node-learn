/**
 * 玩家身份标签 / 声望(功能8)
 *
 * 把「所有 LLM NPC 对某玩家的关系」聚合成一个全局声望标签(英雄/义士/旅人/恶徒/屠夫),
 * 并据此给出「初见态度种子」:一个从未接触过该玩家的 NPC,首次建立关系时按种子设定初始信任
 * —— 于是英雄名声在外、初见即受信任;屠夫恶名远播、初见即遭警惕。
 */

import { Enemy } from '../../core/Enemy';
import { GameWorld } from '../../core/GameWorld';
import { GameConfig } from '../../config';
import { NpcMemory } from '../llm/memory';

export interface PlayerReputation {
  tag: string;
  seedTrust: number; // 初见信任种子(已夹到 ±REPUTATION_SEED_CLAMP)
  score: number;
  helped: number;
  hits: number;
  npcKills: number; // 近似:被标为「仇人」的 NPC 数
}

function clampSeed(v: number): number {
  const c = GameConfig.REPUTATION_SEED_CLAMP;
  return Math.max(-c, Math.min(c, Math.round(v)));
}

function tagOf(score: number): string {
  if (score >= 40) return '英雄';
  if (score >= 15) return '义士';
  if (score <= -40) return '屠夫';
  if (score <= -15) return '恶徒';
  return '旅人';
}

export class Reputation {
  /** 遍历所有 LLM NPC 的关系,按玩家名聚合出全局声望,写入 world.playerTags 并回写在线玩家称号 */
  static recompute(world: GameWorld): void {
    const acc = new Map<string, { trustSum: number; count: number; helped: number; hits: number; npcKills: number }>();

    for (const enemy of world.enemies.values()) {
      if (!enemy.llmEnabled) continue;
      for (const [name, r] of Object.entries(enemy.llmRelations)) {
        let a = acc.get(name);
        if (!a) {
          a = { trustSum: 0, count: 0, helped: 0, hits: 0, npcKills: 0 };
          acc.set(name, a);
        }
        a.trustSum += r.trust;
        a.count++;
        a.helped += r.helped;
        a.hits += r.hits;
        if (r.label === '仇人') a.npcKills++;
      }
    }

    world.playerTags.clear();
    for (const [name, a] of acc) {
      const avgTrust = a.count > 0 ? a.trustSum / a.count : 0;
      const score = avgTrust + a.helped * 2 - a.hits * 3 - a.npcKills * 15;
      world.playerTags.set(name, {
        tag: tagOf(score),
        seedTrust: clampSeed(score * 0.5),
        score: Math.round(score),
        helped: a.helped,
        hits: a.hits,
        npcKills: a.npcKills,
      });
    }

    // 回写在线玩家的称号(nameplate / stats 展示)
    for (const p of world.players.values()) {
      p.reputationTitle = world.playerTags.get(p.name)?.tag ?? '';
    }
  }

  static tagFor(world: GameWorld, playerName: string): string | undefined {
    return world.playerTags.get(playerName)?.tag;
  }

  /** 该 NPC 尚无此玩家关系时,按全局声望种子建立初始关系(初见即有态度) */
  static seedFirstContact(world: GameWorld, enemy: Enemy, playerName: string, now: number): void {
    if (!enemy.llmEnabled) return;
    NpcMemory.ensure(enemy);
    if (enemy.llmRelations[playerName]) return; // 已认识,不覆盖既有关系

    const rep = world.playerTags.get(playerName);
    NpcMemory.relation(enemy, playerName, now); // 建立空关系(trust 0)
    if (rep && rep.seedTrust !== 0) {
      NpcMemory.bumpTrust(enemy, playerName, rep.seedTrust, now);
      NpcMemory.add(
        enemy,
        'world',
        rep.seedTrust > 0 ? `听闻${playerName}是${rep.tag},以礼相待` : `${playerName}恶名在外(${rep.tag}),多加提防`,
        now,
        playerName
      );
    }
  }
}
