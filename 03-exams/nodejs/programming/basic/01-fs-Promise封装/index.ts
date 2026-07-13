/**
 * 基础 01 - fs Promise 封装(骨架)
 */
import { promises as fs } from "fs";
import path from "path";

export async function ensureDir(dir: string): Promise<void> {
  // TODO: 递归创建目录
  throw new Error("TODO: 实现 ensureDir");
}

export async function writeJson(file: string, data: unknown): Promise<void> {
  // TODO: 确保父目录存在,再写入带 2 空格缩进的 JSON
  throw new Error("TODO: 实现 writeJson");
}

export async function readJson<T = unknown>(file: string): Promise<T> {
  // TODO: 读取并解析 JSON
  throw new Error("TODO: 实现 readJson");
}

export async function listJsonFiles(dir: string): Promise<string[]> {
  // TODO: 返回目录下 .json 文件名,升序;目录不存在返回 []
  throw new Error("TODO: 实现 listJsonFiles");
}
