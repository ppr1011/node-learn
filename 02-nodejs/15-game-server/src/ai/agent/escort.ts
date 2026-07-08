/**
 * NPC 带路 / 护送编排 + A2A 协作(功能10)
 *
 * 带路: NPC A 走向目标 NPC B,为玩家引路
 * 护送: NPC A 前往 B,通过 A2A 让 B 跟随,再一起返回目的地
 *
 * @author gaarachen
 */

import { Enemy } from '../../core/Enemy';
import { GameWorld } from '../../core/GameWorld';
import { Player } from '../../core/Player';
import { GameConfig } from '../../config';
import { MsgType } from '../../network/Protocol';
import { NpcMemory } from '../llm/memory';
import { A2ABus, A2AMessage, clearA2AState, findNpcByName } from './a2a';
import { EscortPhase } from '../../core/Enemy';

function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

export class EscortGuideSystem {
  private readonly bus = new A2ABus();

  constructor(private readonly world: GameWorld) {}

  getBus(): A2ABus {
    return this.bus;
  }

  tick(now: number): void {
    for (const enemy of this.world.enemies.values()) {
      if (!enemy.llmEnabled || enemy.isDead) continue;
      this.processInbox(enemy, now);
      this.checkGuideArrival(enemy, now);
      this.checkEscortProgress(enemy, now);
    }
  }

  /** 玩家聊天触发带路/护送(由 LLMBrain / NpcAgentSystem 调用) */
  tryFromChat(enemy: Enemy, player: Player, text: string, now: number): boolean {
    if (CANCEL_A2A.test(text)) {
      this.cancelMission(enemy, now, '玩家取消');
      return true;
    }

    const guideMatch = text.match(GUIDE_CHAT);
    if (guideMatch) {
      const targetName = (guideMatch[1] ?? '').trim();
      if (!targetName) return false;
      const target = findNpcByName(this.world, targetName);
      if (!target || target.id === enemy.id) return false;
      this.startGuide(enemy, player, target, now);
      return true;
    }

    const escortMatch = text.match(ESCORT_CHAT);
    if (escortMatch) {
      const targetName = (escortMatch[1] ?? '').trim();
      if (!targetName) return false;
      const target = findNpcByName(this.world, targetName);
      if (!target || target.id === enemy.id) return false;
      this.startEscort(enemy, player, target, now);
      return true;
    }

    return false;
  }

  /** 发起带路:走向目标 NPC */
  startGuide(
    agent: Enemy,
    player: Player,
    target: Enemy,
    now: number
  ): void {
    clearA2AState(agent);
    agent.followPlayerId = null;
    agent.huntMobKind = null;
    agent.huntForPlayerId = null;
    agent.guideTargetNpcId = target.id;
    agent.guideForPlayerId = player.id;
    agent.a2aRole = 'guide';
    agent.llmDirective = {
      intent: 'guide',
      decidedAt: now,
      reason: `带${player.name}去找${target.displayName}`,
    };

    const speech = `好,我带你去找${target.displayName},跟我来!`;
    this.broadcastSpeech(agent, speech);
    NpcMemory.add(agent, 'bond', `带路:${player.name}→${target.displayName}`, now, player.name);

    this.bus.post({
      fromNpcId: agent.id,
      fromNpcName: agent.displayName,
      toNpcId: target.id,
      kind: 'guide_request',
      payload: {
        targetNpcId: target.id,
        playerId: player.id,
        playerName: player.name,
        reason: '玩家请求带路',
      },
      at: now,
    });
  }

  /** 发起护送:先去找目标 NPC,再通过 A2A 带回来 */
  startEscort(
    agent: Enemy,
    player: Player,
    target: Enemy,
    now: number
  ): void {
    clearA2AState(agent);
    agent.followPlayerId = null;
    agent.huntMobKind = null;
    agent.huntForPlayerId = null;
    agent.escortPhase = 'seek';
    agent.escortTargetNpcId = target.id;
    agent.escortForPlayerId = player.id;
    agent.escortDestX = player.position.x;
    agent.escortDestY = player.position.y;
    agent.a2aRole = 'escort';
    agent.llmDirective = {
      intent: 'escort',
      decidedAt: now,
      reason: `去接${target.displayName}回来`,
    };

    const speech = `收到,我去请${target.displayName}过来!`;
    this.broadcastSpeech(agent, speech);
    NpcMemory.add(agent, 'bond', `护送:${target.displayName}→${player.name}`, now, player.name);

    this.bus.post({
      fromNpcId: agent.id,
      fromNpcName: agent.displayName,
      toNpcId: target.id,
      kind: 'escort_request',
      payload: {
        targetNpcId: target.id,
        playerId: player.id,
        playerName: player.name,
        destX: agent.escortDestX,
        destY: agent.escortDestY,
        reason: '玩家请求护送',
      },
      at: now,
    });
  }

