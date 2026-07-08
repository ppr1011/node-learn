/**
 * NPC 事实问答 —— 对可核实的问题给出准确回复,不依赖 LLM 瞎编
 */

import { Enemy } from '../../core/Enemy';
import { Player } from '../../core/Player';
import { GameWorld } from '../../core/GameWorld';
import { MsgType } from '../../network/Protocol';
import { ZONES } from '../../core/Zone';
import { NpcCapabilities, CAPABILITY_CHAT } from './capabilities';
import { NpcQuests } from './quest';
import { RumorBoard } from './rumor';
import { trustOf, QUEST_FRIEND_TRUST, isNpcFriend } from './relation';
import { timeLabel } from './schedule';

const IDENTITY_CHAT = /你是谁|你叫什么|自我介绍|你是哪位|什么名字|介绍一下你/i;
const ZONE_CHAT = /这是哪|什么区域|在哪|什么地方|这里是/i;
const QUEST_STATUS_CHAT = /委托进度|任务进度|进度怎样|做到哪了|任务怎样|委托怎样/i;
const RUMOR_CHAT = /传闻|有什么消息|听说什么|情报|八卦|最近发生/i;
const TRUST_CHAT = /信任|你对我的|看法|觉得我行|关系怎样|你认识我/i;
const TIME_CHAT = /几点|什么时候|现在几点|天黑了|天亮/i;
const WEATHER_CHAT = /天气|下雨|下雪|有雾/i;

/** 玩家明确挑衅(才允许 NPC 反击) */
export const PROVOKE_CHAT = /打你|杀你|攻击你|揍你|弄死你|去死|滚开|敢打|挑衅|开战/i;

export class NpcDialogue {
  /** 尝试用确定性逻辑回答;返回 true 表示已回复,跳过后续 LLM */
  static tryAnswerFromChat(
    world: GameWorld,
    enemy: Enemy,
    player: Player,
    text: string,
    now: number
  ): boolean {
    if (!enemy.llmEnabled) return false;

    if (CAPABILITY_CHAT.test(text)) {
      return this.answerCapabilities(world, enemy, player);
    }
    if (QUEST_STATUS_CHAT.test(text)) {
      return this.answerQuestStatus(world, enemy, player);
    }
    if (IDENTITY_CHAT.test(text)) {
      return this.answerIdentity(world, enemy, player);
    }
    if (ZONE_CHAT.test(text)) {
      return this.answerZone(world, enemy, player);
    }
    if (RUMOR_CHAT.test(text)) {
      return this.answerRumors(world, enemy, player, now);
    }
    if (TRUST_CHAT.test(text)) {
      return this.answerTrust(world, enemy, player);
    }
    if (TIME_CHAT.test(text)) {
      return this.answerTime(world, enemy, player);
    }
    if (WEATHER_CHAT.test(text)) {
      return this.answerWeather(world, enemy, player);
    }
    return false;
  }

  private static answerCapabilities(world: GameWorld, enemy: Enemy, player: Player): boolean {
    const caps = NpcCapabilities.list(enemy, player.name, world);
    const available = caps.filter((c) => c.available);
    if (available.length === 0) {
      const reason = caps.find((c) => !c.available)?.reason ?? '稍后再来';
      this.speak(world, enemy, `${player.name},现在不行:${reason}`);
      return true;
    }
    const lines = available.map((c) => `${c.label}→${c.hint}`).slice(0, 4);
    const name = enemy.displayName ?? '我';
    this.speak(world, enemy, `${name}能:${lines.join('; ')}`);
    return true;
  }

  private static answerQuestStatus(world: GameWorld, enemy: Enemy, player: Player): boolean {
    const q = NpcQuests.activeFor(enemy, player.name);
    if (!q) {
      const hint = isNpcFriend(enemy, player.name)
        ? '说「有任务吗」可以接。'
        : `成为朋友(信任≥${QUEST_FRIEND_TRUST})后才能接委托,多聊聊吧。`;
      this.speak(world, enemy, `${player.name},你目前没有我的委托。${hint}`);
      return true;
    }
    const mob = NpcCapabilities.mobLabel(q.mobKind);
    this.speak(
      world,
      enemy,
      `「${q.title}」:${mob} ${q.progress}/${q.target}。${q.description}`
    );
    return true;
  }

  private static answerIdentity(world: GameWorld, enemy: Enemy, player: Player): boolean {
    const zone = ZONES[enemy.zoneId]?.name ?? '这片区域';
    const p = enemy.personality ?? '守卫';
    this.speak(
      world,
      enemy,
      `我是${enemy.displayName},${p}。负责照看${zone}。`
    );
    return true;
  }

  private static answerZone(world: GameWorld, enemy: Enemy, player: Player): boolean {
    const zone = ZONES[enemy.zoneId];
    const name = zone?.name ?? '未知区域';
    const lv = zone ? `推荐等级${zone.recommendedLevel}` : '';
    this.speak(world, enemy, `${player.name},这里是${name}${lv ? ',' + lv : ''}。`);
    return true;
  }

  private static answerRumors(
    world: GameWorld,
    enemy: Enemy,
    player: Player,
    now: number
  ): boolean {
    const rumors = RumorBoard.forZone(world, enemy.zoneId, now);
    if (rumors.length === 0) {
      this.speak(world, enemy, `${player.name},这带暂无传闻,风平浪静。`);
      return true;
    }
    const latest = rumors.slice(-2).join('; ');
    this.speak(world, enemy, `听说:${latest}`.slice(0, 100));
    return true;
  }

  private static answerTrust(world: GameWorld, enemy: Enemy, player: Player): boolean {
    const rel = enemy.llmRelations[player.name];
    const trust = trustOf(enemy, player.name);
    const label = rel?.label ?? '陌生人';
    this.speak(
      world,
      enemy,
      `${player.name},我对你的信任是${trust}(${label})。多聊聊或帮我,信任会涨。`
    );
    return true;
  }

  private static answerTime(world: GameWorld, enemy: Enemy, player: Player): boolean {
    const t = timeLabel(world.dayPhase);
    const hint = world.dayPhase === 'night' ? ',夜晚我不接委托。' : '';
    this.speak(world, enemy, `现在是${t}。${hint}`.slice(0, 100));
    return true;
  }

  private static answerWeather(world: GameWorld, enemy: Enemy, player: Player): boolean {
    const w = world.weather.kind;
    const labels: Record<string, string> = {
      clear: '晴朗', rain: '下雨', fog: '有雾', snow: '下雪',
    };
    this.speak(world, enemy, `天气:${labels[w] ?? w}。`);
    return true;
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
