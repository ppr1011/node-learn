/**
 * NPC 事实问答 + 上下文回复 —— 听懂玩家说什么,给出准确/有据的回答
 */

import { Enemy } from '../../core/Enemy';
import { Player } from '../../core/Player';
import { GameWorld } from '../../core/GameWorld';
import { GameConfig } from '../../config';
import { MsgType } from '../../network/Protocol';
import { ZONES } from '../../core/Zone';
import { NpcCapabilities, CAPABILITY_CHAT } from './capabilities';
import { NpcQuests } from './quest';
import { RumorBoard } from './rumor';
import { trustOf, QUEST_FRIEND_TRUST, isNpcFriend } from './relation';
import { timeLabel } from './schedule';
import { LLMGameSnapshot } from '../llm/types';

const IDENTITY_CHAT = /你是谁|你叫什么|自我介绍|你是哪位|什么名字|介绍一下你/i;
const ZONE_CHAT = /这是哪|什么区域|在哪|什么地方|这里是/i;
const QUEST_STATUS_CHAT = /委托进度|任务进度|进度怎样|做到哪了|任务怎样|委托怎样/i;
const RUMOR_CHAT = /传闻|有什么消息|听说什么|情报|八卦|最近发生/i;
const TRUST_CHAT = /信任|你对我的|看法|觉得我行|关系怎样|你认识我/i;
const TIME_CHAT = /几点|什么时候|现在几点|天黑了|天亮/i;
const WEATHER_CHAT = /天气|下雨|下雪|有雾/i;
const META_CHAT = /什么模型|哪个模型|AI|人工智能|GPT|DeepSeek|机器人|程序|LLM|大模型|你是真|是不是AI/i;
const THANKS_CHAT = /谢谢|感谢|多谢|辛苦了/i;
const GREET_CHAT = /你好|hello|hi|嗨|在吗|早上好|晚上好/i;

/** 模型推脱/未听懂类台词 → 需替换 */
export const VAGUE_SPEECH = /刚才说了什么|没听清|你说什么|听不清|什么意思|没听懂|有什么事吗\?*$/i;

/** 玩家明确挑衅(才允许 NPC 反击) */
export const PROVOKE_CHAT = /打你|杀你|攻击你|揍你|弄死你|去死|滚开|敢打|挑衅|开战/i;

export interface ReplyContext {
  npcName: string;
  personality: string;
  playerName: string;
  text: string;
  zoneName?: string;
  capabilities?: string;
  activeQuest?: string;
}

/** 是否有可用的真实 LLM(云端 Key 或本地 Ollama) */
export function hasRealLlmProvider(): boolean {
  return GameConfig.LLM_LOCAL_ENABLED || !!GameConfig.LLM_API_KEY;
}

/** 当前 LLM 后端描述(注入快照,供模型回答「你是什么模型」) */
export function describeLlmBackend(): string {
  if (GameConfig.LLM_LOCAL_ENABLED) {
    return `local:${GameConfig.LLM_LOCAL_MODEL}`;
  }
  if (GameConfig.LLM_API_KEY) {
    return `cloud:${GameConfig.LLM_MODEL}`;
  }
  return 'mock:规则引擎';
}