  cancelMission(enemy: Enemy, now: number, reason: string): void {
    if (!enemy.a2aRole && enemy.followNpcId === null) return;
    if (enemy.escortTargetNpcId !== null) {
      const target = this.world.enemies.get(enemy.escortTargetNpcId);
      if (target) clearA2AState(target);
    }
    if (enemy.followNpcId !== null) {
      const leader = this.world.enemies.get(enemy.followNpcId);
      if (leader) clearA2AState(leader);
    }
    clearA2AState(enemy);
    enemy.llmDirective = { intent: 'patrol', decidedAt: now, reason };
    this.broadcastSpeech(enemy, '好的,那就不去了。');
  }

  /** 供 LLM 快照:当前 A2A 任务摘要 */
  missionSnapshot(enemy: Enemy): string | undefined {
    if (enemy.a2aRole === 'guide' && enemy.guideTargetNpcId !== null) {
      const t = this.world.enemies.get(enemy.guideTargetNpcId);
      return `带路中→${t?.displayName ?? '目标NPC'}`;
    }
    if (enemy.a2aRole === 'escort') {
      const t = enemy.escortTargetNpcId !== null
        ? this.world.enemies.get(enemy.escortTargetNpcId)
        : null;
      const phase = enemy.escortPhase === 'seek' ? '前往' : '带回';
      return `护送${phase}:${t?.displayName ?? '目标NPC'}`;
    }
    if (enemy.a2aRole === 'escorted' && enemy.followNpcId !== null) {
      const l = this.world.enemies.get(enemy.followNpcId);
      return `被${l?.displayName ?? 'NPC'}护送中`;
    }
    if (this.bus.pendingCount(enemy.id) > 0) {
      return `待处理A2A消息×${this.bus.pendingCount(enemy.id)}`;
    }
    return undefined;
  }

  private processInbox(enemy: Enemy, now: number): void {
    const msgs = this.bus.drain(enemy.id);
    for (const msg of msgs) {
      this.handleMessage(enemy, msg, now);
    }
  }

  private handleMessage(enemy: Enemy, msg: A2AMessage, now: number): void {
    switch (msg.kind) {
      case 'guide_request':
        if (msg.payload.playerName) {
          NpcMemory.add(
            enemy,
            'world',
            `${msg.fromNpcName}要带${msg.payload.playerName}来找我`,
            now
          );
        }
        break;

      case 'escort_request':
        NpcMemory.add(
          enemy,
          'world',
          `${msg.fromNpcName}可能要来接我(${msg.payload.playerName ?? '玩家'}委托)`,
          now
        );
        break;

      case 'escort_follow':
        enemy.followPlayerId = null;
        enemy.huntMobKind = null;
        enemy.followNpcId = msg.fromNpcId;
        enemy.a2aRole = 'escorted';
        enemy.llmDirective = { intent: 'follow_npc', decidedAt: now, reason: 'A2A护送跟随' };
        this.broadcastSpeech(enemy, `好,${msg.fromNpcName},我跟你走。`);
        NpcMemory.add(enemy, 'bond', `答应跟随${msg.fromNpcName}返回`, now);
        break;

      case 'escort_complete':
        clearA2AState(enemy);
        enemy.llmDirective = { intent: 'patrol', decidedAt: now, reason: '护送完成' };
        break;

      case 'cancel':
        clearA2AState(enemy);
        break;
    }
  }

