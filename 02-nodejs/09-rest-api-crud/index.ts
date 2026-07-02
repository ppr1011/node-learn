/**
 * 09 - REST API CRUD 完整示例
 * 运行: npx ts-node 02-nodejs/09-rest-api-crud/index.ts
 * 需要: npm install express @types/express
 */

import express, { Request, Response, NextFunction } from "express";

// ========== 类型定义 ==========
interface Todo {
  id: number;
  title: string;
  description: string;
  completed: boolean;
  priority: "low" | "medium" | "high";
  createdAt: string;
  updatedAt: string;
}

type CreateTodoInput = Pick<Todo, "title" | "description" | "priority">;
type UpdateTodoInput = Partial<Pick<Todo, "title" | "description" | "completed" | "priority">>;

// ========== 数据存储 (内存) ==========
let todos: Todo[] = [
  {
    id: 1,
    title: "学习 TypeScript",
    description: "完成基础类型和泛型章节",
    completed: true,
    priority: "high",
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-02T00:00:00Z",
  },
  {
    id: 2,
    title: "学习 Node.js",
    description: "学习 Express 框架和中间件",
    completed: false,
    priority: "high",
    createdAt: "2024-01-02T00:00:00Z",
    updatedAt: "2024-01-02T00:00:00Z",
  },
  {
    id: 3,
    title: "写单元测试",
    description: "为 API 接口编写测试用例",
    completed: false,
    priority: "medium",
    createdAt: "2024-01-03T00:00:00Z",
    updatedAt: "2024-01-03T00:00:00Z",
  },
];
let nextId = 4;

// ========== Express 应用 ==========
const app = express();
app.use(express.json());

// 日志中间件
app.use((req: Request, res: Response, next: NextFunction) => {
  console.log(`  ${req.method} ${req.url}`);
  next();
});

// ========== CRUD 路由 ==========

// CREATE - 创建 Todo
app.post("/api/todos", (req: Request, res: Response) => {
  const { title, description, priority } = req.body as CreateTodoInput;

  if (!title) {
    res.status(400).json({ error: "title is required" });
    return;
  }

  const todo: Todo = {
    id: nextId++,
    title,
    description: description || "",
    completed: false,
    priority: priority || "medium",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  todos.push(todo);
  res.status(201).json({ data: todo });
});

// READ - 获取列表 (支持筛选、排序、分页)
app.get("/api/todos", (req: Request, res: Response) => {
  let result = [...todos];

  // 筛选
  const { completed, priority, search } = req.query;
  if (completed !== undefined) {
    result = result.filter((t) => t.completed === (completed === "true"));
  }
  if (priority) {
    result = result.filter((t) => t.priority === priority);
  }
  if (search) {
    const q = (search as string).toLowerCase();
    result = result.filter(
      (t) => t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)
    );
  }

  // 排序
  const sortBy = (req.query.sort as string) || "createdAt";
  const order = req.query.order === "asc" ? 1 : -1;
  result.sort((a, b) => {
    const aVal = (a as any)[sortBy];
    const bVal = (b as any)[sortBy];
    return aVal > bVal ? order : -order;
  });

  // 分页
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;
  const start = (page - 1) * limit;
  const paged = result.slice(start, start + limit);

  res.json({
    data: paged,
    pagination: { page, limit, total: result.length, pages: Math.ceil(result.length / limit) },
  });
});

// READ - 获取单个
app.get("/api/todos/:id", (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string);
  const todo = todos.find((t) => t.id === id);

  if (!todo) {
    res.status(404).json({ error: "Todo not found" });
    return;
  }
  res.json({ data: todo });
});

// UPDATE - 更新
app.put("/api/todos/:id", (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string);
  const index = todos.findIndex((t) => t.id === id);

  if (index === -1) {
    res.status(404).json({ error: "Todo not found" });
    return;
  }

  const updates: UpdateTodoInput = req.body;
  todos[index] = {
    ...todos[index],
    ...updates,
    id, // 不可修改 id
    updatedAt: new Date().toISOString(),
  };

  res.json({ data: todos[index] });
});

// UPDATE - 切换完成状态
app.patch("/api/todos/:id/toggle", (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string);
  const todo = todos.find((t) => t.id === id);

  if (!todo) {
    res.status(404).json({ error: "Todo not found" });
    return;
  }

  todo.completed = !todo.completed;
  todo.updatedAt = new Date().toISOString();
  res.json({ data: todo });
});

// DELETE - 删除单个
app.delete("/api/todos/:id", (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string);
  const index = todos.findIndex((t) => t.id === id);

  if (index === -1) {
    res.status(404).json({ error: "Todo not found" });
    return;
  }

  const deleted = todos.splice(index, 1);
  res.json({ message: "Deleted", data: deleted[0] });
});

// DELETE - 批量删除已完成
app.delete("/api/todos", (req: Request, res: Response) => {
  const before = todos.length;
  todos = todos.filter((t) => !t.completed);
  const deleted = before - todos.length;
  res.json({ message: `Deleted ${deleted} completed todos` });
});

// ========== 统计接口 ==========
app.get("/api/stats", (req: Request, res: Response) => {
  res.json({
    total: todos.length,
    completed: todos.filter((t) => t.completed).length,
    pending: todos.filter((t) => !t.completed).length,
    byPriority: {
      high: todos.filter((t) => t.priority === "high").length,
      medium: todos.filter((t) => t.priority === "medium").length,
      low: todos.filter((t) => t.priority === "low").length,
    },
  });
});

// ========== 启动与测试 ==========
const PORT = 4003;
const server = app.listen(PORT, () => {
  console.log(`🚀 Todo API at http://localhost:${PORT}\n`);
  autoTest();
});

async function autoTest(): Promise<void> {
  const base = `http://localhost:${PORT}/api`;
  console.log("--- CRUD 测试 ---\n");

  // 列表
  const r1: any = await (await fetch(`${base}/todos`)).json();
  console.log(`✓ 列表: ${r1.pagination.total} 条`);

  // 筛选
  const r2: any = await (await fetch(`${base}/todos?completed=false&priority=high`)).json();
  console.log(`✓ 筛选(未完成+高优先): ${r2.data.length} 条`);

  // 创建
  const r3: any = await (
    await fetch(`${base}/todos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "部署上线", description: "Docker部署", priority: "high" }),
    })
  ).json();
  console.log(`✓ 创建: id=${r3.data.id}, "${r3.data.title}"`);

  // 更新
  const r4: any = await (
    await fetch(`${base}/todos/${r3.data.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Docker 部署上线", priority: "medium" }),
    })
  ).json();
  console.log(`✓ 更新: "${r4.data.title}", priority=${r4.data.priority}`);

  // 切换
  const r5: any = await (await fetch(`${base}/todos/2/toggle`, { method: "PATCH" })).json();
  console.log(`✓ 切换: id=2, completed=${r5.data.completed}`);

  // 统计
  const r6: any = await (await fetch(`${base}/stats`)).json();
  console.log(`✓ 统计:`, r6);

  // 删除
  const r7: any = await (await fetch(`${base}/todos/${r3.data.id}`, { method: "DELETE" })).json();
  console.log(`✓ 删除: "${r7.data.title}"`);

  console.log("\n✅ CRUD 测试完成");
  server.close();
}
