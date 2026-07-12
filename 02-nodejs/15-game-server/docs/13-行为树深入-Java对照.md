# 13 · 行为树深入 + Java 对照（专题）

> 承接 `00-架构导读与Java对照.md` 第 5.9 节，这一篇把**行为树（Behavior Tree, BT）**单独拎出来讲透。
>
> 行为树是本项目里最能体现「设计模式」功力的部分，而且它在 Java 游戏圈同样是标准做法（libgdx-ai、游戏引擎里的 AI 都用它）。所以我会**大量并排贴 Java 等价代码**，你会发现：这套东西的思想和语言无关，就是**组合模式（Composite Pattern）**的一次漂亮应用。

涉及的源码：

| 文件 | 职责 |
| --- | --- |
| `ai/bt/types.ts` | 类型契约：`NodeStatus`、`BTNode`、黑板 `BTContext` |
| `ai/bt/nodes.ts` | 通用节点库：Selector / Sequence / Inverter / Condition / Action |
| `ai/bt/enemyActions.ts` | 敌人专用叶子：探测 / 攻击 / 追击 / 逃跑 / 巡逻 / 仇恨转移 |
| `ai/bt/enemyTree.ts` | 把叶子装配成一棵「普通敌人」的树 |
| `ai/bt/llmNpcTree.ts` | 「LLM NPC」的树（大脑决策 + 身体执行分离） |
| `systems/EnemyAISystem.ts` | 执行器：每 tick 驱动每个敌人的树 |
| `core/Enemy.ts` | 敌人实体，也是行为树的「黑板」载体 |

---

## 一、先问：为什么不用 if-else / 状态机？

假设不用行为树，敌人 AI 你会怎么写？大概是这样一坨（旧版本就是这样）：

```typescript
// ❌ 手写状态机 / if-else —— 能跑，但会越滚越大
function updateEnemy(enemy) {
  const target = findNearestPlayer(enemy);
  if (target) {
    if (enemy.kind === 'slime' && lowHp(enemy)) {
      flee(enemy, target);
    } else if (inRange(enemy, target)) {
      attack(enemy, target);
    } else {
      chase(enemy, target);
    }
  } else {
    patrol(enemy);
  }
}
```

这在敌人只有一种行为时没问题。但需求会长大：

- slime 残血逃跑、demon 残血狂暴、骷髅正常打
- 被友方 NPC 帮忙打时要「拉仇恨」回头打 NPC
- LLM NPC 还要能跟随玩家、护送、带路、狩猎指定怪……

**用 if-else 硬写，很快就变成几百行、七八层缩进、种类判断和优先级判断缠在一起的"意大利面"**。改一个分支要担心影响另一个，加一个行为要在多处埋判断。

行为树的核心价值一句话：

> **把「行为」从「控制流」变成「数据结构」。** 决策逻辑变成一棵可读、可组合、可局部修改的树；加行为 = 插一个节点，而不是改一堆 if。

对比一下本项目的敌人树声明（`enemyTree.ts`），它读起来几乎就是需求本身：

```typescript
sel(                                    // 优先级：从上到下
  seq(hasAggroNpc, ...攻击那个NPC),      // 0. 被拉仇恨 → 打 NPC
  seq(acquireTarget,                    // 1. 探测到玩家 →
    sel(
      seq(slimeLowHp, flee),            //    slime 残血就跑
      seq(inAttackRange, attack),       //    够得着就打
      chase,                            //    够不着就追
    )),
  patrol,                               // 2. 没目标 → 巡逻
)
```

需求 = 代码结构，这就是行为树的魅力。

---

## 二、核心语义：三种执行结果

FSM（有限状态机）关心「我现在处于哪个状态」；行为树不存"当前状态"，而是**每 tick 从根节点重新跑一遍整棵树**，每个节点返回三种结果之一（`types.ts`）：

```typescript
export type NodeStatus = 'success' | 'failure' | 'running';
```

| 结果 | 含义 | 例子 |
| --- | --- | --- |
| `success` | 做完了，且成功 | 「已攻击」「已到达」 |
| `failure` | 做不了 / 条件不成立 | 「视野里没目标」 |
| `running` | 还在进行中，下一 tick 继续 | 「正在追击」「正在巡逻」 |

