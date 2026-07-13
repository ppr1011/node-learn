# Node.js 概念自测 · 挑战

> 偏架构 / 性能 / 面试深水区。共 8 题。

---

### 1.(简答)描述一次 HTTP 请求在 Express 服务里从进入到响应的完整生命周期(涉及事件循环)。

<details><summary>参考答案</summary>

1. 内核收到 TCP 连接,libuv 在 poll 阶段拿到可读事件;
2. Node 解析 HTTP,构造 `req`/`res`,触发路由匹配;
3. 依次执行匹配的中间件(洋葱模型),其中的异步操作(DB/文件)交给 libuv/线程池,主线程继续处理其他事件;
4. 异步结果 ready 后其回调在对应事件循环阶段执行,继续后续中间件;
5. 处理器调用 `res.json()/res.end()` 写回响应(注意可写流背压);
6. 全程微任务(nextTick/Promise)在各阶段间清空。

关键:不要在请求路径上做同步阻塞(如 `readFileSync`、大循环、同步加密),否则阻塞整个事件循环。

</details>

---

### 2.(选择)一个 CPU 密集型任务(如大量图像处理)最不该用哪种方式?

A. `worker_threads`
B. 拆成子任务 + `setImmediate` 让出事件循环
C. 直接在请求处理函数里同步计算
D. 独立的进程/服务

<details><summary>答案与解析</summary>

**C**。在请求处理里同步做 CPU 密集计算会阻塞事件循环,使所有并发请求卡住。应交给 worker 线程/独立进程,或分片让出。

</details>

---

### 3.(简答)如何在 Node 中排查内存泄漏?列举思路与工具。

<details><summary>参考答案</summary>

- 现象:RSS/heapUsed 持续增长不回落、GC 频繁但回收少。
- 工具:`--inspect` + Chrome DevTools 堆快照对比;`process.memoryUsage()`;`heapdump`/`clinic.js`;`--max-old-space-size` 观察。
- 常见根因:未清理的全局缓存/Map、未移除的事件监听器(`EventEmitter` 泄漏,`MaxListenersExceededWarning`)、闭包持有大对象、定时器未清、未关闭的连接/流。
- 方法:多次快照对比"保留下来的对象"(retained size)定位增长来源。

</details>

---

### 4.(简答)`cluster` 和 `worker_threads` 的区别与各自适用场景?

<details><summary>参考答案</summary>

- `cluster`:**多进程**,每个进程独立内存与事件循环,通过 IPC 通信,主进程可共享监听端口(负载均衡)。适合利用多核提升**吞吐**、隔离性好。
- `worker_threads`:**同进程多线程**,可共享内存(`SharedArrayBuffer`)、通信开销小。适合 **CPU 密集**计算卸载。

Web 服务横向扩展常用多进程/多实例;单个重计算用 worker 线程。

</details>

---

### 5.(选择)关于 `Buffer`,错误的是?

A. `Buffer` 用于处理二进制数据
B. `Buffer` 分配在 V8 堆外
C. `Buffer.allocUnsafe` 返回的内存已被清零
D. 处理网络/文件字节流时常用

<details><summary>答案与解析</summary>

**C**。`allocUnsafe` **不**清零(更快但可能含旧数据),需自行覆盖;`alloc` 才清零。Buffer 是堆外内存,适合二进制场景。

</details>

---

### 6.(简答)如何优雅关闭(graceful shutdown)一个 Node 服务?

<details><summary>参考答案</summary>

监听 `SIGTERM`/`SIGINT`,依次:
1. 停止接收新连接(`server.close()`);
2. 等待进行中的请求完成(设超时兜底);
3. 关闭数据库连接池、消息队列、定时器;
4. 全部完成后 `process.exit(0)`,超时未完成则强制退出。

配合负载均衡/编排(K8s 的 preStop、健康检查摘流),避免请求被中断。

</details>

---

### 7.(简答)`require` 的模块缓存机制是怎样的?会带来什么坑?

<details><summary>参考答案</summary>

CommonJS 首次 `require` 后模块被缓存在 `require.cache`,后续 `require` 返回同一实例(单例)。坑:
- 修改导出对象会影响所有引用方(共享状态);
- 循环依赖时可能拿到**未完成**的 `exports`(部分导出为 undefined);
- 测试里需要重置状态时得手动 `delete require.cache[...]`。

ESM 也有类似的模块单例语义(module map)。

</details>

---

### 8.(简答)设计一个高并发下的限流/防雪崩策略,你会考虑哪些手段?

<details><summary>参考答案</summary>

- **限流**:令牌桶/漏桶、固定/滑动窗口计数;进程级用内存计数器,分布式用 Redis。
- **并发上限**:连接池上限、`pLimit` 式并发控制、队列 + 背压。
- **超时与重试**:每次调用设超时,重试用指数退避 + 抖动,避免重试风暴。
- **熔断(circuit breaker)**:错误率超阈值时快速失败一段时间,给下游恢复窗口。
- **降级**:返回缓存/兜底数据。
- **隔离**:舱壁模式(bulkhead)隔离不同依赖的资源。

</details>