  private checkGuideArrival(agent: Enemy, now: number): void {
    if (agent.a2aRole !== 'guide' || agent.guideTargetNpcId === null) return;
    const target = this.world.enemies.get(agent.guideTargetNpcId);
    if (!target || target.isDead) {
      this.cancelMission(agent, now, '目标NPC不可用');
      return;
    }
    const d = dist(
      agent.position.x, agent.position.y,
      target.position.x, target.position.y
    );
    if (d > GameConfig.A2A_GUIDE_ARRIVE_DIST) return;

    const player = agent.guideForPlayerId !== null
      ? this.world.players.get(agent.guideForPlayerId)
      : null;
    const speech = `到了,${target.displayName}就在这附近!`;
    this.broadcastSpeech(agent, speech);
    if (player) {
      NpcMemory.add(agent, 'bond', `带路完成:${target.displayName}`, now, player.name);
      NpcMemory.bumpTrust(agent, player.name, 8, now);
    }
    clearA2AState(agent);
    agent.llmDirective = { intent: 'patrol', decidedAt: now, reason: '带路完成' };
  }

  private checkEscortProgress(agent: Enemy, now: number): void {
    if (agent.a2aRole !== 'escort' || agent.escortTargetNpcId === null) return;
    const target = this.world.enemies.get(agent.escortTargetNpcId);
    if (!target || target.isDead) {
      this.cancelMission(agent, now, '护送目标不可用');
      return;
    }

    if (agent.escortPhase === 'seek') {
      const d = dist(
        agent.position.x, agent.position.y,
        target.position.x, target.position.y
      );
      if (d > GameConfig.A2A_ESCORT_MEET_DIST) return;

      agent.escortPhase = 'lead';
      this.bus.post({
        fromNpcId: agent.id,
        fromNpcName: agent.displayName,
        toNpcId: target.id,
        kind: 'escort_follow',
        payload: {
          destX: agent.escortDestX,
          destY: agent.escortDestY,
          playerName: agent.escortForPlayerId !== null
            ? this.world.players.get(agent.escortForPlayerId)?.name
            : undefined,
        },
        at: now,
      });
      this.broadcastSpeech(agent, `${target.displayName},跟我回来吧!`);
      return;
    }

    if (agent.escortPhase === 'lead') {
      const player = agent.escortForPlayerId !== null
        ? this.world.players.get(agent.escortForPlayerId)
        : null;
      if (player && !player.isDead) {
        agent.escortDestX = player.position.x;
        agent.escortDestY = player.position.y;
      }

      const d = dist(
        agent.position.x, agent.position.y,
        agent.escortDestX, agent.escortDestY
      );
      if (d > GameConfig.A2A_ESCORT_ARRIVE_DIST) return;

      const speech = `${target.displayName}到了,交给你啦!`;
      this.broadcastSpeech(agent, speech);
      if (player) {
        NpcMemory.add(agent, 'bond', `护送完成:${target.displayName}`, now, player.name);
        NpcMemory.bumpTrust(agent, player.name, 10, now);
      }

      this.bus.post({
        fromNpcId: agent.id,
        fromNpcName: agent.displayName,
        toNpcId: target.id,
        kind: 'escort_complete',
        payload: {},
        at: now,
      });
      clearA2AState(agent);
      clearA2AState(target);
      agent.llmDirective = { intent: 'patrol', decidedAt: now, reason: '护送完成' };
    }
  }

  private broadcastSpeech(enemy: Enemy, text: string): void {
    const chatMsg = {
      from: enemy.displayName ?? `NPC#${enemy.id}`,
      fromId: -enemy.id,
      text: text.slice(0, 100),
      x: Math.round(enemy.position.x),
      y: Math.round(enemy.position.y),
    };
    for (const p of this.world.players.values()) {
      if (p.isDead) continue;
      if (dist(p.position.x, p.position.y, enemy.position.x, enemy.position.y)
          <= enemy.detectionRange * 2.5) {
        p.session.send(MsgType.CHAT_MSG, chatMsg);
      }
    }
  }
}

const GUIDE_CHAT = /(?:带我去找|带路去|带我去见|带我见|引我去|领我去|带我去)\s*(.+)/;
const ESCORT_CHAT = /(?:把|请|叫|去接)\s*(.+?)(?:带过来|带来|过来|回来|接回来)/;
const CANCEL_A2A = /不用带了|不用找了|取消带路|别去了|不用接了|停下吧/;
