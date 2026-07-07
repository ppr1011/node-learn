/**
 * LLM 大脑 —— 异步决策调度器
 */

import { Enemy } from '../../core/Enemy';
import { GameWorld } from '../../core/GameWorld';
import { Player } from '../../core/Player';
import { MsgType } from '../../network/Protocol';
import { ZONES, zoneAt } from '../../core/Zone';
import { GameConfig } from '../../config';
import { logger } from '../../utils/Logger';
import { LLMProvider } from './LLMProvider';
import { LLMDirective, LLMGameSnapshot } from './types';
import { NpcMemory } from './memory';
import { NpcMood } from '../agent/mood';
import { RumorBoard } from '../agent/rumor';
import { NpcQuests } from '../agent/quest';
import { timeLabel } from '../agent/schedule';
import { Reputation } from '../agent/reputation';
import { squadSnapshot } from '../agent/squad';

const FOLLOW_CHAT = /跟着我|跟随|follow|一起走|跟我走|跟上/;
const UNFOLLOW_CHAT = /别跟|不用跟|留下|自己巡逻|在这等|不用管我/;
const SPEED_UP_CHAT = /走快点|快点|speed up|赶紧/;

export class LLMBrain {
  private readonly pending = new Set<number>();

  constructor(private readonly provider: LLMProvider) {}

  tick(world: GameWorld, now: number, intervalMs: number): void {
    for (const enemy of world.enemies.values()) {
      if (!enemy.llmEnabled || enemy.isDead) continue;
      if (this.pending.has(enemy.id)) continue;

      // 聊天永远即时响应
      if (enemy.llmChatPending) {
        this.requestDecision(world, enemy, now);
        continue;
      }

      const { engaged, sig } = this.assessSituation(world, enemy);
      // 省 token:无玩家在场且不在跟随 → 完全不调用 LLM,交给行为树巡逻/回巢/清怪
      if (!engaged) continue;

      const elapsed = now - enemy.llmLastRefresh;
      if (elapsed < intervalMs) continue; // 基础限频
      // 情形未变则拉长到 间隔×HOLD 才重算(静态对峙不必每 4s 追问模型)
      if (sig === enemy.llmSituation && elapsed < intervalMs * GameConfig.LLM_STATIC_HOLD_MULT) continue;

      enemy.llmSituation = sig;
      this.requestDecision(world, enemy, now);
    }
  }

  /**
   * 轻量评估「是否值得调用 LLM」+ 情形签名(不构建完整快照,省 CPU 与 token)。
   * engaged: 有玩家在探测范围内 或 正在跟随 —— 只有此时 NPC 的台词/意图对玩家才有意义。
   * sig: 决策「输入」的桶化指纹(不含决策输出的 intent,避免自激振荡)。
   */
  private assessSituation(world: GameWorld, enemy: Enemy): { engaged: boolean; sig: string } {
    const range = enemy.detectionRange * GameConfig.LLM_ENGAGE_RANGE_MULT;
    const near: string[] = [];
    for (const p of world.players.values()) {
      if (p.isDead) continue;
      if (dist(enemy.position.x, enemy.position.y, p.position.x, p.position.y) <= range) near.push(p.name);
    }
    let mobNear = false;
    for (const other of world.enemies.values()) {
      if (other.id === enemy.id || other.isDead || other.llmEnabled) continue;
      if (dist(enemy.position.x, enemy.position.y, other.position.x, other.position.y) <= enemy.detectionRange) {
        mobNear = true;
        break;
      }
    }
    const following = enemy.followPlayerId !== null;
    const engaged = near.length > 0 || following;
    const sig = [
      near.sort().join(','),
      Math.round((enemy.hp / enemy.maxHp) * 4), // 血量四分桶
      Math.round(enemy.mood / 25),              // 心情分桶
      following ? 'F' : '',
      enemy.squadRole ?? '',
      mobNear ? 'M' : '',
      world.dayPhase,
    ].join('|');
    return { engaged, sig };
  }

  onPlayerChat(world: GameWorld, player: Player, text: string, now: number): void {
    for (const enemy of world.enemies.values()) {
      if (!enemy.llmEnabled || enemy.isDead) continue;
      const d = dist(enemy.position.x, enemy.position.y, player.position.x, player.position.y);
      if (d > enemy.detectionRange * 1.2) continue;

      enemy.llmChatPending = { from: player.name, text, at: now };
      // 初见即有态度:该 NPC 没接触过此玩家时,按全局声望播下初始信任(功能8)
      Reputation.seedFirstContact(world, enemy, player.name, now);
      NpcMemory.onPlayerChat(enemy, player.name, text, now);
      world.npcAgent.onPlayerChat(enemy, player, text, now);

      if (FOLLOW_CHAT.test(text)) {
        enemy.followPlayerId = player.id;
        enemy.llmDirective = { intent: 'follow', decidedAt: now, reason: '玩家邀请跟随' };
        NpcMemory.onFollowStart(enemy, player.name, now);
      } else if (UNFOLLOW_CHAT.test(text)) {
        enemy.followPlayerId = null;
        enemy.llmDirective = { intent: 'patrol', decidedAt: now, reason: '玩家解除跟随' };
      }
      if (SPEED_UP_CHAT.test(text) && enemy.followPlayerId === player.id) {
        enemy.followBoostTimer = 6;
      }

      if (!this.pending.has(enemy.id)) {
        this.requestDecision(world, enemy, now);
      }
    }
  }