`running` 是行为树区别于普通函数的关键。一次 `chase` 不会一步追到，它返回 `running` 表示"这事得跨很多帧慢慢做"。下一 tick 树再跑到它，它继续追。

Java 里等价的类型就是一个枚举：

```java
public enum NodeStatus { SUCCESS, FAILURE, RUNNING; }

public interface BTNode {
    NodeStatus tick(BTContext ctx);
}
```

对照 TS 的节点接口（`types.ts`）：

```typescript
export interface BTNode {
  tick(ctx: BTContext): NodeStatus;
}
```

**几乎一模一样**。TS 的 `interface` 和 Java 的 `interface` 在这里是同一个概念。

---

## 三、三类节点 = 组合模式

行为树就三类节点，全在 `nodes.ts` 里，加起来不到 70 行。

### 3.1 组合节点（Composite）：Selector 和 Sequence

它们**持有一组子节点**，自己不干活，只决定"按什么规则调度孩子"。这就是**组合模式**——树枝和树叶实现同一个接口，树枝把调用转发给孩子。

**Selector（选择器）= 逻辑或 / 优先级 / fallback**：

```typescript
export class Selector implements BTNode {
  constructor(private readonly children: BTNode[]) {}
  tick(ctx: BTContext): NodeStatus {
    for (const child of this.children) {
      const s = child.tick(ctx);
      if (s !== 'failure') return s;  // 遇到第一个「非 failure」就冒泡返回
    }
    return 'failure';                 // 全 failure 才 failure
  }
}
```

读法：**「从左到右试，谁能干成（或正在干）就用谁，全都干不了才失败」**。这就是"优先级 / 退而求其次"。

**Sequence（序列）= 逻辑与 / 按步骤**：

```typescript
export class Sequence implements BTNode {
  constructor(private readonly children: BTNode[]) {}
  tick(ctx: BTContext): NodeStatus {
    for (const child of this.children) {
      const s = child.tick(ctx);
      if (s !== 'success') return s;  // 遇到第一个「非 success」就中断冒泡
    }
    return 'success';                 // 全 success 才 success
  }
}
```

读法：**「从左到右依次做，一步失败（或还在进行）就停，全做完才成功」**。常见套路是 `Sequence(条件, 动作)`——条件不成立（failure）就整条中断，条件成立（success）才执行动作。

它俩的 Java 版：

```java
public class Selector implements BTNode {
    private final List<BTNode> children;
    public Selector(BTNode... children) { this.children = List.of(children); }
    public NodeStatus tick(BTContext ctx) {
        for (BTNode child : children) {
            NodeStatus s = child.tick(ctx);
            if (s != NodeStatus.FAILURE) return s;
        }
        return NodeStatus.FAILURE;
    }
}

public class Sequence implements BTNode {
    private final List<BTNode> children;
    public Sequence(BTNode... children) { this.children = List.of(children); }
    public NodeStatus tick(BTContext ctx) {
        for (BTNode child : children) {
            NodeStatus s = child.tick(ctx);
            if (s != NodeStatus.SUCCESS) return s;
        }
        return NodeStatus.SUCCESS;
    }
}
```

**逻辑逐行对应，只是语法不同。** 如果你把 TS 版看懂了，Java 版不用解释。

> 记忆口诀：
> **Selector 找成功**（一个成功就够，像 `||` 短路）；
> **Sequence 找失败**（一个失败就崩，像 `&&` 短路）。

### 3.2 装饰节点（Decorator）：Inverter

只包**一个**子节点，改写它的结果。项目里有个取反器：

```typescript
export class Inverter implements BTNode {
  constructor(private readonly child: BTNode) {}
  tick(ctx: BTContext): NodeStatus {
    const s = this.child.tick(ctx);
    return s === 'success' ? 'failure' : s === 'failure' ? 'success' : 'running';
    //     success↔failure 互换，running 原样透传
  }
}
```

这是**装饰器模式**：同一个接口，包一层加工输出。Java 里就是持有一个 `BTNode child` 的实现类。

### 3.3 叶子节点（Leaf）：Condition 和 Action

叶子是真正干活的地方，不再有子节点。

