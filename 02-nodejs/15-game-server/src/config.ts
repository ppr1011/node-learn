export const GameConfig = {
  PORT: 4000,

  // 游戏世界
  MAP_WIDTH: 3000,
  MAP_HEIGHT: 2000,
  TICK_RATE: 20, // 每秒 20 次逻辑更新

  // AOI
  AOI_CELL_SIZE: 500, // 每个格子 500px

  // 碰撞 / 障碍物(服务端权威生成 + 下发)
  PLAYER_RADIUS: 16, // 玩家碰撞半径(与客户端渲染半径一致)
  OBSTACLE_SEED: 20260703, // 确定性种子,保证前后端/多客户端布局一致
  OBSTACLE_GRID_CELL_SIZE: 500, // 障碍物空间网格格子大小
  OBSTACLE_GAP: 40, // 障碍物之间保留的最小可通行间隙
  // 树:树干挡人(小碰撞半径),树冠盖在玩家头顶(大视觉尺寸)
  TREE_COUNT: 55,
  TREE_MIN_SIZE: 30,
  TREE_MAX_SIZE: 56,
  TREE_TRUNK_RATIO: 0.32, // 碰撞半径 = size * 该比例(只挡树干)
  // 石:整块挡人(碰撞半径 ≈ 视觉半径)
  ROCK_COUNT: 26,
  ROCK_MIN_RADIUS: 34,
  ROCK_MAX_RADIUS: 84,

  // 网络
  HEARTBEAT_INTERVAL: 5000,
  HEARTBEAT_TIMEOUT: 15000,
  RATE_LIMIT_MAX: 30, // 最大令牌数
  RATE_LIMIT_REFILL: 20, // 每秒恢复令牌

  // 游戏规则
  MAX_CHAT_LENGTH: 100,
  RESPAWN_TIME: 3000, // 死亡后 3 秒复活
} as const;
