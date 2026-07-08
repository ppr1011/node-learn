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
import { nearbyNpcs } from '../agent/a2a';
import { NpcCapabilities } from '../agent/capabilities';

const FOLLOW_CHAT = /跟着我|跟随|follow|一起走|跟我走|跟上/;
const UNFOLLOW_CHAT = /别跟|不用跟|留下|自己巡逻|在这等|不用管我/;
const HUNT_CHAT = /你去打|帮我去打|帮我打|去清理|去打怪|帮忙打|清怪|狩猎|击杀|打几只/;
const STOP_HUNT_CHAT = /别打了|不用打了|停下打|停止狩猎/;
const SPEED_UP_CHAT = /走快点|快点|speed up|赶紧/;

/** 模型常把台词误写在 reason;这些 pattern 判定为内部备注,不宜直接展示给玩家 */
const INTERNAL_REASON = /^(无威胁|无目标|维持|保持巡逻|附近|发现怪物|残血|LLM|Mock|玩家邀请|玩家解除|游荡|战术|清怪)/;

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
    const hunting = enemy.huntMobKind !== null;
    const a2aActive = enemy.a2aRole !== null || enemy.followNpcId !== null;
    const engaged = near.length > 0 || following || hunting || a2aActive;
    const sig = [
      near.sort().join(','),
      Math.round((enemy.hp / enemy.maxHp) * 4), // 血量四分桶
      Math.round(enemy.mood / 25),              // 心情分桶
      following ? 'F' : '',
      hunting ? 'H' : '',
      enemy.squadRole ?? '',
      enemy.a2aRole ?? '',
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
      const syncHandled = world.npcAgent.onPlayerChat(enemy, player, text, now);

      if (FOLLOW_CHAT.test(text)) {
        enemy.followPlayerId = player.id;
        enemy.llmDirective = { intent: 'follow', decidedAt: now, reason: '玩家邀请跟随' };
        NpcMemory.onFollowStart(enemy, player.name, now);
      } else if (UNFOLLOW_CHAT.test(text)) {
        enemy.followPlayerId = null;
        enemy.llmDirective = { intent: 'patrol', decidedAt: now, reason: '玩家解除跟随' };
      } else if (STOP_HUNT_CHAT.test(text)) {
        enemy.huntMobKind = null;
        enemy.huntForPlayerId = null;
        enemy.llmDirective = { intent: 'patrol', decidedAt: now, reason: '玩家取消狩猎' };
      } else if (HUNT_CHAT.test(text)) {
        const quest = NpcQuests.activeFor(enemy, player.name);
        enemy.followPlayerId = null;
        enemy.huntForPlayerId = player.id;
        enemy.huntMobKind = quest?.mobKind ?? null;
        enemy.llmDirective = { intent: 'hunt', decidedAt: now, reason: '玩家委托狩猎' };
      }
      if (SPEED_UP_CHAT.test(text) && enemy.followPlayerId === player.id) {
        enemy.followBoostTimer = 6;
      }

      if (syncHandled) {
        enemy.llmChatPending = null;
        continue;
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
        this.applyA2aState(enemy, directive, snapshot);
        if (snapshot.chatText) {
          this.ensureChatSpeech(snapshot, directive);
        }
        enemy.llmDirective = directive;
        if (directive.intent === 'taunt') {
          enemy.llmPoseTimer = 0;
        }
        if (directive.speech) {
          NpcMemory.onNpcSpeech(enemy, snapshot.chatFrom, directive.speech, now);
          this.broadcastNpcChat(world, enemy, directive.speech);
        }
        this.logDialogue(enemy, snapshot, directive);
      })
      .catch((err: Error) => {
        logger.warn(`[LLM] ${enemy.displayName ?? enemy.kind}#${enemy.id} 决策失败: ${err.message}`);
        if (enemy.followPlayerId === null && enemy.a2aRole === null && enemy.followNpcId === null) {
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

  /** 后台对话日志:谁听到了什么、路由到哪个模型、决策出什么意图/台词 */
  private logDialogue(enemy: Enemy, snapshot: LLMGameSnapshot, directive: LLMDirective): void {
    if (!GameConfig.LLM_LOG_DIALOGUE) return;
    const who = `${enemy.displayName || enemy.kind}#${enemy.id}`;
    const via = directive.via ?? 'mock';
    const heard = snapshot.chatText ? ` ⟵ ${snapshot.chatFrom}「${snapshot.chatText}」` : '';
    const said = directive.speech ? ` 💬「${directive.speech}」` : '';
    const reason = directive.reason ? ` · ${directive.reason}` : '';
    logger.info(`[NPC对话] ${who} [${via}] → ${directive.intent}${heard}${said}${reason}`);
  }

  /**
   * 玩家聊天触发决策时,保证有可广播的 speech。
   * 小模型(qwen3.5:4b 等)常把台词写在 reason,导致客户端收不到 CHAT_MSG。
   */
  private ensureChatSpeech(snapshot: LLMGameSnapshot, directive: LLMDirective): void {
    if (directive.speech?.trim()) return;

    const reason = directive.reason?.trim();
    if (reason && this.isPlayerFacingReason(reason)) {
      directive.speech = reason.slice(0, 100);
      return;
    }

    const who = snapshot.chatFrom ?? '旅人';
    switch (directive.intent) {
      case 'follow':
        directive.speech = `好的,${who},我跟你走。`;
        break;
      case 'attack':
        directive.speech = '想动手?奉陪!';
        break;
      case 'flee':
        directive.speech = '……我得先撤了!';
        break;
      case 'hunt':
        directive.speech = '发现怪物,我来清理!';
        break;
      case 'guide':
        directive.speech = '跟我来,我带你去找。';
        break;
      case 'escort':
        directive.speech = '好,我这就去接人。';
        break;
      case 'follow_npc':
        directive.speech = '好,我跟你走。';
        break;
      case 'taunt':
        directive.speech = `……${who},听你吩咐。`;
        break;
      default:
        directive.speech = `嗯?${who},有什么事吗?`;
    }
  }

  private isPlayerFacingReason(reason: string): boolean {
    if (INTERNAL_REASON.test(reason)) return false;
    if (/[，。！？…,!?]/.test(reason)) return true;
    if (/已答应|已承诺|义士|守夜|奉陪|好的/.test(reason)) return true;
    return reason.length >= 6;
  }

  /** 跟随是持久状态:仅 follow 意图或解除聊天可改;周期 patrol 不覆盖 */
  private applyFollowState(
    world: GameWorld,
    enemy: Enemy,
    directive: LLMDirective,
    snapshot: LLMGameSnapshot,
    now: number
  ): void {
    if (enemy.a2aRole === 'guide' || enemy.a2aRole === 'escort') return;
    if (enemy.followNpcId !== null) return;
    if (directive.intent === 'follow') {
      if (enemy.huntMobKind !== null) {
        directive.intent = 'hunt';
        directive.reason = (directive.reason ?? '') + ';维持委托狩猎';
        return;
      }
      const p = this.resolveFollowPlayer(world, snapshot);
      if (p) {
        enemy.followPlayerId = p.id;
        enemy.huntMobKind = null;
        enemy.huntForPlayerId = null;
      }
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
    if (enemy.huntMobKind !== null && directive.intent === 'patrol') {
      directive.intent = 'hunt';
      directive.reason = (directive.reason ?? '') + ';维持委托狩猎';
      return;
    }
    if (enemy.followPlayerId !== null) {
      const p = world.players.get(enemy.followPlayerId);
      if (!p || p.isDead) {
        enemy.followPlayerId = null;
      }
    }
  }

  /** A2A 带路/护送是持久状态:周期 patrol 不覆盖 */
  private applyA2aState(
    enemy: Enemy,
    directive: LLMDirective,
    snapshot: LLMGameSnapshot
  ): void {
    if (enemy.a2aRole === 'guide' && directive.intent === 'patrol') {
      directive.intent = 'guide';
      directive.reason = (directive.reason ?? '') + ';维持带路';
      return;
    }
    if (enemy.a2aRole === 'escort' && directive.intent === 'patrol') {
      directive.intent = 'escort';
      directive.reason = (directive.reason ?? '') + ';维持护送';
      return;
    }
    if (enemy.followNpcId !== null && directive.intent === 'patrol') {
      directive.intent = 'follow_npc';
      directive.reason = (directive.reason ?? '') + ';维持NPC跟随';
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
    const capLine = chat?.from
      ? NpcCapabilities.summarize(enemy, chat.from, world)
      : undefined;
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
      capabilities: capLine,
      timeOfDay: timeLabel(world.dayPhase),
      squad: squadSnapshot(world, enemy),
      nearbyNpcs: nearbyNpcs(world, enemy, enemy.detectionRange * 2),
      a2aMission: world.npcAgent.escort.missionSnapshot(enemy),
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
