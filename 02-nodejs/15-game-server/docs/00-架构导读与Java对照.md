# 00 · 架构导读 + Node.js/Java 对照（初学者入门）

> 这篇文档专门写给「有 Java 基础、刚入门 Node.js」的你。
> 我们用你熟悉的 Java 概念，把这个游戏服务器从头到尾讲一遍：**它是什么 → 世界观差异 → 整体架构 → 一条消息的旅程 → 逐模块拆解 → 语法速查**。
>
> 读完你应该能回答三个问题：
> 1. 为什么 Node.js 写游戏服务器不用加锁？
> 2. 这个服务器每秒到底在干什么？
> 3. 每个文件夹里的代码，在 Java 里大概对应什么？

---

## 一、这个游戏是什么

一个 **MMO-Lite（轻量多人在线）游戏服务器**。玩家用浏览器打开 `client/index.html`，通过 **WebSocket** 长连接连到服务器：

- 多人实时移动（WASD）、近战攻击、聊天
- 敌人 AI（史莱姆/骷髅/恶魔…）、掉落武器、捡装备、升级
- 天气、昼夜、迷雾探索、避难所回血
- 部分 NPC 接了大模型（LLM），能对话、接任务

**一句话技术定位**：服务器是「唯一的裁判」，所有逻辑都在服务器算；浏览器只负责**画面 + 收集输入**。这叫 **服务器权威（Server Authoritative）**，是所有正规联机游戏的根基（否则客户端一改内存就能作弊）。

---

## 二、世界观差异：Node.js vs Java（最重要的一章）

这是 Java 程序员最容易踩坑的地方。**先建立心智模型，后面代码才看得懂。**

### 2.1 单线程事件循环 vs 多线程

| | Java（典型游戏/Web 后台） | Node.js |
|---|---|---|
| 并发模型 | 多线程，一个请求一个线程（或线程池） | **单线程** + 事件循环（Event Loop） |
| 并发安全 | 需要 `synchronized`、`ReentrantLock`、`ConcurrentHashMap` | **几乎不需要锁** |
| 阻塞操作 | 线程阻塞了没关系，还有别的线程 | **一旦阻塞，整个服务器都卡住** |

Node.js 的核心：**你写的所有 JavaScript 代码都跑在同一个线程上**。它靠一个「事件循环」不停地问：「有没有到期的定时器？有没有收到的网络包？有没有完成的磁盘读写？」有就取出来，执行对应的回调函数，执行完再问下一个。

**这带来的第一个红利**：`GameWorld` 里那些 `Map<number, Player>`、共享的敌人列表、天气状态——**完全不用担心线程安全**。因为同一时刻只有一段代码在跑，不可能两个"线程"同时改同一个 `Map`。

> 对比：如果用 Java 写这个 `GameWorld.players`，你几乎一定要用 `ConcurrentHashMap`，还要小心 tick 线程和网络线程同时读写玩家位置。Node.js 里这些问题**根本不存在**。

**这带来的第一个代价**：**绝对不能有阻塞操作**。你不能在 tick 里 `Thread.sleep()`，不能同步读一个大文件，不能跑一个 500ms 的死循环——否则这 500ms 内，**所有玩家都动不了**。所以你会看到代码里所有 I/O（数据库、网络、LLM 请求）都是 `async/await` 异步的。

```
Java 思维：  "开个线程去做这件慢活，主流程继续"
Node 思维：  "发起这件慢活，登记一个'做完了叫我'的回调，主流程立刻返回"
```

### 2.2 async/await 与 Promise vs Future

Node 处理"慢活"（I/O）的方式是 `Promise`（约等于 Java 的 `CompletableFuture`）+ `async/await` 语法糖。

```typescript
// Node.js —— server.ts
async function bootstrap(): Promise<void> {
  await world.initPersistence();   // 等数据库连好（这期间事件循环去干别的）
  server = new GameWebSocketServer(world);
  world.start();
}
```

```java
// Java 近似写法
CompletableFuture<Void> bootstrap() {
    return world.initPersistence()          // 返回一个 future
        .thenRun(() -> {
            server = new GameWebSocketServer(world);
            world.start();
        });
}
// await 就相当于把 .thenRun 的回调地狱拉平成同步写法
```

