/**
 * NPC Agent 系统 —— 统筹心情 tick、信息查询、任务/传闻/记忆
 */

import { Enemy } from '../../core/Enemy';
import { Player } from '../../core/Player';
import { GameWorld } from '../../core/GameWorld';
import { MsgType } from '../../network/Protocol';
import { NpcMemory } from '../llm/memory';
import { NpcMood, moodLabel } from './mood';
import { NpcQuests } from './quest';
import { RumorBoard } from './rumor';
import { formatUnlocks, trustOf, unlockedFor } from './relation';

export class NpcAgentSystem {
  constructor(private readonly world: GameWorld) {}

  tick(dt: number): void {
    for (const enemy of this.world.enemies.values()) {
      if (!enemy.llmEnabled || enemy.isDead) continue;
      NpcMood.tick(enemy, this.world, dt);
    }
  }

  handleNpcInfo(player: Player, enemyId: number): void {
    const enemy = this.world.enemies.get(enemyId);
    if (!enemy || !enemy.llmEnabled || enemy.isDead) {
      player.session.send(MsgType.ERROR, { msg: '该 NPC 无法查询' });
      return;
    }
    const d = Math.hypot(
      player.position.x - enemy.position.x,
      player.position.y - enemy.position.y
    );
    if (d > enemy.detectionRange * 3) {
      player.session.send(MsgType.ERROR, { msg: '距离太远，无法查看 Agent 信息' });
      return;
    }

    const now = Date.now();
    const mem = NpcMemory.summarize(enemy, now);
    const rel = enemy.llmRelations[player.name];
    const quest = NpcQuests.formatActive(enemy, player.name);

    player.session.send(MsgType.NPC_INFO, {
      id: enemy.id,
      name: enemy.displayName,
      personality: enemy.personality,
      mood: enemy.mood,
      moodLabel: moodLabel(enemy.mood),
      trust: rel ? rel.trust : 0,
      relationLabel: rel?.label ?? '陌生人',
      unlocks: formatUnlocks(enemy, player.name),
      quest,
      memory: mem.recent,
      archives: enemy.llmArchives.slice(-3),
      rumors: RumorBoard.forZone(this.world, enemy.zoneId, now),
      following: enemy.followPlayerId === player.id,
    });
  }

  onPlayerChat(enemy: Enemy, player: Player, text: string, now: number): void {
    if (/你好|谢谢|辛苦|棒|厉害/.test(text)) {
      NpcMood.onFriendlyChat(enemy);
    }
    NpcQuests.tryIssueFromChat(this.world, enemy, player, text, now);
  }

  static trustPartnerHunt(enemy: Enemy, playerName: string): boolean {
    return trustOf(enemy, playerName) >= 60 || unlockedFor(enemy, playerName).some((u) => u.id === 'partner');
  }
}
