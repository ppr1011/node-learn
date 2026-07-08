export enum MsgType {
  // Client -> Server
  C_JOIN = 'join', // 进入世界:{ name, token? };token 为空则服务端生成并回传
  C_MOVE = 'c_move',
  C_STOP = 'c_stop',
  C_CHAT = 'c_chat',
  C_ATTACK = 'c_attack',
  C_CAST = 'c_cast', // 施放技能:{ skillId, targetId?, targetKind?, x?, y? }
  C_PING = 'c_ping',

  // Server -> Client
  JOIN_WORLD = 's_join',
  PLAYER_ENTER = 's_enter',
  PLAYER_LEAVE = 's_leave',
  STATE_UPDATE = 's_state',
  CHAT_MSG = 's_chat',
  DAMAGE = 's_damage',
  PLAYER_DEAD = 's_dead',
  PLAYER_RESPAWN = 's_respawn',
  WEATHER = 's_weather',
  TIME_OF_DAY = 's_time', // 昼夜相位变化(功能7)
  PONG = 's_pong',
  ERROR = 's_error',

  // Enemy events
  ENEMY_HIT = 's_enemy_hit',
  ENEMY_DEAD = 's_enemy_dead',

  // 等级 / 经验(击杀敌人获得经验;升级时额外广播供他人展示与特效)
  XP_GAIN = 's_xp',
  LEVEL_UP = 's_levelup',

  // Combat animation (每次攻击都广播,空挥也播动画;命中反馈仍走 DAMAGE/ENEMY_HIT)
  ATTACK = 's_attack',

  // 英雄技能(治疗 / 火球 / 陨石雨)
  SKILL_CAST = 's_skill_cast',
  HEAL = 's_heal',
  AOE_HIT = 's_aoe_hit',

  // Weapon drops(掉落 / 拾取 / 自然消失)
  ITEM_SPAWN = 's_item_spawn',
  ITEM_PICKUP = 's_item_pickup',

  // Health packs(战场随机刷新 / 走近拾取回血 / 自然消失)
  HP_PACK_SPAWN = 's_hp_spawn',
  HP_PACK_PICKUP = 's_hp_pickup',

  // NPC Agent
  C_NPC_INFO = 'c_npc_info',
  NPC_INFO = 's_npc_info',
  NPC_QUEST = 's_quest',
}

export interface GameMessage {
  type: MsgType;
  data?: any;
  seq?: number;
}

export function encodeMessage(type: MsgType, data?: any): string {
  const msg: GameMessage = { type, data };
  return JSON.stringify(msg);
}

export function decodeMessage(raw: string): GameMessage | null {
  try {
    const msg = JSON.parse(raw);
    if (!msg.type) return null;
    return msg as GameMessage;
  } catch {
    return null;
  }
}
