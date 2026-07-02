/**
 * 14 - Node.js 异步模式
 * 运行: npx ts-node 02-nodejs/14-async-patterns/index.ts
 *
 * 涵盖: 事件循环阶段、callback → Promise 转换、
 *       并发流程控制、取消令牌、队列 & 任务调度
 */

import { promisify } from "util";
import { readFile } from "fs";
import * as fs from "fs/promises";
import * as path from "path";

// ========== 一、事件循环执行顺序 ==========
console.log("=== 一、事件循环执行顺序 ===\n");

// 执行顺序:
//   同步代码 → process.nextTick → Promise 微任务 → setImmediate → setTimeout

console.log("[1] 同步: start");

setTimeout(() => console.log("[6] macrotask: setTimeout"), 0);

setImmediate(() => console.log("[5] check phase: setImmediate"));

Promise.resolve().then(() => console.log("[3] microtask: Promise.resolve"));

process.nextTick(() => console.log("[2] nextTick (最优先微任务)"));

Promise.resolve()
  .then(() => console.log("[4] microtask: 第二个 Promise"));

console.log("[1] 同步: end\n");

// ========== 二、callback → Promise 转换 ==========
async function callbackToPromiseDemo(): Promise<void> {
  console.log("=== 二、callback → Promise 转换 ===\n");

  // 方法 1: 手动包装
  function readFileLegacy(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      readFile(filePath, "utf-8", (err, data) => {
        if (err) reject(err);
        else resolve(data);
      });
    });
  }

  // 方法 2: util.promisify (推荐)
  const readFileAsync = promisify(readFile);

  // 方法 3: fs/promises (Node.js 10+ 内置，最简)
  const tmpFile = path.join(__dirname, "tmp.txt");
  await fs.writeFile(tmpFile, "Hello async Node.js!\n你好，异步世界！");

  const [c1, c2, c3] = await Promise.all([
    readFileLegacy(tmpFile),
    readFileAsync(tmpFile, "utf-8"),
    fs.readFile(tmpFile, "utf-8"),
  ]);

  console.log("手动包装:", c1.slice(0, 20));
  console.log("promisify:", (c2 as string).slice(0, 20));
  console.log("fs/promises:", c3.slice(0, 20));

  await fs.unlink(tmpFile);
}

// ========== 三、微任务 vs 宏任务详解 ==========
async function taskQueueDemo(): Promise<void> {
  console.log("\n=== 三、微任务 vs 宏任务 ===\n");

  // 宏任务 (macrotask): setTimeout, setInterval, setImmediate, I/O
  // 微任务 (microtask): Promise.then, process.nextTick, queueMicrotask
  // 每个宏任务执行完后，会清空所有微任务队列，再执行下一个宏任务

  const log: string[] = [];

  await new Promise<void>((done) => {
    setTimeout(() => {
      log.push("setTimeout-1");
      Promise.resolve().then(() => log.push("micro-in-setTimeout"));
      setTimeout(() => {
        log.push("setTimeout-2");
        done();
      }, 0);
    }, 0);

    Promise.resolve()
      .then(() => log.push("micro-1"))
      .then(() => log.push("micro-2"));

    process.nextTick(() => log.push("nextTick"));
    queueMicrotask(() => log.push("queueMicrotask"));
  });

  console.log("执行顺序:", log.join(" → "));
  console.log("\n规律: nextTick > queueMicrotask ≈ Promise.then > setTimeout/setImmediate");
}

// ========== 四、Node.js 特有 API ==========
async function nodeSpecificDemo(): Promise<void> {
  console.log("\n=== 四、Node.js 特有异步 API ===\n");

  // --- setImmediate vs setTimeout ---
  console.log("-- setImmediate vs setTimeout(0) --");
  // 在 I/O 回调内部，setImmediate 总是先于 setTimeout
  await fs.writeFile("/tmp/test_imm.txt", "x");
  await new Promise<void>((done) => {
    fs.readFile("/tmp/test_imm.txt").then(() => {
      const order: string[] = [];
      setImmediate(() => { order.push("setImmediate"); if (order.length === 2) { console.log("I/O 内部顺序:", order.join(" → ")); done(); } });
      setTimeout(() => { order.push("setTimeout"); if (order.length === 2) { console.log("I/O 内部顺序:", order.join(" → ")); done(); } }, 0);
    });
  });
  await fs.unlink("/tmp/test_imm.txt");

  // --- process.nextTick 用于延迟到当前操作完成后 ---
  console.log("\n-- process.nextTick 典型用法 --");
  class AsyncEventEmitter {
    private listeners: ((data: string) => void)[] = [];

    on(fn: (data: string) => void): void {
      this.listeners.push(fn);
    }

    emit(data: string): void {
      // 用 nextTick 确保监听器在当前同步代码结束后执行
      // 这样 emit 调用方能先完成注册，再收到事件
      process.nextTick(() => this.listeners.forEach((fn) => fn(data)));
    }
  }

  const ee = new AsyncEventEmitter();
  ee.on((d) => console.log("  listener received:", d));
  ee.emit("hello"); // 注册在 emit 之后，但 nextTick 延迟确保能收到
  console.log("  (nextTick 还未执行)");
}

