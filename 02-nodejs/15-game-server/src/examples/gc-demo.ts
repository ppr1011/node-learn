/**
 * GC 影响演示 & 优化对比
 *
 * 运行方式：
 *   node --expose-gc -r ts-node/register src/examples/gc-demo.ts
 *
 * 演示内容：
 *   1. 模拟游戏 Tick 中的 GC 压力
 *   2. 对比有无对象池的 GC 表现
 *   3. 演示主动 GC 调度的效果
 */

// ═══════════════════════════════════════════════════════
// 工具函数
// ═══════════════════════════════════════════════════════

function formatMs(ns: bigint): string {
  return (Number(ns) / 1_000_000).toFixed(2);
}

function getMemoryMB(): string {
  return (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);
}

// ═══════════════════════════════════════════════════════
// 场景 1：无优化 —— 每 tick 大量创建临时对象
// ═══════════════════════════════════════════════════════

function simulateNoPool(tickCount: number, playersPerTick: number) {
  console.log('\n═══ 场景 1：无对象池（每 tick 大量创建临时对象）═══');
  console.log(`模拟 ${tickCount} 个 tick，每 tick ${playersPerTick} 个玩家状态\n`);

  let maxTickTime = 0n;
  let totalTickTime = 0n;
  let overruns = 0;
  const tickBudget = 50; // 50ms budget (20Hz)

  for (let tick = 0; tick < tickCount; tick++) {
    const start = process.hrtime.bigint();

    // 模拟每 tick 的操作：为每个玩家创建状态对象并"广播"
    const allStates: any[] = [];
    for (let i = 0; i < playersPerTick; i++) {
      // 每个玩家创建一个状态对象（模拟 toPublicState()）
      const state = {
        id: i,
        name: `Player_${i}`,
        x: Math.random() * 3000,
        y: Math.random() * 2000,
        hp: 100,
        maxHp: 100,
        isDead: false,
      };
      allStates.push(state);

      // 模拟 JSON 序列化（这是 GC 压力的主要来源）
      JSON.stringify({ type: 's_state', data: { players: [state] } });
    }

    const elapsed = process.hrtime.bigint() - start;
    totalTickTime += elapsed;
    if (elapsed > maxTickTime) maxTickTime = elapsed;
    if (Number(elapsed) / 1_000_000 > tickBudget) overruns++;
  }

  console.log(`  平均 tick 耗时: ${formatMs(totalTickTime / BigInt(tickCount))}ms`);
  console.log(`  最大 tick 耗时: ${formatMs(maxTickTime)}ms`);
  console.log(`  超时 tick 数量: ${overruns}/${tickCount} (budget: ${tickBudget}ms)`);
  console.log(`  当前堆内存: ${getMemoryMB()}MB`);
}

// ═══════════════════════════════════════════════════════
// 场景 2：使用对象池 + 手动 JSON 拼接
// ═══════════════════════════════════════════════════════

class SimplePool {
  private pool: any[] = [];

  constructor(prealloc: number) {
    for (let i = 0; i < prealloc; i++) {
      this.pool.push({ id: 0, name: '', x: 0, y: 0, hp: 0, maxHp: 0, isDead: false });
    }
  }

  acquire(): any {
    return this.pool.pop() || { id: 0, name: '', x: 0, y: 0, hp: 0, maxHp: 0, isDead: false };
  }

  release(obj: any): void {
    this.pool.push(obj);
  }

  get size(): number {
    return this.pool.length;
  }
}

function encodeManual(states: any[], count: number): string {
  let s = '{"type":"s_state","data":{"players":[';
  for (let i = 0; i < count; i++) {
    if (i > 0) s += ',';
    const p = states[i];
    s += `{"id":${p.id},"x":${Math.round(p.x)},"y":${Math.round(p.y)},"hp":${p.hp},"isDead":${p.isDead}}`;
  }
  s += ']}}';
  return s;
}

