export const GameConfig = {
  PORT: 4000,

  // 游戏世界
  // 沿 x 轴切成 4 条难度带(见 core/Zone.ts,每带 3000 宽)→ 越往右怪越强
  MAP_WIDTH: 12000,
  MAP_HEIGHT: 4000,
  TICK_RATE: 20, // 每秒 20 次逻辑更新

  // AOI
  AOI_CELL_SIZE: 500, // 每个格子 500px

  // 碰撞 / 障碍物(服务端权威生成 + 下发)
  PLAYER_RADIUS: 16, // 玩家碰撞半径(与客户端渲染半径一致)
  OBSTACLE_SEED: 20260703, // 确定性种子,保证前后端/多客户端布局一致
  OBSTACLE_GRID_CELL_SIZE: 500, // 障碍物空间网格格子大小
  OBSTACLE_GAP: 40, // 障碍物之间保留的最小可通行间隙
  // 树:树干挡人(小碰撞半径),树冠盖在玩家头顶(大视觉尺寸)
  // 数量随地图面积翻倍(6000×4000 → 12000×4000)同步翻倍,保持密度一致
  TREE_COUNT: 440,
  TREE_MIN_SIZE: 30,
  TREE_MAX_SIZE: 56,
  TREE_TRUNK_RATIO: 0.32, // 碰撞半径 = size * 该比例(只挡树干)
  // 石:整块挡人(碰撞半径 ≈ 视觉半径)
  ROCK_COUNT: 208,
  ROCK_MIN_RADIUS: 34,
  ROCK_MAX_RADIUS: 84,

  // 网络
  HEARTBEAT_INTERVAL: 5000,
  HEARTBEAT_TIMEOUT: 15000,
  RATE_LIMIT_MAX: 60, // 最大令牌数(桶容量)
  RATE_LIMIT_REFILL: 30, // 每秒恢复令牌(move 20/s + attack 4.5/s + 余量)

  // 游戏规则
  MAX_CHAT_LENGTH: 100,
  RESPAWN_TIME: 3000, // 死亡后 3 秒复活

  // 天气(统一生成框架的 dynamic 示例:服务端定时重掷 + 广播,多端一致)
  WEATHER_KINDS: ['clear', 'rain', 'fog', 'snow'] as const, // 第一个约定为 clear
  WEATHER_MIN_INTENSITY: 0.35,
  WEATHER_MAX_INTENSITY: 1,
  WEATHER_CHANGE_INTERVAL: 30000, // 每 30 秒重掷一次天气

  // 敌人:实际按区域分带生成(见 core/Zone.ts 的 ZONE_ENEMY_COUNT × 带数);
  // 此处 ENEMY_COUNT 仅作旧 spawner 骨架的兜底占位,GameWorld 已不用它刷怪
  ENEMY_COUNT: 50,
  ENEMY_GAP: 30,
  ENEMY_RADIUS: 14,
  ENEMY_HP: 40,
  ENEMY_SPEED: 120,
  ENEMY_KINDS: ['slime', 'skeleton', 'demon'] as const,
  ENEMY_RESPAWN_TIME: 10000, // 10s 后原地复活

  ITEM_COUNT: 0,
  ITEM_GAP: 20,
  ITEM_RADIUS: 8,
  ITEM_VALUE: 10,
  ITEM_KINDS: ['coin', 'potion'] as const,

  // 武器掉落(击杀敌人 → 加权随机掉落 → 走过自动拾取装备)
  // 武器数值本身在 core/Weapon.ts,这里只放掉落调参旋钮
  WEAPON_DROP_CHANCE: 0.7, // 每次击杀的掉落概率(调高,让掉落更可见)
  WEAPON_PICKUP_RADIUS: 26, // 玩家中心多近算拾取
  WEAPON_PICKUP_GRACE: 700, // 掉落后多久才可被拾取(ms):留出时间让掉落物在地上可见,避免贴身击杀瞬间被吞
  WEAPON_DROP_TTL: 45000, // 掉落物存活时长(ms),超时自然消失

  // 迷雾探索
  FOG_CELL_SIZE: 100,       // 探索网格粒度(px)
  FOG_REVEAL_RADIUS: 400,   // 玩家视野揭雾半径(px)

  // LLM 战术 NPC(行为树 + DeepSeek 大模型大脑)
  // 默认接 DeepSeek 官方 API: https://api-docs.deepseek.com/zh-cn/
  LLM_ENABLED: true,
  LLM_API_URL: process.env.LLM_API_URL ?? 'https://api.deepseek.com/chat/completions',
  LLM_API_KEY: process.env.DEEPSEEK_API_KEY ?? process.env.LLM_API_KEY ?? '',
  LLM_MODEL: process.env.LLM_MODEL ?? 'deepseek-v4-flash',
  LLM_DECISION_INTERVAL_MS: 4000, // 定时战术刷新间隔(聊天可立即触发)
  LLM_NPC_COUNT: 2,             // 新手草原固定刷几只 LLM 守卫
  LLM_MEMORY_MAX: 16,           // 每个 NPC episodic 记忆条数上限
} as const;
