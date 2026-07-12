# 14 · LLM 大脑深入 + Java 对照（专题）

> 承接 `13-行为树深入-Java对照.md`。上一篇讲了 NPC 的「身体」（行为树，每 tick 高频执行）；这一篇讲 NPC 的「大脑」——接大模型（LLM）做**低频决策**。
>
> 这部分对 Java 程序员特别有价值，因为它把 Node.js 三个最核心的特性揉在一起演示了：**异步不阻塞**、**Promise 链式处理**、**优雅降级**。同时它也是「如何把不可靠的 LLM 塞进一个实时系统还不让它拖垮游戏」的实战范本。

涉及的源码：

| 文件 | 职责 |
| --- | --- |
| `ai/llm/types.ts` | 契约：`LLMIntent`（意图白名单）、`LLMDirective`（决策结果）、`LLMGameSnapshot`（世界快照） |
| `ai/llm/LLMProvider.ts` | Provider 抽象 + 三个实现（云端 / 本地 Ollama / Mock 规则引擎）+ prompt 工程 + 防御性解析 |
| `ai/llm/LLMBrain.ts` | 异步决策调度器：何时该问模型、防重入、把结果落到 NPC 黑板 |
| `ai/llm/memory.ts` | 每个 NPC 独立的记忆 + 玩家关系图谱 |
| `systems/EnemyAISystem.ts` | 每 tick 调 `brain.tick(...)`（上一篇已讲） |

---

## 一、一句话架构：大脑决定「想干什么」，身体决定「怎么干」

先把最重要的心智模型立住：

```
         低频（每 4 秒左右，异步）              高频（每 50ms，同步）
  ┌─────────────────────────────┐      ┌──────────────────────────┐
  │  LLM 大脑 (LLMBrain)         │      │  行为树 (BT)              │
  │  · 攒一份世界快照            │      │  · 每 tick 读 llmDirective │
  │  · 异步请求模型              │─────▶│  · 按 intent 执行动作      │
  │  · 得到 directive(意图+台词) │ 写   │    (追/打/逃/跟随/带路…)   │
  │  · 写到 enemy.llmDirective   │ 黑板 │  · 只设 velocity           │
  └─────────────────────────────┘      └──────────────────────────┘
```

**为什么必须分离？** 三个硬约束：

1. **LLM 慢**：一次请求几百毫秒到几秒。而游戏 tick 是 50ms 一次。不可能每 tick 都等模型。
2. **LLM 是异步 I/O**：在 Node 单线程模型里，你**绝对不能**同步等它——否则等待的这几秒，全服所有玩家都卡死（见 `00` 文档第 2.1 节）。
3. **LLM 会犯错**：可能超时、返回垃圾 JSON、幻觉出不存在的动作。实时系统不能被它带崩。

所以设计成：大脑**偶尔、异步地**产出一个「意图」（`LLMDirective`），身体**持续、同步地**读这个意图去执行。二者通过 `enemy.llmDirective` 这块黑板解耦。

> Java 类比：想象一个后台线程池定期调外部 AI 服务，把结果写进一个 `volatile` 字段；游戏主循环每帧读这个字段。区别是 Node 里没有"另一个线程"，异步靠事件循环调度——但**编程模型上你可以就当它是"后台在跑，好了通知我"**。

---

## 二、契约先行：三个关键类型（types.ts）

和行为树一样，先看类型契约，等于先看清楚"数据长什么样"。

