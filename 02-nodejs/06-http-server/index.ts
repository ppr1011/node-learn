/**
 * 06 - HTTP 原生服务器
 * 运行: npx ts-node 02-nodejs/06-http-server/index.ts
 * 测试: curl http://localhost:3000/api/users
 */

import * as http from "http";
import { URL } from "url";

// ========== 简单路由表 ==========
interface User {
  id: number;
  name: string;
  email: string;
}

const users: User[] = [
  { id: 1, name: "Alice", email: "alice@example.com" },
  { id: 2, name: "Bob", email: "bob@example.com" },
  { id: 3, name: "Charlie", email: "charlie@example.com" },
];

// ========== 辅助函数 ==========
function sendJson(res: http.ServerResponse, statusCode: number, data: unknown): void {
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data, null, 2));
}

function parseBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
    req.on("error", reject);
  });
}

// ========== 创建服务器 ==========
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  const method = req.method || "GET";
  const pathname = url.pathname;

  console.log(`${method} ${pathname}`);

  // CORS 头
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE");

  try {
    // 路由处理
    if (pathname === "/" && method === "GET") {
      sendJson(res, 200, { message: "Welcome to Node.js HTTP Server", version: "1.0" });
    } else if (pathname === "/api/users" && method === "GET") {
      sendJson(res, 200, { data: users, total: users.length });
    } else if (pathname.match(/^\/api\/users\/\d+$/) && method === "GET") {
      const id = parseInt(pathname.split("/").pop()!);
      const user = users.find((u) => u.id === id);
      if (user) {
        sendJson(res, 200, { data: user });
      } else {
        sendJson(res, 404, { error: "User not found" });
      }
    } else if (pathname === "/api/users" && method === "POST") {
      const body = await parseBody(req);
      const newUser: User = { id: users.length + 1, ...JSON.parse(body) };
      users.push(newUser);
      sendJson(res, 201, { data: newUser });
    } else if (pathname === "/api/time" && method === "GET") {
      sendJson(res, 200, { time: new Date().toISOString(), uptime: process.uptime() });
    } else {
      sendJson(res, 404, { error: "Not Found", path: pathname });
    }
  } catch (err: any) {
    sendJson(res, 500, { error: "Internal Server Error", message: err.message });
  }
});

// ========== 启动服务器 ==========
const PORT = 4000;

server.listen(PORT, () => {
  console.log(`\n🚀 HTTP Server running at http://localhost:${PORT}`);
  console.log("\n可用路由:");
  console.log("  GET  /            - 欢迎页");
  console.log("  GET  /api/users   - 用户列表");
  console.log("  GET  /api/users/1 - 单个用户");
  console.log("  POST /api/users   - 创建用户");
  console.log("  GET  /api/time    - 服务器时间");
  console.log("\n按 Ctrl+C 停止服务器");

  // 自动测试并退出 (用于演示)
  autoTest();
});

async function autoTest(): Promise<void> {
  console.log("\n--- 自动测试 ---");

  // 测试 GET
  const res1 = await fetch(`http://localhost:${PORT}/api/users`);
  const data1 = await res1.json();
  console.log("GET /api/users:", JSON.stringify(data1).slice(0, 80) + "...");

  // 测试 POST
  const res2 = await fetch(`http://localhost:${PORT}/api/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Dave", email: "dave@example.com" }),
  });
  const data2 = await res2.json();
  console.log("POST /api/users:", JSON.stringify(data2));

  // 测试 404
  const res3 = await fetch(`http://localhost:${PORT}/api/unknown`);
  const data3 = await res3.json();
  console.log("GET /api/unknown:", JSON.stringify(data3));

  console.log("\n✅ 测试完成，服务器关闭");
  server.close();
}