```typescript
export class Condition implements BTNode {            // 判断，返回 success/failure
  constructor(readonly name: string, private readonly fn: (ctx: BTContext) => boolean) {}
  tick(ctx: BTContext): NodeStatus {
    return this.fn(ctx) ? 'success' : 'failure';
  }
}

export class Action implements BTNode {               // 执行，可返回 running
  constructor(readonly name: string, private readonly fn: (ctx: BTContext) => NodeStatus) {}
  tick(ctx: BTContext): NodeStatus {
    return this.fn(ctx);
  }
}
```

注意这里的巧思：`Condition` 和 `Action` 都是**把一个函数包成节点**。`fn` 是一个函数（`(ctx) => boolean`）。在 Java 里，这就是把一个 **函数式接口（`Function`/`Predicate`）** 包进对象：

```java
public class Condition implements BTNode {
    private final String name;
    private final Predicate<BTContext> fn;      // ≈ TS 的 (ctx) => boolean
    public Condition(String name, Predicate<BTContext> fn) { this.name = name; this.fn = fn; }
    public NodeStatus tick(BTContext ctx) {
        return fn.test(ctx) ? NodeStatus.SUCCESS : NodeStatus.FAILURE;
    }
}

public class Action implements BTNode {
    private final String name;
    private final Function<BTContext, NodeStatus> fn;   // ≈ TS 的 (ctx) => NodeStatus
    public Action(String name, Function<BTContext, NodeStatus> fn) { this.name = name; this.fn = fn; }
    public NodeStatus tick(BTContext ctx) { return fn.apply(ctx); }
}
```

> TS 里「函数是一等公民」，可以直接当参数传；Java 8 之后用 `Predicate`/`Function`/`Supplier` 这些函数式接口 + Lambda 达到同样效果。你在这个项目里看到的 `(ctx) => boolean`，脑补成 Java 的 `Predicate<BTContext>` 即可。

### 3.4 简写工厂：让树读起来像伪代码

`nodes.ts` 末尾几个小工厂函数，纯粹为了少打字、让树的声明更好看：

```typescript
export const sel  = (...c: BTNode[]) => new Selector(c);
export const seq  = (...c: BTNode[]) => new Sequence(c);
export const cond = (name, fn) => new Condition(name, fn);
export const act  = (name, fn) => new Action(name, fn);
```

`...c` 是 **rest 参数**（收集任意多个参数成数组），等于 Java 的**可变参数** `BTNode... c`。所以 `sel(a, b, c)` 就是 `new Selector([a, b, c])`。

---

## 四、黑板（Blackboard）：无状态的树 + 有状态的数据

这是行为树设计里非常重要、初学者最容易忽略的一点。

**树本身是无状态的，可以被同种敌人共享同一棵实例。** 看执行器 `EnemyAISystem`：

```typescript
private readonly trees: Partial<Record<EnemyKind, BTNode>> = {};
private treeFor(kind: EnemyKind, llm: boolean): BTNode {
  return this.trees[kind] ?? (this.trees[kind] = buildEnemyTree(kind));  // 懒构建 + 缓存
}
```

一种敌人（比如所有 slime）**只构建一棵树**，所有 slime 共用。那每只 slime 各自的"记忆"（血量、目标、巡逻点）放哪？放在**黑板** `BTContext`（`types.ts`）：

```typescript
export interface BTContext {
  enemy: Enemy;              // ★ 当前这只敌人（每只不同）
  world: GameWorld;          // 世界引用（查玩家、广播）
  dt: number;                // 本 tick 时间增量（秒）
  now: number;               // 当前时间戳
  target: Player | null;     // 探测节点写入：锁定的玩家
  mobTarget: Enemy | null;   // LLM NPC 狩猎的怪
  aggroNpc: Enemy | null;    // 仇恨转移目标
}
```

每 tick，执行器给**每只**敌人**新建一个 ctx**，再 tick 那棵共享的树：

```typescript
// EnemyAISystem.update
for (const enemy of this.world.enemies.values()) {
  if (enemy.isDead) { /* 处理复活计时 */ continue; }
  const ctx: BTContext = { enemy, world: this.world, dt, now, target: null, mobTarget: null, aggroNpc: null };
  this.treeFor(enemy.kind, enemy.llmEnabled).tick(ctx);  // 同种敌人共享树，ctx 各自独立
  this.applyMovement(enemy, dt);                          // 树只设 velocity，这里统一落到 position
}
```

