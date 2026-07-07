# 第十一部分：LLM + 行为树 AI

> ← 返回 [README](../README.md) · 系列文档：[行为树 AI](09-行为树AI.md) · [武器与掉落](10-武器与掉落系统.md)
>
> **关联代码**：`src/ai/llm/*`、`src/ai/bt/llmNpcTree.ts`、`src/ai/bt/llmActions.ts`、`src/systems/EnemyAISystem.ts`、`src/systems/ChatSystem.ts`、`src/core/Enemy.ts`

---

行为树解决了「实时战斗动作怎么组合」的问题，但纯规则 AI 很难做**个性化对话**和**情境化战术**。本部分演示如何把 **LLM 作为大脑、行为树作为身体**，做一个能聊天、能打架、又不阻塞 20Hz 主循环的 NPC。

## 1. 核心架构：大脑 / 身体分离

```
┌──────────────────────────────────────────────┐
│  LLM Brain (异步, 3~4s 或聊天触发)            │
│  观察世界快照 → 输出 intent + 可选台词        │
│  intent ∈ { attack, flee, patrol, taunt, hunt, follow } │
└──────────────────┬───────────────────────────┘
                   │ 写入 enemy.llmDirective
┌──────────────────▼───────────────────────────┐
│  Behavior Tree (同步, 每 tick 20Hz)           │
│  读取 intent → 执行 chase/attack/flee/...    │
└──────────────────────────────────────────────┘
```

**关键约束**：绝不让 BT 节点 `await` LLM。否则一次推理 500ms~2s 会冻住整帧 tick。

| 层 | 频率 | 职责 |
|----|------|------|
| LLM Brain | 4s 定时 + 玩家聊天即时触发 | 高层意图、NPC 台词 |
| Behavior Tree | 20Hz | 移动、攻击冷却、巡逻路径、边界收敛 |

## 2. LLM 输出白名单

模型只许返回 JSON，且 `intent` 限定为四个合法值（见 `src/ai/llm/types.ts`）：

```json
{"intent":"patrol","speech":"欢迎来到新手草原。","reason":"玩家友好问候"}
```

- **attack** → BT 走标准战斗子树（探测→攻击/追击）
- **flee** → BT 逃跑
- **patrol / taunt** → 短暂站定 + 巡逻游荡
- **speech** → 通过现有 `CHAT_MSG` 广播给附近玩家

解析失败或 HTTP 错误时，Brain 回退到 `patrol`，BT 仍有 `buildEnemyTree` 兜底分支。

## 3. 行为树怎么「读」LLM

`buildLlmNpcTree`（`src/ai/bt/llmNpcTree.ts`）在标准敌人树外包一层 Selector：

```
Selector(
  Sequence(llmWantsFlee → acquireTarget → flee),
  Sequence(llmWantsAttack → 战斗子树),
  Sequence(llmWantsPatrol → taunt → patrol),
  buildEnemyTree(kind)   // LLM 未就绪时的规则兜底
)
```

LLM 意图优先级高于种类默认性格（比如 slime 残血逃跑），实现「同模型、不同人设」。

## 4. 世界快照：给模型什么上下文

`LLMBrain.buildSnapshot` 只传结构化摘要，不传原始对象：

- NPC 名、性格、种类、HP、坐标、AI 状态
- 所在区域名、当前天气
- 附近玩家列表（名字、距离、HP）
- 若由聊天触发：玩家原文

这样 token 可控，也方便以后换本地小模型。

## 5. DeepSeek 官方 API（默认）

