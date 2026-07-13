# TypeScript 集成测试

集成测试用于验证**多个题目的产物协作**时的整体行为(而非单个函数)。

- `event-aggregation.integration.test.ts`
  组合「挑战 02 - 类型安全 EventEmitter」与「基础 03 - 泛型数组工具 groupBy」:
  用事件发射器收集一批业务事件,再用 `groupBy` 聚合统计。
  需要这两道题都完成后才能通过。

运行:

```bash
npm run exam:integration      # 只跑集成测试
# 或单独运行本文件
npx ts-node 03-exams/typescript/programming/integration/event-aggregation.integration.test.ts
```