关键区别：Java 的 `future.get()` 会**阻塞当前线程**；Node 的 `await` **不阻塞线程**，它只是把函数"暂停"，把线程还给事件循环去处理别的事，等结果好了再回来接着执行。

看 `GameWorld.addPlayer`：读存档是异步的（可能要查 Redis/SQLite），所以它 `await this.playerStore.load(...)`。这期间服务器照样在跑 tick、处理别的玩家。

### 2.3 定时器：游戏的心跳

Java 里你会用 `ScheduledExecutorService` 或 `Timer` 做定时任务。Node 里是全局的 `setInterval` / `setTimeout`：

```typescript
setInterval(() => { ... }, 50);   // 每 50ms 执行一次 → 相当于游戏的 20Hz tick
setTimeout(() => { ... }, 3000);  // 3 秒后执行一次 → 死亡 3 秒后复活
```

| Node | Java |
|---|---|
| `setInterval(fn, ms)` | `scheduler.scheduleAtFixedRate(task, 0, ms, MILLISECONDS)` |
| `setTimeout(fn, ms)` | `scheduler.schedule(task, ms, MILLISECONDS)` |
| `clearInterval(id)` | `future.cancel()` |

**注意**：因为单线程，`setInterval(fn, 50)` 并不保证严格每 50ms。如果某次 tick 算了 60ms，下次就晚了。所以本项目专门写了 `GameTimer`（见 4.3）来纠偏。

### 2.4 EventEmitter：万物皆事件

Node 的网络库大量使用「事件监听」模式（观察者模式）。你会反复看到 `.on('事件名', 回调)`：

```typescript
ws.on('message', (raw) => { ... });  // 收到消息时
ws.on('close', () => { ... });        // 连接关闭时
ws.on('error', (err) => { ... });     // 出错时
process.on('SIGINT', () => { ... });  // 按 Ctrl+C 时
```

```java
// Java 类比：注册监听器
webSocket.addMessageListener(msg -> { ... });
webSocket.addCloseListener(() -> { ... });
Runtime.getRuntime().addShutdownHook(new Thread(() -> { ... })); // ≈ process.on('SIGINT')
```

### 2.5 模块系统 vs package/import

| Node/TypeScript | Java |
|---|---|
| 一个 `.ts` 文件 = 一个模块 | 一个 `.java` 文件 |
| `export class Player {}` | `public class Player {}` |
| `import { Player } from './Player'` | `import com.game.Player;` |
| `export const GameConfig = {...}` | `public static final` 常量类 |
| 没有 `package` 声明，用**相对路径**导入 | 用**包名**导入 |

`import { GameWorld } from './core/GameWorld'` 里的 `./` 是**相对当前文件的路径**，不是包名。这点和 Java 很不一样。

### 2.6 npm / package.json vs Maven / pom.xml

```json
// package.json ≈ pom.xml
{
  "dependencies": {          // ≈ <dependencies>
    "ws": "^8.18.0",         // WebSocket 库
    "better-sqlite3": "...", // SQLite 驱动
    "ioredis": "..."         // Redis 客户端
  },
  "scripts": {               // ≈ Maven 的 goal / npm 的快捷命令
    "start": "ts-node src/server.ts"
  }
}
```

- `npm install` ≈ `mvn install`（下载依赖到 `node_modules/`，相当于本地 `.m2` 仓库）
- `npm start` ≈ 运行 `scripts.start` 里那条命令

### 2.7 TypeScript ≈ 加了类型的 JavaScript

这个项目用 **TypeScript**（`.ts`），而不是纯 JS。对 Java 程序员是好消息——TS 的类型系统和 Java 很像：

```typescript
class Player extends Entity {      // 继承，和 Java 一样
  readonly name: string;           // readonly ≈ final
  hp: number = 100;                // 字段带默认值
  private recomputeAttack(): void {}  // 访问修饰符 + 返回类型
}

interface PersistenceBackend {     // 接口，和 Java 一样
  load(token: string): Promise<PersistedPlayer | null>;
}
```