```typescript
// 1. 意图白名单 —— 模型只能从这几个里选，防止幻觉出非法动作
export type LLMIntent =
  | 'attack' | 'flee' | 'patrol' | 'taunt' | 'hunt' | 'follow'
  | 'guide' | 'escort' | 'follow_npc';

// 2. 一次决策的结果 —— 挂在 enemy 黑板上供 BT 读取
export interface LLMDirective {
  intent: LLMIntent;    // ★ 核心：想干什么
  speech?: string;      // 可选台词（对玩家说的话）
  reason?: string;      // 决策理由（调试用）
  via?: string;         // 哪个模型产出的（local:xxx / cloud:xxx / mock）
  decidedAt: number;
}

// 3. 送给 LLM 的世界快照 —— 结构化，绝不把整个 GameWorld 塞给模型
export interface LLMGameSnapshot {
  npcName; personality; hp; maxHp; zoneName; weather;
  nearbyPlayers: Array<{ name; distance; hp; tag? }>;  // 附近玩家（含声望标签）
  chatFrom?; chatText?;                                 // 玩家刚说的话
  memoryRecent; playerRelations; mood; zoneRumors;      // 记忆 / 关系 / 心情 / 传闻
  // … 还有小队、A2A 协作、能力清单等
}
```

`LLMIntent` 这个联合类型在 Java 里就是 `enum LLMIntent { ATTACK, FLEE, PATROL, ... }`。**它的作用是"契约"**——大脑输出的意图必须是这几个之一，身体（行为树）也只认这几个。模型返回别的一律拒绝（后面第五节讲）。

`LLMGameSnapshot` 是个典型 **DTO**（数据传输对象）。**关键设计：不把 `GameWorld` 整个丢给模型**，而是精心挑选、压缩成一份结构化快照。原因有二：省 token（省钱/提速）、聚焦（给模型太多噪音反而决策变差）。

---

## 三、Provider 抽象：策略模式 + 三级降级

`LLMProvider.ts` 定义了一个极简接口：

```typescript
export interface LLMProvider {
  decide(snapshot: LLMGameSnapshot): Promise<LLMDirective>;
}
```

一个方法：给你一份快照，（异步地）还我一个决策。返回 `Promise<LLMDirective>` = Java 的 `CompletableFuture<LLMDirective>`。

它有**三个实现**，这就是**策略模式**：

| 实现 | 场景 | 说明 |
| --- | --- | --- |
| `OpenAICompatibleProvider` | 云端 | DeepSeek / OpenAI 兼容 API，强模型 |
| `OllamaProvider` | 本地 | 本地跑 Ollama（Qwen 等），隐私 + 免费 |
| `MockLLMProvider` | 无 Key 兜底 | 纯规则引擎，不调任何模型也能玩 |

工厂函数按配置挑一个（`createLLMProvider`）：

```typescript
export function createLLMProvider(apiKey, apiUrl, model): LLMProvider {
  if (GameConfig.LLM_LOCAL_ENABLED) return new OllamaProvider({...});  // 本地优先
  if (apiKey) return new OpenAICompatibleProvider({...});              // 有 key 走云端
  return new MockLLMProvider();                                        // 都没有 → Mock
}
```

> Java 类比：这就是面向接口编程。`LLMProvider` 是接口，三个 `@Service` 实现，一个工厂（或 Spring 的 `@Conditional`）按配置注入其一。调用方 `LLMBrain` 只依赖接口，不知道背后是云、本地还是 Mock。

**更妙的是"三级降级"**：不只是启动时选一个，而是**运行时任一层失败自动跌落**：

```typescript
// OpenAICompatibleProvider.decide —— 内部持有一个 mock 兜底
private readonly mockFallback = new MockLLMProvider();

async decide(snapshot) {
  try {
    const res = await fetch(...);           // 调云端
    // ...解析...
    if (directive) return directive;        // 成功
  } catch (err) {
    logger.warn(`调用失败，回退 Mock`);      // 网络/超时/非2xx
  }
  return this.mockFallback.decide(snapshot); // ★ 降级：绝不抛异常中断
}
```

层层兜底：**云端挂 → 本地 → Mock 规则 → 最起码巡逻**。核心信条写在注释里：

> 「任何传输或解析失败都自愈到 Mock 规则引擎，保证游戏永不因 LLM 卡住。」

这是把"不可靠的外部依赖"接入"必须稳定的实时系统"的**黄金原则**：外部服务只能锦上添花，绝不能成为单点故障。Java 里你会用 Resilience4j 的 fallback、Hystrix 的熔断达到同样目的，这里手写了一份轻量版。

---

