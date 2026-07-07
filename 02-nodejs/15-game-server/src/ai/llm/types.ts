/**
 * LLM 战术层 —— 类型契约
 *
 * 设计原则:LLM 不做 20Hz 实时控制,只产出「意图」(intent),
 * 行为树每 tick 读取意图并执行具体动作(追击/攻击/巡逻/逃跑/喊话)。
 */

/** LLM 可输出的战术意图(白名单,防止模型幻觉出非法动作) */
export type LLMIntent = 'attack' | 'flee' | 'patrol' | 'taunt' | 'hunt' | 'follow';

/** 一次 LLM 决策的结果,挂在 enemy 黑板上供 BT 读取 */
export interface LLMDirective {
  intent: LLMIntent;
  /** 可选台词(聊天触发或 taunt 时) */
  speech?: string;
  /** 决策理由(调试/日志) */
  reason?: string;
  decidedAt: number;
}

/** 送给 LLM 的世界快照(结构化,避免把整个 GameWorld 塞给模型) */
export interface LLMGameSnapshot {
  npcName: string;
  personality: string;
  kind: string;
  hp: number;
  maxHp: number;
  x: number;
  y: number;
  aiState: string;
  zoneName: string;
  weather: string;
  nearbyPlayers: Array<{
    name: string;
    distance: number;
    hp: number;
    maxHp: number;
  }>;
  /** 附近可狩猎的普通怪物数量 */
  nearbyMobCount: number;
  /** 当前是否正在跟随某玩家 */
  isFollowing: boolean;
  /** 玩家刚发来的聊天(若有) */
  chatFrom?: string;
  chatText?: string;
  /** Agent 记忆摘要(注入 LLM 上下文) */
  memoryRecent: string[];
  playerRelations: string[];
  memoryArchives: string[];
  mood: number;
  moodLabel: string;
  zoneRumors: string[];
  activeQuest?: string;
}