黑板分两层存储：
- **短命数据**（`target`/`mobTarget`/`aggroNpc`）：只活一个 tick，放 ctx，探测节点写、后续节点读。
- **跨 tick 记忆**（血量、`patrolTarget`、`idleTimer`、`enraged`、`aggroNpcId`…）：存在 `Enemy` 对象上（见 `core/Enemy.ts` 的一堆字段），tick 之间保留。

> Java 类比：这是典型的**享元模式（Flyweight）** —— 树是共享的"内在状态"（无状态、可复用），`Enemy`+`ctx` 是"外在状态"（每个实例独有）。你在 Java 里也会这么设计：一个 `Map<EnemyKind, BTNode>` 缓存树，`tick(enemy, ctx)` 时把实例数据通过参数传进去。

**为什么这么设计？** 内存和性能。假设有 500 只 slime，如果每只都 `new` 一棵完整的树（十几个节点对象），就是几千个对象，还要 GC。共享一棵树后，只有轻量的 ctx 是每 tick 临时创建的。

---

## 五、敌人树逐行拆解

现在把 `enemyTree.ts` 完整读一遍。种类差异（slime/demon/…）通过**闭包捕获 `kind`** 注入到条件里——这是个很聪明的技巧。

```typescript
export function buildEnemyTree(kind: EnemyKind): BTNode {
  return sel(
    // ── 分支 0：仇恨转移。被 NPC 帮忙揍时，回头死磕那个 NPC ──────────────
    seq(
      cond('hasAggroNpc', hasAggroNpc),          // 条件：当前锁着某个 NPC 仇恨？
      sel(
        seq(cond('inAggroRange', inAggroAttackRange), act('attackAggroNpc', attackAggroNpc)),
        act('chaseAggroNpc', chaseAggroNpc)
      )
    ),
    // ── 分支 1：常规战斗。探测到玩家后按优先级决策 ────────────────────────
    seq(
      cond('acquireTarget', acquireTarget),      // 条件：探测范围内有玩家？（写入 ctx.target）
      sel(
        // 1a. slime 残血逃跑（闭包捕获 kind：非 slime 此条恒 failure，自然跳过）
        seq(cond('slimeLowHp', (c) => kind === 'slime' && isLowHp(c)), act('flee', flee)),
        // 1b. 进入攻击距离 → 攻击（内部走冷却）
        seq(cond('inAttackRange', inAttackRange), act('attack', attack)),
        // 1c. 否则追击（demon 残血在 chase 内自动狂暴加速）
        act('chase', chase)
      )
    ),
    // ── 分支 2：什么都没有 → 巡逻游荡 ──────────────────────────────────
    act('patrol', patrol)
  );
}
```

### 闭包注入种类差异

看这行：

```typescript
seq(cond('slimeLowHp', (c) => kind === 'slime' && isLowHp(c)), act('flee', flee))
```

`(c) => kind === 'slime' && isLowHp(c)` 这个箭头函数**捕获了外层的 `kind` 参数**（闭包）。构建 skeleton 的树时 `kind === 'skeleton'`，这个条件永远 `false` → `Condition` 返回 `failure` → 这条 `seq` 短路 → Selector 跳到下一分支。等于"逃跑分支只对 slime 存在"，却不需要为每种敌人写不同的树代码。

> Java 里没有 TS 这么轻的闭包语法，但用 Lambda 捕获 `final` 变量能达到同样效果：
> ```java
> BTNode buildEnemyTree(EnemyKind kind) {
>   return sel(
>     ...,
>     seq(cond("slimeLowHp", c -> kind == EnemyKind.SLIME && isLowHp(c)), act("flee", this::flee)),
>     ...
>   );
> }
> ```
> Lambda 里的 `kind` 就是被捕获的自由变量。

### demon 狂暴：把差异藏在动作里

demon 的狂暴不是单独一个分支，而是**藏在 `chase` 动作内部**（`enemyActions.ts`）：

