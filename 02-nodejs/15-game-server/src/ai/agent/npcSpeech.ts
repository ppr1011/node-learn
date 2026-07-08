/**
 * NPC 台词广播(治疗感谢、任务完成等复用)
 * @author gaarachen
 */

import { Enemy } from '../../core/Enemy';
import { GameWorld } from '../../core/GameWorld';
import { MsgType } from '../../network/Protocol';
import { NpcMemory } from '../llm/memory';
import { NpcMood } from './mood';

const THANK_LINES: Array<(who: string) => string> = [
  (who) => `多谢${who},我感觉好多了!`,
  (who) => `${who},谢谢你的治疗。`,
  (who) => `呼……${who},欠你一份情。`,
  (who) => `太好了,${who}来得正是时候!`,
  (who) => `${who},这份恩情我记下了。`,
];

const THANK_REPEAT = (who: string) => `嗯,${who},好多了。`;

export class NpcSpeech {
  /** 避免连续治疗刷屏 */
  private static readonly lastThankAt = new Map<number, number>();

  static broadcast(world: GameWorld, enemy: Enemy, text: string): void {
    const chatMsg = {
      from: enemy.displayName ?? `NPC#${enemy.id}`,
      fromId: -enemy.id,
      text: text.slice(0, 100),
      x: Math.round(enemy.position.x),
      y: Math.round(enemy.position.y),
    };

    for (const player of world.players.values()) {
      if (player.isDead) continue;
      const d = Math.hypot(
        player.position.x - enemy.position.x,
        player.position.y - enemy.position.y,
      );
      if (d <= enemy.detectionRange * 2.5) {
        player.session.send(MsgType.CHAT_MSG, chatMsg);
      }
    }
  }

  /** LLM NPC 被玩家治疗后:记记忆、提心情、说谢谢 */
  static onHealedByPlayer(
    world: GameWorld,
    enemy: Enemy,
    playerName: string,
    amount: number,
    now: number,
  ): void {
    if (!enemy.llmEnabled || amount <= 0) return;

    NpcMemory.onPlayerHeal(enemy, playerName, amount, now);
    NpcMood.onHealed(enemy);

    const last = this.lastThankAt.get(enemy.id) ?? 0;
    const repeat = now - last < 8000;
    this.lastThankAt.set(enemy.id, now);

    const line = repeat
      ? THANK_REPEAT(playerName)
      : this.pickThankLine(playerName, enemy);
    this.broadcast(world, enemy, line);
    NpcMemory.onNpcSpeech(enemy, playerName, line, now);
  }

  private static pickThankLine(playerName: string, enemy: Enemy): string {
    const ratio = enemy.hp / enemy.maxHp;
    if (ratio >= 0.95 && enemy.mood >= 40) {
      return `${playerName},你太贴心了!`;
    }
    if (ratio < 0.45) {
      return `差点就撑不住了……谢谢${playerName}!`;
    }
    if (enemy.mood >= 55) {
      return `哈哈,${playerName},你真是我的救星!`;
    }
    const idx = Math.abs(enemy.id + playerName.length) % THANK_LINES.length;
    return THANK_LINES[idx](playerName);
  }
}