几个差异点：
- 所有数字都是 `number`（没有 int/long/double 之分，底层是 64 位浮点）
- `string | null` 这种 **联合类型** Java 没有（Java 靠 `@Nullable` 或 `Optional`）
- `interface` 可以直接描述"数据的形状"（像 Java 的 record/DTO）
- TS 类型在**编译期**检查，运行时会被抹掉（`ts-node` 帮我们即时编译运行）

---

## 三、整体架构鸟瞰

```
┌─────────────┐   WebSocket    ┌──────────────────────────────────────────┐
│  浏览器客户端  │ ◄───JSON────► │              Node.js 单进程                 │
│ Canvas+输入   │               │                                            │
└─────────────┘               │  ┌─────────────┐   驱动    ┌─────────────┐  │
┌─────────────┐               │  │  网络层      │ ───────► │ GameWorld   │  │
│  浏览器客户端  │ ◄──────────► │  │ WebSocketSrv │          │ (世界总管)   │  │
└─────────────┘               │  │ Session      │          │             │  │
┌─────────────┐               │  │ RateLimiter  │          │ ┌─────────┐ │  │
│  浏览器客户端  │ ◄──────────► │  └─────────────┘          │ │  AOI    │ │  │
└─────────────┘               │  ┌─────────────┐  20Hz    │ │ Systems │ │  │
                              │  │  GameTimer  │ ───────► │ │ Spawn   │ │  │
                              │  │  (心跳节拍)  │          │ │ AI/BT   │ │  │
                              │  └─────────────┘          │ └─────────┘ │  │
                              │                     ┌─────┴─────────────┴─┐│
                              │                     │  持久化 Redis+SQLite  ││
                              │                     └─────────────────────┘│
                              └──────────────────────────────────────────┘
```

**分层职责**（用 Java 后台的语言类比）：

| 层 | 目录 | 职责 | Java 世界的类比 |
|---|---|---|---|
| 入口 | `server.ts` | 启动、优雅关停、信号处理 | `main()` + `@SpringBootApplication` |
| 网络层 | `network/` | 连接管理、协议编解码、限流、心跳 | Netty 的 `ChannelHandler` 链 |
| 世界总管 | `core/GameWorld.ts` | 持有所有状态、驱动 tick、广播 | 单例的 `GameService` / 领域聚合根 |
| 领域实体 | `core/Entity/Player/Enemy` | 玩家/敌人的数据+行为 | JPA Entity / 领域对象 |
| 系统层 | `systems/` | 移动/战斗/聊天/技能等玩法逻辑 | Service 层（按业务拆分） |
| 空间索引 | `core/AOI.ts`、`Obstacle.ts` | 九宫格、碰撞网格 | 空间数据结构 / 索引 |
| 生成器 | `spawn/` | 障碍物/天气/敌人生成 | 工厂 + 策略模式 |
| AI | `ai/bt`、`ai/llm`、`ai/agent` | 行为树 + 大模型决策 | 策略/状态机 + 外部 API 客户端 |
| 持久化 | `persistence/`、`PlayerStore` | 存档读写、冷热分层 | DAO / Repository 层 |
| 工具 | `utils/` | 定时器、日志、限流 | 工具类 / 中间件 |

**三大设计理念**（贯穿全代码）：
1. **服务器权威**：客户端只发"我想往这个方向走"，服务器算真实位置再广播。
2. **固定频率 Tick**：20Hz（每 50ms 一次）统一推进世界，而不是"来一个请求处理一个"。
3. **AOI 视野裁剪**：你只收到你**附近**玩家的数据，不是全服广播（否则 1000 人互相广播 = 100 万条消息/tick）。

---

## 四、一条消息的旅程（端到端追踪）

理解一个游戏服务器最快的方式，是跟着一次"玩家按下方向键"从头走到尾。

### 步骤 1：连接建立

浏览器 `new WebSocket('ws://localhost:4000')` →
`WebSocketServer.ts` 的 `wss.on('connection', ...)` 触发 →
创建一个 `Session`（封装这条连接），存进 `sessions` Map。

> `Session` ≈ Java 里代表"一个客户端连接"的对象。它管这条连接的**心跳时间**、**限流令牌桶**、**发送方法**。

