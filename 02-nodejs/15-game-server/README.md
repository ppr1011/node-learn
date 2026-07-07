# 15 - Node.js 游戏服务器开发

本章将带你从零构建一个 MMO-Lite 游戏服务器，深入理解游戏后台的核心难点、工程挑战和服务稳定性保障。

深度内容已按主题拆分到 [`docs/`](docs/) 目录，本文件作为**导航索引 + 速查总览**。

## 目录

- [快速开始](#快速开始)
- [架构总览](#架构总览)
- [文档导航](#文档导航)
- [Demo 功能说明](#demo-功能说明)
- [代码结构详解](#代码结构详解)
- [扩展思考](#扩展思考)
- [参考资源](#参考资源)

---

## 快速开始

```bash
cd 02-nodejs/15-game-server
npm install
cp .env.example .env   # 填入 DeepSeek API Key，见 docs/11-LLM行为树.md
npm start
```

然后在浏览器打开 `client/index.html`，多开几个标签页就能看到多人同步效果。

- **WASD** / 方向键：移动
- **空格**：攻击（近距离自动瞄准最近目标）
- **击杀敌人**：按几率掉落随机武器，走过去即自动拾取装备（不同武器改变伤害/距离/冷却与攻击动画）
- **Enter**：发送聊天消息（靠近金色名字的 LLM NPC 可对话；**点击金色 NPC 自动寻路**；聊天可说 `去找 艾伦` 或 `/goto`）

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

## 文档导航

深度内容按「现有大章 + 代码结构」拆分为 10 篇，每篇都标注了对应的源码模块：

| 文档 | 主题 | 关联代码模块 |
|------|------|--------------|
| [01 · 游戏后台核心难点](docs/01-核心难点.md) | 实时状态同步、九宫格 AOI、Tick 主循环、协议设计、数据一致性、空间碰撞检测 | `core/AOI.ts`、`core/Obstacle.ts`、`core/GameWorld.ts`、`utils/Timer.ts`、`network/Protocol.ts`、`systems/MovementSystem.ts` |
| [02 · 工程挑战](docs/02-工程挑战.md) | 高并发连接、网络延迟与抖动、反作弊、热更新、分布式扩展 | `network/Session.ts`、`utils/RateLimiter.ts`、`systems/CombatSystem.ts` |
| [03 · 服务稳定性](docs/03-服务稳定性.md) | 心跳检测、优雅关停、限流与背压、内存管理、监控告警 | `network/Session.ts`、`network/WebSocketServer.ts`、`server.ts`、`core/GameWorld.ts` |
| [04 · 生产环境 GC 实战](docs/04-GC实战.md) | V8 GC 诊断、启动参数调优、对象池、二进制协议、Worker Thread、GC-Aware 循环 | `examples/gc-demo.ts`、`utils/Timer.ts` |
| [05 · Node.js 能否承载千万 DAU](docs/05-Nodejs-DAU分析.md) | 单机性能上限、真实架构案例、语言选型对比、Node.js 在游戏后台的定位 | 架构选型（无直接代码） |
| [06 · 客户端视觉系统](docs/06-客户端视觉系统.md) | 程序化地图、精灵渲染、粒子系统、浮动伤害、平滑摄像机、小地图、后期处理 | `client/index.html`、`collision-demo.html` |
| [07 · 已知 Bug 修复记录](docs/07-Bug修复记录.md) | 玩家无法移动、攻击无反馈（含 TDZ 崩溃） | `core/GameWorld.ts`、`client/index.html` |
| [08 · 天气视觉增强](docs/08-天气视觉增强.md) | 分层景深粒子、地面涟漪、闪电、体积雾、色调分级、平滑过渡、程序化/贴图双范式 | `client/index.html`、`client/assets/weather/`、`spawn/definitions/weather.ts` |
| [09 · 行为树 AI](docs/09-行为树AI.md) | FSM vs 行为树、组合/装饰/叶子节点、running 语义、敌人 AI 重构、slime 逃跑 / demon 狂暴 | `ai/bt/*`、`systems/EnemyAISystem.ts`、`core/Enemy.ts` |
| [10 · 武器与掉落系统](docs/10-武器与掉落系统.md) | 击杀掉落、加权稀有度、拾取装备、武器化攻击动画、飞行物/震波、CC0 贴图 | `core/Weapon.ts`、`core/WeaponDrop.ts`、`core/GameWorld.ts`、`systems/CombatSystem.ts`、`client/index.html` |
| [11 · LLM + 行为树 AI](docs/11-LLM行为树.md) | LLM 大脑 + BT 身体、记忆、跟随、寻路、DeepSeek | `ai/llm/*`、`ai/bt/llmNpcTree.ts` |
| [12 · NPC Agent 趣味增强](docs/12-NPC-Agent趣味增强.md) | 委托任务、关系解锁、传闻、心情、记忆面板 | `ai/agent/*`、`client/index.html` |

---

## Demo 功能说明

**服务端功能**

| 功能 | 描述 | 对应核心知识 |
|------|------|-------------|
| 多人同步移动 | WASD 控制，服务器权威，20Hz 广播 | 状态同步、服务器权威 |
| 障碍物碰撞 | 服务端圆形碰撞体 + 空间网格 + push-out 滑动 | 空间分割、碰撞解算 |
| AOI 视野管理 | 只能看到附近九宫格内的玩家 | 九宫格 AOI |
| 范围聊天 | 只有附近的人能看到消息 | AOI 应用 |
| 近战攻击 | 空格攻击最近目标，服务端判定范围 | 冷却时间、服务端校验 |
| 死亡复活 | HP 归零后 3 秒自动复活（出生/复活共用避障出生点） | 状态管理、setTimeout |
| 统一物件生成 | `src/spawn/` 框架:障碍物(确定性种子) + 天气(运行时随机定时广播),敌人/物品留扩展骨架 | static/dynamic 生成、服务端权威 |
| 天气系统 | 服务端每 30s 重掷天气并广播,多端一致(晴/雨/雾/雪) | dynamic 生成、状态广播 |
| 心跳检测 | 15 秒无响应断开僵尸连接 | 连接健康管理 |
| 限流保护 | 令牌桶限制每客户端消息频率 | 反作弊、稳定性 |
| 优雅关停 | Ctrl+C 正确清理所有资源 | 进程信号管理 |

**客户端视觉特性**

| 特性 | 描述 | 技术要点 |
|------|------|----------|
| 程序化地图 | 55棵树+26块石(服务端,带碰撞)、80丛灌木+200朵花(客户端装饰) | 确定性伪随机 `srand`，实心物走服务端权威 |
| Y 轴深度排序 | 靠下的对象后渲染，石在玩家下、树冠盖在玩家上 | 渲染分层：地面装饰→石→玩家→树冠 |
| 渐变玩家精灵 | 径向渐变球体 + 阴影 + 光晕 | `createRadialGradient`，受击变色 |
| 粒子系统 | 受击火星、死亡爆炸、复活环形粒子 | 简单物理（重力+阻力），尾部删除 |
| 浮动伤害数字 | 受击后数字向上飘，高伤害变金色 | 带描边的动态文字，逐帧 Y 偏移 |
| 攻击圆环动画 | 按空格立即显示扩散双圆环 | 本地即时反馈，不等服务器 |
| 平滑摄像机 | lerp 跟随，0.1 系数自然减速 | `camera += (target - camera) * 0.1` |
| 受击屏幕震动 | 被攻击时画面抖动 | `ctx.translate` + 随机偏移 + 衰减 |
| 小地图 | 左下角实时显示玩家位置和视野框 | 独立 canvas，坐标等比缩放 |
| 暗角效果 | 边缘渐暗，引导视线到中心 | 径向渐变覆盖全画面 |
| 天气系统(增强) | 分层景深雨/雪、地面涟漪、闪电、流动体积雾、全局色调分级、平滑过渡 | 屏幕空间对象池,强度自适应,程序化为主 + 可选贴图 |

> 视觉特性的实现细节见 [06 · 客户端视觉系统](docs/06-客户端视觉系统.md);天气增强见 [08 · 天气视觉增强](docs/08-天气视觉增强.md)。

---

## 代码结构详解

```
src/
├── server.ts              # 入口：启动世界、WebSocket、注册信号处理
├── config.ts              # 所有可调参数集中管理
├── core/
│   ├── Entity.ts          # 基础实体（id、位置、速度）
│   ├── Player.ts          # 玩家（HP、攻击、碰撞半径、AOI 信息）
│   ├── AOI.ts             # 九宫格算法实现
│   ├── Obstacle.ts        # 障碍物碰撞数据结构：Obstacle 类型 + 空间网格 broad-phase
│   └── GameWorld.ts       # 世界管理（Tick循环、玩家管理、状态广播、天气定时广播）
├── spawn/                 # 统一物件生成模块（static 确定性 / dynamic 运行时随机）
│   ├── types.ts           # Spawnable / SpawnContext / SpawnDefinition 契约
│   ├── rng.ts             # seededRng / randomRng / placeMany 拒绝采样放置
│   ├── Spawner.ts         # 注册表 + 跨类别避让（占用集合）
│   └── definitions/       # obstacles(已迁移) / weather(已打通) / enemies·items(骨架)
├── network/
│   ├── Protocol.ts        # 消息类型定义、编解码
│   ├── Session.ts         # 单个连接的抽象（心跳、限流、发送）
│   └── WebSocketServer.ts # WebSocket 服务器（连接管理、消息路由）
├── systems/
│   ├── MovementSystem.ts  # 移动：方向输入 → 速度 → 位置更新 → 边界限制 + 障碍物碰撞
│   ├── ChatSystem.ts      # 聊天：范围广播
│   └── CombatSystem.ts    # 战斗：攻击判定、伤害、死亡、复活
├── examples/
│   └── gc-demo.ts         # GC 影响演示 & 优化对比（见 docs/04-GC实战.md）
└── utils/
    ├── Timer.ts           # 高精度游戏定时器（防螺旋死亡）
    ├── Logger.ts          # 带时间戳的日志
    └── RateLimiter.ts     # 令牌桶限流
```

**模块 → 文档对照**（想深入某个模块背后的原理时按此索引）：

- `core/AOI.ts`、`core/Obstacle.ts`、`spawn/`、`utils/Timer.ts`、`network/Protocol.ts`、`systems/MovementSystem.ts` → [01 · 核心难点](docs/01-核心难点.md)
- `network/Session.ts`、`utils/RateLimiter.ts`、`systems/CombatSystem.ts` → [02 · 工程挑战](docs/02-工程挑战.md)
- `network/WebSocketServer.ts`、`server.ts` → [03 · 服务稳定性](docs/03-服务稳定性.md)
- `examples/gc-demo.ts` → [04 · GC 实战](docs/04-GC实战.md)
- `client/index.html` → [06 · 客户端视觉系统](docs/06-客户端视觉系统.md)

---

## 扩展思考

学完本章后，你可以尝试：

1. **添加持久化**：用 Redis 存储玩家数据，支持断线重连恢复状态
2. **引入 Protobuf**：将 JSON 协议替换为二进制协议，对比性能差异
3. **多进程扩展**：用 `cluster` 模块启动多个 worker，配合 Redis 做跨进程通信
4. **增加 NPC/怪物**：实现简单 AI（巡逻、追击），体会 tick 驱动的 AI 设计
5. ~~**地图障碍物**：增加碰撞检测，理解空间分割数据结构~~ ✅ 已实现，见 [01 · 空间碰撞检测](docs/01-核心难点.md#6-空间碰撞检测障碍物)
6. **录像/回放**：记录所有输入，实现确定性回放
7. **压力测试**：编写机器人客户端，测试服务器极限

---

## 参考资源

- [Game Programming Patterns](https://gameprogrammingpatterns.com/) — 游戏编程模式
- [Source Multiplayer Networking](https://developer.valvesoftware.com/wiki/Source_Multiplayer_Networking) — Valve 的网络同步方案
- [Fast-Paced Multiplayer](https://www.gabrielgambetta.com/client-server-game-architecture.html) — 客户端预测详解
- [Node.js `ws` library](https://github.com/websockets/ws) — 本 Demo 使用的 WebSocket 库
