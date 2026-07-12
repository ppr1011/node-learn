import { Player } from './Player';
import { Enemy, EnemyKind } from './Enemy';
import { AOIManager } from './AOI';
import { Obstacle, ObstacleGrid } from './Obstacle';
import { Spawner } from '../spawn/Spawner';
import { obstacleDefinition, ObstacleSpawn } from '../spawn/definitions/obstacles';
import { weatherDefinition, WeatherState } from '../spawn/definitions/weather';
import { enemyDefinition } from '../spawn/definitions/enemies';
import { itemDefinition } from '../spawn/definitions/items';
import { GameTimer } from '../utils/Timer';
import { MovementSystem } from '../systems/MovementSystem';
import { ChatSystem } from '../systems/ChatSystem';
import { CombatSystem } from '../systems/CombatSystem';
import { SkillSystem } from '../systems/SkillSystem';
import { EnemyAISystem } from '../systems/EnemyAISystem';
import { NpcAgentSystem } from '../ai/agent/NpcAgentSystem';
import { RumorEntry } from '../ai/agent/rumor';
import { DayPhase, phaseAt } from '../ai/agent/schedule';
import { PlayerReputation } from '../ai/agent/reputation';
import { GameConfig } from '../config';
import { logger } from '../utils/Logger';
import { MsgType } from '../network/Protocol';
import { WeaponDrop } from './WeaponDrop';
import { rollWeaponDrop } from './Weapon';
import { HealthPack } from './HealthPack';
import { PlayerStore } from './PlayerStore';
import { PersistenceBackend } from '../persistence/types';
import { TieredBackend } from '../persistence/TieredBackend';
import { RedisBackend } from '../persistence/RedisBackend';
import { SqliteBackend } from '../persistence/SqliteBackend';
import { NullBackend } from '../persistence/NullBackend';
import { ExplorationMap } from './ExplorationMap';
import { DEFAULT_SKILL_IDS } from './Skills';
import { Zone, ZONES, ZONE_ENEMY_COUNT, zonePublicState } from './Zone';
import { SHELTERS, isInAnyShelter, nearCampfire, shelterPublicState } from './Shelter';

/** 击杀不同敌人的掉落幸运系数(越高越易出稀有/史诗/传说);再乘所在区域的 dropLuck */
const DROP_LUCK: Record<string, number> = {
  slime: 0.8, skeleton: 1.1, demon: 1.7,
  orc: 1.4, wraith: 1.9, golem: 2.2, dragon: 3.0,
};

export class GameWorld {
  readonly players: Map<number, Player> = new Map();
  readonly enemies: Map<number, Enemy> = new Map();
  readonly drops: Map<number, WeaponDrop> = new Map();
  readonly healthPacks: Map<number, HealthPack> = new Map();
  private nextHpPackAt: number = 0;
  private nextCampfireHealAt: Map<number, number> = new Map(); // 玩家id → 下次可被篝火回血的时刻
  readonly playerStore: PlayerStore; // 角色存档:掉线重连 + 重启恢复位置/装备(Redis 热层 + SQLite 冷层)
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
  readonly skills: SkillSystem;
  readonly enemyAI: EnemyAISystem;
  readonly npcAgent: NpcAgentSystem;
  rumorBoard?: Map<number, RumorEntry[]>;
  // 昼夜相位(功能7):每 tick 由世界时钟推进,变更时广播
  dayPhase: DayPhase = 'day';
  // 玩家全局声望标签(功能8):由 Reputation.recompute 周期写入
  readonly playerTags: Map<string, PlayerReputation> = new Map();

