import { Player } from './Player';
import { AOIManager } from './AOI';
import { Obstacle, ObstacleGrid, generateObstacles } from './Obstacle';
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
  readonly obstacles: Obstacle[];
  readonly obstacleGrid: ObstacleGrid;
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

    this.obstacles = generateObstacles({
      mapWidth: GameConfig.MAP_WIDTH,
      mapHeight: GameConfig.MAP_HEIGHT,
      seed: GameConfig.OBSTACLE_SEED,
      gap: GameConfig.OBSTACLE_GAP,
      tree: {
        count: GameConfig.TREE_COUNT,
        minSize: GameConfig.TREE_MIN_SIZE,
        maxSize: GameConfig.TREE_MAX_SIZE,
        trunkRatio: GameConfig.TREE_TRUNK_RATIO,
      },
      rock: {
        count: GameConfig.ROCK_COUNT,
        minRadius: GameConfig.ROCK_MIN_RADIUS,
        maxRadius: GameConfig.ROCK_MAX_RADIUS,
      },
    });
    this.obstacleGrid = new ObstacleGrid(this.obstacles, GameConfig.OBSTACLE_GRID_CELL_SIZE);

    this.movement = new MovementSystem(this);
    this.chat = new ChatSystem(this);
    this.combat = new CombatSystem(this);

    this.timer = new GameTimer(GameConfig.TICK_RATE, (dt) => this.tick(dt));
  }

  start(): void {
    this.timer.start();
    logger.info(`GameWorld started | tick rate: ${GameConfig.TICK_RATE}Hz | map: ${GameConfig.MAP_WIDTH}x${GameConfig.MAP_HEIGHT} | obstacles: ${this.obstacles.length}`);
  }

  stop(): void {
    this.timer.stop();
    logger.info('GameWorld stopped');
  }

  addPlayer(player: Player): void {
    // 随机生成出生点(避开障碍物)
    player.position = this.findSafeSpawn(player.radius);

    this.players.set(player.id, player);
    this.aoi.addPlayer(player);

    // 通知新玩家当前世界状态
    const nearby = this.aoi.getNearbyPlayers(player);
    player.session.send(MsgType.JOIN_WORLD, {
      self: player.toPublicState(),
      players: nearby.map(p => p.toPublicState()),
      mapWidth: GameConfig.MAP_WIDTH,
      mapHeight: GameConfig.MAP_HEIGHT,
      obstacles: this.obstacles,
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

      // 始终包含自身状态，确保客户端能收到自己的位置更新
      const states: any[] = [player.toPublicState()];

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

      player.session.send(MsgType.STATE_UPDATE, { players: states });
    }
  }

  /** 拒绝采样找一个不与任何障碍物重叠的出生点 */
  private findSafeSpawn(radius: number): { x: number; y: number } {
    for (let i = 0; i < 30; i++) {
      const x = Math.random() * GameConfig.MAP_WIDTH * 0.8 + GameConfig.MAP_WIDTH * 0.1;
      const y = Math.random() * GameConfig.MAP_HEIGHT * 0.8 + GameConfig.MAP_HEIGHT * 0.1;
      const blocked = this.obstacleGrid.queryNearby(x, y, radius).some(o => {
        return Math.hypot(x - o.x, y - o.y) < o.radius + radius;
      });
      if (!blocked) return { x, y };
    }
    // 兜底:极端情况下返回地图中心(即便重叠,下一 tick 会被推出)
    return { x: GameConfig.MAP_WIDTH / 2, y: GameConfig.MAP_HEIGHT / 2 };
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