// ========== 五、可取消的 Promise (AbortController) ==========
async function abortControllerDemo(): Promise<void> {
  console.log("\n=== 五、AbortController 取消 Promise ===\n");

  function fetchWithAbort(url: string, signal: AbortSignal): Promise<string> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => resolve(`Data from ${url}`), 200);

      signal.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(new DOMException("Request aborted", "AbortError"));
      });
    });
  }

  // 场景 1: 正常完成
  const ac1 = new AbortController();
  const r1 = await fetchWithAbort("https://api.example.com/fast", ac1.signal);
  console.log("正常完成:", r1.slice(0, 40));

  // 场景 2: 超时取消
  const ac2 = new AbortController();
  setTimeout(() => ac2.abort(), 50); // 50ms 后取消，但请求要 200ms

  try {
    await fetchWithAbort("https://api.example.com/slow", ac2.signal);
  } catch (err: any) {
    console.log("已取消:", err.message);
  }

  // 场景 3: 同一 signal 取消多个请求
  const ac3 = new AbortController();
  const requests = Promise.allSettled([
    fetchWithAbort("/api/1", ac3.signal),
    fetchWithAbort("/api/2", ac3.signal),
    fetchWithAbort("/api/3", ac3.signal),
  ]);
  ac3.abort(); // 立即取消全部
  const results = await requests;
  const counts = results.reduce(
    (acc, r) => { acc[r.status]++; return acc; },
    { fulfilled: 0, rejected: 0 }
  );
  console.log("批量取消结果:", counts);
}

// ========== 六、异步队列 & 任务调度 ==========
async function asyncQueueDemo(): Promise<void> {
  console.log("\n=== 六、异步任务队列 ===\n");

  class AsyncQueue<T> {
    private queue: Array<() => Promise<T>> = [];
    private running = 0;
    private results: T[] = [];

    constructor(private concurrency: number) {}

    add(task: () => Promise<T>): void {
      this.queue.push(task);
      this.run();
    }

    private async run(): Promise<void> {
      if (this.running >= this.concurrency || this.queue.length === 0) return;
      this.running++;
      const task = this.queue.shift()!;
      try {
        this.results.push(await task());
      } finally {
        this.running--;
        this.run(); // 完成后立刻拉取下一个任务
      }
    }

    async drain(): Promise<T[]> {
      while (this.running > 0 || this.queue.length > 0) {
        await new Promise((r) => setTimeout(r, 10));
      }
      return this.results;
    }
  }

  const queue = new AsyncQueue<string>(2); // 最多 2 个并发
  const log: string[] = [];

  for (let i = 1; i <= 6; i++) {
    const id = i;
    queue.add(async () => {
      log.push(`start-${id}`);
      await new Promise((r) => setTimeout(r, 30));
      log.push(`done-${id}`);
      return `result-${id}`;
    });
  }

  const all = await queue.drain();
  console.log("执行日志:", log.join(", "));
  console.log("全部结果:", all);
}

// ========== 七、async/await 常见陷阱 ==========
async function pitfallsDemo(): Promise<void> {
  console.log("\n=== 七、常见陷阱 ===\n");

  const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

  // 陷阱 1: 在 forEach 中使用 await (无效!)
  console.log("-- 陷阱 1: forEach + await --");
  const ids = [1, 2, 3];

  const wrongLog: number[] = [];
  // 这个 forEach 不会等待每个 await，所有请求同时发出
  ids.forEach(async (id) => {
    await delay(10);
    wrongLog.push(id);
  });
  await delay(50); // 外部等待
  console.log("  forEach 结果 (无序):", wrongLog);

  const rightLog: number[] = [];
  // 正确: for...of 会顺序等待
  for (const id of ids) {
    await delay(10);
    rightLog.push(id);
  }
  console.log("  for...of 结果 (有序):", rightLog);

  // 陷阱 2: 顺序等待 vs 并发等待
  console.log("\n-- 陷阱 2: 串行 vs 并行 --");
  let t = Date.now();
  // 串行 (慢): 每个都等待前一个
  const a = await delay(30).then(() => "a");
  const b = await delay(30).then(() => "b");
  console.log(`  串行耗时: ~${Date.now() - t}ms`);

  t = Date.now();
  // 并行 (快): 同时发起
  const [c, d] = await Promise.all([
    delay(30).then(() => "c"),
    delay(30).then(() => "d"),
  ]);
  console.log(`  并行耗时: ~${Date.now() - t}ms`);

  // 陷阱 3: 忘记处理 Promise rejection (Unhandled Rejection)
  console.log("\n-- 陷阱 3: 未处理的 rejection --");
  // 错误: fetchUser(-1); // 忘记 await 或 .catch，会产生 UnhandledPromiseRejection
  // 正确:
  const failResult = await Promise.resolve()
    .then(() => { throw new Error("必须被处理"); })
    .catch((e: Error) => `已处理: ${e.message}`);
  console.log("  ", failResult);

  // 陷阱 4: async 函数里 try/catch 吃掉错误
  console.log("\n-- 陷阱 4: 错误被吞掉 --");
  async function silentFail(): Promise<string | undefined> {
    try {
      throw new Error("business error");
    } catch {
      // 什么都不做 → 调用方不知道出错了
      return undefined;
    }
  }
  const val = await silentFail();
  console.log("  silentFail 返回:", val, "(调用方无法区分成功还是失败)");
  console.log("  修复: 要么重新 throw，要么返回明确的错误值");
}

// ========== 主函数 ==========
async function main(): Promise<void> {
  await new Promise((r) => setTimeout(r, 50)); // 等事件循环演示先打印

  await callbackToPromiseDemo();
  await taskQueueDemo();
  await nodeSpecificDemo();
  await abortControllerDemo();
  await asyncQueueDemo();
  await pitfallsDemo();

  console.log("\n✅ Node.js 异步模式全部完成");
}

main();