/** 根据玩家原话构建有据回复(Mock / LLM 兜底 / 无 Key 时用) */
export function buildContextualReply(ctx: ReplyContext): string {
  const { playerName, text, npcName, personality } = ctx;
  const snippet = text.trim().slice(0, 36);

  if (META_CHAT.test(text)) {
    const backend = hasRealLlmProvider()
      ? (GameConfig.LLM_LOCAL_ENABLED ? `本地${GameConfig.LLM_LOCAL_MODEL}` : `云端${GameConfig.LLM_MODEL}`)
      : '规则引擎';
    return `${playerName},我是${npcName}(${personality})。游戏 NPC Agent,决策由${backend}驱动。`;
  }
  if (THANKS_CHAT.test(text)) {
    return `不客气,${playerName}!有需要再说。`;
  }
  if (GREET_CHAT.test(text)) {
    return `你好,${playerName}!我是${npcName},${personality}。`;
  }
  if (CAPABILITY_CHAT.test(text) && ctx.capabilities) {
    return `${playerName},我能:${ctx.capabilities.slice(0, 70)}`;
  }
  if (/委托|任务/.test(text)) {
    if (ctx.activeQuest) return `${playerName},当前委托:${ctx.activeQuest}`;
    return `${playerName},还没有委托。成为朋友(信任≥${QUEST_FRIEND_TRUST})后说「有任务吗」可接。`;
  }
  if (/为什么|为何|怎么回事/.test(text)) {
    return `${playerName},关于「${snippet}」……我不太清楚。试试问「你能做什么」或 Shift+点击我。`;
  }
  if (/怎么|如何/.test(text)) {
    return `${playerName},「${snippet}」?说「你能做什么」我教你;委托找我说「有任务吗」。`;
  }
  if (/\?|？/.test(text) || /吗$|呢$/.test(text.trim())) {
    return `${playerName},你问「${snippet}」。我是${npcName},问能力说「你能做什么」,问委托说「委托进度」。`;
  }

  return `${playerName},我听到你说「${snippet}」。我是${npcName},需要帮忙说「你能做什么」。`;
}

export function replyFromSnapshot(snapshot: LLMGameSnapshot): string {
  return buildContextualReply({
    npcName: snapshot.npcName,
    personality: snapshot.personality,
    playerName: snapshot.chatFrom ?? '旅人',
    text: snapshot.chatText ?? '',
    zoneName: snapshot.zoneName,
    capabilities: snapshot.capabilities,
    activeQuest: snapshot.activeQuest,
  });
}

export class NpcDialogue {
  /**
   * 尝试用确定性逻辑回答。
   * 有本地/云端 LLM 时:只拦截游戏硬事实(防编造),闲聊交给 LLM。
   * 无 LLM 时:规则引擎兜底全部对话。
   */
  static tryAnswerFromChat(
    world: GameWorld,
    enemy: Enemy,
    player: Player,
    text: string,
    now: number
  ): boolean {
    if (!enemy.llmEnabled) return false;
    const useLlm = hasRealLlmProvider();

    // ── 硬事实:始终同步回复(数值/列表不能靠 LLM 猜) ──
    if (CAPABILITY_CHAT.test(text)) {
      return this.answerCapabilities(world, enemy, player);
    }
    if (QUEST_STATUS_CHAT.test(text)) {
      return this.answerQuestStatus(world, enemy, player);
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

    // ── 闲聊/开放问题:有 LLM 时不拦截,交给本地/云端模型 ──
    if (!useLlm) {
      if (IDENTITY_CHAT.test(text)) {
        return this.answerIdentity(world, enemy, player);
      }
      if (META_CHAT.test(text)) {
        return this.replyContextually(world, enemy, player, text);
      }
      if (THANKS_CHAT.test(text)) {
        return this.replyContextually(world, enemy, player, text);
      }
      if (GREET_CHAT.test(text)) {
        return this.replyContextually(world, enemy, player, text);
      }
    }
    return false;
  }

  /** 无真实 LLM 时,对任意聊天给出上下文回复 */
  static replyContextually(
    world: GameWorld,
    enemy: Enemy,
    player: Player,
    text: string
  ): boolean {
    if (!text.trim()) return false;
    const zone = ZONES[enemy.zoneId]?.name ?? '这片区域';
    const speech = buildContextualReply({
      npcName: enemy.displayName ?? enemy.kind,
      personality: enemy.personality ?? '守卫',
      playerName: player.name,
      text,
      zoneName: zone,
      capabilities: NpcCapabilities.summarize(enemy, player.name, world),
      activeQuest: NpcQuests.formatActive(enemy, player.name) ?? undefined,
    });
    this.speak(world, enemy, speech);
    return true;
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
