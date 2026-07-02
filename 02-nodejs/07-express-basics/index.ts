/**
 * 07 - Express 基础
 * 运行: npx ts-node 02-nodejs/07-express-basics/index.ts
 * 需要: npm install express @types/express
 */

import express, { Request, Response } from "express";

const app = express();
const PORT = 4001;

// ========== 内置中间件 ==========
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ========== 基本路由 ==========
app.get("/", (req: Request, res: Response) => {
  res.json({
    message: "Welcome to Express!",
    routes: [
      "GET  /api/users",
      "GET  /api/users/:id",
      "POST /api/users",
      "GET  /api/search?q=keyword",
    ],
  });
});

// ========== RESTful 路由 ==========
interface User {
  id: number;
  name: string;
  email: string;
  role: string;
}

const users: User[] = [
  { id: 1, name: "Alice", email: "alice@test.com", role: "admin" },
  { id: 2, name: "Bob", email: "bob@test.com", role: "user" },
  { id: 3, name: "Charlie", email: "charlie@test.com", role: "user" },
];

// GET - 列表 (支持分页)
app.get("/api/users", (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;
  const start = (page - 1) * limit;
  const paged = users.slice(start, start + limit);

  res.json({
    data: paged,
    pagination: { page, limit, total: users.length },
  });
});

// GET - 单个资源 (路径参数)
app.get("/api/users/:id", (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string);
  const user = users.find((u) => u.id === id);

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json({ data: user });
});

// POST - 创建
app.post("/api/users", (req: Request, res: Response) => {
  const { name, email, role } = req.body;

  if (!name || !email) {
    res.status(400).json({ error: "name and email are required" });
    return;
  }

  const newUser: User = { id: users.length + 1, name, email, role: role || "user" };
  users.push(newUser);
  res.status(201).json({ data: newUser });
});

// PUT - 更新
app.put("/api/users/:id", (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string);
  const index = users.findIndex((u) => u.id === id);

  if (index === -1) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  users[index] = { ...users[index], ...req.body, id };
  res.json({ data: users[index] });
});

// DELETE - 删除
app.delete("/api/users/:id", (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string);
  const index = users.findIndex((u) => u.id === id);

  if (index === -1) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const deleted = users.splice(index, 1);
  res.json({ message: "Deleted", data: deleted[0] });
});

// ========== 查询参数 ==========
app.get("/api/search", (req: Request, res: Response) => {
  const q = (req.query.q as string) || "";
  const results = users.filter(
    (u) => u.name.toLowerCase().includes(q.toLowerCase()) || u.email.includes(q)
  );
  res.json({ query: q, results, count: results.length });
});

// ========== 路由分组 ==========
const adminRouter = express.Router();

adminRouter.get("/stats", (req: Request, res: Response) => {
  res.json({
    totalUsers: users.length,
    admins: users.filter((u) => u.role === "admin").length,
    uptime: process.uptime(),
  });
});

app.use("/api/admin", adminRouter);

// ========== 启动服务器 ==========
const server = app.listen(PORT, () => {
  console.log(`🚀 Express server at http://localhost:${PORT}`);
  console.log("\n按 Ctrl+C 停止，或等待自动测试完成");
  autoTest();
});

async function autoTest(): Promise<void> {
  await new Promise((r) => setTimeout(r, 200));
  const base = `http://localhost:${PORT}`;
  console.log("\n--- 自动测试 ---");

  const json = async (res: globalThis.Response) => res.json() as Promise<any>;

  const d1 = await json(await fetch(`${base}/api/users`));
  console.log("GET /api/users:", d1.pagination);

  const d2 = await json(await fetch(`${base}/api/users/1`));
  console.log("GET /api/users/1:", d2.data.name);

  const d3 = await json(await fetch(`${base}/api/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Dave", email: "dave@test.com" }),
  }));
  console.log("POST /api/users:", d3.data);

  const d4 = await json(await fetch(`${base}/api/search?q=ali`));
  console.log("GET /api/search?q=ali:", d4.results.length, "results");

  const d5 = await json(await fetch(`${base}/api/admin/stats`));
  console.log("GET /api/admin/stats:", d5);

  console.log("\n✅ 测试完成");
  server.close();
}
