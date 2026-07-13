# 03 - 考试模块(编程题 + 综合项目 + 概念自测)

本模块是对 `01-typescript` 与 `02-nodejs` 学习内容的检验,分三种题型、三档难度,配套**自动化测试判分**。

## 一、题型总览

| 题型 | 位置 | 判分方式 |
|------|------|----------|
| 编程题(TypeScript) | `typescript/programming/{basic,advanced,challenge}` | 自动化测试(单元 + 集成) |
| 编程题(Node.js) | `nodejs/programming/{basic,advanced,challenge}` | 自动化测试(单元 + 集成) |
| 概念自测题 | `typescript/quizzes/`、`nodejs/quizzes/` | 自评(答案与解析用折叠块给出) |
| 综合实战项目 | `projects/01-todo-rest-api`、`projects/02-kv-cache-service` | 验收测试(单元 + 集成) |

## 二、难度分档

- **基础(basic)**:巩固单一知识点,10~20 分钟/题。
- **进阶(advanced)**:综合运用、贴近实际工程,30~45 分钟/题。
- **挑战(challenge)**:有一定设计难度或类型体操,不限时。

## 三、编程题怎么做

每道编程题是一个独立目录,包含 4 个文件:

```
xx-题目名/
├── problem.md       # 题目描述、要求、提示、评分点
├── index.ts         # 骨架:导出待实现的函数/类,TODO 处会抛错
├── index.test.ts    # 单元测试(自动判分,请勿修改)
└── solution.ts      # 参考答案(做完再看)
```

部分题目还有跨 I/O / 跨进程的**集成测试**:

```
xx-题目名/
└── integration/
    └── xxx.integration.test.ts   # 端到端验证(真实文件、真实定时器等)
```

**做题步骤**:
1. 阅读 `problem.md`。
2. 打开 `index.ts`,把每个 `throw new Error("TODO: ...")` 替换为你的实现。
3. 运行测试,看是否全绿。
4. 卡住了或做完了,对照 `solution.ts`。

> 单元测试与集成测试都通过 = 满分。单元测试验证"逻辑正确",集成测试验证"端到端可用"。

## 四、运行与判分

在**项目根目录**执行(需要 Node 18+,已内置 `node:test`,无需安装额外依赖):

```bash
npm run exam              # 运行全部考试(TS + Node + 项目,单元 + 集成)
npm run exam:ts           # 只跑 TypeScript 编程题
npm run exam:node         # 只跑 Node.js 编程题
npm run exam:projects     # 只跑综合项目验收测试
npm run exam:unit         # 只跑单元测试(快速自测)
npm run exam:integration  # 只跑集成测试(端到端验收)
```

运行器会打印收集到的测试文件清单,并输出 TAP 结果:

```
# tests 12
# pass 12
# fail 0
```

`# fail 0` 且进程退出码为 0 即为全部通过。

> 只想跑某一道题?直接用 ts-node 运行它的测试文件即可:
> `npx ts-node 03-exams/typescript/programming/basic/01-类型标注补全/index.test.ts`

## 五、概念自测题怎么做

打开对应的 `.md` 文件,先自己作答,再点开 `<details>` 折叠块核对答案与解析。

## 六、目录索引

- [TypeScript 编程题](./typescript/programming/)
- [TypeScript 概念自测](./typescript/quizzes/)
- [Node.js 编程题](./nodejs/programming/)
- [Node.js 概念自测](./nodejs/quizzes/)
- [综合项目:TODO REST API](./projects/01-todo-rest-api/)
- [综合项目:KV 缓存服务](./projects/02-kv-cache-service/)