  private requestDecision(world: GameWorld, enemy: Enemy, now: number): void {
    const snapshot = this.buildSnapshot(world, enemy);
    this.pending.add(enemy.id);
    enemy.llmLastRefresh = now;

    this.provider
      .decide(snapshot)
      .then((directive) => {
        this.applyFollowState(world, enemy, directive, snapshot, now);
        enemy.llmDirective = directive;
        if (directive.intent === 'taunt') {
          enemy.llmPoseTimer = 0;
        }
        if (directive.speech) {
          NpcMemory.onNpcSpeech(enemy, snapshot.chatFrom, directive.speech, now);
          this.broadcastNpcChat(world, enemy, directive.speech);
        }
      })
      .catch((err: Error) => {
        logger.warn(`[LLM] ${enemy.displayName ?? enemy.kind}#${enemy.id} 决策失败: ${err.message}`);
        if (enemy.followPlayerId === null) {
          enemy.llmDirective = {
            intent: 'patrol',
            reason: 'LLM 失败回退',
            decidedAt: now,
          };
        }
      })
      .finally(() => {
        this.pending.delete(enemy.id);
        enemy.llmChatPending = null;
      });
  }

  /** 跟随是持久状态:仅 follow 意图或解除聊天可改;周期 patrol 不覆盖 */
  private applyFollowState(
    world: GameWorld,
    enemy: Enemy,
    directive: LLMDirective,
    snapshot: LLMGameSnapshot,
    now: number
  ): void {
    if (directive.intent === 'follow') {
      const p = this.resolveFollowPlayer(world, snapshot);
      if (p) enemy.followPlayerId = p.id;
      return;
    }
    if (UNFOLLOW_CHAT.test(snapshot.chatText ?? '')) {
      enemy.followPlayerId = null;
      return;
    }
    if (enemy.followPlayerId !== null && directive.intent === 'patrol') {
      directive.intent = 'follow';
      directive.reason = (directive.reason ?? '') + ';维持跟随';
      return;
    }
    if (enemy.followPlayerId !== null) {
      const p = world.players.get(enemy.followPlayerId);
      if (!p || p.isDead) {
        enemy.followPlayerId = null;
      }
    }
  }

  private resolveFollowPlayer(world: GameWorld, snapshot: LLMGameSnapshot): Player | null {
    if (snapshot.chatFrom) {
      for (const p of world.players.values()) {
        if (p.name === snapshot.chatFrom && !p.isDead) return p;
      }
    }
    let nearest: Player | null = null;
    let min = Infinity;
    for (const p of world.players.values()) {
      if (p.isDead) continue;
      const d = dist(snapshot.x, snapshot.y, p.position.x, p.position.y);
      if (d < min) { min = d; nearest = p; }
    }
    return nearest;
  }

  private buildSnapshot(world: GameWorld, enemy: Enemy): LLMGameSnapshot {
    const zone = ZONES[enemy.zoneId] ?? zoneAt(enemy.position.x);
    const nearbyPlayers: LLMGameSnapshot['nearbyPlayers'] = [];

    for (const p of world.players.values()) {
      if (p.isDead) continue;
      const d = dist(enemy.position.x, enemy.position.y, p.position.x, p.position.y);
      if (d <= enemy.detectionRange * 1.5) {
        nearbyPlayers.push({
          name: p.name,
          distance: d,
          hp: p.hp,
          maxHp: p.maxHp,
          tag: world.playerTags.get(p.name)?.tag,
        });
      }
    }
    nearbyPlayers.sort((a, b) => a.distance - b.distance);

    let nearbyMobCount = 0;
    for (const other of world.enemies.values()) {
      if (other.id === enemy.id || other.isDead || other.llmEnabled) continue;
      const d = dist(enemy.position.x, enemy.position.y, other.position.x, other.position.y);
      if (d <= enemy.detectionRange) nearbyMobCount++;
    }

    const mem = NpcMemory.summarize(enemy, Date.now());
    const chat = enemy.llmChatPending;
    const now = Date.now();
    const questLine = chat?.from
      ? NpcQuests.formatActive(enemy, chat.from)
      : null;
    return {
      npcName: enemy.displayName ?? enemy.kind,
      personality: enemy.personality ?? '谨慎的守卫',
      kind: enemy.kind,
      hp: enemy.hp,
      maxHp: enemy.maxHp,
      x: Math.round(enemy.position.x),
      y: Math.round(enemy.position.y),
      aiState: enemy.aiState,
      zoneName: zone.name,
      weather: world.weather.kind,
      nearbyPlayers,
      nearbyMobCount,
      isFollowing: enemy.followPlayerId !== null,
      chatFrom: chat?.from,
      chatText: chat?.text,
      memoryRecent: mem.recent,
      playerRelations: mem.relations,
      memoryArchives: enemy.llmArchives.slice(-3),
      mood: enemy.mood,
      moodLabel: NpcMood.format(enemy),
      zoneRumors: RumorBoard.forZone(world, enemy.zoneId, now),
      activeQuest: questLine ?? undefined,
      timeOfDay: timeLabel(world.dayPhase),
      squad: squadSnapshot(world, enemy),
    };
  }

  private broadcastNpcChat(world: GameWorld, enemy: Enemy, text: string): void {
    const chatMsg = {
      from: enemy.displayName ?? `NPC#${enemy.id}`,
      fromId: -enemy.id,
      text: text.slice(0, 100),
      x: Math.round(enemy.position.x),
      y: Math.round(enemy.position.y),
    };

    for (const player of world.players.values()) {
      if (player.isDead) continue;
      const d = dist(player.position.x, player.position.y, enemy.position.x, enemy.position.y);
      if (d <= enemy.detectionRange * 2.5) {
        player.session.send(MsgType.CHAT_MSG, chatMsg);
      }
    }
  }
}

function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}
