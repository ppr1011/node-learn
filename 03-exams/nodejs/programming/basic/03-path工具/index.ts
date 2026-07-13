/**
 * 基础 03 - path 路径工具(骨架)
 * 统一使用 path.posix 语义。
 */
import path from "path";

const p = path.posix;

export function getExtension(filePath: string): string {
  // TODO: 返回不含点、小写的扩展名,没有则 ""
  throw new Error("TODO: 实现 getExtension");
}

export function changeExtension(filePath: string, ext: string): string {
  // TODO: 替换扩展名,保持目录不变
  throw new Error("TODO: 实现 changeExtension");
}

export function splitPath(filePath: string): { dir: string; name: string; ext: string } {
  // TODO: 拆分为 { dir, name, ext(不含点) }
  throw new Error("TODO: 实现 splitPath");
}

export function isInside(parentDir: string, target: string): boolean {
  // TODO: target 是否严格位于 parentDir 内部
  throw new Error("TODO: 实现 isInside");
}
