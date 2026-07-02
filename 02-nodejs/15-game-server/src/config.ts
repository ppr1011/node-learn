export const GameConfig = {
  PORT: 4000,

  // 游戏世界
  MAP_WIDTH: 3000,
  MAP_HEIGHT: 2000,
  TICK_RATE: 20, // 每秒 20 次逻辑更新

  // AOI
  AOI_CELL_SIZE: 500, // 每个格子 500px

  // 网络
  HEARTBEAT_INTERVAL: 5000,
  HEARTBEAT_TIMEOUT: 15000,
  RATE_LIMIT_MAX: 30, // 最大令牌数
  RATE_LIMIT_REFILL: 20, // 每秒恢复令牌

  // 游戏规则
  MAX_CHAT_LENGTH: 100,
  RESPAWN_TIME: 3000, // 死亡后 3 秒复活
} as const;
