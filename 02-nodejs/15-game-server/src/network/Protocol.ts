export enum MsgType {
  // Client -> Server
  C_MOVE = 'c_move',
  C_STOP = 'c_stop',
  C_CHAT = 'c_chat',
  C_ATTACK = 'c_attack',
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
  PONG = 's_pong',
  ERROR = 's_error',
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