### 步骤 2：入场（join）

客户端第一条消息带上名字（和可选的存档 token）→
`handleMessage` 路由到 `handleJoin` →
`world.addPlayer(player)`：
- `await playerStore.load(token)` **异步**读存档（有档恢复位置/血量/装备，没档给个安全出生点）
- 加进 `world.players` 和 AOI 网格
- 给新玩家发 `JOIN_WORLD`（世界快照：附近玩家、障碍物、敌人、天气…）
- 通知附近玩家"有新人来了"

这里有个 Node 特有的坑，代码专门处理了：因为读存档是 `await`（异步），**这期间客户端可能又发了几条消息**。所以用了一个 `joining` Set 做"入场锁"，期间的消息直接丢弃——这是单线程异步下的"竞态处理"，比 Java 的锁更轻。

### 步骤 3：移动输入

客户端每帧发 `{ type: 'c_move', data: { dx: 1, dy: 0 } }` →
`handleMessage` 里先过**限流**（`session.checkRate()`，令牌桶）→
路由到 `world.movement.handleInput(player, data)`：

```typescript
// MovementSystem.handleInput —— 只算方向，不改位置
const len = Math.sqrt(dx*dx + dy*dy);
player.velocity = { x: dx/len * speed, y: dy/len * speed };  // 归一化后 × 速度
```

**注意**：这里只设置了`速度（velocity）`，**没有立刻改位置**。位置的更新留给 tick。这就是"服务器权威"——客户端说的是意图，服务器按自己的节拍算结果。

### 步骤 4：Tick 统一推进（心脏）

`GameTimer` 每 50ms 调一次 `GameWorld.tick(dt)`：

```typescript
private tick(deltaMs: number): void {
  const dt = deltaMs / 1000;          // 转成秒
  this.updateDayNight(Date.now());    // 昼夜
  for (const player of this.players.values()) {
    if (player.isDead) continue;
    this.movement.update(player, dt); // ★ 位置 = 位置 + 速度×时间，再做碰撞
    player.exploration.reveal(...);   // 揭开迷雾
  }
  this.enemyAI.update(dt);            // 敌人行为树
  this.npcAgent.tick(dt);             // NPC 心情/日程
  this.updateDrops(...);              // 掉落物拾取/过期
  this.updateHealthPacks(...);
  this.updateCampfires(...);
  this.broadcastStates();             // ★ 把新状态广播给各自视野内的玩家
}
```

`MovementSystem.update` 里做了真正的位移 + **障碍物碰撞解算**（圆 vs 圆的 push-out 滑动）。

### 步骤 5：广播（只发给"看得见"的人）

`broadcastStates()` 对每个玩家：
- 用 AOI 查出**附近九宫格**内的其他玩家（不是全服！）
- 算出"新进入视野 / 离开视野"，发 `PLAYER_ENTER` / `PLAYER_LEAVE`
- 发 `STATE_UPDATE`（附近所有人的最新位置/血量）

客户端收到后更新画面。**一个完整闭环，每 50ms 转一圈。**

> Java 类比：想象一个 `@Scheduled(fixedRate=50)` 的方法，遍历所有在线玩家更新状态再推送。区别是 Node 单线程，你不用担心这个循环和网络回调抢锁。

---

## 五、逐模块拆解 + Java 类比

### 5.1 入口 `server.ts`

```typescript
const world = new GameWorld();
async function bootstrap() {
  await world.initPersistence();          // 先连数据库
  server = new GameWebSocketServer(world); // 再开端口接客
  world.start();                           // 起 tick 循环
}
process.on('SIGINT', () => gracefulShutdown('SIGINT')); // Ctrl+C 优雅关停
```

- **启动顺序有讲究**：先连持久层，否则第一个玩家读档会落空被当成新号。
- **优雅关停**：收到 `SIGINT`/`SIGTERM`（≈ Java 的 `ShutdownHook`）时，停止接客 → 把在线玩家存档写回 → 退出。
- **兜底**：`process.on('uncaughtException')` 捕获未处理异常（≈ `Thread.setDefaultUncaughtExceptionHandler`），避免一个 bug 让整个进程裸崩。

### 5.2 网络层 `network/`