## 四、异步调度器 LLMBrain：Node 异步的集大成者

`LLMBrain.tick()` 每个游戏 tick 都被调用，但它**不是每次都真的请求模型**。它是个"调度器"，决定"这一 tick 要不要为某个 NPC 发起一次决策"。

### 4.1 防重入：`pending` Set

```typescript
export class LLMBrain {
  private readonly pending = new Set<number>();  // 正在等模型返回的 NPC id

  private requestDecision(world, enemy, now): void {
    if (this.pending.has(enemy.id)) return;      // ★ 已有在途请求 → 不重复发
    this.pending.add(enemy.id);
    this.provider.decide(snapshot)
      .then(directive => { /* 落地 */ })
      .catch(err => { /* 降级 */ })
      .finally(() => { this.pending.delete(enemy.id); });  // ★ 无论成败都释放
  }
}
```

**这是 Node 异步里极其重要的一个模式。** 因为 `decide()` 是异步的（可能跑几秒），而 `tick` 每 50ms 就来一次。如果不防护，同一个 NPC 会被发起几十次并发请求。用一个 `pending` Set 记录"谁的请求还在飞"，在途就跳过。

> Java 类比：等价于一个 `Set<Integer> inFlight`（并发场景要用 `ConcurrentHashMap.newKeySet()`）追踪进行中的异步任务，避免重复提交。但注意——**Node 单线程，这个 `Set` 用普通 `Set` 就行，不用并发容器**。`then/catch/finally` 的回调也都在同一线程排队执行，不会有两个回调同时改这个 Set。这又是单线程免锁的红利。

`Promise.then().catch().finally()` 精确对应 Java 的 `CompletableFuture`：

| Node Promise | Java CompletableFuture |
| --- | --- |
| `.then(v => ...)` | `.thenAccept(v -> ...)` |
| `.catch(e => ...)` | `.exceptionally(e -> ...)` |
| `.finally(() => ...)` | `.whenComplete((v, e) -> ...)` |

注意这里是 **fire-and-forget**：`requestDecision` 发起请求后**立刻返回**，不 `await`。结果通过 `.then` 回调在未来某个 tick 之间落地。`tick()` 本身从不阻塞——这才对得起单线程。

### 4.2 省 token：只在"值得"时才问模型

调 LLM 要花钱（云端）或占算力（本地），所以 `tick` 里有一套"要不要问"的判断（`assessSituation`）：

```typescript
tick(world, now, intervalMs): void {
  for (const enemy of world.enemies.values()) {
    if (!enemy.llmEnabled || enemy.isDead) continue;
    if (this.pending.has(enemy.id)) continue;          // 在途，跳过

    if (enemy.llmChatPending) { this.requestDecision(...); continue; } // 玩家说话 → 即时响应

    const { engaged, sig } = this.assessSituation(world, enemy);
    if (!engaged) continue;                            // ① 附近没玩家、没在跟随 → 根本不问，交给 BT 巡逻

    const elapsed = now - enemy.llmLastRefresh;
    if (elapsed < intervalMs) continue;                // ② 基础限频（如每 4s 最多一次）
    if (sig === enemy.llmSituation && elapsed < intervalMs * HOLD_MULT) continue; // ③ 情形没变 → 拉长间隔

    enemy.llmSituation = sig;
    this.requestDecision(world, enemy, now);
  }
}
```

三道闸门，逐层省：

1. **`engaged` 门**：附近没有活玩家、又没在执行跟随/护送/狩猎任务 → NPC 的台词和意图对玩家毫无意义，**完全不调 LLM**，让行为树自己巡逻。
2. **限频门**：同一 NPC 最快 `intervalMs`（如 4 秒）才问一次。
3. **情形签名门**：`sig` 是把"决策输入"桶化成的一个指纹字符串——

```typescript
const sig = [
  near.sort().join(','),              // 附近有谁
  Math.round(enemy.hp/enemy.maxHp*4), // 血量分 4 桶
  Math.round(enemy.mood / 25),        // 心情分桶
  following ? 'F' : '', hunting ? 'H' : '',
  world.dayPhase,                     // 昼夜
].join('|');
```

