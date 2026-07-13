/**
 * Node 集成测试:fs 封装端到端(请勿修改)
 * 覆盖 基础 01。使用真实临时目录,测试后清理。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { ensureDir, writeJson, readJson, listJsonFiles } from "../basic/01-fs-Promise封装/index";

test("集成:建目录 → 批量写 → 列举 → 读回 → 清理", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "exam-fs-intg-"));
  try {
    const dataDir = path.join(root, "store", "users");
    await ensureDir(dataDir);

    const users = [
      { id: 1, name: "Alice" },
      { id: 2, name: "Bob" },
      { id: 3, name: "Carol" },
    ];
    for (const u of users) {
      await writeJson(path.join(dataDir, `${u.id}.json`), u);
    }

    const files = await listJsonFiles(dataDir);
    assert.deepEqual(files, ["1.json", "2.json", "3.json"]);

    const bob = await readJson<{ id: number; name: string }>(path.join(dataDir, "2.json"));
    assert.deepEqual(bob, { id: 2, name: "Bob" });

    // 读回全部并校验
    const all = await Promise.all(
      files.map((f) => readJson<{ id: number; name: string }>(path.join(dataDir, f)))
    );
    assert.deepEqual(
      all.map((u) => u.name),
      ["Alice", "Bob", "Carol"]
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