| 文件 | 职责 | Java 类比 |
|---|---|---|
| `Protocol.ts` | 定义所有消息类型（枚举）+ JSON 编解码 | 协议常量 + Jackson 序列化 |
| `Session.ts` | 单个连接的封装：心跳时间、限流、发送 | 一个 `Channel` 的包装 |
| `WebSocketServer.ts` | 服务器：接受连接、路由消息、心跳巡检 | Netty `ServerBootstrap` + Handler |

**`Protocol.ts` —— 协议就是一份"接口契约"**：

```typescript
export enum MsgType {
  C_MOVE = 'c_move',      // C_ 前缀 = Client→Server
  STATE_UPDATE = 's_state', // 无 C_ = Server→Client
}
export function encodeMessage(type, data) { return JSON.stringify({ type, data }); }
```

用 JSON 传输，简单直观（缺点是比二进制协议大、慢——`docs/04` 讲了怎么优化）。

**`WebSocketServer.handleMessage` —— 消息路由（就是个大 switch）**：

```typescript
switch (msg.type) {
  case MsgType.C_MOVE:   this.world.movement.handleInput(player, msg.data); break;
  case MsgType.C_ATTACK: this.world.combat.handleAttack(player); break;
  case MsgType.C_CHAT:   this.world.chat.handleChat(player, msg.data.text); break;
  ...
}
```

这就是 Java 里 `@RequestMapping` 分发的手写版——根据消息类型调不同的 Service。

**心跳**：`startHeartbeat` 每 5 秒扫一遍所有 Session，15 秒没动静的当成"僵尸连接"踢掉。防止半开连接占资源。

### 5.3 定时器 `utils/Timer.ts` —— 防"螺旋死亡"

朴素做法是 `setInterval(tick, 50)`，但前面说了，单线程下如果某次 tick 超时，节拍就乱了。`GameTimer` 用**累加器模式**修正：

```typescript
this.accumulator += elapsed;              // 累计真实流逝的时间
while (this.accumulator >= intervalMs) {  // 该补几次就补几次
  this.onTick(intervalMs);
  this.accumulator -= intervalMs;
}
if (this.accumulator > intervalMs * 5) {  // 落后太多就放弃追赶
  this.accumulator = 0;                   // 否则会"越算越慢→更落后"= 螺旋死亡
}
```

> 这是游戏循环的经典模式（"Fix Your Timestep"）。Java 写游戏循环也是同一套思路。

### 5.4 世界总管 `core/GameWorld.ts`

**整个服务器的"上帝对象"**，持有一切状态：

```typescript
readonly players: Map<number, Player>;   // ≈ Map<Integer, Player>，全服玩家
readonly enemies: Map<number, Enemy>;
readonly drops: Map<number, WeaponDrop>; // 掉落物
readonly aoi: AOIManager;
readonly movement/chat/combat/skills/enemyAI/npcAgent; // 各系统
```

它负责：装配所有系统、启动 tick、加入/移除玩家、广播、刷怪、找安全出生点。

> Java 类比：一个单例 `GameService`，构造时 `@Autowired` 一堆子 Service，用 `Map` 缓存所有在线实体。因为 Node 单线程，这些 `Map` 直接用普通 `Map` 就行，**不需要 `ConcurrentHashMap`**。

### 5.5 实体 `core/Entity.ts` / `Player.ts` / `Enemy.ts`

经典继承：`Player extends Entity`、`Enemy extends Entity`。

```typescript
class Entity {
  readonly id: number;         // 自增 ID（模块级变量 nextEntityId++）
  position: Position;
  velocity: Vector2;
  distanceTo(other): number {} // 共用方法
}
```

`Player` 里值得看的两个设计：
- **`toPublicState()`**：把玩家转成"能发给客户端的精简对象"（坐标取整、藏掉内部字段）。≈ Java 的 **DTO / VO**，Entity 与传输对象分离。
- **等级/经验/装备**都是纯数据 + 方法（`gainXp`、`equip`、`takeDamage`），领域逻辑内聚在实体上——这其实是很正的**充血模型**。

### 5.6 空间索引：AOI 与碰撞

