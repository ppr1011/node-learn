/**
 * 10 - 错误处理
 * 运行: npx ts-node 02-nodejs/10-error-handling/index.ts
 * 需要: npm install express @types/express
 */

import express, { Request, Response, NextFunction } from "express";

// ========== 自定义错误类 ==========
class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = "AppError";
  }
}

class NotFoundError extends AppError {
  constructor(resource: string, id?: string | number) {
    super(404, "NOT_FOUND", `${resource}${id ? ` #${id}` : ""} not found`);
  }
}

class ValidationError extends AppError {
  constructor(errors: string[]) {
    super(400, "VALIDATION_ERROR", "Validation failed", errors);
  }
}

class UnauthorizedError extends AppError {
  constructor(message = "Authentication required") {
    super(401, "UNAUTHORIZED", message);
  }
}

class ForbiddenError extends AppError {
  constructor(message = "Insufficient permissions") {
    super(403, "FORBIDDEN", message);
  }
}

// ========== 异步错误包装器 ==========
function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

// ========== Express 应用 ==========
const app = express();
app.use(express.json());

// 模拟数据
const users = [
  { id: 1, name: "Alice", role: "admin" },
  { id: 2, name: "Bob", role: "user" },
];

// ========== 路由示例 ==========

// 正常路由
app.get("/api/users/:id", asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id as string);

  if (isNaN(id)) {
    throw new ValidationError(["id must be a number"]);
  }

  const user = users.find((u) => u.id === id);
  if (!user) {
    throw new NotFoundError("User", id);
  }

  res.json({ data: user });
}));

// 模拟需要认证的路由
app.get("/api/admin", asyncHandler(async (req, res) => {
  const token = req.headers.authorization;
  if (!token) {
    throw new UnauthorizedError();
  }
  if (token !== "Bearer admin-token") {
    throw new ForbiddenError();
  }
  res.json({ message: "Admin area" });
}));

// 模拟意外错误
app.get("/api/crash", asyncHandler(async (req, res) => {
  // 模拟数据库连接失败等意外错误
  throw new Error("Database connection lost");
}));

// 模拟验证错误
app.post("/api/users", asyncHandler(async (req, res) => {
  const errors: string[] = [];
  if (!req.body.name) errors.push("name is required");
  if (!req.body.email) errors.push("email is required");
  if (req.body.name && req.body.name.length < 2) errors.push("name must be at least 2 chars");

  if (errors.length > 0) {
    throw new ValidationError(errors);
  }

  res.status(201).json({ data: { id: 3, ...req.body } });
}));

// ========== 全局错误处理中间件 ==========
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  // 已知的应用错误
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        details: err.details || undefined,
      },
    });
    return;
  }

  // 未知错误 (不暴露内部细节给客户端)
  console.error("Unexpected error:", err);
  res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "An unexpected error occurred",
    },
  });
});

// ========== 未捕获异常处理 ==========
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err.message);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Rejection:", reason);
  process.exit(1);
});

// ========== 启动与测试 ==========
const PORT = 4004;
const server = app.listen(PORT, () => {
  console.log(`🚀 Error handling demo at http://localhost:${PORT}\n`);
  autoTest();
});

async function autoTest(): Promise<void> {
  const base = `http://localhost:${PORT}/api`;
  console.log("--- 错误处理测试 ---\n");

  // 正常请求
  const r1 = await fetch(`${base}/users/1`);
  const d1: any = await r1.json();
  console.log(`✓ GET /users/1 [${r1.status}]:`, d1.data.name);

  // 404 错误
  const r2 = await fetch(`${base}/users/99`);
  const d2: any = await r2.json();
  console.log(`✓ GET /users/99 [${r2.status}]:`, d2.error);

  // 验证错误
  const r3 = await fetch(`${base}/users/abc`);
  const d3: any = await r3.json();
  console.log(`✓ GET /users/abc [${r3.status}]:`, d3.error);

  // 认证错误
  const r4 = await fetch(`${base}/admin`);
  const d4: any = await r4.json();
  console.log(`✓ GET /admin no-auth [${r4.status}]:`, d4.error.code);

  // 权限错误
  const r5 = await fetch(`${base}/admin`, {
    headers: { Authorization: "Bearer wrong" },
  });
  const d5: any = await r5.json();
  console.log(`✓ GET /admin bad-auth [${r5.status}]:`, d5.error.code);

  // POST 验证错误
  const r6 = await fetch(`${base}/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "A" }),
  });
  const d6: any = await r6.json();
  console.log(`✓ POST /users invalid [${r6.status}]:`, d6.error.details);

  // 意外错误
  const r7 = await fetch(`${base}/crash`);
  const d7: any = await r7.json();
  console.log(`✓ GET /crash [${r7.status}]:`, d7.error.code);

  console.log("\n✅ 错误处理测试完成");
  server.close();
}
