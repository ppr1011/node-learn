# Node.js 集成测试

这些测试跨越真实 I/O、真实定时器或多题组合,验证"端到端可用",需要相关题目完成后才能通过。

| 文件 | 覆盖题目 | 验证点 |
|------|----------|--------|
| `fs-workflow.integration.test.ts` | 基础 01(fs 封装) | 在系统临时目录真实完成 建目录→批量写→列举→读回→清理 |
| `backoff-timing.integration.test.ts` | 进阶 01(withRetry) | 真实定时器下,指数退避的累计耗时符合预期 |
| `middleware-concurrency.integration.test.ts` | 进阶 02(compose)+ 挑战 01(pLimit) | 用中间件管线处理请求,并用并发池限制处理器并发峰值 |

运行:

```bash
npm run exam:integration
# 或单独运行
npx ts-node 03-exams/nodejs/programming/integration/fs-workflow.integration.test.ts
```