**`AOI.ts` —— 九宫格视野**。把 12000×4000 的地图切成 500×500 的格子。每个玩家只关心自己所在格 + 周围 8 格（九宫格）里的人。

```typescript
private cells: Map<string, Set<Player>>;  // "格子坐标" → 该格里的玩家集合
getNearbyPlayers(player) {                // 查周围九宫格
  for (dx of [-1,0,1]) for (dy of [-1,0,1]) { ...收集该格玩家... }
}
```

为什么要这样？**广播复杂度从 O(N²) 降到 O(N×k)**。1000 个玩家全服互相广播是 100 万次；九宫格后每人只看几十个邻居。这是 MMO 的命根子优化。

> Java 类比：一个 `Map<String, Set<Player>>` 的空间哈希（Spatial Hashing）。思路和 Node 完全一致，只是 Java 要考虑并发读写。

**`Obstacle.ts` + `MovementSystem` 里的碰撞**：障碍物也放进一个空间网格（`ObstacleGrid`）。移动时只查落点附近的障碍物（broad-phase 粗筛），再做圆 vs 圆的精确碰撞，撞上了就"沿法线推出、保留切向分量"→ 表现为**贴着障碍物边缘滑过去**。

### 5.7 系统层 `systems/`

按玩法拆成独立 Service，每个都持有 `world` 引用：

| 系统 | 干什么 |
|---|---|
| `MovementSystem` | 输入→速度→位置→边界/碰撞→更新 AOI |
| `CombatSystem` | 选目标（玩家优先）、算伤害、死亡、复活、掉落、给经验 |
| `ChatSystem` | 范围聊天（只有附近的人收到） |
| `SkillSystem` | 技能：治疗/火球/陨石雨 |
| `EnemyAISystem` | 每 tick 驱动每个敌人的行为树 |

看 `CombatSystem.handleAttack` 的结构，非常典型：
1. 冷却检查（`canAttack()`）
2. 选目标（攻击范围内最近的玩家 or 敌人）
3. 广播挥击动画（**空挥也播**，即时反馈）
4. 命中结算：扣血 → 广播伤害 → 死了就处理死亡/复活/掉落/给经验

**死亡复活用 `setTimeout` 延迟**，很能体现 Node 味道：

```typescript
setTimeout(() => {
  if (!this.world.players.has(player.id)) return; // 3秒内可能已下线，要判空
  const spawn = this.world.findSafeSpawn(player.radius);
  player.respawn(spawn.x, spawn.y);
}, GameConfig.RESPAWN_TIME);
```

Java 里你会用 `scheduler.schedule(...)`；Node 里一个 `setTimeout` 搞定，而且**不用担心它和 tick 抢锁**（都在同一线程排队执行）。

### 5.8 生成器 `spawn/`

统一的物件生成框架，用**策略/工厂**思想：

- `types.ts`：定义 `SpawnDefinition` 契约（每种物件怎么生成）
- `rng.ts`：`seededRng`（**确定性**伪随机，同一种子布局永远一致 → 多客户端看到同一张地图）+ `placeMany`（拒绝采样避免重叠）
- `Spawner.ts`：注册表，`.register(定义).register(定义)`（链式），再 `generateStatic()` / `generateDynamic()`
- `definitions/`：障碍物、天气、敌人、物品各自的生成规则

**静态 vs 动态**：障碍物是 `static`（用种子确定性生成，多端一致，无需存档）；天气是 `dynamic`（运行时随机、服务端定时重掷再广播）。

> Java 类比：`SpawnStrategy` 接口 + 一堆实现，`Spawner` 是持有 `List<SpawnStrategy>` 的上下文。确定性随机 = 传固定 seed 的 `new Random(seed)`。

### 5.9 AI：行为树 + 大模型

这是项目最有意思的部分，分三层：

**① 行为树（`ai/bt/`）—— 敌人的"身体"**

行为树（Behavior Tree）比 `switch` 状态机更好扩展。核心就三种节点（`nodes.ts`）：

- **Selector（选择器）**：从左到右试子节点，第一个"不失败"的就用它 →「优先级」
- **Sequence（序列）**：从左到右依次执行，一个失败就中断 →「按步骤做完」
- **叶子**：`Condition`（判断）、`Action`（执行，可返回 `running` 表示"还在做"）