如果这一 tick 算出的 `sig` 和上次决策时一样（比如双方站着对峙、血量心情都没变），说明"局面没变化"，就把重问间隔拉长到 `间隔 × HOLD_MULT`——**静态对峙不必每 4 秒追问模型同一个问题**。

> 这套"输入指纹去重"思想在 Java 缓存里很常见：把入参 hash 成一个 key，key 没变就复用上次结果。这里更进一步，用它来节流"要不要重新计算"。

### 4.3 玩家聊天：即时插队

普通战术决策是低频的，但**玩家发消息给 NPC 时必须即时回应**（`onPlayerChat`）：把消息记进 `enemy.llmChatPending`，`tick` 里一看到有 pending chat 就立刻 `requestDecision`，绕过限频。同时用正则先做一层"快速意图识别"（`跟着我` → follow、`帮我打` → hunt），既能在模型慢时先响应，也给模型一个明确上下文。

---

## 五、Prompt 工程 + 防御性解析：驯服不可靠的模型

这是最能体现"工程 vs 玩具"差距的部分。让 LLM 稳定吐出合法 JSON，需要一整套防御。

### 5.1 两段式 Prompt

- **System Prompt 是常量**（`SYSTEM_PROMPT`）：定义角色、输出格式（只输出 JSON）、意图白名单、行为准则（默认中立、残血逃跑…）。做成常量有个隐藏收益——**稳定前缀能命中 DeepSeek 的上下文缓存**，省钱提速。
- **User Prompt 分两档**（`buildUserPrompt`）：
  - 无对话（战术刷新）：只带即时战况 + 2 条近况，丢弃长上下文 → 省 token。
  - 有对话（社交）：带完整人格、记忆、关系、传闻，让 NPC 扮演到位。

> Java 类比：System Prompt = 一个 `static final String`；User Prompt = 用 `StringBuilder` 按条件拼接。没什么新概念，但"按场景裁剪上下文以控成本"是 LLM 应用的核心工程活。

### 5.2 三重防御性解析

模型（尤其小模型）输出的 JSON 经常有瑕疵：包在 markdown 代码块里、多一个括号、被 `max_tokens` 截断、混入思维链。`parseDirective` 层层清洗：

```typescript
extractJson(raw)     // ① 从 ```json ... ``` 或第一个{到最后一个}里抠出 JSON
repairJsonText(json) // ② 修多余的 }}、补缺失的 }
JSON.parse(json)     // ③ 正常解析
// 失败则正则兜底 readStrField() 直接抠 "intent"/"speech" 字段（应对截断）
stripThink(text)     // ④ 剥掉推理模型的 <think>...</think> 思维链
```

然后是**意图白名单校验**（`resolveIntent`）——这是防幻觉的关键：

```typescript
function normalizeIntent(value): LLMIntent | null {
  const v = value.trim().toLowerCase();
  return VALID_INTENTS.includes(v) ? v : null;  // 不在白名单 → null（拒绝）
}
// 还兼容模型输出中文："攻击"→attack、"逃跑"→flee …
```

模型返回 `"intent": "dance"`？不在白名单，拒绝。返回中文 `"攻击"`？映射成 `attack`。**永远不信任模型输出，先校验再用**——这和 Java 后台"永远校验外部输入"是同一条铁律。

### 5.3 超时控制

```typescript
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), this.opts.timeoutMs); // 到点掐断
const res = await fetch(url, { signal: controller.signal, ... });
```

`fetch` + `AbortController` = Java 的 `HttpClient` + `.timeout(Duration)`。本地模型可能慢到分钟级，超时就 abort 并降级 Mock，绝不让一个慢请求拖着 NPC 一直不决策。

---

## 六、服务端权威 Guard：不让模型说了算

模型输出经过解析后**不是直接采用**，而是先过一串"守卫"（`applyXxxGuard`），用服务端规则**覆盖/修正**模型的决策。这是"服务器权威"原则在 AI 层的体现——模型只是建议，服务端说了算。