  constructor() {
    this.playerStore = new PlayerStore(GameWorld.createBackend());

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
    // 清空避难所安全圈内的障碍物:让圈内可自由走动(安全落脚点不该被树石堵住)
    this.obstacles = ((spawned.get('obstacle') as ObstacleSpawn[] | undefined) ?? [])
      .filter((o) => !isInAnyShelter(o.x, o.y));
    this.obstacleGrid = new ObstacleGrid(this.obstacles, GameConfig.OBSTACLE_GRID_CELL_SIZE);

    // 初始天气(dynamic:运行时随机,服务端权威)
    this.weather = this.rollWeather();
    this.dayPhase = phaseAt(Date.now(), GameConfig.DAY_CYCLE_MS).phase;

    this.movement = new MovementSystem(this);
    this.chat = new ChatSystem(this);
    this.combat = new CombatSystem(this);
    this.skills = new SkillSystem(this, this.combat);
    this.enemyAI = new EnemyAISystem(this);
    this.npcAgent = new NpcAgentSystem(this);

    // 按难度带刷怪:每条带在带内随机取该带允许的种类,并套用该带的属性倍率
    // (深层带怪更硬更值钱)。落点用带内拒绝采样避障,与 findSafeSpawn 同一思路。
    this.spawnEnemiesByZone();
    this.spawnLlmNpcs();

    this.timer = new GameTimer(GameConfig.TICK_RATE, (dt) => this.tick(dt));
    this.nextHpPackAt = Date.now() + GameConfig.HP_PACK_INTERVAL;
  }

  /** 按配置组装持久化后端:开启时 Redis(热)+ SQLite(冷)双层,关闭时空后端(纯内存)。 */
  private static createBackend(): PersistenceBackend {
    if (!GameConfig.PERSIST_ENABLED) return new NullBackend();
    return new TieredBackend(
      new RedisBackend(GameConfig.REDIS_URL, GameConfig.REDIS_KEY_PREFIX, GameConfig.REDIS_TTL_SEC),
      new SqliteBackend(GameConfig.SQLITE_PATH),
    );
  }

  /** 连接持久层(建表 / 连 Redis);须在 start() 前 await,确保首个玩家能读到存档。 */
  async initPersistence(): Promise<void> {
    await this.playerStore.init();
  }

  start(): void {
    this.timer.start();
    // 启动 write-behind:周期快照在线玩家写回持久层
    this.playerStore.startFlushLoop(() => this.players.values());
    // 天气定时重掷 + 广播(dynamic 生成的运行时驱动)
    this.weatherTimer = setInterval(() => {
      this.weather = this.rollWeather();
      this.broadcastWeather();
    }, GameConfig.WEATHER_CHANGE_INTERVAL);
    logger.info(`GameWorld started | tick rate: ${GameConfig.TICK_RATE}Hz | map: ${GameConfig.MAP_WIDTH}x${GameConfig.MAP_HEIGHT} | obstacles: ${this.obstacles.length} | enemies: ${this.enemies.size} | weather: ${this.weather.kind}`);
  }

  /** 关服:停循环 → 快照所有在线玩家做最终写回 → 关闭持久层连接。 */
  async stop(): Promise<void> {
    this.timer.stop();
    if (this.weatherTimer) {
      clearInterval(this.weatherTimer);
      this.weatherTimer = null;
    }
    this.playerStore.stopFlushLoop();
    // 最终写回:把所有在线玩家的当前状态快照并落库
    for (const player of this.players.values()) this.playerStore.snapshot(player);
    await this.playerStore.flush([...this.players.values()].map(p => p.token));
    await this.playerStore.close();
    logger.info('GameWorld stopped');
  }

