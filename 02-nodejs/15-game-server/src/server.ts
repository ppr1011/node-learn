import './loadEnv';
import { GameWorld } from './core/GameWorld';
import { GameWebSocketServer } from './network/WebSocketServer';
import { GameConfig } from './config';
import { logger } from './utils/Logger';

const world = new GameWorld();
let server: GameWebSocketServer;
let statsInterval: ReturnType<typeof setInterval>;

// 先连接持久层(建表 / 连 Redis),再开端口接客 —— 否则首个玩家读档会落空当成新号
async function bootstrap(): Promise<void> {
  await world.initPersistence();

  server = new GameWebSocketServer(world);
  world.start();

  // 定期打印服务器状态
  statsInterval = setInterval(() => {
    const stats = world.getStats();
    logger.info(`[Stats] online: ${stats.online} | tick: ${stats.avgTickTime}ms | mem: ${stats.memoryMB}MB`);
  }, 10000);
}

// 优雅关停:停接客 → 最终写回 + 关闭持久层(world.stop 内含)→ 退出
let shuttingDown = false;
async function gracefulShutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`Received ${signal}, shutting down gracefully...`);

  // 停止接受新连接
  server?.shutdown();

  // 停止游戏循环 + 最终写回持久层
  await world.stop();

  // 清除定时器
  if (statsInterval) clearInterval(statsInterval);

  logger.info('Server stopped. Goodbye!');
  process.exit(0);
}

process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => void gracefulShutdown('SIGINT'));

// 未捕获异常处理
process.on('uncaughtException', (err) => {
  logger.error(`Uncaught exception: ${err.message}\n${err.stack}`);
  void gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason) => {
  logger.error(`Unhandled rejection: ${reason}`);
});

logger.info(`=== MMO-Lite Game Server ===`);
logger.info(`Port: ${GameConfig.PORT} | Map: ${GameConfig.MAP_WIDTH}x${GameConfig.MAP_HEIGHT}`);
if (GameConfig.LLM_ENABLED) {
  const mode = GameConfig.LLM_LOCAL_ENABLED
    ? `LLM(Local, ${GameConfig.LLM_LOCAL_MODEL} @ Ollama)`
    : GameConfig.LLM_API_KEY
      ? `DeepSeek(${GameConfig.LLM_MODEL})`
      : 'LLM(Mock, 请配置 .env 中的 DEEPSEEK_API_KEY 或 LLM_LOCAL_ENABLED=1)';
  logger.info(`AI: BehaviorTree + ${mode} | NPCs: ${GameConfig.LLM_NPC_COUNT}`);
}
logger.info(`Open client/index.html in browser to play`);

// 启动(连持久层 → 开端口 → 起循环)
bootstrap().catch((err) => {
  logger.error(`Bootstrap failed: ${err.message}\n${err.stack}`);
  process.exit(1);
});
