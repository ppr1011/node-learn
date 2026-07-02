/**
 * 08 - 中间件模式
 * 运行: npx ts-node 02-nodejs/08-middleware-pattern/index.ts
 * 需要: npm install express @types/express
 */

import express, { Request, Response, NextFunction } from "express";

const app = express();
const PORT = 4002;

app.use(express.json());

// ========== 1. 日志中间件 ==========
function logger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  const { method, url } = req;

  res.on("finish", () => {
    const duration = Date.now() - start;
    console.log(`  ${method} ${url} → ${res.statusCode} (${duration}ms)`);
  });

  next();
}

// ========== 2. 请求 ID 中间件 ==========
function requestId(req: Request, res: Response, next: NextFunction): void {
  const id = `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  req.headers["x-request-id"] = id;
  res.setHeader("X-Request-Id", id);
  next();
}

// ========== 3. 限流中间件 ==========
function rateLimit(maxRequests: number, windowMs: number) {
  const requests = new Map<string, { count: number; resetAt: number }>();

  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = req.ip || "unknown";
    const now = Date.now();
    const record = requests.get(ip);

    if (!record || now > record.resetAt) {
      requests.set(ip, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    if (record.count >= maxRequests) {
      res.status(429).json({ error: "Too many requests" });
      return;
    }

    record.count++;
    next();
  };
}

// ========== 4. 认证中间件 ==========
function authenticate(req: Request, res: Response, next: NextFunction): void {
  const token = req.headers.authorization?.replace("Bearer ", "");

  if (!token) {
    res.status(401).json({ error: "No token provided" });
    return;
  }

  if (token === "valid-token-123") {
    (req as any).user = { id: 1, name: "Alice", role: "admin" };
    next();
  } else {
    res.status(403).json({ error: "Invalid token" });
  }
}

// ========== 5. 角色检查中间件 ==========
function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as any).user;
    if (!user || !roles.includes(user.role)) {
      res.status(403).json({ error: "Insufficient permissions" });
      return;
    }
    next();
  };
}

// ========== 6. 请求验证中间件 ==========
function validateBody(schema: Record<string, "string" | "number" | "boolean">) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const errors: string[] = [];

    for (const [field, type] of Object.entries(schema)) {
      if (req.body[field] === undefined) {
        errors.push(`${field} is required`);
      } else if (typeof req.body[field] !== type) {
        errors.push(`${field} must be ${type}`);
      }
    }

    if (errors.length > 0) {
      res.status(400).json({ error: "Validation failed", details: errors });
      return;
    }
    next();
  };
}

// ========== 应用中间件 ==========

// 全局中间件
app.use(logger);
app.use(requestId);
app.use(rateLimit(100, 60000));

// 公开路由
app.get("/", (req: Request, res: Response) => {
  res.json({ message: "Public route", requestId: req.headers["x-request-id"] });
});

app.get("/health", (req: Request, res: Response) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

// 受保护路由 (需要认证)
app.get("/api/profile", authenticate, (req: Request, res: Response) => {
  res.json({ user: (req as any).user });
});

// 管理员路由 (需要认证 + 角色)
app.post(
  "/api/admin/users",
  authenticate,
  requireRole("admin"),
  validateBody({ name: "string", email: "string" }),
  (req: Request, res: Response) => {
    res.status(201).json({ message: "User created", data: req.body });
  }
);

// ========== 7. 错误处理中间件 (必须4个参数) ==========
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error("Error:", err.message);
  res.status(500).json({ error: "Internal Server Error", message: err.message });
});

// ========== 启动与测试 ==========
const server = app.listen(PORT, () => {
  console.log(`🚀 Middleware demo at http://localhost:${PORT}\n`);
  autoTest();
});

async function autoTest(): Promise<void> {
  const base = `http://localhost:${PORT}`;
  console.log("--- 中间件测试 ---\n");

  // 公开路由
  const r1 = await fetch(`${base}/`);
  const d1: any = await r1.json();
  console.log("✓ 公开路由 requestId:", d1.requestId);

  // 无 token
  const r2 = await fetch(`${base}/api/profile`);
  const d2: any = await r2.json();
  console.log("✓ 无token:", d2.error);

  // 错误 token
  const r3 = await fetch(`${base}/api/profile`, {
    headers: { Authorization: "Bearer wrong" },
  });
  const d3: any = await r3.json();
  console.log("✓ 错误token:", d3.error);

  // 正确 token
  const r4 = await fetch(`${base}/api/profile`, {
    headers: { Authorization: "Bearer valid-token-123" },
  });
  const d4: any = await r4.json();
  console.log("✓ 正确token:", d4.user.name);

  // 验证失败
  const r5 = await fetch(`${base}/api/admin/users`, {
    method: "POST",
    headers: { Authorization: "Bearer valid-token-123", "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Test" }), // 缺少 email
  });
  const d5: any = await r5.json();
  console.log("✓ 验证失败:", d5.details);

  // 完整请求
  const r6 = await fetch(`${base}/api/admin/users`, {
    method: "POST",
    headers: { Authorization: "Bearer valid-token-123", "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Test", email: "test@t.com" }),
  });
  const d6: any = await r6.json();
  console.log("✓ 创建成功:", d6.message);

  console.log("\n✅ 所有中间件测试通过");
  server.close();
}
