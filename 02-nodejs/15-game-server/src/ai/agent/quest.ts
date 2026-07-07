/**
 * NPC 委托任务
 */

import { Enemy, EnemyKind } from '../../core/Enemy';
import { Player } from '../../core/Player';
import { GameWorld } from '../../core/GameWorld';
import { GameConfig } from '../../config';
import { MsgType } from '../../network/Protocol';
import { NpcMemory } from '../llm/memory';
import { RumorBoard } from './rumor';
import { questXpMultiplier, onQuestComplete } from './relation';
import { NpcMood } from './mood';

export interface NpcQuest {
  mobKind: EnemyKind;
  target: number;
  progress: number;
  rewardXp: number;
  status: 'active' | 'done';
  issuedAt: number;
}

const QUEST_MOBS: EnemyKind[] = ['slime', 'skeleton', 'demon'];
const QUEST_CHAT = /有任务|任务吗|委托|帮我|帮忙|quest/i;

export class NpcQuests {
  static activeFor(enemy: Enemy, playerName: string): NpcQuest | null {
    const q = enemy.llmQuests[playerName];
    return q && q.status === 'active' ? q : null;
  }

  static tryIssueFromChat(
    world: GameWorld,
    enemy: Enemy,
    player: Player,
    text: string,
    now: number
  ): boolean {
    if (!enemy.llmEnabled || !QUEST_CHAT.test(text)) return false;

    const existing = this.activeFor(enemy, player.name);
    if (existing) {
      this.notifyQuest(player, enemy, existing);
      this.speak(world, enemy, `你还有委托:击杀${existing.target}只${existing.mobKind}(${existing.progress}/${existing.target})`);
      return true;
    }

    const mobKind = QUEST_MOBS[Math.floor(Math.random() * QUEST_MOBS.length)] ?? 'slime';
    const target = GameConfig.LLM_QUEST_DEFAULT_COUNT;
    const quest: NpcQuest = {
      mobKind,
      target,
      progress: 0,
      rewardXp: GameConfig.LLM_QUEST_REWARD_XP,
      status: 'active',
      issuedAt: now,
    };
    enemy.llmQuests[player.name] = quest;
    NpcMemory.add(enemy, 'bond', `向${player.name}发布委托:击杀${target}只${mobKind}`, now, player.name);
    this.notifyQuest(player, enemy, quest);
    this.speak(
      world,
      enemy,
      `帮我清理${target}只${mobKind}，完成给你${quest.rewardXp}经验！`
    );
    return true;
  }

  static onPlayerKillMob(
    world: GameWorld,
    player: Player,
    mobKind: EnemyKind,
    mobX: number,
    mobY: number,
    now: number
  ): void {
    for (const enemy of world.enemies.values()) {
      if (!enemy.llmEnabled || enemy.isDead) continue;
      const q = this.activeFor(enemy, player.name);
      if (!q || q.mobKind !== mobKind) continue;

      const d = Math.hypot(enemy.position.x - mobX, enemy.position.y - mobY);
      if (d > enemy.detectionRange * 2.5) continue;

      q.progress++;
      this.notifyQuest(player, enemy, q);

      if (q.progress < q.target) continue;

      q.status = 'done';
      const mult = questXpMultiplier(enemy, player.name);
      const reward = Math.round(q.rewardXp * mult);
      const levels = player.gainXp(reward);
      onQuestComplete(enemy, player.name, now);
      NpcMood.onQuestComplete(enemy);
      NpcMemory.add(enemy, 'world', `${player.name}完成了委托`, now, player.name);
      RumorBoard.add(world, enemy.zoneId, `${player.name}完成了${enemy.displayName}的委托`, now);

      player.session.send(MsgType.XP_GAIN, {
        id: player.id,
        gained: reward,
        xp: player.xp,
        xpToNext: player.xpToNext,
        level: player.level,
        source: 'quest',
      });
      if (levels > 0) {
        player.session.send(MsgType.LEVEL_UP, {
          id: player.id,
          level: player.level,
          hp: player.hp,
          maxHp: player.maxHp,
          xp: player.xp,
          xpToNext: player.xpToNext,
        });
      }

      this.speak(world, enemy, `干得漂亮！${reward}经验已给你。`);
      delete enemy.llmQuests[player.name];
    }
  }

  static formatActive(enemy: Enemy, playerName: string): string | null {
    const q = this.activeFor(enemy, playerName);
    if (!q) return null;
    return `击杀${q.mobKind} ${q.progress}/${q.target}`;
  }

  private static notifyQuest(player: Player, enemy: Enemy, q: NpcQuest): void {
    player.session.send(MsgType.NPC_QUEST, {
      npcId: enemy.id,
      npcName: enemy.displayName,
      mobKind: q.mobKind,
      progress: q.progress,
      target: q.target,
      status: q.status,
    });
  }

  private static speak(world: GameWorld, enemy: Enemy, text: string): void {
    const chatMsg = {
      from: enemy.displayName ?? `NPC#${enemy.id}`,
      fromId: -enemy.id,
      text: text.slice(0, 100),
      x: Math.round(enemy.position.x),
      y: Math.round(enemy.position.y),
    };
    for (const p of world.players.values()) {
      if (p.isDead) continue;
      const d = Math.hypot(p.position.x - enemy.position.x, p.position.y - enemy.position.y);
      if (d <= enemy.detectionRange * 2.5) {
        p.session.send(MsgType.CHAT_MSG, chatMsg);
      }
    }
  }
}
