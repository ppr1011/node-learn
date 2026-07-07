/**
 * LLM 大脑 —— 异步决策调度器
 */

import { Enemy } from '../../core/Enemy';
import { GameWorld } from '../../core/GameWorld';
import { Player } from '../../core/Player';
import { MsgType } from '../../network/Protocol';
import { ZONES, zoneAt } from '../../core/Zone';
import { logger } from '../../utils/Logger';
import { LLMProvider } from './LLMProvider';
import { LLMDirective, LLMGameSnapshot } from './types';

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
      if (now - enemy.llmLastRefresh < intervalMs && !enemy.llmChatPending) continue;

      this.requestDecision(world, enemy, now);
    }
  }

  onPlayerChat(world: GameWorld, player: Player, text: string, now: number): void {
    for (const enemy of world.enemies.values()) {
      if (!enemy.llmEnabled || enemy.isDead) continue;
      const d = dist(enemy.position.x, enemy.position.y, player.position.x, player.position.y);
      if (d > enemy.detectionRange * 1.2) continue;

      enemy.llmChatPending = { from: player.name, text, at: now };

      if (FOLLOW_CHAT.test(text)) {
        enemy.followPlayerId = player.id;
        enemy.llmDirective = { intent: 'follow', decidedAt: now, reason: '玩家邀请跟随' };
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

    const chat = enemy.llmChatPending;
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
