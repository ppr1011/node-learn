# 已知 Bug 修复记录

> ← 返回 [README](../README.md) · 系列文档：[核心难点](01-核心难点.md) · [工程挑战](02-工程挑战.md) · [服务稳定性](03-服务稳定性.md) · [GC 实战](04-GC实战.md) · [DAU 分析](05-Nodejs-DAU分析.md) · [客户端视觉](06-客户端视觉系统.md) · [Bug 记录](07-Bug修复记录.md) · [天气视觉增强](08-天气视觉增强.md) · [行为树 AI](09-行为树AI.md) · [武器与掉落](10-武器与掉落系统.md)
>
> **关联代码**：`src/core/GameWorld.ts`、`client/index.html`

---

### Bug 1：玩家无法移动（画面静止）

**现象**：连接成功后按 WASD 没有任何反应，角色停在原地。

**根因**：`GameWorld.broadcastStates` 调用 `aoi.getNearbyPlayers(player)` 获取附近玩家列表，而该方法内部明确排除了玩家自身（`if (p !== exclude)`）。结果玩家自己的位置更新从未发回给自己，客户端的 `targetX/targetY` 永远不更新，插值和摄像机都停在初始值。

```typescript
// 修复：GameWorld.broadcastStates()
// 始终把自身状态加入广播列表
const states: any[] = [player.toPublicState()]; // ← 修复前没有这行

for (const other of nearby) {
  states.push(other.toPublicState());
  // ...
}
player.session.send(MsgType.STATE_UPDATE, { players: states });
```

**文件**：`src/core/GameWorld.ts`

---

### Bug 2：按空格攻击无视觉反馈

**现象**：按空格后没有任何动画，不知道攻击是否生效。

**根因一**：服务端的攻击逻辑在无目标时静默返回，客户端收不到任何消息，没有本地动画兜底。

**根因二**（引入修复时产生的新 Bug）：攻击圆环代码被放置在 `const radius = 16` 声明之前，JavaScript `const` 存在暂时性死区（Temporal Dead Zone），访问未初始化的 `radius` 抛出 `ReferenceError`，导致整个渲染循环崩溃，画面变黑。

**修复**：在客户端 `keydown` 事件中设置本地动画标记，在 border 绘制之后（`radius` 已声明）渲染攻击圆环：

```javascript
// 按下空格时设置本地动画标记
if (e.key === ' ') {
  ws.send(JSON.stringify({ type: 'c_attack' }));
  if (players[myId]) players[myId].attackFlash = 12; // ← 本地立即反馈
}

// 渲染（在 radius 声明之后）
const radius = 16;
// ...绘制 body、border...

// 攻击圆环（radius 此时已可用）
if (p.attackFlash && p.attackFlash > 0) {
  p.attackFlash--;
  const progress = 1 - p.attackFlash / 12;
  ctx.arc(sx, sy, radius + ATTACK_RANGE * progress, 0, Math.PI * 2);
  ctx.strokeStyle = `rgba(255,220,80,${(1 - progress) * 0.85})`;
  ctx.stroke();
}
```

**文件**：`client/index.html`
