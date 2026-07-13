# Node.js 后端工程学习计划

## 学习路线

| 序号 | 主题 | 目标 |
|------|------|------|
| 01 | 模块系统 | 理解 CommonJS 与 ESM，模块导入导出 |
| 02 | 文件系统操作 | fs 模块，文件读写、目录操作 |
| 03 | Path 与 OS | 路径处理、系统信息获取 |
| 04 | EventEmitter | 事件驱动架构，自定义事件 |
| 05 | Stream | 可读流、可写流、管道、Transform |
| 06 | HTTP 服务器 | 原生 HTTP 模块创建服务器 |
| 07 | Express 基础 | 路由、请求响应、静态文件 |
| 08 | 中间件模式 | Express 中间件原理与实践 |
| 09 | REST API CRUD | 完整 RESTful API 设计与实现 |
| 10 | 错误处理 | 统一错误处理、自定义错误类 |
| 11 | 环境变量与配置 | dotenv、多环境配置管理 |
| 12 | 数据库 (MySQL) | mysql2 连接池、CRUD 操作 |
| 13 | JWT 认证 | 用户注册登录、Token 鉴权 |
| 14 | Node.js 异步模式 | 事件循环阶段、callback→Promise 转换、AbortController 取消、异步队列、async/await 陷阱 |

## 运行方式

```bash
# 运行 TypeScript 写的 Node.js 示例
npx ts-node 02-nodejs/01-module-system/index.ts

# 需要额外依赖的示例先安装
npm install express dotenv mysql2 jsonwebtoken bcryptjs
npm install -D @types/express @types/jsonwebtoken @types/bcryptjs
```

## 检验学习成果

- 编程题(自动判分):[`03-exams/nodejs/programming`](../03-exams/nodejs/programming/)
- 概念自测题(附答案解析):[`03-exams/nodejs/quizzes`](../03-exams/nodejs/quizzes/)
- 综合实战项目:[TODO REST API](../03-exams/projects/01-todo-rest-api/)、[KV 缓存服务](../03-exams/projects/02-kv-cache-service/)

```bash
npm run exam:node        # Node.js 编程题
npm run exam:projects    # 综合项目验收测试
```

详见 [`03-exams/README.md`](../03-exams/README.md)。
