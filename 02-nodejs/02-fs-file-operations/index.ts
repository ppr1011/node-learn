/**
 * 02 - 文件系统操作
 * 运行: npx ts-node 02-nodejs/02-fs-file-operations/index.ts
 */

import * as fs from "fs";
import * as path from "path";

const workDir = path.join(__dirname, "temp");

// ========== 目录操作 ==========
console.log("--- 目录操作 ---");

// 创建目录 (递归)
if (!fs.existsSync(workDir)) {
  fs.mkdirSync(workDir, { recursive: true });
  console.log("创建目录:", workDir);
}

// ========== 同步文件写入 ==========
console.log("\n--- 同步文件操作 ---");

const filePath = path.join(workDir, "hello.txt");
fs.writeFileSync(filePath, "Hello, Node.js!\n你好，世界！\n", "utf-8");
console.log("写入文件:", filePath);

// 追加内容
fs.appendFileSync(filePath, `写入时间: ${new Date().toISOString()}\n`);
console.log("追加内容完成");

// 同步读取
const content = fs.readFileSync(filePath, "utf-8");
console.log("读取内容:\n", content);

// ========== 异步文件操作 (Promises) ==========
console.log("--- 异步文件操作 ---");

async function asyncFileOps(): Promise<void> {
  const asyncFile = path.join(workDir, "async.json");

  // 写入 JSON
  const data = { name: "Alice", skills: ["TypeScript", "Node.js"], level: 5 };
  await fs.promises.writeFile(asyncFile, JSON.stringify(data, null, 2));
  console.log("异步写入 JSON:", asyncFile);

  // 读取 JSON
  const raw = await fs.promises.readFile(asyncFile, "utf-8");
  const parsed = JSON.parse(raw);
  console.log("异步读取 JSON:", parsed);

  // 文件信息
  const stats = await fs.promises.stat(asyncFile);
  console.log("文件大小:", stats.size, "bytes");
  console.log("创建时间:", stats.birthtime.toLocaleString());
  console.log("是文件:", stats.isFile());
  console.log("是目录:", stats.isDirectory());
}

// ========== 读取目录 ==========
async function listDirectory(dir: string): Promise<void> {
  console.log(`\n--- 目录列表: ${dir} ---`);
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const type = entry.isDirectory() ? "[DIR]" : "[FILE]";
    console.log(`  ${type} ${entry.name}`);
  }
}

// ========== 文件复制与重命名 ==========
async function copyAndRename(): Promise<void> {
  const src = path.join(workDir, "hello.txt");
  const dest = path.join(workDir, "hello-copy.txt");

  // 复制
  await fs.promises.copyFile(src, dest);
  console.log("\n--- 复制文件 ---");
  console.log(`${src} → ${dest}`);

  // 重命名
  const renamed = path.join(workDir, "hello-renamed.txt");
  await fs.promises.rename(dest, renamed);
  console.log(`重命名为: ${renamed}`);
}

// ========== 监听文件变化 ==========
function watchDemo(): void {
  console.log("\n--- 文件监听 (2秒后自动停止) ---");
  const watcher = fs.watch(workDir, (eventType, filename) => {
    console.log(`  [${eventType}] ${filename}`);
  });

  // 触发变化
  const watchFile = path.join(workDir, "watch-test.txt");
  fs.writeFileSync(watchFile, "watching...");

  setTimeout(() => {
    fs.unlinkSync(watchFile);
    watcher.close();
    console.log("  监听已停止");
  }, 500);
}

// ========== 清理 ==========
async function cleanup(): Promise<void> {
  console.log("\n--- 清理临时文件 ---");
  await fs.promises.rm(workDir, { recursive: true, force: true });
  console.log("已删除:", workDir);
}

// 执行所有操作
async function main(): Promise<void> {
  await asyncFileOps();
  await listDirectory(workDir);
  await copyAndRename();
  await listDirectory(workDir);
  watchDemo();
  setTimeout(async () => {
    await cleanup();
  }, 1000);
}

main();