```typescript
this.provider.decide(snapshot).then(directive => {
  this.applyNeutralGuard(enemy, directive, snapshot);  // 没被挑衅 → 禁止 attack
  this.applyHuntGuard(enemy, directive);               // 没接委托 → 禁止 hunt
  this.applyFollowState(world, enemy, directive, ...);  // follow 是持久态，别被 patrol 覆盖
  this.applyA2aState(enemy, directive, snapshot);       // 带路/护送同理
  enemy.llmDirective = directive;                       // 修正后才落地
  // ...
});
```

举例 `applyNeutralGuard`：模型一时兴起想 `attack` 玩家，但如果这个玩家没先动手、也没在聊天里挑衅，守卫会把 `attack` 强制改成 `taunt`/`patrol`：

```typescript
private applyNeutralGuard(enemy, directive, snapshot): void {
  if (directive.intent !== 'attack') return;
  if (canNpcAttackPlayer(enemy, chatFrom, chatText)) return;  // 被挑衅了 → 放行
  // 检查历史关系：曾被这玩家打过才允许还手
  if (anyHostile) return;
  directive.intent = chatText ? 'taunt' : 'patrol';           // ★ 否则强制降级为不打
}
```

> Java 类比：这就是一条**责任链 / 拦截器链**（`Filter` chain）。每个 guard 是一个拦截器，对"模型建议"这个对象做校验和修正，再传给下一个。业务规则（中立、委托、跟随持久化）集中在这里，与"怎么调模型"完全解耦。

---

## 七、记忆系统：让 NPC 是个「有状态的 Agent」

`memory.ts` 给每个 LLM NPC 一份**独立的记忆**，存在 `Enemy` 对象上（`llmMemory` 事件流 + `llmRelations` 关系图谱）。这让 NPC 不是无状态的问答机器，而是"记得你"的 Agent。

**两类记忆**：

```typescript
// ① episodic：时间序事件流（聊天/战斗/结伴）
interface NpcMemoryEntry { at: number; kind: 'chat_in'|'combat'|'bond'|...; text: string; }

// ② relations：按玩家名的信任分 + 标签
interface NpcPlayerRelation { trust: number; chats; hits; helped; label: string; }
```

**信任分随交互涨落**，直接影响 NPC 态度：

```typescript
onPlayerChat: 打招呼 +3、说"我不打你" +18、挑衅 -15
onPlayerHit:  被玩家攻击 -22，trust<-30 标记为"袭击者"
onPlayerHeal: 被治疗 +10，高信任标记"恩人"
onNpcDeath:   被击杀 -50，标记"仇人"
```

信任分映射成标签（`relLabel`）：`挚友(≥60) / 友善(≥30) / 熟人(≥10) / 中立 / 警惕 / 敌对(<-40)`。这个标签和信任分会注入到下次的 prompt 里，模型据此调整语气——**你打过它，它下次就对你有戒心**。

**记忆压缩（控 token）**：记忆不能无限长，`add()` 里做了淘汰——超过上限时，把最老的 4 条压成一句归档摘要（`llmArchives`），归档也只留最近 5 条：

```typescript
while (enemy.llmMemory.length > max) {
  const chunk = enemy.llmMemory.splice(0, 4);          // 取最老 4 条
  enemy.llmArchives.push(chunk.map(e => e.text).join(' → ').slice(0, 120));  // 压成一句
}
```

这是"短期详细记忆 + 长期摘要记忆"的分层，和人的记忆一样，也和 LangChain 里的 memory 压缩策略一个思路。

> Java 类比：`NpcMemory` 全是 `static` 方法，操作传入的 `Enemy`——是个**无状态工具类**（像 `Collections`），状态本身存在 `Enemy` 上。事件流用 `List` + 超长 `splice` 淘汰，关系图谱用 `Map<String, Relation>`。都是你熟悉的集合操作。

---

## 八、完整数据流：一次「玩家搭话 NPC」走通全程

把所有模块串起来，看玩家对 NPC 说"你好"会发生什么：