```typescript
export function chase(ctx: BTContext): NodeStatus {
  const { enemy, target } = ctx;
  if (!target) return 'failure';
  if (enemy.kind === 'demon' && enemy.hp / enemy.maxHp < LOW_HP) enemy.enraged = true; // ★ 触发即锁定
  const speed = enemy.speed * (enemy.enraged ? 1.4 : 1);   // 狂暴提速 40%
  enemy.aiState = 'chase';
  moveToward(enemy, target.position.x, target.position.y, speed);
  return 'running';   // ★ 追击是持续动作，返回 running
}
```

两种设计哲学的对比很有教学意义：
- slime 逃跑 = **树结构层面**的差异（单独分支 + 闭包条件）
- demon 狂暴 = **动作内部**的差异（一个种类判断 + 一个状态位）

选哪种？如果差异会**改变决策流程**（逃跑是全新行为），用分支；如果只是**同一行为的参数调整**（追还是追，只是快了点），藏动作里。

---

## 六、跟着一次 tick 走一遍（执行追踪）

假设一只 **slime，残血，视野里有玩家**。看树怎么跑：

```
根 Selector.tick()
├─ 分支0 Sequence.tick()
│   └─ cond hasAggroNpc → failure（没被 NPC 拉仇恨）
│      → Sequence 遇 failure，中断返回 failure
│   → Selector 收到 failure，继续下一分支
├─ 分支1 Sequence.tick()
│   ├─ cond acquireTarget → success（找到玩家，写入 ctx.target）
│   └─ 子 Selector.tick()
│       ├─ 分支1a Sequence.tick()
│       │   ├─ cond slimeLowHp →（kind===slime && 残血）→ success
│       │   └─ act flee → running（朝反方向逃跑）
│       │      → Sequence 全非 failure... 遇到 running 停，返回 running
│       │   → 子 Selector 收到 running（非 failure）→ 冒泡返回 running
│   → 分支1 Sequence：acquireTarget(success) 后子节点返回 running → 返回 running
│   → 根 Selector 收到 running（非 failure）→ 冒泡返回 running，结束
└─ 分支2 patrol 不会被执行到（前面已经 running）
```

**关键点**：`running` 和 `success` 一样，都会让 Selector"停下并冒泡"。所以一旦 slime 进入逃跑（running），根节点立刻返回，**不会再往下走到巡逻**。下一 tick 重新从根开始，只要还残血还有目标，又会走到 flee。

再看**骷髅，满血，玩家在攻击范围外**：

```
分支0 hasAggroNpc → failure
分支1 acquireTarget → success
  子Selector:
    1a slimeLowHp → failure（不是 slime）→ seq 短路 failure → 试下一个
    1b inAttackRange → failure（够不着）→ seq 短路 failure → 试下一个
    1c chase → running（追上去）
  → 冒泡 running
```

需求「够不着就追」，就是靠 Selector 从上往下试、`failure` 就换下一个实现的。

---

## 七、动作只设速度，不改位置（关注点分离）

注意所有移动类动作（`chase`/`flee`/`patrol`）**只设置 `enemy.velocity`**，从不直接改 `position`。真正的位移由执行器在 tick 末尾统一做（`EnemyAISystem.applyMovement`）：

```typescript
private applyMovement(enemy: Enemy, dt: number): void {
  if (enemy.velocity.x === 0 && enemy.velocity.y === 0) return;
  enemy.position.x = clamp(enemy.position.x + enemy.velocity.x * dt, ...);  // 位置 = 位置 + 速度×时间
  enemy.position.y = clamp(enemy.position.y + enemy.velocity.y * dt, ...);  // 并收敛到地图边界
}
```

**为什么分离？** 让行为树只管"决策方向/意图"，把"如何把意图落成位置、如何处理边界"这类通用机制收拢到一处。改移动规则（比如以后要给敌人也加障碍物碰撞）只改 `applyMovement` 一个地方，不用动树。这和玩家那边 `MovementSystem`「输入设速度 → tick 算位置」是同一个思路。

---

## 八、LLM NPC 树：大脑 + 身体分离

`llmNpcTree.ts` 是进阶版：给接了大模型的 NPC 用。设计精髓是**「大脑（LLM）决定意图，身体（BT）负责执行」**。

