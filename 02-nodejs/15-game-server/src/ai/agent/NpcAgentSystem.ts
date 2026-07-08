/**
 * NPC Agent 系统 —— 统筹心情 tick、信息查询、任务/传闻/记忆
 */

import { Enemy } from '../../core/Enemy';
import { Player } from '../../core/Player';
import { GameWorld } from '../../core/GameWorld';
import { MsgType } from '../../network/Protocol';
import { GameConfig } from '../../config';
import { NpcMemory } from '../llm/memory';
import { NpcMood, moodLabel } from './mood';
import { NpcQuests } from './quest';
import { RumorBoard } from './rumor';
import { formatUnlocks, trustOf, unlockedFor } from './relation';
import { timeLabel } from './schedule';
import { Reputation } from './reputation';
import { SquadSystem } from './squad';
import { EscortGuideSystem } from './escort';
import { NpcCapabilities } from './capabilities';

export class NpcAgentSystem {
  private readonly squad: SquadSystem;
  private readonly escortGuide: EscortGuideSystem;
  private lastReputationAt = 0;

  constructor(private readonly world: GameWorld) {
    this.squad = new SquadSystem(world);
    this.escortGuide = new EscortGuideSystem(world);
  }

  get escort(): EscortGuideSystem {
    return this.escortGuide;
  }

  tick(dt: number): void {
    const now = Date.now();

    // 全局声望周期重算(功能8,节流)
    if (now - this.lastReputationAt >= GameConfig.REPUTATION_RECOMPUTE_MS) {
      Reputation.recompute(this.world);
      this.lastReputationAt = now;
    }

    for (const enemy of this.world.enemies.values()) {
      if (!enemy.llmEnabled || enemy.isDead) continue;
      NpcMood.tick(enemy, this.world, dt);
      // 初见即有态度:探测范围内未接触过的玩家,按全局声望播下初始信任(功能8)
      for (const p of this.world.players.values()) {
        if (p.isDead) continue;
        const d = Math.hypot(p.position.x - enemy.position.x, p.position.y - enemy.position.y);
        if (d <= enemy.detectionRange) Reputation.seedFirstContact(this.world, enemy, p.name, now);
      }
    }

    // 多 Agent 协作:小队编排(功能9)
    this.squad.update(now);

    // A2A 带路/护送编排(功能10)
    this.escortGuide.tick(now);
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
      capabilities: NpcCapabilities.formatForPanel(enemy, player.name, this.world),
      quest,
      memory: mem.recent,
      archives: enemy.llmArchives.slice(-3),
      rumors: RumorBoard.forZone(this.world, enemy.zoneId, now),
      following: enemy.followPlayerId === player.id,
      a2aRole: enemy.a2aRole,
      a2aMission: this.escortGuide.missionSnapshot(enemy),
      timeOfDay: timeLabel(this.world.dayPhase),
      playerTag: this.world.playerTags.get(player.name)?.tag ?? '旅人',
      squadRole: enemy.squadRole,
    });
  }

  onPlayerChat(enemy: Enemy, player: Player, text: string, now: number): boolean {
    if (/你好|谢谢|辛苦|棒|厉害/.test(text)) {
      NpcMood.onFriendlyChat(enemy);
    }
    // 能力问询已有完整回复,跳过后续 LLM 避免重复发言
    if (NpcCapabilities.tryRespondFromChat(this.world, enemy, player, text)) return true;
    NpcQuests.tryIssueFromChat(this.world, enemy, player, text, now);
    this.escortGuide.tryFromChat(enemy, player, text, now);
    return false;
  }

  static trustPartnerHunt(enemy: Enemy, playerName: string): boolean {
    return trustOf(enemy, playerName) >= 60 || unlockedFor(enemy, playerName).some((u) => u.id === 'partner');
  }
}
