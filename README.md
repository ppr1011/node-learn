# node-learn · 循序渐进的 TypeScript / Node.js 学习项目

一个从语言基础到后端工程、再到综合实战与自测考试的渐进式学习仓库。

## 模块总览

| 模块 | 内容 | 说明 |
|------|------|------|
| [`01-typescript`](./01-typescript/) | TS 基础 → 泛型 → 类型体操 → 异步 | 每章一个可运行的 `index.ts` |
| [`02-nodejs`](./02-nodejs/) | 模块系统、fs、Stream、HTTP、Express、REST、错误处理、JWT、异步模式 | 含综合项目 `15-game-server` |
| [`03-exams`](./03-exams/) | **考试模块**:编程题(自动判分)+ 综合项目 + 概念自测 | 三档难度,覆盖 TS 与 Node |

## 快速开始

```bash
# 运行任意示例(无需编译,ts-node 直接执行)
npx ts-node 01-typescript/01-basic-types/index.ts
npx ts-node 02-nodejs/06-http-server/index.ts
```

## 考试与自测

考试模块用 Node 内置 `node:test` 做自动化判分(单元测试 + 集成测试),无需额外依赖。

```bash
npm run exam              # 全部考试(TS + Node + 项目)
npm run exam:ts           # 只跑 TypeScript 编程题
npm run exam:node         # 只跑 Node.js 编程题
npm run exam:projects     # 只跑综合项目验收测试
npm run exam:unit         # 只跑单元测试(快速自测)
npm run exam:integration  # 只跑集成测试(端到端验收)
```

做题方式、评分规则与目录索引见 [`03-exams/README.md`](./03-exams/README.md)。

## 环境要求

- Node.js 18+(已在 v18 / v22 验证)
- 依赖:`npm install`