大模型不直接控制 NPC 的每一步（那样太慢、每 tick 都要请求 LLM 不现实），而是**低频地**（`LLM_DECISION_INTERVAL_MS`）产出一个「指令」（`llmDirective`，比如"想逃跑""想攻击""想巡逻"），写到 `Enemy` 上。行为树则**每 tick 高频运行**，读这个指令并落地执行：

```typescript
return sel(
  // 大脑说想逃 → 且真能锁到目标 → 执行逃跑
  seq(cond('llmFlee', (c) => hasLlmDirective(c) && llmWantsFlee(c)), cond('acquireTarget', acquireTarget), act('flee', flee)),
  seq(cond('shouldFollowNpc', shouldFollowNpc), act('followNpc', followNpc)),   // 跟随另一 NPC（被护送）
  seq(cond('shouldGuide', shouldGuide), act('guideToNpc', guideToNpc)),         // 给玩家带路
  seq(cond('shouldEscort', shouldEscort), escortSubtree),                        // 护送
  seq(cond('shouldFollow', shouldFollow), followSubtree),                        // 跟随玩家（可边跟边打怪）
  seq(cond('returnHome', shouldReturnHome), act('returnHome', returnHome)),      // 回家
  seq(cond('shouldHunt', shouldHuntMob), mobCombat),                             // 狩猎指定怪
  seq(cond('llmAttack', shouldAttackPlayer), playerCombat),                      // 大脑说打玩家
  seq(cond('llmPatrol', ...), act('patrol', patrol)),                            // 大脑说巡逻
  seq(cond('llmTaunt', ...), act('taunt', taunt), act('patrol', patrol)),        // 嘲讽
  buildEnemyTree(kind)   // ★ 兜底：什么指令都没有 → 退化成普通敌人行为
);
```

值得学的三点：

1. **优先级即数组顺序**：越靠上优先级越高。护送 > 跟随 > 打怪 > 巡逻，一目了然。
2. **子树复用**：`playerCombat`、`mobCombat`、`followSubtree`、`escortSubtree` 都是先拼好的小树，再组进大树。**树可以嵌套树**（组合模式的递归本质）。
3. **最后一行 `buildEnemyTree(kind)`**：直接把"普通敌人的整棵树"作为兜底分支挂进来。当 LLM 没给任何指令时，NPC 就退化成普通怪的行为。**整棵树被当成一个节点复用**——这正是组合模式"叶子和组合体同构"的威力。

> Java 类比：`buildLlmNpcTree` 返回的 `BTNode` 和 `buildEnemyTree` 返回的 `BTNode` 是同一个接口类型，所以后者能无缝塞进前者当孩子。这跟你在 Java 里把一个 `Component` 塞进另一个 `Composite` 是一码事。

---

## 九、仇恨转移：一个"跨实体交互"的完整案例

`enemyActions.ts` 里的 aggro（仇恨）机制值得单独看，它展示了行为树如何处理"实体之间的互动"。

场景：友方 LLM NPC 帮玩家打一只普通怪。这只怪应该"记仇"，回头打 NPC，让玩家有机会脱身。

- NPC 命中怪时调 `provokeAggro(mob, npc, now)`：给怪记下 `aggroNpcId` + `aggroUntil`（到期时间）。
- 怪的树里，**分支 0** 优先检查 `hasAggroNpc`：

```typescript
export function hasAggroNpc(ctx: BTContext): boolean {
  const { enemy, world, now } = ctx;
  if (enemy.aggroNpcId === null) return false;
  if (now >= enemy.aggroUntil) { clearAggro(enemy); return false; }        // 超时 → 放弃
  const npc = world.enemies.get(enemy.aggroNpcId);
  if (!npc || npc.isDead || !npc.llmEnabled) { clearAggro(enemy); return false; } // NPC 没了 → 放弃
  const d = dist(enemy.position, npc.position);
  if (d > enemy.detectionRange * AGGRO_LEASH_MULT) { clearAggro(enemy); return false; } // 被甩太远 → 放弃
  ctx.aggroNpc = npc;               // 写入黑板，供后续 attackAggroNpc/chaseAggroNpc 使用
  enemy.targetPlayerId = null;      // 明确放弃玩家目标
  return true;
}
```