  /** 昼夜时钟:算当前相位,切换时广播 s_time(功能7) */
  private updateDayNight(now: number): void {
    const { phase } = phaseAt(now, GameConfig.DAY_CYCLE_MS);
    if (phase === this.dayPhase) return;
    this.dayPhase = phase;
    this.broadcastAll(MsgType.TIME_OF_DAY, { phase, cycleMs: GameConfig.DAY_CYCLE_MS });
    logger.info(`Day/Night → ${phase}`);
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

  async addPlayer(player: Player): Promise<void> {
    // 有存档(掉线重连 / 换标签页 / 服务端重启后)→ 恢复上次位置、血量、装备、探索进度;否则随机安全出生点
    // load 走「内存缓存 → Redis 热层 → SQLite 冷层」,是 join 链路上唯一的异步点(热路径 tick 不受影响)
    const saved = await this.playerStore.load(player.token);
    if (saved) {
      player.position = { x: saved.x, y: saved.y };
      // 先恢复等级/经验,再 equip:等级加成会叠加到攻击力上
      player.level = saved.level ?? 1;
      player.xp = saved.xp ?? 0;
      player.maxHp = saved.maxHp;
      player.hp = saved.hp;
      player.facing = saved.facing;
      player.isDead = false;
      player.equip(saved.weapon);
      if (saved.explored) {
        player.exploration = ExplorationMap.fromBase64(
          saved.explored, player.exploration.cols, player.exploration.rows
        );
      }
      logger.info(`Player "${player.name}" restored @ (${Math.round(saved.x)}, ${Math.round(saved.y)}) with ${saved.weapon}`);
    } else {
      player.position = this.findSafeSpawn(player.radius);
      // 新玩家:预揭开出生点附近区域
      player.exploration.reveal(player.position.x, player.position.y, GameConfig.FOG_REVEAL_RADIUS);
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
      zones: ZONES.map(zonePublicState),
      shelters: SHELTERS.map(shelterPublicState),
      obstacles: this.obstacles,
      enemies: [...this.enemies.values()].map(e => e.toPublicState()),
      drops: [...this.drops.values()].map(d => d.toPublicState()),
      healthPacks: [...this.healthPacks.values()].map(p => p.toPublicState()),
      weather: this.weather,
      timeOfDay: { phase: this.dayPhase, cycleMs: GameConfig.DAY_CYCLE_MS },
      fogGrid: {
        cols: player.exploration.cols,
        rows: player.exploration.rows,
        cellSize: GameConfig.FOG_CELL_SIZE,
        revealRadius: GameConfig.FOG_REVEAL_RADIUS,
        explored: player.exploration.toBase64(),
      },
      skills: DEFAULT_SKILL_IDS,
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
    // 离线前先快照 + 即时写回:下次带同一 token 重连(乃至服务端重启后)即可恢复个人进度
    this.playerStore.snapshot(player);
    this.playerStore.flush([player.token]).catch((err) =>
      logger.error(`[Persist] 下线写回失败: ${(err as Error).message}`)
    );

    this.aoi.removePlayer(player);
    this.players.delete(player.id);
    this.skills.removePlayer(player.id);
    this.nextCampfireHealAt.delete(player.id);

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

    // 昼夜推进(相位切换时广播给所有玩家)
    this.updateDayNight(Date.now());

    // 更新所有玩家的移动 + 揭雾
    for (const player of this.players.values()) {
      if (player.isDead) continue;
      this.movement.update(player, dt);
      player.exploration.reveal(
        player.position.x, player.position.y, GameConfig.FOG_REVEAL_RADIUS
      );
    }

    // 更新敌人 AI + Agent 心情
    this.enemyAI.update(dt);
    this.npcAgent.tick(dt);

    // 掉落物:拾取判定 + TTL 清理
    this.updateDrops(Date.now());
    this.updateHealthPacks(Date.now());
    this.updateCampfires(Date.now());

    // 广播状态更新给各自视野内的玩家
    this.broadcastStates();
  }

  /** 向所有在线玩家广播(掉落物数量少 + 有 TTL 上限,与天气一样走全局广播,简单可靠) */
  private broadcastAll(type: MsgType, data: unknown): void {
    for (const player of this.players.values()) player.session.send(type, data);
  }

  /** 击杀敌人后按几率掉落一件武器(强敌 luck 更高;再叠加所在难度带的 dropLuck) */
  spawnWeaponDrop(enemy: Enemy): void {
    if (Math.random() >= GameConfig.WEAPON_DROP_CHANCE) return;
    const zoneLuck = (ZONES[enemy.zoneId] ?? ZONES[0]!).dropLuck;
    const luck = (DROP_LUCK[enemy.kind] ?? 1) * zoneLuck;
    const kind = rollWeaponDrop(luck);
    const drop = new WeaponDrop(
      kind, enemy.position.x, enemy.position.y,
      GameConfig.WEAPON_DROP_TTL, GameConfig.WEAPON_PICKUP_GRACE
    );
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
      // 拾取宽限期内:先让掉落物在地上可见,暂不允许拾取
      if (now < drop.pickableAt) continue;
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

  /** 每 tick:生命包拾取 + TTL 清理 + 周期性补刷 */
  private updateHealthPacks(now: number): void {
    const R = GameConfig.HP_PACK_PICKUP_RADIUS;
    for (const pack of this.healthPacks.values()) {
      if (now >= pack.expiresAt) {
        this.healthPacks.delete(pack.id);
        this.broadcastAll(MsgType.HP_PACK_PICKUP, { packId: pack.id, byPlayerId: null });
        continue;
      }
      if (now < pack.pickableAt) continue;
      for (const player of this.players.values()) {
        if (player.isDead) continue;
        const dx = player.position.x - pack.position.x;
        const dy = player.position.y - pack.position.y;
        if (Math.hypot(dx, dy) <= R) {
          const healed = player.heal(pack.healAmount);
          this.healthPacks.delete(pack.id);
          this.broadcastAll(MsgType.HP_PACK_PICKUP, {
            packId: pack.id,
            byPlayerId: player.id,
            healed,
            hp: player.hp,
            maxHp: player.maxHp,
          });
          break;
        }
      }
    }
    if (now >= this.nextHpPackAt && this.healthPacks.size < GameConfig.HP_PACK_MAX) {
      this.spawnHealthPack();
      this.nextHpPackAt = now + GameConfig.HP_PACK_INTERVAL;
    }
  }

  private spawnHealthPack(): void {
    const zone = ZONES[Math.floor(Math.random() * ZONES.length)]!;
    const pos = this.findSafeSpawnInZone(zone, GameConfig.HP_PACK_PICKUP_RADIUS);
    const pack = new HealthPack(
      pos.x, pos.y,
      GameConfig.HP_PACK_HEAL,
      GameConfig.HP_PACK_TTL,
      GameConfig.HP_PACK_PICKUP_GRACE,
    );
    this.healthPacks.set(pack.id, pack);
    this.broadcastAll(MsgType.HP_PACK_SPAWN, pack.toPublicState());
    logger.info(`HealthPack spawned @ (${Math.round(pos.x)}, ${Math.round(pos.y)}) zone=${zone.id}`);
  }

  /**
   * 每 tick:站在避难所门口篝火半径内的玩家周期性回血(直到满血)。
   * 复用 s_heal 广播(casterId=null → 客户端只飘绿字、不弹系统消息);
   * 用 nextCampfireHealAt 按玩家节流到 ~1s 一次,离开篝火即清除条目(便于再入场立即回血)。
   */
  private updateCampfires(now: number): void {
    for (const player of this.players.values()) {
      if (player.isDead || !nearCampfire(player.position.x, player.position.y) || player.hp >= player.maxHp) {
        this.nextCampfireHealAt.delete(player.id);
        continue;
      }
      const next = this.nextCampfireHealAt.get(player.id) ?? 0;
      if (now < next) continue;
      const amount = player.heal(GameConfig.CAMPFIRE_HEAL);
      this.nextCampfireHealAt.set(player.id, now + GameConfig.CAMPFIRE_HEAL_INTERVAL);
      if (amount <= 0) continue;
      const msg = {
        targetKind: 'player',
        targetId: player.id,
        hp: player.hp,
        maxHp: player.maxHp,
        amount,
        casterId: null, // 无施法者 → 客户端不弹「治疗」系统消息,仅飘绿字
      };
      player.session.send(MsgType.HEAL, msg);
      for (const other of this.aoi.getNearbyPlayers(player)) {
        if (other.id !== player.id) other.session.send(MsgType.HEAL, msg);
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

  /** 启动时按难度带刷怪:每带 ZONE_ENEMY_COUNT 只,种类从该带 enemyKinds 随机,属性乘 statMult */
  private spawnEnemiesByZone(): void {
    for (const zone of ZONES) {
      const kinds = zone.enemyKinds;
      for (let i = 0; i < ZONE_ENEMY_COUNT; i++) {
        const kind = kinds[Math.floor(Math.random() * kinds.length)] ?? 'slime';
        const radius = new Enemy(kind, 0, 0).radius; // 取该种类碰撞半径用于避障
        const pos = this.findSafeSpawnInZone(zone, radius);
        const enemy = new Enemy(kind, pos.x, pos.y, zone.statMult, zone.id);
        this.enemies.set(enemy.id, enemy);
      }
    }
  }

  /** 在新手草原刷几只 LLM 战术 NPC(行为树执行 + 大模型决策) */
  private spawnLlmNpcs(): void {
    if (!GameConfig.LLM_ENABLED || GameConfig.LLM_NPC_COUNT <= 0) return;

    const zone = ZONES[0]!;
    const personas: Array<{ name: string; personality: string; kind: EnemyKind }> = [
      { name: '守卫·艾伦', personality: '友善但警惕的草原守卫', kind: 'skeleton' },
      { name: '史莱姆贤者', personality: '话多、胆小、爱吐槽', kind: 'slime' },
      { name: '密林斥候', personality: '冷静寡言的侦察者', kind: 'demon' },
    ];

    for (let i = 0; i < GameConfig.LLM_NPC_COUNT; i++) {
      const p = personas[i % personas.length]!;
      const radius = new Enemy(p.kind, 0, 0).radius;
      const pos = this.findSafeSpawnInZone(zone, radius);
      const enemy = new Enemy(p.kind, pos.x, pos.y, 1, zone.id);
      enemy.llmEnabled = true;
      enemy.displayName = p.name;
      enemy.personality = p.personality;
      enemy.llmLastRefresh = 0;
      this.enemies.set(enemy.id, enemy);
    }
    logger.info(`[LLM] 已生成 ${GameConfig.LLM_NPC_COUNT} 只战术 NPC`);
  }

  /** 拒绝采样找一个不与任何障碍物重叠的出生点;新玩家出生在最左的新手带 */
  findSafeSpawn(radius: number): { x: number; y: number } {
    return this.findSafeSpawnInZone(ZONES[0]!, radius);
  }

  /** 在指定难度带内拒绝采样一个不与障碍物重叠的落点(带内边缘留 10% 余量) */
  findSafeSpawnInZone(zone: Zone, radius: number): { x: number; y: number } {
    const { x: zx, y: zy, w, h } = zone.bounds;
    const padX = w * 0.08, padY = h * 0.1;
    for (let i = 0; i < 30; i++) {
      const x = zx + padX + Math.random() * (w - padX * 2);
      const y = zy + padY + Math.random() * (h - padY * 2);
      // 避开避难所安全圈:刷怪 / 补给包 / 复活 / 出生点都不落进圈内
      if (isInAnyShelter(x, y)) continue;
      const blocked = this.obstacleGrid.queryNearby(x, y, radius).some(o => {
        return Math.hypot(x - o.x, y - o.y) < o.radius + radius;
      });
      if (!blocked) return { x, y };
    }
    // 兜底:带中心(即便重叠,下一 tick 会被推出)
    return { x: zx + w / 2, y: zy + h / 2 };
  }

  /** 敌人复活落点:回到它所属的难度带内(避免深渊巨龙复活到新手区) */
  respawnPointFor(enemy: Enemy): { x: number; y: number } {
    const zone = ZONES[enemy.zoneId] ?? ZONES[0]!;
    return this.findSafeSpawnInZone(zone, enemy.radius);
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
