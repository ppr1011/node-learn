# Node.js 概念自测 · 进阶

> 先自己作答,再点开折叠块核对。共 10 题。

---

### 1.(选择)以下代码输出顺序是?

```js
console.log("A");
setTimeout(() => console.log("B"), 0);
Promise.resolve().then(() => console.log("C"));
process.nextTick(() => console.log("D"));
console.log("E");
```

A. A E D C B
B. A E C D B
C. A B C D E
D. A E B C D

<details><summary>答案与解析</summary>

**A**。同步先执行:`A`、`E`。然后微任务阶段:`process.nextTick` 队列优先于 Promise 微任务 → `D`、`C`。最后宏任务定时器 → `B`。

</details>

---

### 2.(选择)Node 事件循环的阶段顺序,下列正确的是?

A. timers → pending → poll → check → close
B. poll → timers → check → close
C. check → timers → poll → close
D. timers → check → poll → pending

<details><summary>答案与解析</summary>

**A**。主要阶段:timers(`setTimeout`/`setInterval`)→ pending callbacks → poll(I/O)→ check(`setImmediate`)→ close callbacks。每个阶段之间会清空微任务队列(nextTick 优先于 Promise)。

</details>

---

### 3.(简答)`setImmediate` 和 `setTimeout(fn, 0)` 有什么区别?

<details><summary>答案与解析</summary>

`setImmediate` 在 **check** 阶段执行,`setTimeout(fn,0)` 在 **timers** 阶段执行。在主模块中两者顺序不确定(受进程启动耗时影响);但在一个 **I/O 回调内部**,`setImmediate` 一定先于 `setTimeout(fn,0)` 执行(因为紧接着就是 check 阶段)。

</details>

---

### 4.(简答)什么是"回调地狱"?如何用 Promise / async-await 改善?再说说 `util.promisify` 的作用。

<details><summary>答案与解析</summary>

回调地狱指多层嵌套回调导致代码难读、错误处理分散。Promise 用链式 `.then` 展平,`async/await` 用同步写法书写异步流程、用 `try/catch` 统一错误处理。`util.promisify` 把"最后一个参数是 `(err, data)` 回调"的函数转换成返回 Promise 的函数。

</details>

---

### 5.(选择)`Promise.all` 与 `Promise.allSettled` 的区别?

A. 没有区别
B. `all` 有一个失败就整体 reject;`allSettled` 等全部结束并返回每个的状态
C. `allSettled` 更快
D. `all` 会忽略错误

<details><summary>答案与解析</summary>

**B**。`Promise.all` 快速失败(任一 reject 立即 reject);`Promise.allSettled` 永不 reject,返回 `{status, value|reason}` 数组。还有 `race`(第一个 settle)、`any`(第一个 fulfilled)。

</details>

---

### 6.(简答)`AbortController` 用来做什么?举一个使用场景。

<details><summary>答案与解析</summary>

`AbortController` 提供一个 `signal`,用于**取消**异步操作。调用 `controller.abort()` 会触发 signal 的 `abort` 事件。常见场景:给 `fetch(url, { signal })` 设置超时取消、取消正在进行的文件读取或数据库查询。监听方需响应 signal 并抛出/清理。

</details>

---

### 7.(选择)Express 中要捕获 `async` 路由处理器里 `await` 抛出的错误,通常需要?

A. 什么都不做,Express 会自动捕获
B. 用 try/catch 或包一层 asyncHandler 把错误传给 `next(err)`
C. 用 `process.on('uncaughtException')`
D. 用 `Promise.all`

<details><summary>答案与解析</summary>

**B**。Express 4 不会自动捕获 async 函数的 rejection,需要 `try { ... } catch(e) { next(e) }`,或用 `asyncHandler(fn) = (req,res,next) => fn(req,res,next).catch(next)` 包装,再交给错误处理中间件。(Express 5 对返回的 Promise rejection 有改进。)

</details>

---

### 8.(简答)`unhandledRejection` 和 `uncaughtException` 分别在什么时候触发?生产上应如何处理?

<details><summary>答案与解析</summary>

- `unhandledRejection`:有 Promise 被 reject 但没有 `.catch`。
- `uncaughtException`:有同步/异步错误冒泡到顶层未被捕获。

生产上应**记录日志并优雅退出**(让进程管理器如 PM2/系统重启),而不是若无其事继续运行——因为此时进程状态可能已不可靠。

</details>

---

### 9.(简答)什么是背压(backpressure)?流里如何体现和处理?

<details><summary>答案与解析</summary>

背压指**生产速度 > 消费速度**时,数据在缓冲区堆积。可写流的 `write()` 返回 `false` 表示缓冲已满,应暂停可读流,待 `drain` 事件再继续。`pipe`/`pipeline` 会自动处理背压,推荐用 `stream.pipeline` 以同时获得背压与错误处理。

</details>

---

### 10.(选择)关于 Node 的单线程模型,正确的是?

A. Node 完全单线程,无法利用多核
B. JS 主线程单线程,但 I/O 由 libuv 线程池 / 内核异步完成;可用 cluster / worker_threads 利用多核
C. 每个请求开一个线程
D. Node 没有线程池

<details><summary>答案与解析</summary>

**B**。执行 JS 的是单线程事件循环,但底层 I/O 借助 libuv 的线程池与操作系统异步机制。CPU 密集任务可用 `worker_threads`,多进程可用 `cluster` 或多实例 + 负载均衡。

</details>
