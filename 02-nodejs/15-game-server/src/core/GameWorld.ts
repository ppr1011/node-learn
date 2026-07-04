import { Player } from './Player';
import { Enemy, EnemyKind } from './Enemy';
import { AOIManager } from './AOI';
import { Obstacle, ObstacleGrid } from './Obstacle';
import { Spawner } from '../spawn/Spawner';
import { obstacleDefinition, ObstacleSpawn } from '../spawn/definitions/obstacles';
import { weatherDefinition, WeatherState } from '../spawn/definitions/weather';
import { enemyDefinition, EnemySpawn } from '../spawn/definitions/enemies';
import { itemDefinition } from '../spawn/definitions/items';
import { GameTimer } from '../utils/Timer';
import { MovementSystem } from '../systems/MovementSystem';
import { ChatSystem } from '../systems/ChatSystem';
import { CombatSystem } from '../systems/CombatSystem';
import { EnemyAISystem } from '../systems/EnemyAISystem';
import { GameConfig } from '../config';
import { logger } from '../utils/Logger';
import { MsgType } from '../network/Protocol';
import { WeaponDrop } from './WeaponDrop';
import { rollWeaponDrop } from './Weapon';
import { PlayerStore } from './PlayerStore';

/** 击杀不同敌人的掉落幸运系数(越高越易出稀有/史诗) */
const DROP_LUCK: Record<string, number> = { slime: 0.8, skeleton: 1.1, demon: 1.7 };

export class GameWorld {
  readonly players: Map<number, Player> = new Map();
  readonly enemies: Map<number, Enemy> = new Map();
  readonly drops: Map<number, WeaponDrop> = new Map();
  readonly playerStore: PlayerStore = new PlayerStore(); // 角色存档:掉线重连恢复位置/装备
  readonly aoi: AOIManager;
  readonly spawner: Spawner;
  readonly obstacles: Obstacle[];
  readonly obstacleGrid: ObstacleGrid;
  weather: WeatherState;
  private weatherTimer: ReturnType<typeof setInterval> | null = null;
  private timer: GameTimer;
  readonly movement: MovementSystem;
  readonly chat: ChatSystem;
  readonly combat: CombatSystem;
  readonly enemyAI: EnemyAISystem;

  constructor() {
    this.aoi = new AOIManager(
      GameConfig.AOI_CELL_SIZE,
      GameConfig.MAP_WIDTH,
      GameConfig.MAP_HEIGHT
    );

    // 统一物件生成:注册各类定义,启动时一次性生成 static 物件(障碍物)
    this.spawner = new Spawner(GameConfig.MAP_WIDTH, GameConfig.MAP_HEIGHT)
      .register(
        obstacleDefinition({
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
        })
      )
      .register(
        weatherDefinition({
          kinds: GameConfig.WEATHER_KINDS,
          minIntensity: GameConfig.WEATHER_MIN_INTENSITY,
          maxIntensity: GameConfig.WEATHER_MAX_INTENSITY,
        })
      )
      // 敌人/物品:骨架已注册但 count=0,不产出实体(扩展见 src/spawn/definitions/*)
      .register(
        enemyDefinition({
          count: GameConfig.ENEMY_COUNT,
          gap: GameConfig.ENEMY_GAP,
          radius: GameConfig.ENEMY_RADIUS,
          hp: GameConfig.ENEMY_HP,
          speed: GameConfig.ENEMY_SPEED,
          kinds: GameConfig.ENEMY_KINDS,
        })
      )
      .register(
        itemDefinition({
          count: GameConfig.ITEM_COUNT,
          gap: GameConfig.ITEM_GAP,
          radius: GameConfig.ITEM_RADIUS,
          value: GameConfig.ITEM_VALUE,
          kinds: GameConfig.ITEM_KINDS,
        })
      );

    const spawned = this.spawner.generateStatic(GameConfig.OBSTACLE_SEED);
    this.obstacles = (spawned.get('obstacle') as ObstacleSpawn[] | undefined) ?? [];
    this.obstacleGrid = new ObstacleGrid(this.obstacles, GameConfig.OBSTACLE_GRID_CELL_SIZE);

    // 初始天气(dynamic:运行时随机,服务端权威)
    this.weather = this.rollWeather();

    this.movement = new MovementSystem(this);
    this.chat = new ChatSystem(this);
    this.combat = new CombatSystem(this);
    this.enemyAI = new EnemyAISystem(this);

    // Spawn enemies (dynamic, avoids obstacles via shared occupied list)
    const enemySpawns = this.spawner.generateDynamic('enemy') as EnemySpawn[];
    for (const spawn of enemySpawns) {
      const kind = (spawn.kind as EnemyKind) ?? 'slime';
      const enemy = new Enemy(kind, spawn.x, spawn.y);
      this.enemies.set(enemy.id, enemy);
    }

    this.timer = new GameTimer(GameConfig.TICK_RATE, (dt) => this.tick(dt));
  }

  start(): void {
    this.timer.start();
    // 天气定时重掷 + 广播(dynamic 生成的运行时驱动)
    this.weatherTimer = setInterval(() => {
      this.weather = this.rollWeather();
      this.broadcastWeather();
    }, GameConfig.WEATHER_CHANGE_INTERVAL);
    logger.info(`GameWorld started | tick rate: ${GameConfig.TICK_RATE}Hz | map: ${GameConfig.MAP_WIDTH}x${GameConfig.MAP_HEIGHT} | obstacles: ${this.obstacles.length} | enemies: ${this.enemies.size} | weather: ${this.weather.kind}`);
  }

