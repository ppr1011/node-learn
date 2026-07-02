/**
 * 11 - 异步编程: Promise & async/await
 * 运行: npx ts-node 01-typescript/11-async-programming/index.ts
 */

// ========== 一、Promise 基础 ==========
console.log("=== 一、Promise 基础 ===\n");

// Promise 有三种状态: pending → fulfilled / rejected
const p1 = new Promise<string>((resolve, reject) => {
  // 同步执行，这里决定最终状态
  resolve("成功了!");
});

const p2 = new Promise<string>((resolve, reject) => {
  reject(new Error("出错了!"));
});

// .then / .catch / .finally
p1.then((value) => console.log("p1 resolved:", value));

p2
  .then((value) => console.log("不会执行"))
  .catch((err: Error) => console.log("p2 rejected:", err.message))
  .finally(() => console.log("p2 finally (always runs)"));

// ========== 二、封装异步操作为 Promise ==========
console.log("\n=== 二、封装异步操作 ===\n");

// 将 setTimeout 包装成 Promise
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 模拟 API 请求
function fetchUser(id: number): Promise<{ id: number; name: string; email: string }> {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (id <= 0) {
        reject(new Error(`Invalid user id: ${id}`));
        return;
      }
      resolve({ id, name: `User-${id}`, email: `user${id}@test.com` });
    }, 50);
  });
}

function fetchPosts(userId: number): Promise<string[]> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve([`Post-A by ${userId}`, `Post-B by ${userId}`]);
    }, 30);
  });
}

// ========== 三、Promise 链式调用 ==========
console.log("=== 三、Promise 链式调用 ===\n");

// 每个 .then 返回一个新 Promise，可以继续链式调用
fetchUser(1)
  .then((user) => {
    console.log("获取用户:", user.name);
    return fetchPosts(user.id); // 返回新的 Promise
  })
  .then((posts) => {
    console.log("该用户的文章:", posts);
    return posts.length; // 返回普通值，自动包装成 fulfilled Promise
  })
  .then((count) => {
    console.log("文章数量:", count);
  })
  .catch((err: Error) => {
    console.log("链式错误:", err.message);
  });

// ========== 四、async / await ==========
console.log("\n=== 四、async / await ===\n");

// async 函数总是返回 Promise
// await 只能在 async 函数内使用，等待 Promise 完成

async function getUserWithPosts(userId: number): Promise<void> {
  try {
    console.log(`[${userId}] 开始获取数据...`);

    const user = await fetchUser(userId);
    console.log(`[${userId}] 用户:`, user.name);

    const posts = await fetchPosts(user.id);
    console.log(`[${userId}] 文章:`, posts);

  } catch (err: any) {
    console.log(`[${userId}] 错误:`, err.message);
  }
}

// ========== 五、并发控制: Promise 组合器 ==========
async function combinatorDemo(): Promise<void> {
  console.log("=== 五、Promise 组合器 ===\n");

  const ids = [1, 2, 3];

  // --- Promise.all: 全部成功才成功，一个失败就失败 ---
  console.log("-- Promise.all (全部并发) --");
  const start = Date.now();
  const users = await Promise.all(ids.map((id) => fetchUser(id)));
  console.log(`获取 ${users.length} 个用户，耗时: ${Date.now() - start}ms`);
  // 注意：并发发出 3 个请求，总耗时约 50ms，而非 150ms

  // --- Promise.allSettled: 无论成功失败都等全部完成 ---
  console.log("\n-- Promise.allSettled (不因失败而中止) --");
  const results = await Promise.allSettled([
    fetchUser(1),
    fetchUser(-1), // 会 reject
    fetchUser(3),
  ]);
  results.forEach((result, i) => {
    if (result.status === "fulfilled") {
      console.log(`  [${i}] 成功:`, result.value.name);
    } else {
      console.log(`  [${i}] 失败:`, result.reason.message);
    }
  });

  // --- Promise.race: 第一个完成的决定结果 ---
  console.log("\n-- Promise.race (竞速，取最快) --");
  const fastest = await Promise.race([
    new Promise<string>((r) => setTimeout(() => r("100ms"), 100)),
    new Promise<string>((r) => setTimeout(() => r("50ms"), 50)),
    new Promise<string>((r) => setTimeout(() => r("80ms"), 80)),
  ]);
  console.log("最快完成:", fastest);

  // --- Promise.any: 第一个成功的决定结果 (忽略 reject) ---
  console.log("\n-- Promise.any (取第一个成功) --");
  const first = await Promise.any([
    new Promise<string>((_, r) => setTimeout(() => r(new Error("fail-30ms")), 30)),
    new Promise<string>((res) => setTimeout(() => res("success-60ms"), 60)),
    new Promise<string>((res) => setTimeout(() => res("success-80ms"), 80)),
  ]);
  console.log("第一个成功:", first);
}

