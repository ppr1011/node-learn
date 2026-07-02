/**
 * 03 - Path 与 OS 模块
 * 运行: npx ts-node 02-nodejs/03-path-and-os/index.ts
 */

import * as path from "path";
import * as os from "os";

// ========== Path 模块 ==========
console.log("=== Path 模块 ===\n");

// 路径拼接
console.log("--- path.join ---");
console.log(path.join("/users", "alice", "documents", "file.txt"));
console.log(path.join("src", "..", "dist", "index.js"));

// 路径解析 (返回绝对路径)
console.log("\n--- path.resolve ---");
console.log(path.resolve("src", "index.ts"));
console.log(path.resolve("/tmp", "test", "file.txt"));

// 路径解析为对象
console.log("\n--- path.parse ---");
const parsed = path.parse("/home/user/project/src/index.ts");
console.log(parsed);
// { root: '/', dir: '/home/user/project/src', base: 'index.ts', ext: '.ts', name: 'index' }

// 从对象构建路径
console.log("\n--- path.format ---");
console.log(path.format({ dir: "/home/user", base: "file.txt" }));

// 获取各部分
const filePath = "/Users/alice/project/src/utils/helper.ts";
console.log("\n--- 路径各部分 ---");
console.log("dirname:", path.dirname(filePath));
console.log("basename:", path.basename(filePath));
console.log("basename (no ext):", path.basename(filePath, ".ts"));
console.log("extname:", path.extname(filePath));

// 相对路径
console.log("\n--- path.relative ---");
console.log(path.relative("/home/user/project/src", "/home/user/project/dist"));
console.log(path.relative("/a/b/c", "/a/d/e"));

// 规范化路径
console.log("\n--- path.normalize ---");
console.log(path.normalize("/foo/bar//baz/./quux/.."));

// 判断是否绝对路径
console.log("\n--- path.isAbsolute ---");
console.log("/foo/bar:", path.isAbsolute("/foo/bar"));
console.log("./foo:", path.isAbsolute("./foo"));

// 平台分隔符
console.log("\n--- 分隔符 ---");
console.log("sep:", JSON.stringify(path.sep));
console.log("delimiter:", JSON.stringify(path.delimiter));

// ========== OS 模块 ==========
console.log("\n\n=== OS 模块 ===\n");

// 系统信息
console.log("--- 系统信息 ---");
console.log("平台:", os.platform());
console.log("架构:", os.arch());
console.log("系统类型:", os.type());
console.log("版本:", os.version());
console.log("主机名:", os.hostname());
console.log("用户主目录:", os.homedir());
console.log("临时目录:", os.tmpdir());

// CPU 信息
console.log("\n--- CPU 信息 ---");
const cpus = os.cpus();
console.log("CPU 型号:", cpus[0].model);
console.log("CPU 核数:", cpus.length);
console.log("CPU 速度:", cpus[0].speed, "MHz");

// 内存信息
console.log("\n--- 内存信息 ---");
const totalMem = os.totalmem();
const freeMem = os.freemem();
console.log("总内存:", (totalMem / 1024 / 1024 / 1024).toFixed(2), "GB");
console.log("可用内存:", (freeMem / 1024 / 1024 / 1024).toFixed(2), "GB");
console.log("使用率:", (((totalMem - freeMem) / totalMem) * 100).toFixed(1), "%");

// 运行时间
console.log("\n--- 运行时间 ---");
const uptime = os.uptime();
const hours = Math.floor(uptime / 3600);
const minutes = Math.floor((uptime % 3600) / 60);
console.log(`系统运行时间: ${hours}h ${minutes}m`);

// 网络接口
console.log("\n--- 网络接口 ---");
const nets = os.networkInterfaces();
for (const [name, interfaces] of Object.entries(nets)) {
  if (!interfaces) continue;
  for (const iface of interfaces) {
    if (iface.family === "IPv4" && !iface.internal) {
      console.log(`${name}: ${iface.address} (${iface.mac})`);
    }
  }
}

// 用户信息
console.log("\n--- 当前用户 ---");
const userInfo = os.userInfo();
console.log("用户名:", userInfo.username);
console.log("UID:", userInfo.uid);
console.log("GID:", userInfo.gid);
console.log("Shell:", userInfo.shell);

// EOL (换行符)
console.log("\n--- 行尾符 ---");
console.log("os.EOL:", JSON.stringify(os.EOL));
console.log("(Windows: \\r\\n, Unix/Mac: \\n)");