function simulateWithPool(tickCount: number, playersPerTick: number) {
  console.log('\n═══ 场景 2：对象池 + 手动序列化 ═══');
  console.log(`模拟 ${tickCount} 个 tick，每 tick ${playersPerTick} 个玩家状态\n`);

  const pool = new SimplePool(playersPerTick * 2);
  let maxTickTime = 0n;
  let totalTickTime = 0n;
  let overruns = 0;
  const tickBudget = 50;

  for (let tick = 0; tick < tickCount; tick++) {
    const start = process.hrtime.bigint();

    // 从池中获取对象并填充
    const states: any[] = [];
    for (let i = 0; i < playersPerTick; i++) {
      const state = pool.acquire();
      state.id = i;
      state.name = `Player_${i}`;
      state.x = Math.random() * 3000;
      state.y = Math.random() * 2000;
      state.hp = 100;
      state.maxHp = 100;
      state.isDead = false;
      states.push(state);
    }

    // 手动拼接 JSON（避免 stringify 的内部临时对象）
    encodeManual(states, playersPerTick);

    // 归还对象到池
    for (let i = 0; i < playersPerTick; i++) {
      pool.release(states[i]);
    }

    const elapsed = process.hrtime.bigint() - start;
    totalTickTime += elapsed;
    if (elapsed > maxTickTime) maxTickTime = elapsed;
    if (Number(elapsed) / 1_000_000 > tickBudget) overruns++;
  }

  console.log(`  平均 tick 耗时: ${formatMs(totalTickTime / BigInt(tickCount))}ms`);
  console.log(`  最大 tick 耗时: ${formatMs(maxTickTime)}ms`);
  console.log(`  超时 tick 数量: ${overruns}/${tickCount} (budget: ${tickBudget}ms)`);
  console.log(`  当前堆内存: ${getMemoryMB()}MB`);
  console.log(`  对象池剩余: ${pool.size}`);
}

// ═══════════════════════════════════════════════════════
// 场景 3：主动 GC 调度
// ═══════════════════════════════════════════════════════

function simulateScheduledGC(tickCount: number, playersPerTick: number) {
  console.log('\n═══ 场景 3：主动 GC 调度（每 100 tick 主动触发）═══');
  console.log(`模拟 ${tickCount} 个 tick，每 tick ${playersPerTick} 个玩家状态\n`);

  if (!global.gc) {
    console.log('  ⚠️  需要 --expose-gc 参数才能运行此场景');
    console.log('  运行命令: npx ts-node --expose-gc src/examples/gc-demo.ts');
    return;
  }

  let maxTickTime = 0n;
  let totalTickTime = 0n;
  let overruns = 0;
  let gcCount = 0;
  let maxGcTime = 0n;
  const tickBudget = 50;

  for (let tick = 0; tick < tickCount; tick++) {
    const start = process.hrtime.bigint();

    // 模拟正常 tick 负载
    const allStates: any[] = [];
    for (let i = 0; i < playersPerTick; i++) {
      allStates.push({
        id: i, x: Math.random() * 3000, y: Math.random() * 2000,
        hp: 100, maxHp: 100, isDead: false,
      });
    }
    JSON.stringify({ type: 's_state', data: { players: allStates } });

    const elapsed = process.hrtime.bigint() - start;
    totalTickTime += elapsed;
    if (elapsed > maxTickTime) maxTickTime = elapsed;
    if (Number(elapsed) / 1_000_000 > tickBudget) overruns++;

    // 每 100 tick 主动 GC（模拟 "空闲时段" 触发）
    if (tick > 0 && tick % 100 === 0) {
      const gcStart = process.hrtime.bigint();
      global.gc!();
      const gcElapsed = process.hrtime.bigint() - gcStart;
      if (gcElapsed > maxGcTime) maxGcTime = gcElapsed;
      gcCount++;
    }
  }

  console.log(`  平均 tick 耗时: ${formatMs(totalTickTime / BigInt(tickCount))}ms`);
  console.log(`  最大 tick 耗时: ${formatMs(maxTickTime)}ms`);
  console.log(`  超时 tick 数量: ${overruns}/${tickCount} (budget: ${tickBudget}ms)`);
  console.log(`  主动 GC 次数: ${gcCount}`);
  console.log(`  最大 GC 耗时: ${formatMs(maxGcTime)}ms`);
  console.log(`  当前堆内存: ${getMemoryMB()}MB`);
}

// ═══════════════════════════════════════════════════════
// 运行
// ═══════════════════════════════════════════════════════

console.log('╔══════════════════════════════════════════════════╗');
console.log('║     Node.js 游戏服务器 GC 影响演示              ║');
console.log('╚══════════════════════════════════════════════════╝');
console.log(`\nNode.js ${process.version} | 初始堆内存: ${getMemoryMB()}MB`);

const TICKS = 1000;
const PLAYERS = 200;

simulateNoPool(TICKS, PLAYERS);

// 手动 GC 清理上一场景的影响
if (global.gc) global.gc();

simulateWithPool(TICKS, PLAYERS);

if (global.gc) global.gc();

simulateScheduledGC(TICKS, PLAYERS);

console.log('\n────────────────────────────────────────────────');
console.log('结论：');
console.log('  - 对象池减少 GC 触发频率，降低最大 tick 耗时');
console.log('  - 手动序列化避免 stringify 内部的大量临时字符串');
console.log('  - 主动 GC 将暂停控制在可预测的时间点');
console.log('  - 三者组合使用效果最佳');
console.log('────────────────────────────────────────────────\n');