敌人树（`enemyTree.ts`）读起来像伪代码：

```
Selector(
  Sequence(探测到目标? →
    Selector(
      史莱姆残血 → 逃跑,
      在攻击距离 → 攻击,
      → 追击            // demon 残血会自动狂暴
    )),
  → 巡逻                // 没目标就游荡
)
```

想加"呼叫增援"只需插一个分支——**行为是数据/结构，不是缠在一起的 if-else**。

> Java 类比：行为树在 Java 游戏里也是标准做法（有 libgdx-ai 等库）。`BTNode` 接口 + `tick()` 方法，Selector/Sequence 组合子节点，就是**组合模式（Composite Pattern）**。

**② LLM 大脑（`ai/llm/`）—— NPC 的"决策"**

部分金色 NPC 接了 DeepSeek/本地 Ollama。行为树负责"执行"（走/打/说），大模型负责"决定说什么、去哪"。有 `memory.ts` 存 NPC 记忆（谁打过我）。LLM 请求当然是**异步**的（`await`），绝不能卡 tick。

**③ Agent 增强（`ai/agent/`）—— NPC 的"社会性"**

任务委托、关系解锁、传闻扩散、心情、声望、护送、A2A（NPC 间协作）等。属于玩法增强，可选读。

### 5.10 持久化 `persistence/` + `PlayerStore.ts`

**冷热双层 + write-behind**，这是商业游戏的经典套路：

```
        ┌─────────────── PlayerStore ───────────────┐
写玩家 → │ L1 内存缓存 (Map)  →  TieredBackend         │
        │                      ├─ Redis  (热层，快)   │
        │                      └─ SQLite (冷层，持久) │
        └────────────────────────────────────────────┘
```

- **读（load）**：内存缓存 → Redis 热层 → SQLite 冷层，逐层兜底。冷层命中会**回填热层**。
- **写（write-behind）**：tick 里**从不同步写库**！由定时器每 5 秒把在线玩家批量快照写回，另在下线/关服时各写一次。
- **降级**：Redis 连不上自动退化为纯 SQLite；`PERSIST_ENABLED=0` 退回纯内存。

为什么这么设计？**因为单线程**——如果 tick 里同步等一次 Redis 往返（几毫秒），所有玩家都会卡顿。所以把写库彻底挪出热路径，异步批量做。

> Java 类比：`TieredBackend` = 装饰器/责任链把两个 `Repository` 串起来；write-behind = 一个 `@Scheduled` 批量 flush 的写缓冲。接口 `PersistenceBackend` 有 `Redis/Sqlite/Null` 三个实现 = 面向接口编程 + 策略模式。

### 5.11 限流 `utils/RateLimiter.ts` —— 令牌桶

防止某个客户端疯狂发包（作弊/攻击）。经典**令牌桶算法**：

```typescript
consume() {
  this.refill();                    // 按流逝时间补充令牌
  if (this.tokens >= 1) { this.tokens--; return true; }  // 有令牌放行
  return false;                     // 没令牌拒绝（静默丢弃）
}
```

每个 `Session` 一个桶。桶容量 60，每秒回填 30（够 20/s 移动 + 攻击 + 余量）。

> Java 类比：Guava 的 `RateLimiter` 就是这个思路，只是这里手写了一份。

---

## 六、Node.js 语法速查表（对照 Java）

