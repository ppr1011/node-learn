import { Player } from '../core/Player';
import { GameWorld } from '../core/GameWorld';
import { MsgType } from '../network/Protocol';
import { GameConfig } from '../config';

export class ChatSystem {
  constructor(private readonly world: GameWorld) {}

  handleChat(player: Player, text: string): void {
    if (player.isDead) return;

    // 消息长度限制
    const sanitized = text.slice(0, GameConfig.MAX_CHAT_LENGTH);

    // 范围聊天：只发送给 AOI 范围内的玩家
    const nearby = this.world.aoi.getNearbyPlayers(player);

    const chatMsg = {
      from: player.name,
      fromId: player.id,
      text: sanitized,
      x: Math.round(player.position.x),
      y: Math.round(player.position.y),
    };

    // 发给自己
    player.session.send(MsgType.CHAT_MSG, chatMsg);

    // 发给附近的人
    for (const other of nearby) {
      other.session.send(MsgType.CHAT_MSG, chatMsg);
    }

    // 通知 LLM NPC:附近有玩家说话
    this.world.enemyAI.onPlayerChat(player, sanitized);
  }
}
