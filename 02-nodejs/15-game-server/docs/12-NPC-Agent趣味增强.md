# 第十二部分：NPC Agent 趣味增强

> ← 返回 [README](../README.md) · 前置：[LLM + 行为树 AI](11-LLM行为树.md)
>
> **关联代码**：`src/ai/agent/*`、`src/ai/llm/memory.ts`、`client/index.html`

---

在「LLM 大脑 + BT 身体 + 独立记忆」基础上，本部分把 Agent 能力落成**可玩的系统**，而不只是更好看的聊天。

## 实现状态总览

| # | 功能 | 状态 | 模块 |
|---|------|------|------|
| 0 | 独立记忆 (episodic + 关系) | ✅ | `ai/llm/memory.ts` |
| 1 | 委托任务 | ✅ | `ai/agent/quest.ts` |
| 2 | 关系解锁 | ✅ | `ai/agent/relation.ts` |
| 3 | 区域传闻 | ✅ | `ai/agent/rumor.ts` |
| 4 | NPC 心情 | ✅ | `ai/agent/mood.ts` |
| 5 | 记忆可视化 | ✅ | `C_NPC_INFO` / 客户端面板 |
| 6 | 长期记忆归档 | ✅ | `memory.ts` archive 逻辑 |
| 7 | 昼夜日程 | ✅ | `ai/agent/schedule.ts` |
| 8 | 玩家身份标签 | ✅ | `ai/agent/reputation.ts` |
| 9 | 多 Agent 协作编排 | ✅ | `ai/agent/squad.ts` |

---

## 1. 委托任务

**触发**：对 NPC 说「有任务吗」「帮我」「委托」。

**流程**：
```
玩家请求 → NPC 发放击杀委托(如清 3 只 slime)
         → 玩家在 NPC 附近击杀计入进度
         → 完成 → 额外经验 + 信任 + 区域传闻
```

配置：`config.LLM_QUEST_REWARD_XP`、`LLM_QUEST_DEFAULT_COUNT`

---

## 2. 关系解锁

信任值达到阈值解锁能力（影响 BT / 奖励，不仅是对话）：

| 信任 | 称号 | 能力 |
|------|------|------|
| ≥30 | 熟识 | 承诺不攻击时免疫靠近误判 |
| ≥60 | 伙伴 | 委托经验 ×1.5；优先协助 hunt |
| ≥90 | 羁绊 | 委托经验 ×2；击杀委托怪额外信任 |

---

## 3. 区域传闻

同一难度带内的 LLM NPC 共享 `RumorBoard`：

- 委托完成、NPC 被击杀、高信任结伴等事件写入传闻
- 所有本区 NPC 的 LLM 快照注入 `zoneRumors`
- 台词可引用「听说 xxx…」

---

## 4. NPC 心情

`mood ∈ [-100, 100]`，每 tick 微调：

| 因素 | 影响 |
|------|------|
| 下雨/下雪 | 缓慢下降 |
| 被玩家攻击 | 大幅下降 |
| 友好聊天 | 上升 |
| 独处过久 | 缓慢下降 |
| 完成委托 | 上升 |

心情注入 LLM 快照；极低时更易 flee，极高时更愿意 follow/hunt。

---

## 5. 记忆可视化

**Shift + 点击**金色 NPC → 客户端发 `c_npc_info` → 服务端回 `s_npc_info`：

- 信任 / 心情 / 已解锁称号
- 近期记忆、进行中委托、本区传闻

---

## 6. 长期记忆归档

episodic 满 `LLM_MEMORY_MAX` 时，最旧 4 条压缩为 1 条 `life` 摘要写入 `llmArchives`，防止 token 爆炸同时保留人格连续性。

---

## 7. 昼夜日程

一整天压缩为 `config.DAY_CYCLE_MS`（默认 4 分钟），世界时钟循环推进：

```
黎明 dawn → 白天 day → 黄昏 dusk → 夜晚 night（phaseAt 纯函数,前后端各自计算）
```