// ========== 六、错误处理模式 ==========
async function errorHandlingDemo(): Promise<void> {
  console.log("\n=== 六、错误处理模式 ===\n");

  // 模式 1: try/catch (推荐)
  console.log("-- 模式 1: try/catch --");
  try {
    await fetchUser(-1);
  } catch (err: any) {
    console.log("捕获到:", err.message);
  }

  // 模式 2: .catch() 提供默认值
  console.log("\n-- 模式 2: .catch 提供默认值 --");
  const user = await fetchUser(-999).catch(() => ({
    id: 0,
    name: "Guest",
    email: "guest@example.com",
  }));
  console.log("用户 (fallback):", user.name);

  // 模式 3: Result 模式 (不抛异常，返回 ok/error)
  console.log("\n-- 模式 3: Result 模式 --");
  type Result<T> = { ok: true; data: T } | { ok: false; error: Error };

  async function safeCall<T>(promise: Promise<T>): Promise<Result<T>> {
    try {
      const data = await promise;
      return { ok: true, data };
    } catch (err: any) {
      return { ok: false, error: err };
    }
  }

  const r1 = await safeCall(fetchUser(1));
  const r2 = await safeCall(fetchUser(-1));

  if (r1.ok) console.log("safeCall 成功:", r1.data.name);
  if (!r2.ok) console.log("safeCall 失败:", r2.error.message);
}

// ========== 七、高级异步模式 ==========
async function advancedDemo(): Promise<void> {
  console.log("\n=== 七、高级异步模式 ===\n");

  // --- 超时控制 ---
  console.log("-- 超时控制 --");
  function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)
    );
    return Promise.race([promise, timeout]);
  }

  const slowRequest = new Promise<string>((r) => setTimeout(() => r("done"), 200));
  try {
    await withTimeout(slowRequest, 100);
  } catch (err: any) {
    console.log("超时:", err.message);
  }

  const fastRequest = new Promise<string>((r) => setTimeout(() => r("fast done"), 30));
  const result = await withTimeout(fastRequest, 100);
  console.log("未超时:", result);

  // --- 重试机制 ---
  console.log("\n-- 重试机制 --");
  let attempt = 0;
  async function unstableApi(): Promise<string> {
    attempt++;
    if (attempt < 3) throw new Error(`Network error (attempt ${attempt})`);
    return "success after retries";
  }

  async function retry<T>(fn: () => Promise<T>, maxRetries: number, delayMs = 20): Promise<T> {
    for (let i = 0; i <= maxRetries; i++) {
      try {
        return await fn();
      } catch (err) {
        if (i === maxRetries) throw err;
        console.log(`  重试 ${i + 1}/${maxRetries}...`);
        await delay(delayMs);
      }
    }
    throw new Error("unreachable");
  }

  const res = await retry(unstableApi, 3);
  console.log("重试结果:", res);

  // --- 并发限制 ---
  console.log("\n-- 并发限制 (最多同时 2 个) --");
  async function limitedConcurrency<T>(
    tasks: (() => Promise<T>)[],
    limit: number
  ): Promise<T[]> {
    const results: T[] = [];
    const queue = [...tasks];
    const workers = Array.from({ length: limit }, async () => {
      while (queue.length > 0) {
        const task = queue.shift()!;
        results.push(await task());
      }
    });
    await Promise.all(workers);
    return results;
  }

  const taskLog: number[] = [];
  const tasks = Array.from({ length: 6 }, (_, i) => async () => {
    taskLog.push(i + 1);
    await delay(20);
    return `task-${i + 1}`;
  });

  const taskResults = await limitedConcurrency(tasks, 2);
  console.log("完成顺序:", taskLog.join(" → "));
  console.log("结果:", taskResults);
}

// ========== 八、async 迭代器 (for await...of) ==========
async function asyncIteratorDemo(): Promise<void> {
  console.log("\n=== 八、async 迭代器 ===\n");

  // 模拟分页 API
  async function* paginate(totalPages: number): AsyncGenerator<number[], void, void> {
    for (let page = 1; page <= totalPages; page++) {
      await delay(20);
      const items = Array.from({ length: 3 }, (_, i) => (page - 1) * 3 + i + 1);
      yield items;
    }
  }

  const allItems: number[] = [];
  for await (const page of paginate(3)) {
    console.log("  页数据:", page);
    allItems.push(...page);
  }
  console.log("全部数据:", allItems);

  // 异步生成器：流式处理
  async function* streamNumbers(count: number): AsyncGenerator<number> {
    for (let i = 1; i <= count; i++) {
      await delay(10);
      yield i;
    }
  }

  let sum = 0;
  for await (const n of streamNumbers(5)) {
    sum += n;
  }
  console.log("流式求和 1..5:", sum);
}

// ========== 主函数：顺序执行所有演示 ==========
async function main(): Promise<void> {
  // 等待微任务队列先跑完 (Promise 链式演示)
  await delay(200);

  await getUserWithPosts(2);
  await getUserWithPosts(-1); // 触发错误路径

  await combinatorDemo();
  await errorHandlingDemo();
  await advancedDemo();
  await asyncIteratorDemo();

  console.log("\n✅ 全部异步编程示例完成");
}

main();