因为这个条件在 Selector 的**最前面**，仇恨一旦成立就压倒"找玩家"的常规分支。多个"退出条件"（超时/目标消失/甩太远）任一命中就 `clearAggro` 回到常规逻辑。

**这段代码同时也是「Node.js 单线程」的一个隐性红利**：`hasAggroNpc` 里连续读了 `world.enemies`、算距离、改 `enemy` 字段，全程没有任何锁。因为整个 tick 在单线程里跑，你不可能在读 `aggroNpcId` 和写 `targetPlayerId` 之间被别的线程插入。**若在 Java 多线程游戏服务器里做同样的跨实体交互，你就要认真考虑加锁或用无锁结构了。**

---

## 十、完整的 Java 等价骨架

把前面的片段拼起来，一份能直接类比的 Java 版行为树最小实现：

```java
// ---- 契约 ----
enum NodeStatus { SUCCESS, FAILURE, RUNNING }

interface BTNode { NodeStatus tick(BTContext ctx); }

class BTContext {                       // 黑板
    Enemy enemy; GameWorld world; double dt; long now;
    Player target; Enemy mobTarget, aggroNpc;
}

// ---- 组合节点 ----
class Selector implements BTNode {
    private final List<BTNode> children;
    Selector(BTNode... c) { children = List.of(c); }
    public NodeStatus tick(BTContext ctx) {
        for (BTNode c : children) {
            NodeStatus s = c.tick(ctx);
            if (s != NodeStatus.FAILURE) return s;
        }
        return NodeStatus.FAILURE;
    }
}
class Sequence implements BTNode {
    private final List<BTNode> children;
    Sequence(BTNode... c) { children = List.of(c); }
    public NodeStatus tick(BTContext ctx) {
        for (BTNode c : children) {
            NodeStatus s = c.tick(ctx);
            if (s != NodeStatus.SUCCESS) return s;
        }
        return NodeStatus.SUCCESS;
    }
}

// ---- 叶子（包裹 Lambda）----
class Condition implements BTNode {
    private final Predicate<BTContext> fn;
    Condition(String name, Predicate<BTContext> fn) { this.fn = fn; }
    public NodeStatus tick(BTContext ctx) {
        return fn.test(ctx) ? NodeStatus.SUCCESS : NodeStatus.FAILURE;
    }
}
class Action implements BTNode {
    private final Function<BTContext, NodeStatus> fn;
    Action(String name, Function<BTContext, NodeStatus> fn) { this.fn = fn; }
    public NodeStatus tick(BTContext ctx) { return fn.apply(ctx); }
}

// ---- 工厂（模拟 sel/seq/cond/act）----
static Selector sel(BTNode... c) { return new Selector(c); }
static Sequence seq(BTNode... c) { return new Sequence(c); }
static Condition cond(String n, Predicate<BTContext> f) { return new Condition(n, f); }
static Action act(String n, Function<BTContext, NodeStatus> f) { return new Action(n, f); }

// ---- 装配敌人树（对照 enemyTree.ts）----
BTNode buildEnemyTree(EnemyKind kind) {
    return sel(
        seq(cond("hasAggroNpc", this::hasAggroNpc),
            sel(seq(cond("inAggroRange", this::inAggroRange), act("attackNpc", this::attackAggroNpc)),
                act("chaseNpc", this::chaseAggroNpc))),
        seq(cond("acquireTarget", this::acquireTarget),
            sel(seq(cond("slimeLowHp", c -> kind == EnemyKind.SLIME && isLowHp(c)), act("flee", this::flee)),
                seq(cond("inRange", this::inAttackRange), act("attack", this::attack)),
                act("chase", this::chase))),
        act("patrol", this::patrol)
    );
}
```

**对照 TS 版你会发现结构完全一致。** 差异只在：
- TS 用 `type NodeStatus = 'a'|'b'|'c'` 字符串联合类型，Java 用 `enum`；
- TS 函数直接传递，Java 用 `Predicate`/`Function` + 方法引用 `this::flee`；
- TS 的 rest 参数 `...c` = Java 可变参数 `BTNode... c`。

