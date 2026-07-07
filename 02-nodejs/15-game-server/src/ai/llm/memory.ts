/**
 * NPC Agent 记忆 —— 每个 LLM NPC 独立 episodic + 关系图谱
 *
 * episodic: 时间序事件流(聊天/战斗/结伴),限量淘汰
 * relations: 按玩家名的信任与标签,影响 LLM 语气与战术倾向
 */

import { Enemy } from '../../core/Enemy';
import { GameConfig } from '../../config';
import { NpcMood } from '../agent/mood';

export type MemoryKind = 'chat_in' | 'chat_out' | 'combat' | 'bond' | 'world';

export interface NpcMemoryEntry {
  at: number;
  kind: MemoryKind;
  text: string;
  playerName?: string;
}

export interface NpcPlayerRelation {
  trust: number;
  chats: number;
  hits: number;
  helped: number;
  lastSeenAt: number;
  label: string;
}

export interface NpcMemorySummary {
  recent: string[];
  relations: string[];
}

function clampTrust(v: number): number {
  return Math.max(-100, Math.min(100, v));
}

function relLabel(trust: number): string {
  if (trust >= 60) return '挚友';
  if (trust >= 30) return '友善';
  if (trust >= 10) return '熟人';
  if (trust >= -10) return '中立';
  if (trust >= -40) return '警惕';
  return '敌对';
}

function ago(ms: number, now: number): string {
  const sec = Math.floor((now - ms) / 1000);
  if (sec < 60) return `${sec}秒前`;
  if (sec < 3600) return `${Math.floor(sec / 60)}分钟前`;
  return `${Math.floor(sec / 3600)}小时前`;
}

export class NpcMemory {
  static ensure(enemy: Enemy): void {
    if (!enemy.llmMemory) enemy.llmMemory = [];
    if (!enemy.llmRelations) enemy.llmRelations = {};
  }

  static relation(enemy: Enemy, playerName: string, now: number): NpcPlayerRelation {
    this.ensure(enemy);
    let r = enemy.llmRelations![playerName];
    if (!r) {
      r = { trust: 0, chats: 0, hits: 0, helped: 0, lastSeenAt: now, label: '陌生人' };
      enemy.llmRelations![playerName] = r;
    }
    r.lastSeenAt = now;
    return r;
  }

  static bumpTrust(enemy: Enemy, playerName: string, delta: number, now: number): void {
    const r = this.relation(enemy, playerName, now);
    r.trust = clampTrust(r.trust + delta);
    r.label = relLabel(r.trust);
  }

  static add(
    enemy: Enemy,
    kind: MemoryKind,
    text: string,
    now: number,
    playerName?: string
  ): void {
    if (!enemy.llmEnabled) return;
    this.ensure(enemy);
    const entry: NpcMemoryEntry = {
      at: now,
      kind,
      text: text.slice(0, 80),
      playerName,
    };
    enemy.llmMemory!.push(entry);
    const max = GameConfig.LLM_MEMORY_MAX;
    while (enemy.llmMemory!.length > max) {
      if (enemy.llmMemory!.length >= 4) {
        const chunk = enemy.llmMemory!.splice(0, 4);
        const summary = chunk.map((e) => e.text).join(' → ');
        enemy.llmArchives.push(summary.slice(0, 120));
        while (enemy.llmArchives.length > 5) enemy.llmArchives.shift();
      } else {
        enemy.llmMemory!.shift();
      }
    }
  }

  static onPlayerChat(enemy: Enemy, playerName: string, text: string, now: number): void {
    if (!enemy.llmEnabled) return;
    const r = this.relation(enemy, playerName, now);
    r.chats++;
    this.add(enemy, 'chat_in', `${playerName}: ${text}`, now, playerName);
    this.bumpTrust(enemy, playerName, 1, now);

    if (/你好|hello|hi|嗨|在吗/.test(text)) {
      this.bumpTrust(enemy, playerName, 3, now);
    }
    if (/我不打|不会打|是友军|友军|peace|别打/.test(text)) {
      this.bumpTrust(enemy, playerName, 18, now);
      r.label = '承诺不攻击';
      this.add(enemy, 'bond', `${playerName}承诺不会攻击我`, now, playerName);
    }
    if (/跟着我|跟随|一起走|跟我走/.test(text)) {
      this.bumpTrust(enemy, playerName, 12, now);
      this.add(enemy, 'bond', `答应跟随${playerName}`, now, playerName);
    }
    if (/打|杀|攻击|滚|揍/.test(text)) {
      this.bumpTrust(enemy, playerName, -15, now);
    }
  }

  static onNpcSpeech(
    enemy: Enemy,
    playerName: string | undefined,
    speech: string,
    now: number
  ): void {
    this.add(enemy, 'chat_out', speech, now, playerName);
  }

  static onPlayerHit(enemy: Enemy, playerName: string, damage: number, now: number): void {
    if (!enemy.llmEnabled) return;
    const r = this.relation(enemy, playerName, now);
    r.hits++;
    this.bumpTrust(enemy, playerName, -22, now);
    NpcMood.onHit(enemy);
    this.add(enemy, 'combat', `${playerName}攻击了我(-${damage}HP)`, now, playerName);
    if (r.trust < -30) r.label = '袭击者';
  }

  static onMobKill(enemy: Enemy, mobKind: string, now: number, allyName?: string): void {
    if (!enemy.llmEnabled) return;
    this.add(enemy, 'world', `击杀了${mobKind}`, now, allyName);
    if (allyName) {
      const r = this.relation(enemy, allyName, now);
      r.helped++;
      this.bumpTrust(enemy, allyName, 6, now);
    }
  }

  static onFollowStart(enemy: Enemy, playerName: string, now: number): void {
    this.add(enemy, 'bond', `开始跟随${playerName}`, now, playerName);
  }

  static onNpcDeath(enemy: Enemy, killerName: string | undefined, now: number): void {
    if (!enemy.llmEnabled) return;
    if (killerName) {
      this.bumpTrust(enemy, killerName, -50, now);
      this.add(enemy, 'combat', `被${killerName}击杀`, now, killerName);
      const r = this.relation(enemy, killerName, now);
      r.label = '仇人';
    }
  }

  /** 压缩成 LLM 可读摘要(控制 token) */
  static summarize(enemy: Enemy, now: number): NpcMemorySummary {
    this.ensure(enemy);
    const recent = (enemy.llmMemory ?? [])
      .slice(-8)
      .map((m) => `[${ago(m.at, now)}] ${m.text}`);

    const relations = Object.entries(enemy.llmRelations ?? {})
      .sort((a, b) => b[1].lastSeenAt - a[1].lastSeenAt)
      .slice(0, 4)
      .map(([name, r]) =>
        `${name}(信任${r.trust},${r.label};聊${r.chats}次/帮${r.helped}次/被打${r.hits}次)`
      );

    return { recent, relations };
  }

  static resetCombatMood(enemy: Enemy): void {
    enemy.llmMemory = [];
    enemy.llmRelations = {};
  }
}
