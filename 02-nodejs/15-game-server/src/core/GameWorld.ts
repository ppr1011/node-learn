import { Player } from './Player';
import { AOIManager } from './AOI';
import { GameTimer } from '../utils/Timer';
import { MovementSystem } from '../systems/MovementSystem';
import { ChatSystem } from '../systems/ChatSystem';
import { CombatSystem } from '../systems/CombatSystem';
import { GameConfig } from '../config';
import { logger } from '../utils/Logger';
import { MsgType } from '../network/Protocol';

export class GameWorld {
  readonly players: Map<number, Player> = new Map();
  readonly aoi: AOIManager;
  private timer: GameTimer;
  readonly movement: MovementSystem;
  readonly chat: ChatSystem;
  readonly combat: CombatSystem;

  constructor() {
    this.aoi = new AOIManager(
      GameConfig.AOI_CELL_SIZE,
      GameConfig.MAP_WIDTH,
      GameConfig.MAP_HEIGHT
    );

    this.movement = new MovementSystem(this);
    this.chat = new ChatSystem(this);
    this.combat = new CombatSystem(this);

    this.timer = new GameTimer(GameConfig.TICK_RATE, (dt) => this.tick(dt));
  }

  start(): void {
    this.timer.start();
    logger.info(`GameWorld started | tick rate: ${GameConfig.TICK_RATE}Hz | map: ${GameConfig.MAP_WIDTH}x${GameConfig.MAP_HEIGHT}`);
  }

  stop(): void {
    this.timer.stop();
    logger.info('GameWorld stopped');
  }

  addPlayer(player: Player): void {
    // 随机生成出生点
    player.position = {
      x: Math.random() * GameConfig.MAP_WIDTH * 0.8 + GameConfig.MAP_WIDTH * 0.1,
      y: Math.random() * GameConfig.MAP_HEIGHT * 0.8 + GameConfig.MAP_HEIGHT * 0.1,
    };

    this.players.set(player.id, player);
    this.aoi.addPlayer(player);

    // 通知新玩家当前世界状态
    const nearby = this.aoi.getNearbyPlayers(player);
    player.session.send(MsgType.JOIN_WORLD, {
      self: player.toPublicState(),
      players: nearby.map(p => p.toPublicState()),
      mapWidth: GameConfig.MAP_WIDTH,
      mapHeight: GameConfig.MAP_HEIGHT,
    });

    // 通知附近玩家有新人加入
    for (const other of nearby) {
      other.session.send(MsgType.PLAYER_ENTER, player.toPublicState());
      player.visiblePlayers.add(other.id);
      other.visiblePlayers.add(player.id);
    }

    logger.info(`Player "${player.name}" (id=${player.id}) joined | online: ${this.players.size}`);
  }

  removePlayer(player: Player): void {
    this.aoi.removePlayer(player);
    this.players.delete(player.id);

    // 通知所有能看到该玩家的人
    for (const otherId of player.visiblePlayers) {
      const other = this.players.get(otherId);
      if (other) {
        other.session.send(MsgType.PLAYER_LEAVE, { id: player.id });
        other.visiblePlayers.delete(player.id);
      }
    }

    logger.info(`Player "${player.name}" (id=${player.id}) left | online: ${this.players.size}`);
  }

  private tick(deltaMs: number): void {
    const dt = deltaMs / 1000;

    // 更新所有玩家的移动
    for (const player of this.players.values()) {
      if (player.isDead) continue;
      this.movement.update(player, dt);
    }

    // 广播状态更新给各自视野内的玩家
    this.broadcastStates();
  }

  private broadcastStates(): void {
    for (const player of this.players.values()) {
      const nearby = this.aoi.getNearbyPlayers(player);
      const newVisible = new Set<number>();

      const states: any[] = [];
      for (const other of nearby) {
        newVisible.add(other.id);
        states.push(other.toPublicState());

        // 新进入视野
        if (!player.visiblePlayers.has(other.id)) {
          player.session.send(MsgType.PLAYER_ENTER, other.toPublicState());
        }
      }

      // 离开视野
      for (const oldId of player.visiblePlayers) {
        if (!newVisible.has(oldId)) {
          player.session.send(MsgType.PLAYER_LEAVE, { id: oldId });
        }
      }

      player.visiblePlayers = newVisible;

      // 发送位置更新
      if (states.length > 0) {
        player.session.send(MsgType.STATE_UPDATE, { players: states });
      }
    }
  }

  getStats() {
    return {
      online: this.players.size,
      avgTickTime: this.timer.avgTickTime.toFixed(2),
      tps: this.timer.tps,
      memoryMB: (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1),
    };
  }
}