- **服务端权威**：`GameWorld.tick` 每帧算相位，切换时广播 `s_time`；`JOIN_WORLD` 带初值。
- **行为影响**（不止台词）：`NpcSchedule.biasFor(phase)` 给出倾向——
  - 夜晚 `huntAllowed=false`：金色 NPC 不再主动清怪（跟随/显式 hunt 除外）
  - 夜晚 `homebound=true`：离出生点超过 `NIGHT_HOME_RADIUS` 则 `returnHome` 缓步回巢
  - 黄昏/夜晚 `fleeBias`：更易撤退
- **注入 LLM**：快照 `timeOfDay` 进提示词，台词会应景（「夜深了，早点回营吧」）。
- **客户端**：全屏昼夜叠加（夜蓝压暗 / 黎明黄昏暖色）叠在天气之上；stats 栏显示时段。

配置：`DAY_CYCLE_MS`、`NIGHT_HOME_RADIUS`

---

## 8. 玩家身份标签（声望）

把「所有 LLM NPC 对某玩家的关系」聚合成一个**全局声望标签**，并据此设定**初见态度**。

- `Reputation.recompute`（每 `REPUTATION_RECOMPUTE_MS` 一次）遍历全体 NPC 的 `llmRelations`：
  - `score = 平均信任 + 帮忙×2 - 被打×3 - 结仇 NPC×15`
  - 标签：`≥40 英雄 / ≥15 义士 / ≤-40 屠夫 / ≤-15 恶徒 / else 旅人`
  - 由 score 折算 `seedTrust`（夹到 `±REPUTATION_SEED_CLAMP`）
- **初见即有态度**：一个从未接触过你的 NPC 首次建立关系时（聊天或进入探测范围），按 `seedTrust` 播下初始信任——英雄初见即受信、屠夫初见即遭防备。
- **注入 LLM**：附近玩家名后带 `[英雄]/[屠夫]`，语气随之而变。
- **可见性**：玩家 nameplate 上方显示「「称号」」；stats 栏显示自己的称号；Shift 点 NPC 面板显示「你的声望」。

配置：`REPUTATION_RECOMPUTE_MS`、`REPUTATION_SEED_CLAMP`

---

## 9. 多 Agent 协作（小队）

当 ≥2 只彼此靠近（`SQUAD_RADIUS`）的 LLM NPC 盯上**同一只普通怪**时，自动成队并分工：

| 角色 | 行为 |
|------|------|
| striker(leader) | 正面强攻，直冲目标 |
| flanker | 绕到怪相对 leader 的**远侧**，两翼包抄 |
| bait | 直冲并 `provokeAggro` 拉仇恨，替队友吸引怪 |

- 分工写进 `Enemy` 黑板（`squadId/squadRole/squadTargetId`），`SquadSystem.update` 每 tick 重算。
- **真实行为**：行为树 `chaseMob` 按 `squadRole` 改移动目标点 → 肉眼可见的包抄阵型。
- **协作式决策**：分工经快照注入各成员 LLM；leader 首次成队（带 `SQUAD_ANNOUNCE_COOLDOWN_MS` 冷却）**播报一句协调台词**——即「共享黑板 + leader 播报」，而非单请求批处理。
- **客户端**：小队 NPC 名字上方显示「主攻/包抄/引怪」徽标。

配置：`SQUAD_RADIUS`、`SQUAD_ANNOUNCE_COOLDOWN_MS`

---

## 体验路径（推荐试玩顺序）

1. 点击 NPC（Shift）查看 Agent 面板
2. 说「我不打你」→「有任务吗」→ 接委托杀怪
3. 说「跟着我」一起清怪 → 看任务进度与传闻更新
4. 雨天观察心情变化；攻击 NPC 看信任/心情下降
5. **昼夜**：等一个整日循环，看屏幕明暗与 stats 时段变化；夜晚金色 NPC 停止追怪、朝出生点回巢
6. **声望**：反复攻击某 NPC 直到成「仇人」，再靠近另一只从未接触的 NPC → 初见即警惕；行善攒正声望后换新 NPC 初见即友善
7. **协作**：把 ≥2 只 NPC 引到同一群怪旁（或带队清怪）→ 看 leader 播报、flanker 绕后包抄，面板显示分工