  stop(): void {
    this.timer.stop();
    if (this.weatherTimer) {
      clearInterval(this.weatherTimer);
      this.weatherTimer = null;
    }
    logger.info('GameWorld stopped');
  }

  /** 用 dynamic 定义重掷一次全局天气 */
  private rollWeather(): WeatherState {
    const [w] = this.spawner.generateDynamic('weather') as WeatherState[];
    return w ?? { id: 0, category: 'weather', kind: 'clear', intensity: 0 };
  }

  /** 把当前天气广播给所有在线玩家(服务端权威 → 多端一致) */
  private broadcastWeather(): void {
    for (const player of this.players.values()) {
      player.session.send(MsgType.WEATHER, this.weather);
    }
    logger.info(`Weather → ${this.weather.kind} (intensity ${this.weather.intensity.toFixed(2)})`);
  }

  addPlayer(player: Player): void {
    // 有存档(掉线重连 / 换标签页)→ 恢复上次位置、血量、装备;否则随机安全出生点
    const saved = this.playerStore.get(player.token);
    if (saved) {
      player.position = { x: saved.x, y: saved.y };
      player.hp = saved.hp;
      player.maxHp = saved.maxHp;
      player.facing = saved.facing;
      player.isDead = false;
      player.equip(saved.weapon);
      logger.info(`Player "${player.name}" restored @ (${Math.round(saved.x)}, ${Math.round(saved.y)}) with ${saved.weapon}`);
    } else {
      player.position = this.findSafeSpawn(player.radius);
    }

    this.players.set(player.id, player);
    this.aoi.addPlayer(player);

    // 通知新玩家当前世界状态(回传 token:首次注册时是服务端新生成的,供客户端本地记住角色)
    const nearby = this.aoi.getNearbyPlayers(player);
    player.session.send(MsgType.JOIN_WORLD, {
      self: player.toPublicState(),
      token: player.token,
      players: nearby.map(p => p.toPublicState()),
      mapWidth: GameConfig.MAP_WIDTH,
      mapHeight: GameConfig.MAP_HEIGHT,
      obstacles: this.obstacles,
      enemies: [...this.enemies.values()].map(e => e.toPublicState()),
      drops: [...this.drops.values()].map(d => d.toPublicState()),
      weather: this.weather,
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
    // 离线前先存档:下次带同一 token 重连即可恢复(全局共享世界中的个人进度)
    this.playerStore.save(player);

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

    // 更新敌人 AI
    this.enemyAI.update(dt);

    // 掉落物:拾取判定 + TTL 清理
    this.updateDrops(Date.now());

    // 广播状态更新给各自视野内的玩家
    this.broadcastStates();
  }

  /** 向所有在线玩家广播(掉落物数量少 + 有 TTL 上限,与天气一样走全局广播,简单可靠) */
  private broadcastAll(type: MsgType, data: unknown): void {
    for (const player of this.players.values()) player.session.send(type, data);
  }

  /** 击杀敌人后按几率掉落一件武器(强敌 luck 更高) */
  spawnWeaponDrop(enemy: Enemy): void {
    if (Math.random() >= GameConfig.WEAPON_DROP_CHANCE) return;
    const luck = DROP_LUCK[enemy.kind] ?? 1;
    const kind = rollWeaponDrop(luck);
    const drop = new WeaponDrop(kind, enemy.position.x, enemy.position.y, GameConfig.WEAPON_DROP_TTL);
    this.drops.set(drop.id, drop);
    this.broadcastAll(MsgType.ITEM_SPAWN, drop.toPublicState());
  }

  /** 每 tick:玩家走到掉落物上自动拾取装备;过期掉落自然消失 */
  private updateDrops(now: number): void {
    const R = GameConfig.WEAPON_PICKUP_RADIUS;
    for (const drop of this.drops.values()) {
      // TTL 到期 → 消失(byPlayerId=null 表示自然消失,非被拾取)
      if (now >= drop.expiresAt) {
        this.drops.delete(drop.id);
        this.broadcastAll(MsgType.ITEM_PICKUP, { dropId: drop.id, byPlayerId: null });
        continue;
      }
      // 拾取判定:命中最近的一名存活玩家即被其装备
      for (const player of this.players.values()) {
        if (player.isDead) continue;
        const dx = player.position.x - drop.position.x;
        const dy = player.position.y - drop.position.y;
        if (Math.hypot(dx, dy) <= R) {
          player.equip(drop.kind);
          this.drops.delete(drop.id);
          this.broadcastAll(MsgType.ITEM_PICKUP, {
            dropId: drop.id,
            byPlayerId: player.id,
            weapon: drop.kind,
          });
          break;
        }
      }
    }
  }

  private broadcastStates(): void {
    // Build enemy state snapshot once (same for all players)
    const enemyStates = [...this.enemies.values()].map(e => e.toPublicState());

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

      player.session.send(MsgType.STATE_UPDATE, { players: states, enemies: enemyStates });
    }
  }

  /** 拒绝采样找一个不与任何障碍物重叠的出生点(出生 / 复活共用) */
  findSafeSpawn(radius: number): { x: number; y: number } {
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
