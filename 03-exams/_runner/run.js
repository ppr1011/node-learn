/**
 * 考试测试运行器(进程内 runner)
 *
 * 为什么不用 `node --test "glob"`?
 *   - `--test` 的 glob 参数需要 Node 21+;
 *   - `--test` 会为每个文件另开子进程,ts-node 的预加载在部分 Node 版本里不会传播到子进程。
 * 本 runner 只做一件事:在当前进程内注册 ts-node,再顺序 require 所有匹配的测试文件。
 * node:test 会在进程退出前自动运行已注册的用例,并在有失败时把退出码置为 1。
 * 这样在 Node 18 / 20 / 22 上行为一致,无需任何额外依赖。
 *
 * 用法: node 03-exams/_runner/run.js <scope> <mode>
 *   scope: all | typescript | nodejs | projects   (默认 all)
 *   mode : all | unit | integration               (默认 all)
 *          unit        —— 仅 *.test.ts(排除 *.integration.test.ts)
 *          integration —— 仅 *.integration.test.ts
 */

require("ts-node/register");

const fs = require("fs");
const path = require("path");

const scope = process.argv[2] || "all";
const mode = process.argv[3] || "all";

const examRoot = path.resolve(__dirname, "..");

// 根据 scope 确定要扫描的目录
const scopeDirs = {
  all: ["typescript", "nodejs", "projects"],
  typescript: ["typescript"],
  nodejs: ["nodejs"],
  projects: ["projects"],
};

const targets = scopeDirs[scope];
if (!targets) {
  console.error(`未知 scope: ${scope}(可选:all | typescript | nodejs | projects)`);
  process.exit(2);
}

/** 递归收集目录下所有文件路径 */
function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.name === "node_modules") return [];
    return entry.isDirectory() ? walk(full) : [full];
  });
}

let files = targets
  .flatMap((sub) => walk(path.join(examRoot, sub)))
  .filter((f) => f.endsWith(".test.ts"));

if (mode === "unit") {
  files = files.filter((f) => !f.endsWith(".integration.test.ts"));
} else if (mode === "integration") {
  files = files.filter((f) => f.endsWith(".integration.test.ts"));
} else if (mode !== "all") {
  console.error(`未知 mode: ${mode}(可选:all | unit | integration)`);
  process.exit(2);
}

files.sort();

console.log(`\n📝 考试范围: scope=${scope} mode=${mode}`);
console.log(`📂 收集到 ${files.length} 个测试文件:`);
for (const f of files) {
  console.log(`   - ${path.relative(examRoot, f)}`);
}
console.log("");

if (files.length === 0) {
  console.log("(没有匹配的测试文件)");
  process.exit(0);
}

// 顺序加载所有测试文件;node:test 会在进程退出前统一运行。
// 单个文件加载失败(如类型体操题未实现导致编译错误)不应中断其余文件,
// 记为失败并继续。
let loadErrors = 0;
for (const f of files) {
  try {
    require(f);
  } catch (err) {
    loadErrors++;
    console.error(`\n❌ 加载失败(编译/导入错误): ${path.relative(examRoot, f)}`);
    console.error(String(err && err.message ? err.message : err).split("\n").slice(0, 8).join("\n"));
  }
}

if (loadErrors > 0) {
  // node:test 只统计已成功注册的用例;这里显式反映加载失败,保证退出码非 0。
  process.on("exit", (code) => {
    if (code === 0) process.exitCode = 1;
  });
  process.exitCode = 1;
}
