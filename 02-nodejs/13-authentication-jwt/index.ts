/**
 * 13 - JWT 认证
 * 运行: npx ts-node 02-nodejs/13-authentication-jwt/index.ts
 * 需要: npm install express jsonwebtoken bcryptjs
 *       npm install -D @types/express @types/jsonwebtoken @types/bcryptjs
 */

import express, { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

// ========== 配置 ==========
const JWT_SECRET = "your-secret-key-change-in-production";
const JWT_EXPIRES_IN = "1h";
const SALT_ROUNDS = 10;

// ========== 用户存储 (内存模拟) ==========
interface User {
  id: number;
  username: string;
  email: string;
  password: string; // 哈希后的密码
  role: "admin" | "user";
}

interface JwtPayload {
  userId: number;
  username: string;
  role: string;
}

const users: User[] = [];
let nextId = 1;

// ========== 认证服务 ==========
class AuthService {
  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, SALT_ROUNDS);
  }

  async comparePassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  generateToken(payload: JwtPayload): string {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  }

  verifyToken(token: string): JwtPayload {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  }

  generateRefreshToken(payload: JwtPayload): string {
    return jwt.sign(payload, JWT_SECRET + "-refresh", { expiresIn: "7d" });
  }
}

const authService = new AuthService();

// ========== 中间件 ==========
function authenticate(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "No token provided" });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const decoded = authService.verifyToken(token);
    (req as any).user = decoded;
    next();
  } catch (err: any) {
    if (err.name === "TokenExpiredError") {
      res.status(401).json({ error: "Token expired" });
    } else {
      res.status(401).json({ error: "Invalid token" });
    }
  }
}

function authorize(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as any).user as JwtPayload;
    if (!roles.includes(user.role)) {
      res.status(403).json({ error: "Insufficient permissions" });
      return;
    }
    next();
  };
}

// ========== Express 应用 ==========
const app = express();
app.use(express.json());

// 注册
app.post("/auth/register", async (req: Request, res: Response) => {
  const { username, email, password, role } = req.body;

  if (!username || !email || !password) {
    res.status(400).json({ error: "username, email, password are required" });
    return;
  }

  if (users.find((u) => u.email === email)) {
    res.status(409).json({ error: "Email already exists" });
    return;
  }

  const hashedPassword = await authService.hashPassword(password);
  const user: User = {
    id: nextId++,
    username,
    email,
    password: hashedPassword,
    role: role || "user",
  };
  users.push(user);

  const token = authService.generateToken({
    userId: user.id,
    username: user.username,
    role: user.role,
  });

  res.status(201).json({
    message: "Registration successful",
    user: { id: user.id, username: user.username, email: user.email, role: user.role },
    token,
  });
});

// 登录
app.post("/auth/login", async (req: Request, res: Response) => {
  const { email, password } = req.body;

  const user = users.find((u) => u.email === email);
  if (!user) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const isValid = await authService.comparePassword(password, user.password);
  if (!isValid) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const payload: JwtPayload = { userId: user.id, username: user.username, role: user.role };
  const token = authService.generateToken(payload);
  const refreshToken = authService.generateRefreshToken(payload);

  res.json({
    message: "Login successful",
    token,
    refreshToken,
    expiresIn: JWT_EXPIRES_IN,
  });
});

// 刷新 Token
app.post("/auth/refresh", (req: Request, res: Response) => {
  const { refreshToken } = req.body;

  try {
    const decoded = jwt.verify(refreshToken, JWT_SECRET + "-refresh") as JwtPayload;
    const newToken = authService.generateToken({
      userId: decoded.userId,
      username: decoded.username,
      role: decoded.role,
    });
    res.json({ token: newToken, expiresIn: JWT_EXPIRES_IN });
  } catch {
    res.status(401).json({ error: "Invalid refresh token" });
  }
});

// 受保护路由
app.get("/api/profile", authenticate, (req: Request, res: Response) => {
  const user = (req as any).user as JwtPayload;
  res.json({ user });
});

// 管理员路由
app.get("/api/admin/users", authenticate, authorize("admin"), (req: Request, res: Response) => {
  const safeUsers = users.map(({ password, ...u }) => u);
  res.json({ users: safeUsers });
});

// 修改密码
app.post("/api/change-password", authenticate, async (req: Request, res: Response) => {
  const { currentPassword, newPassword } = req.body;
  const { userId } = (req as any).user as JwtPayload;

  const user = users.find((u) => u.id === userId);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const isValid = await authService.comparePassword(currentPassword, user.password);
  if (!isValid) {
    res.status(401).json({ error: "Current password incorrect" });
    return;
  }

  user.password = await authService.hashPassword(newPassword);
  res.json({ message: "Password updated" });
});

// ========== 启动与测试 ==========
const PORT = 4005;
const server = app.listen(PORT, () => {
  console.log(`🚀 JWT Auth demo at http://localhost:${PORT}\n`);
  autoTest();
});

async function autoTest(): Promise<void> {
  const base = `http://localhost:${PORT}`;
  console.log("--- JWT 认证测试 ---\n");

  // 注册
  const r1 = await fetch(`${base}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "alice", email: "alice@test.com", password: "pass123", role: "admin" }),
  });
  const d1: any = await r1.json();
  console.log(`✓ 注册 [${r1.status}]: user=${d1.user.username}, token=${d1.token.slice(0, 20)}...`);

  // 注册第二个用户
  await fetch(`${base}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "bob", email: "bob@test.com", password: "pass456" }),
  });

  // 登录
  const r2 = await fetch(`${base}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "alice@test.com", password: "pass123" }),
  });
  const d2: any = await r2.json();
  const token = d2.token;
  console.log(`✓ 登录 [${r2.status}]: expiresIn=${d2.expiresIn}`);

  // 错误密码
  const r3 = await fetch(`${base}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "alice@test.com", password: "wrong" }),
  });
  const d3: any = await r3.json();
  console.log(`✓ 错误密码 [${r3.status}]: ${d3.error}`);

  // 访问受保护路由
  const r4 = await fetch(`${base}/api/profile`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const d4: any = await r4.json();
  console.log(`✓ 获取 profile [${r4.status}]:`, d4.user);

  // 无 token 访问
  const r5 = await fetch(`${base}/api/profile`);
  const d5: any = await r5.json();
  console.log(`✓ 无token [${r5.status}]: ${d5.error}`);

  // 管理员接口
  const r6 = await fetch(`${base}/api/admin/users`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const d6: any = await r6.json();
  console.log(`✓ 管理员列表 [${r6.status}]: ${d6.users.length} users`);

  // 非管理员访问管理员接口
  const bobLogin: any = await (await fetch(`${base}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "bob@test.com", password: "pass456" }),
  })).json();

  const r7 = await fetch(`${base}/api/admin/users`, {
    headers: { Authorization: `Bearer ${bobLogin.token}` },
  });
  const d7: any = await r7.json();
  console.log(`✓ 非管理员访问 [${r7.status}]: ${d7.error}`);

  console.log("\n✅ JWT 认证测试完成");
  server.close();
}
