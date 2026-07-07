/**
 * LLM 大脑 —— 异步决策调度器
 *
 * 与行为树解耦:Brain 按间隔/事件触发 LLM,把结果写入 enemy.llmDirective;
 * BT 每 tick 只读黑板,不阻塞游戏循环。
 */

import { Enemy } from '../../core/Enemy';
import { GameWorld } from '../../core/GameWorld';
import { Player } from '../../core/Player';
import { MsgType } from '../../network/Protocol';
import { ZONES, zoneAt } from '../../core/Zone';
import { logger } from '../../utils/Logger';
import { LLMProvider } from './LLMProvider';
import { LLMDirective, LLMGameSnapshot } from './types';

export class LLMBrain {
  private readonly pending = new Set<number>();

  constructor(private readonly provider: LLMProvider) {}

  /** 主循环入口:为到期 NPC 发起异步决策(不 await,避免卡住 tick) */
  tick(world: GameWorld, now: number, intervalMs: number): void {
    for (const enemy of world.enemies.values()) {
      if (!enemy.llmEnabled || enemy.isDead) continue;
      if (this.pending.has(enemy.id)) continue;
      if (now - enemy.llmLastRefresh < intervalMs && !enemy.llmChatPending) continue;

      this.requestDecision(world, enemy, now);
    }
  }

  /** 玩家聊天触发:附近 LLM NPC 立即请求一次决策(带聊天上下文) */
  onPlayerChat(world: GameWorld, player: Player, text: string, now: number): void {
    for (const enemy of world.enemies.values()) {
      if (!enemy.llmEnabled || enemy.isDead) continue;
      const d = dist(enemy.position.x, enemy.position.y, player.position.x, player.position.y);
      if (d > enemy.detectionRange * 1.2) continue;

      enemy.llmChatPending = { from: player.name, text, at: now };
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
        enemy.llmDirective = directive;
        if (directive.speech) {
          this.broadcastNpcChat(world, enemy, directive.speech);
        }
      })
      .catch((err: Error) => {
        logger.warn(`[LLM] ${enemy.displayName ?? enemy.kind}#${enemy.id} 决策失败: ${err.message}`);
        enemy.llmDirective = {
          intent: 'patrol',
          reason: 'LLM 失败回退',
          decidedAt: now,
        };
      })
      .finally(() => {
        this.pending.delete(enemy.id);
        enemy.llmChatPending = null;
      });
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
