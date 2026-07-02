/**
 * 01 - Node.js 模块系统
 * 运行: npx ts-node 02-nodejs/01-module-system/index.ts
 */

// ========== CommonJS (Node.js 默认) ==========
// const fs = require('fs');         // CJS 导入
// module.exports = { ... };         // CJS 导出
// exports.myFunc = function() {};   // CJS 命名导出

// ========== ES Modules (推荐，TypeScript 默认) ==========
import * as path from "path";
import { readFileSync, existsSync } from "fs";

console.log("--- 模块系统概述 ---");
console.log("CommonJS: require() / module.exports");
console.log("ES Modules: import / export");
console.log("TypeScript 编译后会根据 tsconfig 的 module 字段决定输出格式\n");

// ========== 模拟模块化项目结构 ==========

// utils.ts - 工具模块
namespace Utils {
  export function capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  export function slugify(str: string): string {
    return str.toLowerCase().replace(/\s+/g, "-");
  }

  export function randomId(): string {
    return Math.random().toString(36).substring(2, 10);
  }
}

// config.ts - 配置模块
namespace Config {
  export const APP_NAME = "MyApp";
  export const VERSION = "1.0.0";
  export const PORT = 3000;

  export function getFullConfig() {
    return { appName: APP_NAME, version: VERSION, port: PORT };
  }
}

// logger.ts - 日志模块
namespace Logger {
  type Level = "info" | "warn" | "error" | "debug";

  export function log(level: Level, message: string): void {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
    console.log(`${prefix} ${message}`);
  }

  export const info = (msg: string) => log("info", msg);
  export const warn = (msg: string) => log("warn", msg);
  export const error = (msg: string) => log("error", msg);
  export const debug = (msg: string) => log("debug", msg);
}

// ========== 使用模块 ==========
console.log("--- 使用自定义模块 ---");
Logger.info(`App: ${Config.APP_NAME} v${Config.VERSION}`);
Logger.info(`Slug: ${Utils.slugify("Hello World Example")}`);
Logger.info(`ID: ${Utils.randomId()}`);
Logger.warn("This is a warning");
Logger.debug(`Full config: ${JSON.stringify(Config.getFullConfig())}`);

// ========== 内置模块使用 ==========
console.log("\n--- 内置模块 ---");
console.log("当前文件:", __filename);
console.log("当前目录:", __dirname);
console.log("解析路径:", path.resolve("./src/index.ts"));
console.log("文件存在:", existsSync(__filename));

// ========== module.paths 和模块解析 ==========
console.log("\n--- 模块解析顺序 ---");
console.log("1. 核心模块 (fs, path, http...)");
console.log("2. node_modules 目录 (从当前目录向上查找)");
console.log("3. 相对/绝对路径文件");
console.log("\nmodule.paths:");
module.paths.forEach((p) => console.log(`  ${p}`));

// ========== require.resolve ==========
console.log("\n--- require.resolve ---");
console.log("typescript:", require.resolve("typescript"));
