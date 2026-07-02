# 15 - Node.js 游戏服务器开发

本章将带你从零构建一个 MMO-Lite 游戏服务器，深入理解游戏后台的核心难点、工程挑战和服务稳定性保障。

## 目录

- [快速开始](#快速开始)
- [架构总览](#架构总览)
- [第一部分：游戏后台核心难点](#第一部分游戏后台核心难点)
- [第二部分：工程挑战](#第二部分工程挑战)
- [第三部分：服务稳定性](#第三部分服务稳定性)
- [Demo 功能说明](#demo-功能说明)
- [代码结构详解](#代码结构详解)
- [扩展思考](#扩展思考)

---

## 快速开始

```bash
cd 02-nodejs/15-game-server
npm install
npm start
```

然后在浏览器打开 `client/index.html`，多开几个标签页就能看到多人同步效果。

- **WASD** / 方向键：移动
- **空格**：攻击（近距离自动瞄准最近目标）
- **Enter**：发送聊天消息

---

## 架构总览

```
┌──────────────┐     WebSocket      ┌────────────────────────────────────┐
│   Browser    │ ◄────────────────► │         Game Server                │
│  (Canvas +   │                    │                                    │
│   Input)     │                    │  ┌──────────┐   ┌──────────────┐  │
└──────────────┘                    │  │ Network  │──►│  GameWorld   │  │
                                    │  │  Layer   │   │              │  │
┌──────────────┐                    │  │          │   │ ┌──────────┐ │  │
│   Browser    │ ◄────────────────► │  │ Session  │   │ │   AOI    │ │  │
└──────────────┘                    │  │ Protocol │   │ │ Manager  │ │  │
                                    │  │ Rate Lim │   │ └──────────┘ │  │
┌──────────────┐                    │  └──────────┘   │              │  │
│   Browser    │ ◄────────────────► │                 │ ┌──────────┐ │  │
└──────────────┘                    │  ┌──────────┐   │ │ Systems  │ │  │
                                    │  │  Timer   │──►│ │Move/Chat │ │  │
                                    │  │  (Tick)  │   │ │ /Combat  │ │  │
                                    │  └──────────┘   │ └──────────┘ │  │
                                    │                 └──────────────┘  │
                                    └────────────────────────────────────┘
```

### 核心设计理念

1. **服务器权威**（Server Authoritative）：所有游戏逻辑在服务器运行，客户端只负责展示和输入
2. **固定频率 Tick**：服务器以 20Hz 固定频率更新世界状态
3. **AOI 优化**：九宫格算法减少无效网络广播

---

## 第一部分：游戏后台核心难点

### 1. 实时状态同步

游戏服务器与 Web 后台最大的区别：**状态是连续变化的**。

Web 后台是请求-响应模型，客户端发一个请求、服务器返一个响应。而游戏服务器需要持续广播世界状态给所有玩家，每秒 20+ 次。

```
传统 Web：  Client → Request → Server → Response → Client（一次性）
游戏服务器：Client → Input → Server → Broadcast → All Clients（持续循环）
```

**服务器权威模式**（本 Demo 采用）：

```typescript
// 客户端只发送意图（"我要向右走"），不直接修改坐标
// 服务器负责校验和计算最终位置
handleInput(player, data) {
  const { dx, dy } = data;
  // 归一化 + 速度限制，防止客户端发送非法速度
  const len = Math.sqrt(dx * dx + dy * dy);
  player.velocity = {
    x: (dx / len) * player.speed,  // 服务器决定最终速度
    y: (dy / len) * player.speed,
  };
}
```

**为什么不让客户端直接同步坐标？**
- 客户端可以被篡改（外挂），发送虚假坐标
- 多个客户端对同一状态的修改可能冲突
- 服务器无法做碰撞检测和规则校验

### 2. AOI (Area of Interest) — 兴趣区域管理

**问题**：假设有 1000 个玩家在线，每人每秒移动产生 20 次状态更新。如果每次都广播给所有人：`1000 × 1000 × 20 = 2000 万次/秒`，网络根本扛不住。

**解决方案：九宫格 AOI**

将地图划分为固定大小的格子（本 Demo 为 500×500 像素）。每个玩家只需要知道自己所在格子及相邻 8 个格子（九宫格）内的玩家动态。

```
┌─────┬─────┬─────┬─────┬─────┐
│     │     │     │     │     │
├─────┼─────┼─────┼─────┼─────┤
│     │ NW  │  N  │ NE  │     │
├─────┼─────┼─────┼─────┼─────┤
│     │  W  │ [P] │  E  │     │   P 只关心周围 9 格
├─────┼─────┼─────┼─────┼─────┤
│     │ SW  │  S  │ SE  │     │
├─────┼─────┼─────┼─────┼─────┤
│     │     │     │     │     │
└─────┴─────┴─────┴─────┴─────┘
```

**关键实现**：当玩家跨越格子边界时，计算新旧九宫格的差集，得到 enter/leave 事件。

```typescript
updatePlayer(player) {
  const [newCx, newCy] = this.getCellCoords(player.position.x, player.position.y);
  if (newCx === player.aoiCellX && newCy === player.aoiCellY) return; // 没跨格

  // 计算差集
  const oldNeighbors = this.getNeighborPlayers(oldCx, oldCy);
  const newNeighbors = this.getNeighborPlayers(newCx, newCy);
  // entered = newNeighbors - oldNeighbors
  // left    = oldNeighbors - newNeighbors
}
```

**效果**：广播量从 O(N²) 降到 O(N × K)，K 是单格平均玩家数。

### 3. 游戏主循环 (Game Loop / Tick)

传统 Web 服务器是**事件驱动**的：有请求才处理。游戏服务器需要**主动推进时间**：即使没有玩家操作，世界也在运转（怪物巡逻、BUFF 倒计时、物理模拟等）。

```typescript
// 固定频率 Tick（本 Demo 20Hz = 每 50ms 一次）
class GameTimer {
  start() {
    this.timer = setInterval(() => {
      const elapsed = Date.now() - this.lastTime;
      this.accumulator += elapsed;

      // 固定步长更新，保证物理模拟稳定
      while (this.accumulator >= intervalMs) {
        this.onTick(intervalMs);  // 固定 50ms 的 deltaTime
        this.accumulator -= intervalMs;
      }

      // 防止螺旋死亡：如果积累太多帧，直接丢弃
      if (this.accumulator > intervalMs * 5) {
        this.accumulator = 0;
      }
    }, intervalMs);
  }
}
```

**为什么不用 `setInterval(tick, 50)` 直接跑？**

`setInterval` 不保证精确间隔。如果某一 tick 耗时过长（比如 80ms），下一个 tick 会延迟，导致物理模拟不稳定。`accumulator` 模式确保逻辑更新步长恒定。

**螺旋死亡（Spiral of Death）**：当 tick 处理时间 > tick 间隔时间，accumulator 不断增长，每次需要补更多帧，越补越多。解决方案：设置上限，超过就直接丢弃。

### 4. 协议设计

本 Demo 使用 JSON 格式方便学习，但生产环境需要考虑：

| 方案 | 优点 | 缺点 | 适用场景 |
|------|------|------|----------|
| JSON | 可读、调试方便 | 体积大、序列化慢 | 开发/低频消息 |
| Protocol Buffers | 小体积、强类型、跨语言 | 需要编译 .proto 文件 | 生产环境首选 |
| FlatBuffers | 零拷贝、极快 | 使用复杂 | 超高频消息 |
| 自定义二进制 | 最小体积 | 维护困难 | 特殊场景 |

**消息结构设计原则**：
```typescript
// 好的设计：消息类型 + 数据分离
{ type: "c_move", data: { dx: 1, dy: 0 } }

// 坏的设计：每种消息不同结构
{ action: "move", x: 1, y: 0, player: "abc" }
```

### 5. 数据一致性

多个玩家同时操作同一目标时，可能产生竞态条件：

```
玩家A 攻击怪物（HP=10, 伤害=8）→ HP 应该 = 2
玩家B 攻击怪物（HP=10, 伤害=8）→ HP 应该 = 2
实际结果应该是 HP = -6（死亡），而非两个独立的 HP=2
```

**解决方案**：
- 单线程模型（Node.js 天然优势）：所有逻辑在同一线程执行，无需加锁
- Tick 内顺序执行：同一 tick 内的操作按顺序处理，保证一致
- 对于持久化数据：使用乐观锁 + 版本号

---

## 第二部分：工程挑战

### 1. 高并发连接管理

Node.js 单进程理论上可以维持数万 WebSocket 连接，但实际受限于：

- **内存**：每个连接需要维护 Session、Player 对象、消息缓冲区
- **CPU**：每次 tick 需要遍历所有玩家进行状态更新
- **GC 压力**：大量小对象（消息、临时数组）触发频繁 GC，导致卡顿

```typescript
// 估算内存占用
// 每个玩家约 2KB（Session + Player + AOI tracking）
// 1000 玩家 ≈ 2MB
// 10000 玩家 ≈ 20MB（对象本身不大，但 GC 扫描代价高）
```

**应对策略**：
- 对象池复用，减少 GC 压力
- 消息批量发送，减少系统调用
- 根据负载动态调整 tick rate

### 2. 网络延迟与抖动

互联网延迟通常 20~200ms，且不稳定。游戏需要在延迟下提供流畅体验：

**客户端预测**：客户端收到输入后立即在本地模拟移动，不等服务器确认。如果服务器结果与预测不一致，平滑修正。

```javascript
// 客户端插值（本 Demo 实现）
if (p.targetX !== undefined) {
  p.x += (p.targetX - p.x) * 0.3;  // 平滑过渡到服务器坐标
  p.y += (p.targetY - p.y) * 0.3;
}
```

**断线重连**：
```typescript
// 心跳检测 —— 服务器定期检查最后活动时间
if (now - session.lastActivity > HEARTBEAT_TIMEOUT) {
  session.close();           // 关闭连接
  world.removePlayer(player); // 清理游戏状态
}
```

### 3. 反作弊

客户端不可信。常见外挂手段及防御：

| 外挂类型 | 手段 | 防御 |
|----------|------|------|
| 加速 | 修改速度值 | 服务器固定速度，忽略客户端速度 |
| 瞬移 | 直接发送目标坐标 | 服务器只接受方向，自己计算位置 |
| 刷攻击 | 绕过冷却时间 | 服务器验证 lastAttackTime |
| 消息轰炸 | 高频发包 | 令牌桶限流 |

```typescript
// 本 Demo 的反作弊措施：
// 1. 速度由服务器决定
player.velocity = { x: (dx/len) * player.speed, ... };

// 2. 攻击冷却服务端验证
canAttack(): boolean {
  return (Date.now() - this.lastAttackTime) >= this.attackCooldown;
}

// 3. 令牌桶限流
class RateLimiter {
  consume(count = 1): boolean {
    this.refill();
    if (this.tokens >= count) { this.tokens -= count; return true; }
    return false; // 超限，拒绝处理
  }
}
```

### 4. 热更新

生产环境不能随便重启服务器（会断开所有玩家）。常见热更方式：

- **配置热加载**：监听配置文件变化，运行时替换
- **模块热替换**：清除 `require.cache`，重新加载逻辑模块
- **灰度切换**：新老服务器并存，逐步迁移玩家

### 5. 分布式扩展

单服务器的连接数和 CPU 存在上限，需要横向扩展：

```
                    ┌─────────────┐
                    │  Gateway    │  负载均衡，路由到正确的 GameServer
                    └──────┬──────┘
              ┌────────────┼────────────┐
              ▼            ▼            ▼
      ┌──────────┐  ┌──────────┐  ┌──────────┐
      │ Game-01  │  │ Game-02  │  │ Game-03  │   每台负责地图的一个区域
      │ (0,0)~   │  │ (1000,0) │  │ (2000,0) │
      │ (1000,   │  │ ~(2000,  │  │ ~(3000,  │
      │  1000)   │  │  1000)   │  │  1000)   │
      └──────────┘  └──────────┘  └──────────┘
              │            │            │
              └────────────┼────────────┘
                           ▼
                    ┌─────────────┐
                    │   Redis     │   跨服通信、共享状态
                    └─────────────┘
```

Node.js 的 `cluster` 模块或 `worker_threads` 可以利用多核，但跨进程状态共享需要额外方案（Redis、共享内存）。

---

## 第三部分：服务稳定性

### 1. 心跳检测

**问题**：TCP 连接断开时，如果没有主动关闭（比如网络中断、客户端崩溃），服务器可能永远感知不到。这些"僵尸连接"会持续占用资源。

```typescript
// 本 Demo 的实现
const HEARTBEAT_INTERVAL = 5000;  // 每 5 秒检查一次
const HEARTBEAT_TIMEOUT = 15000;  // 15 秒无活动视为断线

startHeartbeat() {
  setInterval(() => {
    for (const [id, session] of this.sessions) {
      if (now - session.lastActivity > HEARTBEAT_TIMEOUT) {
        session.close();
        this.handleDisconnect(id);
      }
    }
  }, HEARTBEAT_INTERVAL);
}
```

**客户端配合**：定期发送 ping 消息，既保持连接活跃，又能测量延迟。

### 2. 优雅关停 (Graceful Shutdown)

直接 `kill -9` 会导致：玩家数据丢失、连接异常断开、资源未释放。

```typescript
function gracefulShutdown(signal: string) {
  logger.info(`Received ${signal}, shutting down...`);

  // 1. 停止接受新连接
  server.shutdown();

  // 2. 停止游戏循环
  world.stop();

  // 3. 通知所有在线玩家（生产环境应该持久化数据）
  // 4. 等待进行中的操作完成
  // 5. 清理资源

  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
```

### 3. 限流与背压

**令牌桶算法**（本 Demo 采用）：

```
令牌桶：最大 30 个令牌，每秒恢复 20 个

正常玩家：每秒约 20 条消息（移动指令），刚好不会超限
外挂/恶意客户端：每秒 100+ 条消息，很快耗尽令牌，被拒绝

┌─────────────────────────┐
│  Bucket (max: 30)       │
│  ████████████████░░░░░░ │  ← 消耗中
│  ←── refill: 20/sec ──→ │
└─────────────────────────┘
```

**背压**：当服务器处理不过来时，不能无限缓冲消息（会 OOM），需要：
- 设置发送队列上限
- 超限时丢弃非关键消息（如频繁的位置更新保留最新一条）
- 极端情况断开连接

### 4. 内存管理

Node.js 的 GC 是 stop-the-world 的，大量小对象会导致帧卡顿：

**对象池**：预分配对象，用完回收而非创建新的
```typescript
// 概念示例（本 Demo 未实现，生产环境建议使用）
class ObjectPool<T> {
  private pool: T[] = [];

  acquire(): T {
    return this.pool.pop() || this.create();
  }

  release(obj: T): void {
    this.reset(obj);
    this.pool.push(obj);
  }
}
```

**避免闭包泄漏**：
```typescript
// 危险：闭包引用了大对象
setTimeout(() => {
  // 这里引用了 player 对象
  // 即使 player 已离线，也不会被 GC
  doSomething(player);
}, 3000);

// 安全：通过 ID 查找，不持有引用
setTimeout(() => {
  const player = this.world.players.get(playerId);
  if (!player) return; // 已离线，直接返回
  doSomething(player);
}, 3000);
```

### 5. 监控告警

生产环境必须有以下监控指标：

| 指标 | 含义 | 告警阈值 |
|------|------|----------|
| 在线人数 | 当前连接数 | 接近单机上限 |
| Tick 耗时 | 单次 tick 处理时间 | > tick 间隔的 80% |
| 内存使用 | heapUsed | > 可用内存的 70% |
| 消息队列长度 | 待发送消息数 | 持续增长 |
| WebSocket 错误率 | 连接异常比例 | > 5% |

```typescript
// 本 Demo 的简单监控
getStats() {
  return {
    online: this.players.size,
    avgTickTime: this.timer.avgTickTime,
    memoryMB: process.memoryUsage().heapUsed / 1024 / 1024,
  };
}
```

---

## Demo 功能说明

| 功能 | 描述 | 对应核心知识 |
|------|------|-------------|
| 多人同步移动 | WASD 控制，服务器权威 | 状态同步、服务器权威 |
| AOI 视野管理 | 只能看到附近格子的玩家 | 九宫格 AOI |
| 范围聊天 | 只有附近的人能看到消息 | AOI 应用 |
| 近战攻击 | 空格攻击最近目标 | 冷却时间、服务端校验 |
| 死亡复活 | HP 归零后 3 秒自动复活 | 状态管理 |
| 心跳检测 | 15 秒无响应断开 | 连接健康管理 |
| 限流保护 | 令牌桶限制消息频率 | 反作弊、稳定性 |
| 优雅关停 | Ctrl+C 正确清理 | 进程管理 |

---

## 代码结构详解

```
src/
├── server.ts              # 入口：启动世界、WebSocket、注册信号处理
├── config.ts              # 所有可调参数集中管理
├── core/
│   ├── Entity.ts          # 基础实体（id、位置、速度）
│   ├── Player.ts          # 玩家（HP、攻击、AOI 信息）
│   ├── AOI.ts             # 九宫格算法实现
│   └── GameWorld.ts       # 世界管理（Tick循环、玩家管理、状态广播）
├── network/
│   ├── Protocol.ts        # 消息类型定义、编解码
│   ├── Session.ts         # 单个连接的抽象（心跳、限流、发送）
│   └── WebSocketServer.ts # WebSocket 服务器（连接管理、消息路由）
├── systems/
│   ├── MovementSystem.ts  # 移动：方向输入 → 速度 → 位置更新 → 边界限制
│   ├── ChatSystem.ts      # 聊天：范围广播
│   └── CombatSystem.ts    # 战斗：攻击判定、伤害、死亡、复活
└── utils/
    ├── Timer.ts           # 高精度游戏定时器（防螺旋死亡）
    ├── Logger.ts          # 带时间戳的日志
    └── RateLimiter.ts     # 令牌桶限流
```

---

## 扩展思考

学完本章后，你可以尝试：

1. **添加持久化**：用 Redis 存储玩家数据，支持断线重连恢复状态
2. **引入 Protobuf**：将 JSON 协议替换为二进制协议，对比性能差异
3. **多进程扩展**：用 `cluster` 模块启动多个 worker，配合 Redis 做跨进程通信
4. **增加 NPC/怪物**：实现简单 AI（巡逻、追击），体会 tick 驱动的 AI 设计
5. **地图障碍物**：增加碰撞检测，理解空间分割数据结构
6. **录像/回放**：记录所有输入，实现确定性回放
7. **压力测试**：编写机器人客户端，测试服务器极限

---

## 参考资源

- [Game Programming Patterns](https://gameprogrammingpatterns.com/) — 游戏编程模式
- [Source Multiplayer Networking](https://developer.valvesoftware.com/wiki/Source_Multiplayer_Networking) — Valve 的网络同步方案
- [Fast-Paced Multiplayer](https://www.gabrielgambetta.com/client-server-game-architecture.html) — 客户端预测详解
- [Node.js `ws` library](https://github.com/websockets/ws) — 本 Demo 使用的 WebSocket 库