| 场景 | Node/TypeScript | Java |
|---|---|---|
| 哈希表 | `new Map<number, Player>()` | `new HashMap<Integer, Player>()` |
| 集合 | `new Set<number>()` | `new HashSet<Integer>()` |
| 遍历 Map 值 | `for (const p of map.values())` | `for (Player p : map.values())` |
| 遍历数组 | `for (const x of arr)` | `for (X x : arr)` |
| 数组转换 | `arr.map(x => x.id)` | `arr.stream().map(x -> x.id)` |
| 数组过滤 | `arr.filter(x => x.hp > 0)` | `arr.stream().filter(x -> x.hp > 0)` |
| Lambda | `(a, b) => a + b` | `(a, b) -> a + b` |
| 空值合并 | `a ?? b`（a 为 null/undef 取 b） | `a != null ? a : b` |
| 可选链 | `obj?.field?.sub` | 嵌套判空 / `Optional` |
| 三元 | `cond ? a : b` | 一样 |
| 字符串模板 | `` `hi ${name}` `` | `"hi " + name` / `String.format` |
| 展开数组 | `[...map.values()]` | `new ArrayList<>(map.values())` |
| 常量 | `const x = 1` | `final int x = 1` |
| 异步等待 | `await fn()` | `future.get()`（但不阻塞线程） |
| 异步方法 | `async function f(): Promise<T>` | `CompletableFuture<T> f()` |
| 定时重复 | `setInterval(fn, ms)` | `scheduleAtFixedRate` |
| 延迟一次 | `setTimeout(fn, ms)` | `schedule` |
| 事件监听 | `emitter.on('x', fn)` | `addXxxListener` |
| 当前时间戳 | `Date.now()` | `System.currentTimeMillis()` |
| 数学 | `Math.hypot(dx, dy)` | `Math.hypot(dx, dy)` |
| JSON 序列化 | `JSON.stringify(obj)` | `objectMapper.writeValueAsString` |
| JSON 反序列化 | `JSON.parse(str)` | `objectMapper.readValue` |

**几个务必记住的坑**：
1. **数字只有 `number`**（64 位浮点），没有 int/long。大整数要用 `BigInt`。
2. **`==` 有隐式转换**，永远用 `===`（严格相等）。
3. **`this` 会丢**：普通函数里的 `this` 取决于调用方；箭头函数 `() => {}` 会捕获外层 `this`（所以回调里大量用箭头函数）。
4. **没有 checked exception**：错误靠 `try/catch` + Promise 的 `.catch()`，异步错误忘了 catch 会变成 `unhandledRejection`。
5. **不要阻塞**：任何"慢"操作都必须异步，否则卡死全服。

---

## 七、建议的阅读/学习路线

按这个顺序读代码，由浅入深：

1. **`config.ts`** —— 先看有哪些可调参数，建立全局印象
2. **`Protocol.ts`** —— 搞清客户端和服务器"说什么话"
3. **`server.ts` → `WebSocketServer.ts`** —— 连接怎么建立、消息怎么路由
4. **`Entity.ts` → `Player.ts`** —— 数据长什么样
5. **`Timer.ts` → `GameWorld.tick()`** —— ★ 理解"心跳循环"这个最核心的概念
6. **`MovementSystem.ts`** —— 一个最简单的系统怎么工作
7. **`AOI.ts`** —— 理解视野裁剪这个 MMO 关键优化
8. **`CombatSystem.ts`** —— 一个较完整的玩法闭环
9. **`ai/bt/`** —— 行为树（组合模式的漂亮实践）
10. **`persistence/`** —— 冷热分层 + write-behind

对应的深度文档在 `docs/01` ~ `docs/12`（README 里有索引表）。

**动手练习建议**（巩固 Node 手感）：
- 在 `Protocol.ts` 加一个新消息类型，在 `WebSocketServer` 路由它，走通一个"客户端→服务器→广播"的最小闭环
- 给 `tick` 加一句 `console.log`，观察它 50ms 一次的节奏
- 故意在 tick 里写个 `while(true)` 死循环，亲眼看看"单线程阻塞"如何让全服卡死（记得删掉）
- 给敌人行为树加一个新分支（比如"血量低于 30% 时呼叫增援"）

---

## 八、一页纸总结

- **Node.js = 单线程 + 事件循环**：不用锁，但绝不能阻塞。
- 这个服务器 = **服务器权威** + **20Hz 固定 tick** + **AOI 视野裁剪** 三板斧。
- **一次循环**：收输入(设速度) → tick(算位置+碰撞+AI) → 按视野广播，每 50ms 一圈。
- 代码分层和 Java 后台高度相似：入口 / 网络 / 世界 / 实体 / 系统 / 索引 / AI / 持久化。
- 你的 Java 知识 90% 能迁移，重点补：**async/await 异步模型**、**事件监听**、**单线程不阻塞**这三件事。

祝入门顺利 🎮