项目默认接入 [DeepSeek API](https://api-docs.deepseek.com/zh-cn/)，兼容 OpenAI Chat Completions 格式。

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `LLM_API_URL` | `https://api.deepseek.com/chat/completions` | DeepSeek 端点 |
| `LLM_MODEL` | `deepseek-v4-flash` | 快速推理模型 |
| `DEEPSEEK_API_KEY` | `.env` 文件 | 从环境变量读取，**勿提交到 Git** |

```bash
# 1. 复制环境变量模板
cp .env.example .env
# 2. 编辑 .env，填入你在 https://platform.deepseek.com/api_keys 申请的 Key
# 3. 启动
npm start
```

也可直接导出环境变量：

```bash
export DEEPSEEK_API_KEY=sk-...
export LLM_MODEL=deepseek-v4-flash
npm start
```

未配置 Key 时自动降级为 `MockLLMProvider`，不影响 Demo 运行。

## 6. 其它 Provider

| Provider | 何时使用 |
|----------|----------|
| `MockLLMProvider` | 未配置 `DEEPSEEK_API_KEY` |
| `OpenAICompatibleProvider` | 已配置 Key，默认走 DeepSeek；改 `LLM_API_URL` 可切 OpenAI 等兼容端点 |

## 7. 对话气泡

客户端收到 `s_chat` 后，除右侧聊天栏外，还会在说话者头顶显示**对话气泡**（NPC 金色、玩家绿色），持续约 4.5 秒并跟随实体移动。

## 8. NPC 不移动？已修复

早期 `patrol` 分支写成 `Sequence(taunt → patrol)`，且 `taunt` 与 `patrol` **共用 `idleTimer`**。每 tick `taunt` 先跑并返回 `running`，`patrol` 永远进不去。

修复：
- `patrol` 意图 → 直接 `patrol`
- `taunt` 意图 → 独立 `llmPoseTimer` 站定后再 `patrol`
- 新增 `hunt` 意图 + 巡逻时自动清怪

## 9. NPC 打怪

LLM NPC 可攻击普通怪物（非 LLM 敌人）：
- `hunt` 意图：主动狩猎
- `patrol` / `taunt` / **跟随途中**：附近刷怪自动转入 `mobCombat` 子树
- 击杀后怪物走正常复活流程，广播 `ENEMY_HIT` / `ENEMY_DEAD`

## 10. NPC 跟随玩家

对金色名字 NPC 说 **「跟着我」**（或「一起走」「跟上」），NPC 会：
- **立即**绑定跟随（不等 LLM 返回）
- 保持约 58px 间距跟在身后
- 途中遇怪会顺手清怪，再继续跟
- 说 **「走快点」** 临时加速 6 秒
- 说 **「别跟了」** 解除跟随
- 跟太远（>900px）自动解除

跟随是**持久状态**：LLM 每 4 秒刷新时不会误切回 `patrol`。

## 11. 怎么体验

1. `npm start`，打开 `client/index.html`
2. 在新手草原找**金色名字**的 NPC（如「守卫·艾伦」「史莱姆贤者」）
3. 靠近后按 **Enter** 聊天，例如「你好」「这里危险吗」
4. NPC 会通过范围聊天回复，并可能切换战术（追击/逃跑/巡逻）

## 12. 自动寻路到 NPC（客户端）

客户端内置 **网格 A* 寻路**（`client/pathfind.js`），每 50ms 与移动输入同频 tick：

| 触发方式 | 说明 |
|----------|------|
| **点击金色 NPC** | 地图上点击 LLM NPC 精灵/名字附近 |
| 聊天 `去找 艾伦` | 模糊匹配 `displayName` |
| 聊天 `/goto` | 走向最近的 LLM NPC |
| 聊天 `/goto 史莱姆贤者` | 走向指定 NPC |

- 绿色虚线为规划路径，自动绕开服务端下发的树/石障碍物
- 到达 NPC 约 72px 内自动停止
- **WASD / 摇杆** 手动移动会取消寻路
- 卡住约 2s 或目标移动时每 3s 自动重新规划

## 13. 配置旋钮（`src/config.ts`）

| 配置项 | 默认 | 含义 |
|--------|------|------|
| `LLM_ENABLED` | `true` | 总开关 |
| `LLM_NPC_COUNT` | `2` | 新手草原 LLM NPC 数量 |
| `LLM_DECISION_INTERVAL_MS` | `4000` | 定时战术刷新 |
| `DEEPSEEK_API_KEY` | `.env` | 空则用 Mock |

## 14. NPC Agent 记忆（已实现）

每个 LLM NPC 是独立 **Agent**，拥有：

| 层级 | 内容 |
|------|------|
| **Episodic** | 最近 16 条事件（聊天、战斗、结伴、击杀） |
| **Relations** | 按玩家名的信任值(-100~100)、标签、互动统计 |

记忆在每次 LLM 决策时压缩注入快照；高信任 +「我不打你」会阻止 BT 攻击分支。

**体验验证**：先说「我不打你」→ 再说「你好」→ NPC 应认出你；若攻击 NPC 后再对话，语气应变警惕。

## 15. 趣味性增强路线图

详见 **[12 · NPC Agent 趣味增强](12-NPC-Agent趣味增强.md)**（含实现状态与体验路径）。

| # | 功能 | 状态 |
|---|------|------|
| 1 | 委托任务 | ✅ |
| 2 | 关系解锁 | ✅ |
| 3 | 区域传闻 | ✅ |
| 4 | NPC 心情 | ✅ |
| 5 | 记忆可视化 | ✅ |
| 6 | 长期记忆归档 | ✅ |
| 7–9 | 日程 / 身份标签 / 多 Agent 协作 | 🔲 |

## 16. 扩展方向

- **记忆**：~~把最近 N 轮对话写入 snapshot~~ ✅ 已实现 `src/ai/llm/memory.ts`
- **工具调用**：LLM 返回 `use_skill:fireball`，BT 增加对应 Action 叶子
- **多 NPC 协商**：一个 Brain 批次推理多个 NPC，共享区域态势
- **本地模型**：换 `LLMProvider` 实现接 Ollama / vLLM，架构不变

**结论**：LLM 不适合替代行为树做帧级控制，但非常适合坐在 BT 上层当「战术参谋」。BT 保证实时性与确定性，LLM 提供语义理解与角色扮演——这是目前游戏 AI 的主流落地姿势。
