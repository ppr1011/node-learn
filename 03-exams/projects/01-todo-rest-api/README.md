# 综合项目 01 - TODO REST API(进阶)

用 Express 实现一个内存版 TODO 列表的 RESTful API。本项目考察:路由设计、请求校验、状态码、错误处理、分层(store 与 app 分离)。

## 目录

```
01-todo-rest-api/
├── src/                 # 你要实现的代码
│   ├── types.ts         # 类型定义(已给)
│   ├── store.ts         # TodoStore 内存存储(待实现)
│   └── app.ts           # createApp() 组装 Express 应用(待实现)
├── tests/
│   ├── store.test.ts               # 单元测试:TodoStore
│   └── api.integration.test.ts     # 集成测试:真实启动 HTTP 服务走完整 CRUD
└── solution/            # 参考实现(做完再看)
```

## 数据模型

```ts
interface Todo {
  id: string;
  title: string;
  completed: boolean;
  createdAt: number; // 毫秒时间戳
}
```

## 需求

### 一、`TodoStore`(`src/store.ts`)

内存存储,方法:

| 方法 | 说明 |
|------|------|
| `create(title: string): Todo` | 生成自增字符串 id(`"1"`, `"2"` …),`completed=false`,`createdAt=Date.now()` |
| `list(): Todo[]` | 返回所有 todo(数组副本,按创建顺序) |
| `get(id: string): Todo \| undefined` | 按 id 查找 |
| `update(id, patch): Todo \| undefined` | 局部更新 `title`/`completed`,返回更新后的对象;不存在返回 `undefined` |
| `remove(id: string): boolean` | 删除,返回是否存在 |
| `clear(): void` | 清空 |

### 二、`createApp(store)`(`src/app.ts`)

返回一个 Express 应用(不要在此文件里 `listen`),挂载以下路由。统一 JSON,错误响应体为 `{ error: { message: string } }`。

| 方法 & 路径 | 行为 | 状态码 |
|-------------|------|--------|
| `GET /todos` | 返回全部 | 200 |
| `POST /todos` | body `{ title }` 创建;`title` 缺失或非非空字符串 → 校验失败 | 201 / 400 |
| `GET /todos/:id` | 返回单个 | 200 / 404 |
| `PATCH /todos/:id` | body 可含 `title`(非空字符串)、`completed`(布尔);类型非法 → 400;不存在 → 404 | 200 / 400 / 404 |
| `DELETE /todos/:id` | 删除 | 204 / 404 |

要求:
- 使用 `express.json()` 解析请求体;
- 404 与 400 都返回规范错误体;
- 成功创建返回创建的对象,`GET`/`PATCH` 返回对应对象。

## 验收与判分

```bash
# 在项目根目录
npm run exam:projects          # 运行所有项目验收测试
# 或单独运行本项目的两个测试文件
npx ts-node 03-exams/projects/01-todo-rest-api/tests/store.test.ts
npx ts-node 03-exams/projects/01-todo-rest-api/tests/api.integration.test.ts
```

- **单元测试**(`store.test.ts`):验证 `TodoStore` 逻辑。
- **集成测试**(`api.integration.test.ts`):真实 `app.listen(0)` 启动服务,用 `fetch` 走「创建→列表→查询→更新→删除→404/400」完整链路。

两个测试文件全绿 = 满分。

## 提示

- `store` 与 `app` 分离,便于分别测试与替换存储实现。
- 路由里对不存在的 id 统一返回 404;对非法 body 返回 400。
- Express 5 已安装,直接 `import express from "express"`。