```
1. 玩家发聊天 → ChatSystem → LLMBrain.onPlayerChat(world, player, "你好", now)
2. resolveChatTarget：路由给点名的 / 最近的那只 LLM NPC
3. 记忆更新：NpcMemory.onPlayerChat（信任 +3，记一条 chat_in）
4. 正则快判：不是 follow/hunt 指令 → 存 enemy.llmChatPending，等决策
5. requestDecision：
   a. buildSnapshot：攒快照（自身状态 + 附近玩家 + 记忆摘要 + 关系 + 心情 + 传闻 + 能力…）
   b. pending.add(id)，fire-and-forget 调 provider.decide(snapshot)
   c. provider：拼 prompt → fetch 模型（超时保护）→ 解析 JSON → 白名单校验 → 得 directive
      （失败则层层降级到 Mock）
6. .then(directive)：
   a. 过 guards（中立守卫/跟随态/…）修正意图
   b. enemy.llmDirective = directive（★ 写黑板）
   c. 有 speech → 记进记忆 + broadcastNpcChat 广播给附近玩家（客户端弹对话气泡）
7. .finally：pending.delete(id)
8. 之后每个 tick：行为树 buildLlmNpcTree 读 enemy.llmDirective.intent，
   执行对应动作（这里是 taunt/patrol → 站着说话/游荡）
```

**注意第 5b 到第 8 之间隔了好几个 tick**（模型要跑几百毫秒到几秒）。这期间游戏照常运行、其他玩家照常移动——因为整条 LLM 链路是**异步、非阻塞**的。台词广播出去时，可能已经是玩家说完话之后一两秒了，但游戏体验上完全流畅。

---

## 九、这套设计教给你的 Node.js / 工程要点

1. **异步不阻塞是铁律**：LLM 链路全程 `async/await` + fire-and-forget，`tick` 从不 `await` 模型。这是单线程服务器的生命线。

2. **Promise 三件套**：`.then/.catch/.finally` 对应 Java `CompletableFuture` 的 `thenAccept/exceptionally/whenComplete`。`finally` 里释放 `pending` 是防重入的关键。

3. **单线程免锁**：`pending` Set、`enemy.llmDirective` 黑板、记忆的读写，全程无锁。Java 多线程做同样的事要用并发容器 + 可见性保证（`volatile`）。

4. **面向接口 + 策略 + 降级**：`LLMProvider` 一个接口三个实现，运行时层层跌落到 Mock。外部依赖只加分不减分。

5. **永不信任外部输出**：extractJson/repairJson/白名单/超时——把不可靠的模型当成"敌意输入"来防御。

6. **服务端权威延伸到 AI**：模型只给建议，guards 用业务规则做最终裁决。

7. **成本意识**：engaged 门 + 情形签名 + prompt 分档 + 记忆压缩，四处省 token。工程 LLM 应用一半的功夫在"少调、调得准"。

---

## 一页纸总结

- **大脑（LLM，低频异步）+ 身体（BT，高频同步）** 通过 `enemy.llmDirective` 黑板解耦。
- LLM 慢、异步、会犯错 → 绝不能同步等它，绝不能让它拖垮 tick。
- **调度器 `LLMBrain`**：`pending` Set 防重入，fire-and-forget，`.then/.catch/.finally` 落地。
- **省 token 三道门**：无人在场不问 / 基础限频 / 情形签名没变就拉长间隔。
- **Provider 策略模式**：云端 / 本地 / Mock 三实现 + 运行时三级降级 = 永不因 LLM 卡死。
- **防御性解析**：抠 JSON → 修 JSON → 白名单校验意图 → 超时 abort。
- **服务端权威 guards**：模型建议 → 拦截器链修正 → 才落地。
- **记忆系统**：episodic 事件流 + 关系信任图谱 + 归档压缩，让 NPC 记得你。
- 你的 Java 知识全部适用（接口/策略/责任链/DTO/CompletableFuture），换的是"异步不阻塞"和"驯服不可靠 LLM"这两层工程直觉。
