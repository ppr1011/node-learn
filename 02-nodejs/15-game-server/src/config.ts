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

  // ── 状态持久化(冷热双层:Redis 热存 + SQLite 冷存,write-behind 写回)──────
  // 让玩家进度活得比进程久:重启服务端后带同一 token 重连即可恢复位置/血量/武器/等级/迷雾。
  // 世界本身用确定性种子重建,无需持久化;只落库「角色个人进度」。
  PERSIST_ENABLED: process.env.PERSIST_ENABLED !== '0', // 0 = 关闭(退回纯内存旧行为)
  PERSIST_FLUSH_MS: 5000,                               // 每 5s 快照在线玩家批量写回(write-behind)
  REDIS_URL: process.env.REDIS_URL ?? 'redis://127.0.0.1:6379', // 热层;连不上自动降级为纯 SQLite
  REDIS_KEY_PREFIX: process.env.REDIS_KEY_PREFIX ?? 'game:player:',
  REDIS_TTL_SEC: Number(process.env.REDIS_TTL_SEC) || 0, // 0 = 热层不过期(账本);>0 给活跃态设 TTL
  SQLITE_PATH: process.env.SQLITE_PATH ?? 'data/players.db', // 冷层永久账本(单文件,进程外存活)

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

  // 生命补给包(战场随机刷新,走近自动拾取回血)
  HP_PACK_MAX: 3,            // 地图上同时最多 N 个补给包
  HP_PACK_INTERVAL: 25000,   // 每 25s 尝试补刷一个(未满上限时)
  HP_PACK_HEAL: 40,          // 每包回复血量
  HP_PACK_TTL: 60000,        // 无人拾取 60s 后自然消失
  HP_PACK_PICKUP_RADIUS: 30, // 走到距包中心多近算拾取
  HP_PACK_PICKUP_GRACE: 500, // 刷出后 500ms 内不可拾取(让包先在地上「亮相」)

  // 避难所门口篝火(站在篝火半径内周期性回血,直到满血;几何尺寸见 core/Shelter.ts)
  CAMPFIRE_HEAL: 6,            // 每次回复血量
  CAMPFIRE_HEAL_INTERVAL: 1000, // 每 1s 回一次(飘一次绿字)

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
  // ── 省 token:只有「有玩家在场/跟随」才调用 LLM;情形不变则拉长间隔 ──
  LLM_ENGAGE_RANGE_MULT: 1.5,   // 玩家进入 detectionRange×该倍数才算「在场」,值得思考
  LLM_STATIC_HOLD_MULT: 3,      // 情形未变时,决策保持 间隔×该倍数 才重算(静态场景省 ~2/3 调用)
  LLM_MAX_OUTPUT_TOKENS: 160,   // 云端单次决策输出上限(JSON 很小,无需 400)

  // ── 本地模型:开关一开,全部 LLM 调用(战术 + 对话)都走本地 Ollama,不再访问云端 ──
  // 默认关闭;需先 `ollama pull qwen3.5:9b` 并 `ollama serve`,再置 LLM_LOCAL_ENABLED=1
  // 走 Ollama 原生 /api/chat(而非 /v1):唯有它支持 think 开关,关思考后 Qwen3 从 48s→~1s
  LLM_LOCAL_ENABLED: process.env.LLM_LOCAL_ENABLED === '1',
  // ⚠️ 用 127.0.0.1 而非 localhost:Node undici fetch 会先解析到 IPv6 ::1,而 Ollama 默认只监听 IPv4 → ECONNREFUSED
  LLM_LOCAL_URL: process.env.LLM_LOCAL_URL ?? 'http://127.0.0.1:11434/api/chat',
  LLM_LOCAL_MODEL: process.env.LLM_LOCAL_MODEL ?? 'qwen3.5:9b',
  LLM_LOCAL_THINK: process.env.LLM_LOCAL_THINK === '1', // 默认关思考:推理模型思考会慢到分钟级且常截断
  LLM_LOCAL_MAX_TOKENS: 256,    // 关思考后答案就是一小段 JSON,256 足够(开 think 需自行调大)
  // ── 上下文窗口:Ollama 默认 num_ctx 仅 4096,与模型训练上限(如 Qwen 256K)无关 ──
  // 0 = 自动:启动首用时探测该模型 /api/show 的 context_length,按 CAP 收敛(避免直接拉满爆显存)
  // >0 = 手动强制该 num_ctx(单位 token)
  LLM_LOCAL_NUM_CTX: Number(process.env.LLM_LOCAL_NUM_CTX) || 0,
  LLM_LOCAL_NUM_CTX_CAP: Number(process.env.LLM_LOCAL_NUM_CTX_CAP) || 8192, // 自动模式显存安全上限
  LLM_LOCAL_TIMEOUT_MS: 30000,  // 首次调用含模型冷加载,给足超时;超时即回退 Mock,不卡住游戏循环
  LLM_LOG_DIALOGUE: true,       // 后台打印每次 NPC 决策/对话(含实际产出的模型来源)
  LLM_NPC_COUNT: 2,             // 新手草原固定刷几只 LLM 守卫
  LLM_MEMORY_MAX: 16,           // 每个 NPC episodic 记忆条数上限
  LLM_QUEST_DEFAULT_COUNT: 3,   // 默认委托击杀数量
  LLM_QUEST_REWARD_XP: 35,      // 委托完成基础经验
  LLM_HUNT_SEEK_RANGE: 8000,    // NPC 委托狩猎时全图搜索半径(px)
  LLM_RUMOR_MAX: 8,             // 每个难度带传闻条数上限

  // 昼夜日程(功能7):一整天压缩为 DAY_CYCLE_MS 真实时长,循环推进 黎明→白天→黄昏→夜晚
  DAY_CYCLE_MS: 240000,         // 4 分钟一整天(调小便于观察)
  NIGHT_HOME_RADIUS: 260,       // 夜晚离出生点超过此距离则回巢

  // 玩家身份标签 / 声望(功能8)
  REPUTATION_RECOMPUTE_MS: 2000, // 全局声望重算节流间隔
  REPUTATION_SEED_CLAMP: 25,     // 初见态度信任种子的绝对值上限

  // 多 Agent 协作 / 小队(功能9)
  SQUAD_RADIUS: 320,            // 组队所需的 NPC 相互靠近半径
  SQUAD_ANNOUNCE_COOLDOWN_MS: 12000, // leader 播报协调台词的冷却

  // A2A 带路/护送(功能10)
  A2A_GUIDE_ARRIVE_DIST: 120,   // 带路到达目标 NPC 的判定距离
  A2A_ESCORT_MEET_DIST: 100,    // 护送者接到目标 NPC 的判定距离
  A2A_ESCORT_ARRIVE_DIST: 140,  // 护送返回目的地的判定距离
} as const;
