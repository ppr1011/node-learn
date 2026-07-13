/**
 * 基础 01 - 单元测试(请勿修改)
 * 使用系统临时目录,测试后自动清理。
 */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { ensureDir, writeJson, readJson, listJsonFiles } from "./index";

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "exam-fs-"));
});
afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

test("ensureDir 递归创建且幂等", async () => {
  const deep = path.join(tmp, "a", "b", "c");
  await ensureDir(deep);
  await ensureDir(deep); // 再次调用不报错
  const stat = await fs.stat(deep);
  assert.equal(stat.isDirectory(), true);
});

test("writeJson 自动建目录 + readJson 读回", async () => {
  const file = path.join(tmp, "sub", "data.json");
  await writeJson(file, { name: "Alice", age: 20 });
  const content = await fs.readFile(file, "utf-8");
  assert.match(content, /\n  "name"/); // 2 空格缩进
  const data = await readJson<{ name: string; age: number }>(file);
  assert.deepEqual(data, { name: "Alice", age: 20 });
});

test("listJsonFiles 只返回 .json 且升序", async () => {
  await writeJson(path.join(tmp, "b.json"), 1);
  await writeJson(path.join(tmp, "a.json"), 2);
  await fs.writeFile(path.join(tmp, "note.txt"), "x");
  await fs.mkdir(path.join(tmp, "sub.json")); // 目录不算文件
  const files = await listJsonFiles(tmp);
  assert.deepEqual(files, ["a.json", "b.json"]);
});

test("listJsonFiles 目录不存在返回 []", async () => {
  const files = await listJsonFiles(path.join(tmp, "not-exist"));
  assert.deepEqual(files, []);
});