设计模式（组合 + 享元 + 装饰）是同一套，**换语言不换脑子**。

---

## 十一、实操：给敌人加一个新行为

假设需求：**「骷髅血量低于 50% 时呼叫增援」**（把附近同类也拉进战斗）。用行为树只需三步，且不碰任何已有分支：

**第 1 步**：在 `enemyActions.ts` 加一个条件 + 一个动作叶子：

```typescript
export function skeletonNeedsHelp(ctx: BTContext): boolean {
  return ctx.enemy.kind === 'skeleton' && ctx.enemy.hp / ctx.enemy.maxHp < 0.5;
}

export function callReinforcements(ctx: BTContext): NodeStatus {
  const { enemy, world } = ctx;
  for (const other of world.enemies.values()) {
    if (other.kind === 'skeleton' && !other.isDead && other.targetPlayerId === null) {
      const d = Math.hypot(other.position.x - enemy.position.x, other.position.y - enemy.position.y);
      if (d < 400) other.aggroNpcId = null, other.targetPlayerId = ctx.target?.id ?? null; // 简化示意
    }
  }
  return 'success';  // 呼叫是瞬发动作
}
```

**第 2 步**：在 `enemyTree.ts` 的战斗子 Selector 里插一个分支（放在攻击之前，让它优先触发一次）：

```typescript
seq(
  cond('acquireTarget', acquireTarget),
  sel(
    seq(cond('slimeLowHp', (c) => kind === 'slime' && isLowHp(c)), act('flee', flee)),
    seq(cond('needHelp', skeletonNeedsHelp), act('callHelp', callReinforcements)), // ★ 新增
    seq(cond('inAttackRange', inAttackRange), act('attack', attack)),
    act('chase', chase)
  )
)
```

**第 3 步**：无。不用改执行器、不用改别的种类、不用动状态机——**这就是行为树相对 if-else 的核心优势：局部可插入、彼此不干扰。**

（真做的话记得给"呼叫"加个冷却，否则每 tick 都会喊。冷却也放 `Enemy` 上一个字段即可。）

---

## 十二、常见坑与要点小结

1. **`running` 会短路 Selector**：一旦某分支返回 `running`，Selector 立刻冒泡，后面分支当 tick 不执行。所以"持续动作"要想清楚它是否该长期霸占决策权。

2. **条件顺序 = 优先级**：Selector 里越靠上越优先。仇恨转移放第 0 位、逃跑放攻击之前，都是刻意排的。调顺序就是调 AI 性格。

3. **树无状态、数据进黑板**：别在节点对象里存 `this.someState`，否则同种敌人共享树会串味。所有跨 tick 状态放 `Enemy`，单 tick 临时值放 `ctx`。

4. **叶子只做一件小事**：`acquireTarget` 只探测、`attack` 只攻击、`chase` 只移动。小叶子才好复用、好组合（LLM 树复用敌人树的叶子就是明证）。

5. **决策与执行分离**：动作只设 `velocity` / 写黑板，位移和边界收敛交给执行器统一做。LLM 层更进一步——大脑低频决策、身体高频执行。

6. **单线程免锁**：跨实体读写（仇恨、呼叫增援）在 Node 里天然安全；这套逻辑照搬到 Java 多线程服务器就要重新考虑并发。

---

## 一页纸总结

- 行为树 = 把 AI 决策从「if-else 控制流」变成「可组合的数据结构」。
- 三种结果：`success` / `failure` / `running`（`running` 是精髓，支持跨帧的持续动作）。
- 三类节点：**组合**（Selector 找成功、Sequence 找失败）、**装饰**（Inverter）、**叶子**（Condition/Action）——就是**组合模式**。
- 树**无状态**可共享，实例数据放**黑板**（`ctx` + `Enemy`）——**享元模式**。
- 种类差异用**闭包捕获 `kind`** 注入条件；小差异藏动作里，大差异开新分支。
- LLM NPC：**大脑低频决策 → 写 directive → 身体每 tick 读并执行**，兜底复用普通敌人整棵树。
- 加新行为 = 加叶子 + 插分支，**不碰旧逻辑**。这就是它打败 if-else 的地方。
- 整套设计与语言无关，Java 版结构一模一样，换的是语法不是思想。
